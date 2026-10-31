// Voice chat mesh bằng WebRTC thuần; báo hiệu (signaling) đi qua Socket.IO.
//
// Quy trình: ai bật voice thì gửi 'hello' cho mọi người trong phòng. Khi hai bên đều đã bật,
// bên có id nhỏ hơn tạo offer (tránh hai bên cùng offer một lúc).

import { createVocalChain } from '../audio/vocalChain.js';

const SING_BITRATE = 96000; // bit/giây; mặc định của WebRTC (~32k) hơi thấp cho tiếng hát có vang
// Danh sách STUN/TURN do server gửi trong 'init' (setRoster); đây là giá trị dự phòng
let rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const SPEAK_THRESHOLD = 0.03; // RMS (0..1) coi là đang nói
const SPEAK_HOLD_MS = 300;

// sendSignal(toId, data); onSpeaking(id, isSpeaking); getVolume(id) -> 0..1: âm lượng nghe người đó (gần/xa, hát...)
export function createVoice({ sendSignal, onSpeaking, getVolume }) {
  let selfId = null;
  let started = false;
  let starting = null;
  let localStream = null;
  let audioCtx = null;
  let singing = null; // { chain } khi đang hát: gửi tiếng đã qua hiệu ứng thay cho tiếng mic thường
  let singingToken = 0; // để bỏ qua kết quả của lần bật hát đã bị dừng giữa chừng
  const roster = new Set(); // id những người khác trong phòng
  const readyPeers = new Set(); // đã nhận 'hello' từ họ
  const helloSentTo = new Set();
  const peers = new Map(); // id -> { pc, audio, analyser, speaking, lastLoud }
  const chains = new Map(); // id -> Promise: xử lý tín hiệu tuần tự theo từng người

  function sendHello(id) {
    if (helloSentTo.has(id)) return;
    helloSentTo.add(id);
    sendSignal(id, { type: 'hello' });
  }

  function connectIfReady(id) {
    if (!started || !roster.has(id) || !readyPeers.has(id) || peers.has(id)) return;
    if (selfId < id) createPeer(id, true);
  }

  function createPeer(id, initiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    const peer = { pc, audio: null, gain: null, volume: null, analyser: null, speaking: false, lastLoud: 0 };
    peers.set(id, peer);

    if (singing) pc.addTrack(singing.chain.outTrack, singing.chain.outStream);
    else if (localStream) localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    else if (initiator) pc.addTransceiver('audio', { direction: 'recvonly' }); // không có mic: chỉ nghe

    pc.onicecandidate = (e) => e.candidate && sendSignal(id, { type: 'candidate', candidate: e.candidate });
    pc.ontrack = (e) => attachRemote(id, peer, e.streams[0]);
    pc.onconnectionstatechange = () => {
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

    // Chỉnh âm lượng bằng audio.volume. iPhone/iPad không cho đổi volume (luôn là 1), nên ở đó
    // dùng Web Audio: tắt tiếng phần tử <audio> (vẫn để nó chạy cho luồng không bị ngắt) rồi phát qua GainNode.
    audio.volume = 0.5;
    if (audio.volume !== 0.5 && audioCtx) {
      audio.muted = true;
      peer.gain = audioCtx.createGain();
      audioCtx.createMediaStreamSource(stream).connect(peer.gain);
      peer.gain.connect(audioCtx.destination);
    }
    applyVolume(peer, getVolume ? getVolume(id) : 1);

    if (audioCtx) {
      peer.analyser = audioCtx.createAnalyser();
      peer.analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(peer.analyser); // đo trước khi chỉnh âm lượng, nên đèn "đang nói" không phụ thuộc khoảng cách
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
    peers.delete(id);
    if (peer.speaking) onSpeaking?.(id, false);
  }

  // Đổi luồng âm thanh đang gửi cho mọi người sang `track` (không cần kết nối lại), và đặt trần bit rate
  function swapOutgoingTrack(track, maxBitrate) {
    for (const peer of peers.values()) {
      const sender = peer.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (!sender) continue; // người này không có mic (chỉ nghe) nên không có gì để đổi
      sender.replaceTrack(track).catch((err) => console.warn('Voice: không đổi được luồng gửi', err));
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

  function restoreMicConstraints() {
    const track = localStream?.getAudioTracks()[0];
    track?.applyConstraints({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }).catch(() => {});
  }

  function reset() {
    for (const id of [...peers.keys()]) closePeer(id);
    roster.clear();
    readyPeers.clear();
    helloSentTo.clear();
    chains.clear();
  }

  // Phát hiện ai đang nói: so mức âm lượng (RMS) của từng luồng
  const buf = new Uint8Array(128);
  setInterval(() => {
    const now = performance.now();
    for (const [id, peer] of peers) {
      if (getVolume) applyVolume(peer, getVolume(id)); // theo khoảng cách hiện tại (người đi lại)
      if (!peer.analyser) continue;
      peer.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      if (Math.sqrt(sum / buf.length) > SPEAK_THRESHOLD) peer.lastLoud = now;
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
      if (started) ids.forEach(sendHello);
    },
    peerJoined(id) {
      roster.add(id);
    },
    peerLeft(id) {
      roster.delete(id);
      readyPeers.delete(id);
      helloSentTo.delete(id);
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
        } catch (err) {
          console.warn('Voice: không dùng được mic, chuyển sang chỉ nghe', err);
          mode = 'listen-only';
        }
        started = true;
        roster.forEach(sendHello);
        roster.forEach(connectIfReady);
        return mode;
      })();
      return starting;
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
      const chain = createVocalChain(audioCtx, track);
      singing = { chain };
      swapOutgoingTrack(chain.outTrack, SING_BITRATE);
    },

    // Hát xong: trả về mic thường
    stopSinging() {
      singingToken++;
      if (!singing) return;
      const { chain } = singing;
      singing = null;
      swapOutgoingTrack(localStream?.getAudioTracks()[0], null);
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
