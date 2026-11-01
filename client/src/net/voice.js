// Voice chat mesh bằng WebRTC thuần; báo hiệu (signaling) đi qua Socket.IO.
//
// Quy trình: ai bật voice thì gửi 'hello' cho mọi người trong phòng. Khi hai bên đều đã bật,
// bên có id nhỏ hơn tạo offer (tránh hai bên cùng offer một lúc).
//
// Âm lượng gần/xa được áp dụng ở NGƯỜI NÓI: mỗi người nghe nhận một bản giọng có âm lượng riêng ("gain" theo khoảng
// cách tới người đó), nên người nghe dùng thiết bị nào (kể cả iPhone, không cho chỉnh âm lượng) cũng nghe đúng.
// Nếu thiết bị người nói không dùng được cách đó, tự chuyển về cách cũ ("raw"): gửi giọng gốc cho mọi người và để
// người nghe tự hạ âm lượng. Người nói báo cho người nghe biết đang dùng cách nào (tin 'send-mode').

import { createVocalChain } from '../audio/vocalChain.js';

const SING_BITRATE = 96000; // bit/giây; mặc định của WebRTC (~32k) hơi thấp cho tiếng hát có vang
// Danh sách STUN/TURN do server gửi trong 'init' (setRoster); đây là giá trị dự phòng
let rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const SPEAK_THRESHOLD = 0.03; // RMS (0..1) coi là đang nói
const SPEAK_HOLD_MS = 300;
const MIN_DETECT_GAIN = 0.04; // người nói gửi quá nhỏ (xa) thì không đo "đang nói" nữa: tiếng nhỏ hơn nhiễu nền

