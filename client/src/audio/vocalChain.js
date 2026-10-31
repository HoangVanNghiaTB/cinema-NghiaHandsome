// Chuỗi hiệu ứng cho mic khi hát karaoke: lọc tiếng ù -> EQ nhẹ -> nén -> echo + reverb -> chặn đỉnh.
// Đầu ra là một MediaStream để gửi cho mọi người; KHÔNG nối ra loa của chính người hát (không tự nghe lại,
// tránh bị hú và độ trễ). Các thông số mặc định cố định ở đây, không chỉnh trên web.

const HIGHPASS_HZ = 100; // bỏ tiếng ù, tiếng "bụp" khi hơi thổi vào mic
const MUD_CUT = { freq: 200, gain: -2, q: 1 }; // bớt đục
const PRESENCE = { freq: 4000, gain: 2, q: 1 }; // rõ lời hơn
// nén cho giọng đều: đoạn nhỏ không chìm, đoạn hét không chói
const COMPRESSOR = { threshold: -24, knee: 12, ratio: 3, attack: 0.01, release: 0.15 };
// Echo ít: lặp 1-2 lần, lần thứ 3 rất nhỏ (mỗi lần = feedback x lần trước: 0.16 -> 0.056 -> 0.020)
const ECHO = { delay: 0.3, feedback: 0.35, wet: 0.16, lowpass: 3500 }; // delay: giây (hợp nhạc ~100 nhịp/phút)
// Reverb như phòng lớn: vang ~1.5 giây, vang tối màu, bớt tiếng đục ở phần vang
const REVERB = { seconds: 1.5, preDelay: 0.025, highpass: 300, lowpass: 6000, wet: 0.22 };
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

// track: MediaStreamTrack của mic. Trả về { outStream, outTrack, dispose() }.
export function createVocalChain(ctx, track) {
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
  const hp = filter('highpass', HIGHPASS_HZ);
  const mud = filter('peaking', MUD_CUT.freq, MUD_CUT.gain, MUD_CUT.q);
  const presence = filter('peaking', PRESENCE.freq, PRESENCE.gain, PRESENCE.q);
  const comp = add(ctx.createDynamicsCompressor());
  comp.threshold.value = COMPRESSOR.threshold;
  comp.knee.value = COMPRESSOR.knee;
  comp.ratio.value = COMPRESSOR.ratio;
  comp.attack.value = COMPRESSOR.attack;
  comp.release.value = COMPRESSOR.release;
  source.connect(hp).connect(mud).connect(presence).connect(comp);

  const mix = gain(1);
  comp.connect(mix); // tiếng gốc

  // Echo: comp -> gửi -> delay -> lowpass -> (vòng hồi tiếp về delay) và -> mix
  const echoSend = gain(ECHO.wet);
  const delay = add(ctx.createDelay(1));
  delay.delayTime.value = ECHO.delay;
  const echoTone = filter('lowpass', ECHO.lowpass); // mỗi lần lặp tối hơn
  const echoFeedback = gain(ECHO.feedback);
  comp.connect(echoSend).connect(delay).connect(echoTone);
  echoTone.connect(echoFeedback).connect(delay);
  echoTone.connect(mix);

  // Reverb: comp -> trễ đầu -> lọc bớt đục -> vang -> lọc bớt chói -> mix
  const preDelay = add(ctx.createDelay(0.5));
  preDelay.delayTime.value = REVERB.preDelay;
  const reverbLow = filter('highpass', REVERB.highpass);
  const convolver = add(ctx.createConvolver());
  convolver.buffer = makeImpulse(ctx, REVERB.seconds);
  const reverbTone = filter('lowpass', REVERB.lowpass);
  const reverbWet = gain(REVERB.wet);
  comp.connect(preDelay).connect(reverbLow).connect(convolver).connect(reverbTone).connect(reverbWet).connect(mix);

  const limiter = add(ctx.createDynamicsCompressor());
  limiter.threshold.value = LIMITER.threshold;
  limiter.knee.value = LIMITER.knee;
  limiter.ratio.value = LIMITER.ratio;
  limiter.attack.value = LIMITER.attack;
  limiter.release.value = LIMITER.release;
  const out = add(ctx.createMediaStreamDestination());
  mix.connect(limiter).connect(out);

  return {
    outStream: out.stream,
    outTrack: out.stream.getAudioTracks()[0],
    dispose() {
      nodes.forEach((n) => n.disconnect());
    },
  };
}
