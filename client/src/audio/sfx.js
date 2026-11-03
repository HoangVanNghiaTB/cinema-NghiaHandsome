// Hiệu ứng âm thanh cho các game treo tường, tự tạo bằng Web Audio (không cần file).
// Phong cách chiptune: ngắn, gọn. Âm lượng theo thanh "Hiệu ứng" trong menu (main.js gọi setVolume).
// Các tiếng cần chất liệu thật (sói hú, nền đêm / ngày, nhạc nền...) không nằm ở đây.

let ctx = null;
let master = 1;
const BASE = 0.22; // mức chung của mọi tiếng, để không to hơn giọng quản trò và nhạc video

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

// Gọi trong một thao tác chạm / bấm (iPhone và trình duyệt chỉ cho phát tiếng sau thao tác của người dùng)
function unlock() {
  const c = ensure();
  if (c && c.state !== 'running') c.resume().then(tryAmb).catch(() => {});
}
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  document.addEventListener(ev, unlock, { capture: true, passive: true });
}

// Một nốt: tần số f (Hz), kéo trượt tới `to` nếu có, bắt đầu sau `at` giây
function tone(f, dur, { type = 'square', vol = 0.5, to = null, at = 0, attack = 0.005 } = {}) {
  const c = ctx;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * BASE * master, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// Tiếng xì / cộc: nhiễu trắng qua bộ lọc
function noise(dur, { freq = 1500, q = 1, type = 'bandpass', vol = 0.5, at = 0, to = null } = {}) {
  const c = ctx;
  const t = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol * BASE * master, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(c.destination);
  s.start(t);
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // số nốt MIDI -> Hz

// Mỗi tiếng nhận tham số tuỳ chọn `a` (vd. mức của ô vừa gộp)
const SOUNDS = {
  click: () => tone(900, 0.04, { type: 'square', vol: 0.35 }),
  open: () => {
    tone(NOTE(72), 0.07, { vol: 0.4 });
    tone(NOTE(79), 0.1, { vol: 0.4, at: 0.06 });
  },
  close: () => {
    tone(NOTE(79), 0.07, { vol: 0.4 });
    tone(NOTE(72), 0.1, { vol: 0.4, at: 0.06 });
  },
  select: () => tone(NOTE(76), 0.06, { type: 'triangle', vol: 0.6 }),
  // Đến lượt bạn
  turn: () => {
    tone(NOTE(84), 0.16, { type: 'sine', vol: 0.7 });
    tone(NOTE(91), 0.3, { type: 'sine', vol: 0.5, at: 0.09 });
  },
  // Đặt quân cờ: cộc nhẹ
  place: () => {
    tone(260, 0.09, { type: 'triangle', vol: 0.9, to: 110 });
    noise(0.04, { freq: 2500, vol: 0.4 });
  },
  // Quân Nối 4 chạm đáy: cộc rồi nảy nhẹ
  land: () => {
    tone(200, 0.1, { type: 'triangle', vol: 0.9, to: 80 });
    noise(0.05, { freq: 1800, vol: 0.4 });
    tone(150, 0.06, { type: 'triangle', vol: 0.4, to: 80, at: 0.12 });
  },
  drop: () => noise(0.18, { freq: 3000, to: 600, type: 'bandpass', vol: 0.25 }),
  // Gộp ô 2048: nốt cao dần theo mức (a = 1 cho ô 4, 2 cho ô 8...)
  merge: (a = 1) => {
    const n = 60 + Math.min(14, a) * 2;
    tone(NOTE(n), 0.12, { type: 'triangle', vol: 0.8 });
    tone(NOTE(n + 7), 0.14, { type: 'triangle', vol: 0.5, at: 0.05 });
  },
  slide: () => noise(0.09, { freq: 1200, to: 400, type: 'bandpass', vol: 0.3 }),
  // Rắn ăn mồi
  eat: () => {
    tone(NOTE(72), 0.06, { vol: 0.45 });
    tone(NOTE(79), 0.09, { vol: 0.45, at: 0.05 });
  },
  die: () => tone(NOTE(60), 0.45, { type: 'sawtooth', vol: 0.5, to: NOTE(36) }),
  // Đập chuột
  hit: () => {
    tone(420, 0.09, { type: 'square', vol: 0.5, to: 180 });
    noise(0.05, { freq: 1500, vol: 0.4 });
  },
  gold: () => {
    for (let i = 0; i < 3; i++) tone(NOTE(79 + i * 4), 0.08, { vol: 0.45, at: i * 0.05 });
  },
  bomb: () => {
    noise(0.35, { freq: 900, to: 90, type: 'lowpass', vol: 0.9 });
    tone(110, 0.3, { type: 'sawtooth', vol: 0.5, to: 40 });
  },
  miss: () => tone(NOTE(55), 0.08, { type: 'triangle', vol: 0.35, to: NOTE(50) }),
  // Xúc xắc: lắc (nhiều tiếng lách cách), rồi tiếng xúc xắc dừng
  shake: () => {
    for (let i = 0; i < 9; i++) noise(0.03, { freq: 2200 + Math.random() * 2500, q: 3, vol: 0.45, at: i * 0.11 + Math.random() * 0.03 });
  },
  dieLand: () => {
    tone(330, 0.07, { type: 'triangle', vol: 0.8, to: 140 });
    noise(0.04, { freq: 3000, vol: 0.4 });
    tone(250, 0.05, { type: 'triangle', vol: 0.4, to: 130, at: 0.1 });
  },
  chip: () => {
    tone(1500, 0.03, { type: 'square', vol: 0.3 });
    tone(2100, 0.05, { type: 'square', vol: 0.3, at: 0.03 });
  },
  // Điểm
  coin: () => {
    tone(NOTE(83), 0.06, { vol: 0.45 });
    tone(NOTE(88), 0.22, { vol: 0.45, at: 0.06 });
  },
  coinLoss: () => {
    tone(NOTE(76), 0.08, { type: 'triangle', vol: 0.5 });
    tone(NOTE(69), 0.18, { type: 'triangle', vol: 0.5, at: 0.07 });
  },
  // Trúng lớn kiểu xổ số: chạy nốt lên, chuông ngân, xu rơi lấp lánh
  jackpot: () => {
    [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => tone(NOTE(n), 0.14, { type: 'square', vol: 0.4, at: i * 0.075 }));
    [84, 88, 91, 96].forEach((n) => tone(NOTE(n), 1.4, { type: 'sine', vol: 0.45, at: 0.55 }));
    tone(NOTE(60), 1.2, { type: 'triangle', vol: 0.5, at: 0.55 });
    for (let i = 0; i < 12; i++) tone(2000 + Math.random() * 1800, 0.07, { type: 'square', vol: 0.18, at: 0.7 + i * 0.1 + Math.random() * 0.05 });
    noise(0.9, { freq: 6000, type: 'highpass', vol: 0.15, at: 0.55 });
  },
  // Thắng / thua / hoà
  win: () => {
    [72, 76, 79, 84].forEach((n, i) => tone(NOTE(n), i === 3 ? 0.5 : 0.12, { type: 'square', vol: 0.45, at: i * 0.11 }));
    tone(NOTE(60), 0.6, { type: 'triangle', vol: 0.5, at: 0.33 });
  },
  lose: () => {
    [67, 64, 60].forEach((n, i) => tone(NOTE(n), i === 2 ? 0.6 : 0.2, { type: 'triangle', vol: 0.7, at: i * 0.2 }));
  },
  draw: () => {
    tone(NOTE(67), 0.15, { type: 'triangle', vol: 0.6 });
    tone(NOTE(67), 0.3, { type: 'triangle', vol: 0.6, at: 0.18 });
  },
  // Đếm ngược và hết giờ
  tick: () => tone(1200, 0.04, { type: 'square', vol: 0.3 }),
  go: () => {
    tone(NOTE(72), 0.1, { vol: 0.5 });
    tone(NOTE(84), 0.25, { vol: 0.5, at: 0.1 });
  },
  bell: () => {
    tone(NOTE(79), 0.9, { type: 'sine', vol: 0.7 });
    tone(NOTE(79) * 2.76, 0.5, { type: 'sine', vol: 0.25 });
  },
  // Ma Sói
  vote: () => {
    tone(240, 0.07, { type: 'triangle', vol: 0.8, to: 120 });
    noise(0.03, { freq: 2000, vol: 0.3 });
  },
  death: () => {
    tone(NOTE(55), 0.7, { type: 'sine', vol: 0.8 });
    tone(NOTE(55) * 1.5, 0.7, { type: 'sine', vol: 0.4, to: NOTE(55) * 1.4 });
    tone(NOTE(43), 0.9, { type: 'triangle', vol: 0.5, at: 0.05 });
  },
  flip: () => noise(0.08, { freq: 2500, to: 5000, type: 'highpass', vol: 0.3 }),
};

// Tiếng từ file (client/public/sfx/): tải khi game cần (sfx.preload). gain là mức tuyệt đối trước hệ số "Hiệu ứng";
// dur + fadeIn / fadeOut cắt tiếng dài cho vừa lúc dùng; ambient là tiếng nền chỉ dùng qua sfx.ambient:
// burst = cứ vang `on` giây (ngẫu nhiên trong khoảng) rồi im `off` giây, lặp lại, cho thưa chứ không kêu liền tù tì
const FILES = {
  bonk: { url: '/sfx/bonk.mp3', gain: 0.3 },
  hang: { url: '/sfx/hang.mp3', gain: 0.45 },
  gunshot: { url: '/sfx/gunshot.mp3', gain: 0.5 },
  howl: { url: '/sfx/wolf_howl.mp3', gain: 0.3, dur: 6.5, fadeOut: 2 },
  laugh: { url: '/sfx/witch_laugh.mp3', gain: 0.35, dur: 4, fadeOut: 1.5 },
  dawnBirds: { url: '/sfx/dawn_birds.mp3', gain: 0.4, fadeIn: 1.5, fadeOut: 4 },
  ambNight: { url: '/sfx/amb_night.mp3', gain: 0.25, ambient: true, burst: { on: [8, 14], off: [5, 6] } },
};
const rand = ([a, b]) => a + Math.random() * (b - a);
const buffers = {};
const loading = {};
function load(name) {
  const def = FILES[name];
  const c = ensure();
  if (!def || !c || buffers[name] || loading[name]) return;
  loading[name] = fetch(def.url)
    .then((r) => r.arrayBuffer())
    .then((d) => c.decodeAudioData(d))
    .then((b) => {
      buffers[name] = b;
      tryAmb(); // đang chờ file nền này thì phát luôn
    })
    .catch(() => {
      // thiếu file hoặc không giải mã được thì im lặng
    });
}
function playFile(name) {
  const def = FILES[name];
  const buf = buffers[name];
  if (!buf) {
    load(name);
    return;
  }
  const c = ctx;
  const t = c.currentTime;
  const dur = Math.min(def.dur ?? buf.duration, buf.duration);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  const level = def.gain * master;
  if (def.fadeIn) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + def.fadeIn);
  } else {
    g.gain.setValueAtTime(level, t);
  }
  if (def.fadeOut) {
    g.gain.setValueAtTime(level, t + dur - def.fadeOut);
    g.gain.linearRampToValueAtTime(0, t + dur);
  }
  src.connect(g).connect(c.destination);
  src.start(t, 0, dur);
}