// sendSignal(toId, data); onSpeaking(id, isSpeaking)
// getVolume(id, senderMode) -> 0..1: hệ số âm lượng MÌNH tự áp dụng khi phát giọng của người đó
//     (senderMode 'gain': họ đã hạ âm lượng rồi nên chỉ còn phần mình chỉnh; 'raw': mình phải tự hạ gần/xa)
// getSendVolume(id) -> 0..1: âm lượng giọng MÌNH gửi cho người đó (gần/xa, hoặc đang hát)
// getExpectedGain(id) -> 0..1: âm lượng người đó đang gửi cho mình theo cùng quy tắc (để đo "đang nói" cho đúng)
export function createVoice({ sendSignal, onSpeaking, onSelfSpeaking, getVolume, getSendVolume, getExpectedGain }) {
  let selfId = null;
  let started = false;
  let starting = null;
  let localStream = null;
  let audioCtx = null;
  let singing = null; // { chain } khi đang hát: gửi tiếng đã qua hiệu ứng thay cho tiếng mic thường
  let singingToken = 0; // để bỏ qua kết quả của lần bật hát đã bị dừng giữa chừng
  let sendMode = 'raw'; // 'gain' (hạ âm lượng riêng cho từng người nghe) hoặc 'raw' (gửi giọng gốc)
  let micSource = null; // nguồn mic trong Web Audio (chỉ khi sendMode = 'gain')
  let sendUpstream = null; // nút đang cấp giọng cho các bộ chỉnh âm lượng: micSource, hoặc đầu ra chuỗi hiệu ứng khi hát
  const roster = new Set(); // id những người khác trong phòng
  const readyPeers = new Set(); // đã nhận 'hello' từ họ
  const helloSentTo = new Set();
  const remoteModes = new Map(); // id -> 'gain' | 'raw': cách người đó đang gửi giọng cho mình
  const peers = new Map(); // id -> { pc, audio, sendGain, sendDest, analyser, speaking, lastLoud, ... }
  const chains = new Map(); // id -> Promise: xử lý tín hiệu tuần tự theo từng người

  function sendHello(id) {
    if (helloSentTo.has(id)) return;
    helloSentTo.add(id);
    sendSignal(id, { type: 'hello' });
  }

  function broadcastSendMode() {
    roster.forEach((id) => sendSignal(id, { type: 'send-mode', mode: sendMode }));
  }

  function connectIfReady(id) {
    if (!started || !roster.has(id) || !readyPeers.has(id) || peers.has(id)) return;
    if (selfId < id) createPeer(id, true);
  }

  // Thử xem Web Audio có tạo ra âm thanh thật không: phát một âm thử qua MediaStreamDestination rồi đo lại.
  // Nếu không (một số thiết bị/trình duyệt), ta dùng cách gửi giọng gốc cho chắc.
  async function sendChainWorks() {
    try {
      const osc = audioCtx.createOscillator();
      const level = audioCtx.createGain();
      level.gain.value = 0.5;
      const dest = audioCtx.createMediaStreamDestination();
      osc.connect(level).connect(dest);
      const probe = audioCtx.createMediaStreamSource(dest.stream);
      const analyser = audioCtx.createAnalyser();
      probe.connect(analyser);
      osc.start();
      const data = new Uint8Array(128);
      let ok = false;
      for (let i = 0; i < 10 && !ok; i++) {
        await new Promise((r) => setTimeout(r, 50));
        analyser.getByteTimeDomainData(data);
        ok = data.some((v) => Math.abs(v - 128) > 4);
      }
      osc.stop();
      [osc, level, dest, probe, analyser].forEach((n) => n.disconnect());
      return ok;
    } catch (err) {
      console.warn('Voice: thử Web Audio bị lỗi', err);
      return false;
    }
  }

  // Dựng đường gửi giọng "gain". Không được thì để nguyên 'raw' (cách dự phòng).
  async function initSendChain() {
    const track = localStream?.getAudioTracks()[0];
    if (!track || !audioCtx?.createMediaStreamDestination) return;
    try {
      if (audioCtx.state !== 'running') await audioCtx.resume();
    } catch {
      // thử tiếp ở dưới
    }
    if (audioCtx.state !== 'running') {
      console.info('Voice: AudioContext không chạy, dùng cách gửi giọng gốc');
      return;
    }
    if (!(await sendChainWorks())) {
      console.info('Voice: Web Audio không cho tiếng ra, dùng cách gửi giọng gốc');
      return;
    }
    micSource = audioCtx.createMediaStreamSource(new MediaStream([track]));
    sendUpstream = micSource;
    sendMode = 'gain';
    // Nếu giữa chừng Web Audio bị dừng (vd. iPhone bị ngắt) thì tự quay về cách gửi giọng gốc
    audioCtx.addEventListener('statechange', () => {
      if (audioCtx.state !== 'running') fallbackToRaw('AudioContext bị dừng');
    });
  }

  function fallbackToRaw(reason) {
    if (sendMode === 'raw') return;
    console.warn(`Voice: chuyển về cách gửi giọng gốc (${reason})`);
    sendMode = 'raw';
    const rawTrack = localStream?.getAudioTracks()[0];
    const track = singing && audioCtx?.state === 'running' ? singing.chain.outTrack : rawTrack;
    for (const peer of peers.values()) {
      const sender = peer.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (track) sender?.replaceTrack(track).catch(() => {});
      peer.sendGain?.disconnect();
      peer.sendDest?.disconnect();
      peer.sendGain = null;
      peer.sendDest = null;
    }
    broadcastSendMode();
  }

  function createPeer(id, initiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    const peer = {
      pc, audio: null, gain: null, volume: null, analyser: null, speaking: false, lastLoud: 0,
      sendGain: null, sendDest: null, // bộ chỉnh âm lượng riêng cho người này khi gửi (chế độ 'gain')
    };
    peers.set(id, peer);

    if (sendMode === 'gain' && localStream) {
      const gain = audioCtx.createGain();
      gain.gain.value = getSendVolume ? getSendVolume(id) : 1;
      const dest = audioCtx.createMediaStreamDestination();
      sendUpstream.connect(gain);
      gain.connect(dest);
      peer.sendGain = gain;
      peer.sendDest = dest;
      pc.addTrack(dest.stream.getAudioTracks()[0], dest.stream);
    } else if (singing) {
      pc.addTrack(singing.chain.outTrack, singing.chain.outStream);
    } else if (localStream) {
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    } else if (initiator) {
      pc.addTransceiver('audio', { direction: 'recvonly' }); // không có mic: chỉ nghe
    }
    sendSignal(id, { type: 'send-mode', mode: sendMode });

    pc.onicecandidate = (e) => e.candidate && sendSignal(id, { type: 'candidate', candidate: e.candidate });
    pc.ontrack = (e) => attachRemote(id, peer, e.streams[0]);
    pc.onconnectionstatechange = () => {
      console.info(`Voice: kết nối với ${id} -> ${pc.connectionState}`); // để chẩn đoán khi mất tiếng
      if (pc.connectionState === 'failed' && peers.get(id) === peer) closePeer(id);
    };

    if (initiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => sendSignal(id, { type: 'offer', sdp: pc.localDescription }))
        .catch((err) => console.warn('Voice: lỗi tạo offer', err));
    }
    return peer;
  }

  function attachRemote(id, peer, stream) {
    if (!stream || peer.audio) return;
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.srcObject = stream;
    document.body.appendChild(audio);
    peer.audio = audio;

    // Hệ số âm lượng của riêng mình (thanh trong menu) chỉnh bằng audio.volume. iPhone/iPad không cho đổi
    // volume (luôn là 1), nên ở đó dùng Web Audio: tắt tiếng phần tử <audio> (vẫn để nó chạy cho luồng không bị ngắt)
    // rồi phát qua GainNode.
    audio.volume = 0.5;
    if (audio.volume !== 0.5 && audioCtx) {
      audio.muted = true;
      peer.gain = audioCtx.createGain();
      audioCtx.createMediaStreamSource(stream).connect(peer.gain);
      peer.gain.connect(audioCtx.destination);
    }
    applyVolume(peer, getVolume ? getVolume(id, remoteModes.get(id) ?? 'raw') : 1);

    if (audioCtx) {
      peer.analyser = audioCtx.createAnalyser();
      peer.analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(peer.analyser); // đo trước khi chỉnh âm lượng phía mình
    }
  }

  function applyVolume(peer, volume) {
    if (!peer.audio) return;
    const v = Math.min(1, Math.max(0, volume));
    if (peer.volume !== null && Math.abs(peer.volume - v) < 0.01) return; // chưa đổi đáng kể thì thôi
    peer.volume = v;
    if (peer.gain) peer.gain.gain.value = v;
    else peer.audio.volume = v;
  }

  function closePeer(id) {
    const peer = peers.get(id);
    if (!peer) return;
    peer.pc.close();
    peer.audio?.remove();
    peer.sendGain?.disconnect();
    peer.sendDest?.disconnect();
    peers.delete(id);
    if (peer.speaking) onSpeaking?.(id, false);
  }

  // Chế độ 'raw': đổi luồng âm thanh đang gửi cho mọi người sang `track` (không cần kết nối lại)
  function replaceOutgoingTrack(track) {
    for (const peer of peers.values()) {
      const sender = peer.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (!sender) continue; // người này không có mic (chỉ nghe) nên không có gì để đổi
      sender.replaceTrack(track).catch((err) => console.warn('Voice: không đổi được luồng gửi', err));
    }
  }

  // Đặt trần bit rate cho luồng đang gửi (null = về mặc định)
  function applyBitrate(maxBitrate) {
    for (const peer of peers.values()) {
      const sender = peer.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (!sender) continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        if (maxBitrate) params.encodings[0].maxBitrate = maxBitrate;
        else delete params.encodings[0].maxBitrate;
        sender.setParameters(params).catch(() => {});
      } catch {
        // trình duyệt không cho chỉnh thì dùng mặc định
      }
    }
  }

  // Chế độ 'gain': đổi nguồn cấp giọng cho các bộ chỉnh âm lượng (mic thường <-> chuỗi hiệu ứng khi hát)
  function setSendUpstream(node) {
    for (const peer of peers.values()) {
      if (!peer.sendGain) continue;
      try {
        sendUpstream.disconnect(peer.sendGain);
      } catch {
        // chưa nối thì thôi
      }
      node.connect(peer.sendGain);
    }
    sendUpstream = node;
  }

  function restoreMicConstraints() {
    const track = localStream?.getAudioTracks()[0];
    track?.applyConstraints({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }).catch(() => {});
  }

  function reset() {
    for (const id of [...peers.keys()]) closePeer(id);
    roster.clear();
    readyPeers.clear();
    helloSentTo.clear();
    remoteModes.clear();
    chains.clear();
  }

  // Mỗi 0.1 giây: cập nhật âm lượng gần/xa (gửi và nghe), và phát hiện ai đang nói bằng mức tín hiệu (RMS)
  const buf = new Uint8Array(128);
  let localAnalyser = null; // đo mức mic của chính mình (để avatar mình nhép miệng)
  let localLastLoud = 0;
  let localSpeaking = false;
  setInterval(() => {
    const now = performance.now();
    if (localAnalyser) {
      // mic đang tắt thì track bị vô hiệu hoá, tín hiệu là im lặng nên không cần kiểm tra riêng
      localAnalyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      if (Math.sqrt(sum / buf.length) > SPEAK_THRESHOLD) localLastLoud = now;
      const speaking = now - localLastLoud < SPEAK_HOLD_MS;
      if (speaking !== localSpeaking) {
        localSpeaking = speaking;
        onSelfSpeaking?.(speaking);
      }
    }
    for (const [id, peer] of peers) {
      const mode = remoteModes.get(id) ?? 'raw';
      if (getVolume) applyVolume(peer, getVolume(id, mode));
      if (peer.sendGain && getSendVolume) {
        peer.sendGain.gain.setTargetAtTime(getSendVolume(id), audioCtx.currentTime, 0.05); // đổi êm, không bị lách tách
      }
      if (!peer.analyser) continue;
      peer.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      let level = Math.sqrt(sum / buf.length);
      if (mode === 'gain' && getExpectedGain) {
        // người nói đã hạ âm lượng theo khoảng cách nên tín hiệu nhận được nhỏ đi; chia lại cho đúng mức gốc
        const gain = getExpectedGain(id);
        level = gain >= MIN_DETECT_GAIN ? level / gain : 0;
      }
      if (level > SPEAK_THRESHOLD) peer.lastLoud = now;
      const speaking = now - peer.lastLoud < SPEAK_HOLD_MS;
      if (speaking !== peer.speaking) {
        peer.speaking = speaking;
        onSpeaking?.(id, speaking);
      }
    }
  }, 100);

  return {
    // Gọi khi vào phòng / kết nối lại: danh sách người khác trong phòng
    setRoster(selfIdValue, ids, iceServers) {
      reset();
      selfId = selfIdValue;
      if (iceServers?.length) rtcConfig = { iceServers };
      ids.forEach((id) => roster.add(id));
      if (started) {
        ids.forEach(sendHello);
        broadcastSendMode();
      }
    },
    peerJoined(id) {
      roster.add(id);
    },
    peerLeft(id) {
      roster.delete(id);
      readyPeers.delete(id);
      helloSentTo.delete(id);
      remoteModes.delete(id);
      chains.delete(id);
      closePeer(id);
    },
    reset,

    // Xin quyền mic và bật voice. Trả về 'mic' | 'listen-only'. Gọi lần nữa thì trả cùng kết quả.
    start() {
      if (starting) return starting;
      starting = (async () => {
        audioCtx = new AudioContext();
        let mode = 'mic';
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          localStream.getAudioTracks().forEach((t) => (t.enabled = false)); // mặc định tắt tiếng
          try {
            localAnalyser = audioCtx.createAnalyser();
            localAnalyser.fftSize = 256;
            audioCtx.createMediaStreamSource(localStream).connect(localAnalyser); // chỉ để đo, không nối ra loa
          } catch (err) {
            console.warn('Voice: không đo được mức mic của mình', err);
          }
        } catch (err) {
          console.warn('Voice: không dùng được mic, chuyển sang chỉ nghe', err);
          mode = 'listen-only';
        }
        if (localStream) {
          try {
            await initSendChain(); // xong (hoặc bỏ cuộc) trước khi nối với ai
          } catch (err) {
            console.warn('Voice: không dựng được đường gửi riêng, dùng cách gửi giọng gốc', err);
            sendMode = 'raw'; // mic vẫn dùng bình thường
          }
        }
        started = true;
        roster.forEach(sendHello);
        broadcastSendMode();
        roster.forEach(connectIfReady);
        return mode;
      })();
      return starting;
    },

    // Số người đã nối voice thành công / số người khác trong phòng (để hiện lên màn hình khi chẩn đoán)
    status() {
      let connected = 0;
      for (const peer of peers.values()) if (peer.pc.connectionState === 'connected') connected++;
      return { connected, total: roster.size };
    },

    // Bắt đầu hát: gửi tiếng mic đã qua chuỗi hiệu ứng (echo, reverb...) thay cho tiếng mic thường.
    // Người hát KHÔNG nghe lại giọng của chính mình. Bật/tắt mic (toggleMic) vẫn hoạt động như thường.
    async startSinging() {
      if (singing || !localStream || !audioCtx) return;
      const token = ++singingToken;
      const track = localStream.getAudioTracks()[0];
      // Khi hát bỏ khử nhiễu và tự chỉnh âm lượng của trình duyệt (làm giọng kéo dài bị cắt, bơm lên xuống);
      // giữ khử vọng vì không biết người hát dùng tai nghe hay loa.
      try {
        await track.applyConstraints({ echoCancellation: true, noiseSuppression: false, autoGainControl: false });
      } catch (err) {
        console.warn('Voice: không đổi được cấu hình mic khi hát', err);
      }
      if (token !== singingToken) {
        restoreMicConstraints(); // đã dừng hát trong lúc chờ
        return;
      }
      if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
      let chain;
      try {
        chain = createVocalChain(audioCtx, track);
      } catch (err) {
        // thiết bị không dựng được chuỗi hiệu ứng: vẫn hát được, chỉ là bằng giọng mic thường
        console.warn('Voice: không dựng được hiệu ứng khi hát, hát bằng mic thường', err);
        restoreMicConstraints();
        return;
      }
      singing = { chain };
      if (sendMode === 'gain') setSendUpstream(chain.output);
      else replaceOutgoingTrack(chain.outTrack);
      applyBitrate(SING_BITRATE);
    },

    // Hát xong: trả về mic thường
    stopSinging() {
      singingToken++;
      if (!singing) return;
      const { chain } = singing;
      singing = null;
      if (sendMode === 'gain') setSendUpstream(micSource);
      else replaceOutgoingTrack(localStream?.getAudioTracks()[0]);
      applyBitrate(null);
      chain.dispose();
      restoreMicConstraints();
    },

    // Bật/tắt mic; trả về true nếu đang bật. Không có mic thì trả về false.
    toggleMic() {
      const tracks = localStream?.getAudioTracks() ?? [];
      if (!tracks.length) return false;
      const enabled = !tracks[0].enabled;
      tracks.forEach((t) => (t.enabled = enabled));
      return enabled;
    },

    handleSignal(from, data) {
      if (!data || !roster.has(from)) return;

      if (data.type === 'hello') {
        readyPeers.add(from);
        if (started) {
          sendHello(from);
          connectIfReady(from);
        }
        return;
      }
      if (data.type === 'send-mode') {
        remoteModes.set(from, data.mode === 'gain' ? 'gain' : 'raw');
        return;
      }
      if (!started) return;

      const chain = (chains.get(from) ?? Promise.resolve())
        .then(async () => {
          if (data.type === 'offer') {
            const peer = peers.get(from) ?? createPeer(from, false);
            await peer.pc.setRemoteDescription(data.sdp);
            await peer.pc.setLocalDescription(await peer.pc.createAnswer());
            sendSignal(from, { type: 'answer', sdp: peer.pc.localDescription });
          } else if (data.type === 'answer') {
            await peers.get(from)?.pc.setRemoteDescription(data.sdp);
          } else if (data.type === 'candidate') {
            await peers.get(from)?.pc.addIceCandidate(data.candidate);
          }
        })
        .catch((err) => console.warn('Voice: lỗi xử lý tín hiệu', err));
      chains.set(from, chain);
    },
  };
}
