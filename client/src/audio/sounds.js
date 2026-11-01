import * as THREE from 'three';

// Âm thanh trong rạp, dùng các file có sẵn trong dự án (client/public/sounds). Mỗi file chứa nhiều tiếng;
// ta cắt từng tiếng/đoạn ra (theo các mốc `onsets`, tìm bằng cách phân tích biên độ) và phát ngẫu nhiên một cái mỗi lần.
// Mặc định âm thanh có vị trí: càng xa người nghe càng nhỏ, và lệch trái/phải theo hướng nguồn âm.
// Loại `global: true` thì cả phòng nghe như nhau, không theo khoảng cách (vd. vỗ tay).
//
// maxGain là phần của mức tối đa (YouTube ở 100% là mức 1) mà tiếng to nhất có thể đạt, ở sát người nghe.
const SOUNDS = {
  // Tiếng bước chân (chạy trên cỏ), ~10 bước trong file
  step: {
    url: '/sounds/footsteps.mp3',
    onsets: [0.17, 0.83, 1.18, 1.49, 1.8, 3.42, 3.75, 4.43, 4.74, 5.05],
    preRoll: 0.04, // lấy thêm một chút trước tiếng chạm đất cho trọn đoạn bắt đầu
    duration: 0.28, // độ dài mỗi tiếng được cắt
    fadeOut: 0.06, // mờ dần ở cuối để không bị "tách" khi cắt
    rateJitter: 0.1, // tốc độ phát đổi ngẫu nhiên ±5% cho đỡ lặp
    maxGain: 1 / 20,
    maxDistance: 12, // m: xa hơn thế thì không nghe thấy
  },
  // Tiếng tát khi đánh trúng, 4 tiếng trong file
  slap: {
    url: '/sounds/slap.mp3',
    onsets: [0.46, 2.735, 5.425, 8.275],
    preRoll: 0.02,
    duration: 0.45,
    fadeOut: 0.06,
    rateJitter: 0.06,
    maxGain: 1 / 2,
    maxDistance: 18, // cả phòng đều nghe được, xa thì nhỏ
  },
  // Tiếng vỗ tay của khán giả (file dài ~7.7 giây, mạnh nhất ở 5 giây đầu): cắt một đoạn 3 giây khớp với lúc
  // avatar vỗ tay. Cả phòng nghe như nhau (không theo gần xa) nhưng nhỏ, đủ nghe mà không gây khó chịu.
  clap: {
    url: '/sounds/clap.mp3',
    onsets: [0.3, 1.2, 2.2], // ba điểm bắt đầu khác nhau cho đỡ lặp
    preRoll: 0,
    duration: 3,
    fadeIn: 0.15,
    fadeOut: 0.6,
    rateJitter: 0.04,
    maxGain: 0.04,
    global: true,
    maxVoices: 2, // nhiều người vỗ tay cùng lúc thì chỉ chồng tối đa 2 tiếng, không thì thành tiếng ồn
  },
};

const MIN_AUDIBLE_GAIN = 0.0015;
export const STEP_LENGTH = 1.5; // m đi được giữa hai bước chân

// listener: camera của người chơi (vị trí và hướng nhìn quyết định âm to nhỏ, lệch trái/phải)
export function createSounds(listener) {
  let ctx = null;
  const buffers = {}; // tên âm thanh -> AudioBuffer (có sau khi tải xong)
  const lastPlayed = {}; // tên âm thanh -> chỉ số tiếng vừa phát, để không lặp liền nhau
  const voices = {}; // tên âm thanh -> số tiếng đang phát (để giới hạn maxVoices)
  let master = 1; // hệ số âm lượng chung do người dùng chỉnh (thanh "Hiệu ứng" trong menu)
  const right = new THREE.Vector3();

  async function load(name) {
    try {
      const data = await (await fetch(SOUNDS[name].url)).arrayBuffer();
      buffers[name] = await ctx.decodeAudioData(data);
    } catch (err) {
      console.warn(`Không nạp được âm thanh "${name}"`, err);
    }
  }

  // x, z: vị trí nguồn âm (bỏ qua với âm thanh global)
  function playAt(name, x, z) {
    const sound = SOUNDS[name];
    const buffer = buffers[name];
    if (!ctx || !buffer || ctx.state !== 'running') return;

    let gain;
    let pan = 0; // -1 = hoàn toàn bên trái, +1 = bên phải (theo hướng camera đang nhìn)
    if (sound.global) {
      if ((voices[name] ?? 0) >= (sound.maxVoices ?? Infinity)) return;
      gain = sound.maxGain * master;
    } else {
      const dx = x - listener.position.x;
      const dz = z - listener.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= sound.maxDistance) return;
      const falloff = 1 - dist / sound.maxDistance;
      gain = sound.maxGain * falloff * falloff * master; // giảm nhanh theo khoảng cách
      if (dist > 0.5) {
        right.set(1, 0, 0).applyQuaternion(listener.quaternion);
        pan = THREE.MathUtils.clamp((right.x * dx + right.z * dz) / dist, -1, 1) * 0.8;
      }
    }
    if (gain < MIN_AUDIBLE_GAIN) return;

    // chọn ngẫu nhiên một tiếng, không trùng tiếng vừa rồi
    let index;
    do index = Math.floor(Math.random() * sound.onsets.length);
    while (index === lastPlayed[name] && sound.onsets.length > 1);
    lastPlayed[name] = index;
    const offset = Math.max(0, sound.onsets[index] - sound.preRoll);

    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 1 + (Math.random() - 0.5) * sound.rateJitter;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + (sound.fadeIn ?? 0.004));
    env.gain.setValueAtTime(gain, t + sound.duration - sound.fadeOut);
    env.gain.linearRampToValueAtTime(0, t + sound.duration);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    src.connect(env).connect(panner).connect(ctx.destination);
    voices[name] = (voices[name] ?? 0) + 1;
    src.onended = () => (voices[name] -= 1);
    src.start(t, offset, sound.duration);
  }

  return {
    // Gọi trong một thao tác bấm của người dùng (trình duyệt chặn âm thanh trước đó)
    unlock() {
      if (!ctx) {
        ctx = new AudioContext();
        Object.keys(SOUNDS).forEach(load);
      }
      if (ctx.state === 'suspended') ctx.resume();
    },
    // Hệ số âm lượng chung cho mọi hiệu ứng (1 = như thiết kế, 0 = tắt, 2 = gấp đôi)
    setVolume(scale) {
      master = Math.max(0, scale);
    },
    playStepAt: (x, z) => playAt('step', x, z),
    playSlapAt: (x, z) => playAt('slap', x, z),
    playClap: () => playAt('clap'), // cả phòng nghe như nhau
  };
}