// Tiếng nền (một cái một lúc), vang từng đợt thưa thớt. ambient(null) để tắt.
let amb = null; // { name, out, src, timer }
let wantAmb = null;
function stopAmb(fade = 1.5) {
  const a = amb;
  amb = null;
  if (!a || !ctx) return;
  clearTimeout(a.timer);
  const t = ctx.currentTime;
  a.out.gain.cancelScheduledValues(t);
  a.out.gain.setValueAtTime(a.out.gain.value, t);
  a.out.gain.linearRampToValueAtTime(0, t + fade);
  a.src?.stop(t + fade + 0.1);
}
// Phát tiếng nền đang muốn nếu file đã tải xong và được phép phát
function tryAmb() {
  if (wantAmb && buffers[wantAmb] && ctx?.state === 'running') startAmb(wantAmb);
}
// Một đợt: vào từ từ, vang một lúc, ra từ từ; xong hẹn đợt sau sau một quãng im ngẫu nhiên
function pulse(a) {
  if (amb !== a) return;
  const def = FILES[a.name];
  const buf = buffers[a.name];
  const on = Math.min(rand(def.burst.on), buf.duration - 1);
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + 2);
  env.gain.setValueAtTime(1, t + on - 3);
  env.gain.linearRampToValueAtTime(0, t + on);
  src.connect(env).connect(a.out);
  src.start(t, Math.random() * (buf.duration - on), on);
  a.src = src;
  a.timer = setTimeout(() => pulse(a), (on + rand(def.burst.off)) * 1000);
}
function startAmb(name) {
  const buf = buffers[name];
  if (!buf || !ctx || amb?.name === name) return;
  stopAmb();
  const out = ctx.createGain();
  out.gain.value = FILES[name].gain * master;
  out.connect(ctx.destination);
  amb = { name, out, src: null, timer: 0 };
  pulse(amb);
}

export const sfx = {
  unlock,
  setVolume(scale) {
    master = Math.max(0, scale);
    if (amb && ctx) amb.out.gain.setTargetAtTime(FILES[amb.name].gain * master, ctx.currentTime, 0.1);
  },
  // Tải trước các file tiếng (gọi khi mở game cần chúng)
  preload(names) {
    names.forEach(load);
  },
  // Bật tiếng nền (tên trong FILES có ambient) hoặc tắt bằng null
  ambient(name) {
    wantAmb = name;
    if (!name) return stopAmb();
    if (amb?.name === name) return;
    ensure();
    load(name);
    if (ctx?.state === 'running') tryAmb();
    else ctx?.resume().then(tryAmb).catch(() => {});
  },
  play(name, arg) {
    const make = SOUNDS[name];
    const file = FILES[name] && !FILES[name].ambient;
    if ((!make && !file) || master <= 0) return;
    const c = ensure();
    if (!c) return;
    if (c.state !== 'running') {
      c.resume().catch(() => {});
      return; // chưa được phép phát (chưa có thao tác nào): bỏ qua tiếng này
    }
    try {
      if (file) playFile(name);
      else make(arg);
    } catch {
      // âm thanh hỏng không được làm hỏng game
    }
  },
};
