import * as THREE from 'three';

// Tiếng bước chân dùng file có sẵn trong dự án (client/public/sounds/footsteps.mp3: chạy trên cỏ).
// File dài ~6.6 giây chứa nhiều tiếng bước; ta cắt từng tiếng ra và phát ngẫu nhiên một tiếng mỗi bước.
// Càng xa người nghe càng nhỏ, và lệch trái/phải theo hướng nguồn âm.

const SAMPLE_URL = '/sounds/footsteps.mp3';
// Thời điểm (giây) tiếng chạm đất của từng bước trong file, tìm bằng cách phân tích biên độ
const STEP_ONSETS = [0.17, 0.83, 1.18, 1.49, 1.8, 3.42, 3.75, 4.43, 4.74, 5.05];
const PRE_ROLL = 0.04; // lấy thêm một chút trước tiếng chạm đất cho trọn đoạn bắt đầu
const STEP_DURATION = 0.28; // độ dài mỗi bước được cắt
const FADE_OUT = 0.06; // mờ dần ở cuối để không bị "tách" khi cắt

// Âm lượng tối đa của một bước = 1/20 mức tối đa (YouTube ở 100% là mức 1)
const MAX_GAIN = 1 / 20;
const MAX_DISTANCE = 12; // m: xa hơn thế thì không nghe thấy
const MIN_AUDIBLE_GAIN = 0.0015;
export const STEP_LENGTH = 1.5; // m đi được giữa hai bước

// listener: camera của người chơi (vị trí và hướng nhìn quyết định âm to nhỏ, lệch trái/phải)
export function createFootsteps(listener) {
  let ctx = null;
  let sample = null; // AudioBuffer của file, null cho tới khi tải xong
  let lastStep = -1;
  const right = new THREE.Vector3();

  async function loadSample() {
    try {
      const data = await (await fetch(SAMPLE_URL)).arrayBuffer();
      sample = await ctx.decodeAudioData(data);
    } catch (err) {
      console.warn('Không nạp được tiếng bước chân', err);
    }
  }

  return {
    // Gọi trong một thao tác bấm của người dùng (trình duyệt chặn âm thanh trước đó)
    unlock() {
      if (!ctx) {
        ctx = new AudioContext();
        loadSample();
      }
      if (ctx.state === 'suspended') ctx.resume();
    },

    // Phát một bước chân tại vị trí (x, z) trong phòng
    playAt(x, z) {
      if (!ctx || !sample || ctx.state !== 'running') return;
      const dx = x - listener.position.x;
      const dz = z - listener.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= MAX_DISTANCE) return;
      const falloff = 1 - dist / MAX_DISTANCE;
      const gain = MAX_GAIN * falloff * falloff; // giảm nhanh theo khoảng cách
      if (gain < MIN_AUDIBLE_GAIN) return;

      // -1 = hoàn toàn bên trái, +1 = bên phải (theo hướng camera đang nhìn)
      let pan = 0;
      if (dist > 0.5) {
        right.set(1, 0, 0).applyQuaternion(listener.quaternion);
        pan = THREE.MathUtils.clamp((right.x * dx + right.z * dz) / dist, -1, 1) * 0.8;
      }

      // chọn ngẫu nhiên một bước, không trùng bước vừa rồi
      let step;
      do step = Math.floor(Math.random() * STEP_ONSETS.length);
      while (step === lastStep && STEP_ONSETS.length > 1);
      lastStep = step;
      const offset = Math.max(0, STEP_ONSETS[step] - PRE_ROLL);

      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = sample;
      src.playbackRate.value = 0.95 + Math.random() * 0.1; // hơi khác nhau mỗi lần cho đỡ lặp
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + 0.004);
      env.gain.setValueAtTime(gain, t + STEP_DURATION - FADE_OUT);
      env.gain.linearRampToValueAtTime(0, t + STEP_DURATION);
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      src.connect(env).connect(panner).connect(ctx.destination);
      src.start(t, offset, STEP_DURATION);
    },
  };
}
