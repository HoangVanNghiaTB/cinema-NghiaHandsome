// Chuỗi hiệu ứng cho mic khi hát karaoke: lọc tiếng ù -> EQ nhẹ -> nén -> echo stereo + reverb (đều nhỏ, giọng thật là chính) -> chặn đỉnh.
// Đầu ra là một MediaStream để gửi cho mọi người; KHÔNG nối ra loa của chính người hát (không tự nghe lại,
// tránh bị hú và độ trễ). Các thông số giọng, echo, reverb chỉnh được lúc đang hát qua bảng ở tường sau (xem mixParams.js);
// ở đây chỉ còn những thứ cố định.

import { MIX_DEFAULTS } from './mixParams.js';

const MUD_Q = 1;
const PRESENCE_Q = 1;
// nén cho giọng đều: đoạn nhỏ không chìm, đoạn hét không chói
const COMPRESSOR = { threshold: -24, knee: 12, ratio: 3, attack: 0.01, release: 0.15 };
// chặn đỉnh để không bị rè khi hát to
const LIMITER = { threshold: -2, knee: 0, ratio: 20, attack: 0.003, release: 0.1 };

// Tiếng vang tự tạo: nhiễu ngẫu nhiên tắt dần theo hàm mũ (giảm 60 dB sau đúng `seconds`)
function makeImpulse(ctx, seconds) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp((-6.9 * i) / length);
  }
  return buffer;
}

// track: MediaStreamTrack của mic; params: bộ thông số theo mixParams.js (thiếu thì lấy mặc định).
// Trả về { output, outStream, outTrack, setParams(params), dispose() }.
export function createVocalChain(ctx, track, params = MIX_DEFAULTS) {
  const P = { ...MIX_DEFAULTS, ...params };
  const nodes = [];
  const add = (node) => {
    nodes.push(node);
    return node;
  };
  const filter = (type, frequency, gain = 0, q = 0.707) => {
    const f = add(ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = frequency;
    f.gain.value = gain;
    f.Q.value = q;
    return f;
  };
  const gain = (value) => {
    const g = add(ctx.createGain());
    g.gain.value = value;
    return g;
  };

  const source = add(ctx.createMediaStreamSource(new MediaStream([track])));
  const hp = filter('highpass', P.hp);
  const mud = filter('peaking', 200, P.mud, MUD_Q);
  const presence = filter('peaking', 4000, P.presence, PRESENCE_Q);
  const comp = add(ctx.createDynamicsCompressor());
  comp.threshold.value = COMPRESSOR.threshold;
  comp.knee.value = COMPRESSOR.knee;
  comp.ratio.value = COMPRESSOR.ratio;
  comp.attack.value = COMPRESSOR.attack;
  comp.release.value = COMPRESSOR.release;
  source.connect(hp).connect(mud).connect(presence).connect(comp);

  const mix = gain(1);
  comp.connect(mix); // tiếng gốc

  // Echo stereo: comp -> gửi -> cắt thấp -> (delay trái | delay phải), mỗi bên có lowpass và vòng hồi tiếp riêng -> mix
  const echoSend = gain(P.echoWet / 100);
  const echoLow = filter('highpass', P.echoHp);
  const echoMerger = add(ctx.createChannelMerger(2));
  comp.connect(echoSend).connect(echoLow);
  const echoDelays = [];
  const echoTones = [];
  const echoFeedbacks = [];
  [P.echoL, P.echoR].forEach((ms, channel) => {
    const delay = add(ctx.createDelay(1));
    delay.delayTime.value = ms / 1000;
    const tone = filter('lowpass', P.echoLp);
    const feedback = gain(P.echoFb / 100);
    echoLow.connect(delay).connect(tone);
    tone.connect(feedback).connect(delay);
    tone.connect(echoMerger, 0, channel);
    echoDelays.push(delay);
    echoTones.push(tone);
    echoFeedbacks.push(feedback);
  });
  echoMerger.connect(mix);

  // Reverb: comp -> trễ đầu -> lọc bớt đục -> vang -> lọc bớt chói -> mix
  const preDelay = add(ctx.createDelay(0.5));
  preDelay.delayTime.value = P.revPre / 1000;
  const reverbLow = filter('highpass', P.revHp);
  const convolver = add(ctx.createConvolver());
  let impulseSeconds = P.revTime;
  convolver.buffer = makeImpulse(ctx, impulseSeconds);
  const reverbTone = filter('lowpass', P.revLp);
  const reverbWet = gain(P.revWet / 100);
  comp.connect(preDelay).connect(reverbLow).connect(convolver).connect(reverbTone).connect(reverbWet).connect(mix);

  const limiter = add(ctx.createDynamicsCompressor());
  limiter.threshold.value = LIMITER.threshold;
  limiter.knee.value = LIMITER.knee;
  limiter.ratio.value = LIMITER.ratio;
  limiter.attack.value = LIMITER.attack;
  limiter.release.value = LIMITER.release;
  const out = add(ctx.createMediaStreamDestination());
  mix.connect(limiter).connect(out);

  // Đổi thông số lúc đang hát: giá trị đổi êm (không lách tách); chỉ thời gian vang phải dựng lại tiếng vang nên đợi
  // người chỉnh dừng tay một chút (kéo thanh liên tục không dựng lại mỗi lần)
  const set = (param, value) => param.setTargetAtTime(value, ctx.currentTime, 0.03);
  let impulseTimer = null;
  const setParams = (next) => {
    Object.assign(P, next);
    set(hp.frequency, P.hp);
    set(mud.gain, P.mud);
    set(presence.gain, P.presence);
    set(echoSend.gain, P.echoWet / 100);
    set(echoLow.frequency, P.echoHp);
    echoDelays[0] && set(echoDelays[0].delayTime, P.echoL / 1000);
    echoDelays[1] && set(echoDelays[1].delayTime, P.echoR / 1000);
    echoTones.forEach((t) => set(t.frequency, P.echoLp));
    echoFeedbacks.forEach((f) => set(f.gain, P.echoFb / 100));
    set(preDelay.delayTime, P.revPre / 1000);
    set(reverbLow.frequency, P.revHp);
    set(reverbTone.frequency, P.revLp);
    set(reverbWet.gain, P.revWet / 100);
    if (Math.abs(P.revTime - impulseSeconds) >= 0.05 && !impulseTimer) {
      impulseTimer = setTimeout(() => {
        impulseTimer = null;
        impulseSeconds = P.revTime;
        convolver.buffer = makeImpulse(ctx, impulseSeconds);
      }, 250);
    }
  };

  return {
    setParams,
    output: limiter, // đầu ra dạng nút Web Audio, để nối thêm bộ chỉnh âm lượng riêng cho từng người nghe
    outStream: out.stream,
    outTrack: out.stream.getAudioTracks()[0],
    dispose() {
      clearTimeout(impulseTimer);
      nodes.forEach((n) => n.disconnect());
    },
  };
}
