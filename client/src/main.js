import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { buildCinema, floorHeight, ROOM, SCREEN, SEATS } from './scene/cinema.js';
import { createTouchControls } from './ui/touch.js';
import { createYouTubePlayer, parseVideoId } from './player/youtube.js';
import { Avatars } from './scene/avatars.js';
import { connectToRoom } from './net/socket.js';
import { createVoice } from './net/voice.js';

const scene = new THREE.Scene(); // không đặt background để lớp CSS3D phía sau lộ ra qua "lỗ" màn hình

// Điện thoại/máy tính bảng: không có chuột nên dùng điều khiển cảm ứng (không khoá con trỏ được)
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.6, -4);
camera.rotation.order = 'YXZ'; // rotation.y là góc quay ngang thật sự, kể cả khi ngước/cúi

// Chất lượng đồ hoạ: 'auto' (mặc định) | 'low' | 'high'. Tự động chọn thấp nếu trình duyệt chỉ có đồ hoạ phần mềm
// (không có tăng tốc card đồ hoạ), để người dùng không phải sửa máy mới xem được mượt.
const QUALITY_KEY = 'cinema-quality';
function readQualitySetting() {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    return v === 'low' || v === 'high' ? v : 'auto';
  } catch {
    return 'auto';
  }
}
function detectSoftwareRendering() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}
const qualitySetting = readQualitySetting();
const lowQuality = qualitySetting === 'low' || (qualitySetting === 'auto' && detectSoftwareRendering());
const START_PIXEL_RATIO = lowQuality ? Math.min(devicePixelRatio, 0.75) : Math.min(devicePixelRatio, 1.5);

// Lớp WebGL (phía trên, nền trong suốt)
const renderer = new THREE.WebGLRenderer({
  antialias: !lowQuality,
  alpha: true,
  powerPreference: 'high-performance', // máy có 2 card: ưu tiên card rời
});
renderer.setClearColor(0x000000, 0);
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(START_PIXEL_RATIO); // về sau tự hạ thêm nếu FPS thấp
document.getElementById('gl-layer').appendChild(renderer.domElement);

// Lớp CSS3D (phía dưới, chứa iframe YouTube)
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(innerWidth, innerHeight);
document.getElementById('css-layer').appendChild(cssRenderer.domElement);
const cssScene = new THREE.Scene();

// Chẩn đoán FPS: thêm ?nocss vào link để tắt lớp video, so sánh FPS có/không có lớp đó
const NO_CSS = new URLSearchParams(location.search).has('nocss');
if (NO_CSS) document.getElementById('css-layer').style.display = 'none';

buildCinema(scene, { lowQuality });

// Màn hình video: div thu nhỏ cho khớp màn hình 3D. Chế độ thấp dùng 480p để YouTube
// gửi video nhẹ hơn (giải mã video bằng CPU rất tốn trên máy không có tăng tốc phần cứng)
const VIDEO_PX = lowQuality ? { w: 854, h: 480 } : { w: 1280, h: 720 };
const screenEl = document.createElement('div');
screenEl.style.cssText = `width:${VIDEO_PX.w}px;height:${VIDEO_PX.h}px;background:#050505;`;
const playerHost = document.createElement('div');
screenEl.appendChild(playerHost);
const screenObj = new CSS3DObject(screenEl);
screenObj.position.set(0, SCREEN.y, SCREEN.z);
screenObj.scale.setScalar(SCREEN.width / VIDEO_PX.w);
cssScene.add(screenObj);

// Menu + điều khiển video
const $ = (id) => document.getElementById(id);
const menu = $('menu');
const msg = $('msg');
let player = null;

// Chọn chất lượng đồ hoạ trong menu; đổi thì tải lại trang để áp dụng
const qualitySelect = $('quality');
qualitySelect.value = qualitySetting;
qualitySelect.addEventListener('change', () => {
  try {
    localStorage.setItem(QUALITY_KEY, qualitySelect.value);
  } catch {
    // không lưu được thì thôi
  }
  location.reload();
});

createYouTubePlayer(playerHost, {
  width: VIDEO_PX.w,
  height: VIDEO_PX.h,
  onError: (text) => (msg.textContent = text),
}).then((p) => {
  player = p;
  applyDesired(); // người vào sau: player sẵn sàng thì bắt kịp video đang chiếu
});

// Đồng bộ video: `desired` là trạng thái mới nhất server gửi, đã tính cả thời gian trôi qua từ lúc nhận
const SYNC_TOLERANCE = 2; // giây; lệch hơn thì tự tua lại (định kỳ)
const EXPLICIT_TOLERANCE = 0.5; // khi có người tua/phát/dừng
let desired = null;
let loadedVideoId = null;

const expectedPosition = () =>
  !desired ? 0 : desired.playing ? desired.position + (performance.now() - desired.receivedAt) / 1000 : desired.position;

function applyDesired(tolerance = EXPLICIT_TOLERANCE) {
  if (!player || !desired || !desired.videoId) return;
  const pos = expectedPosition();

  if (desired.videoId !== loadedVideoId) {
    loadedVideoId = desired.videoId;
    if (desired.playing) player.load(desired.videoId, pos);
    else player.cue(desired.videoId, pos);
    return;
  }

  const state = player.getState(); // 0 hết, 1 phát, 2 dừng, 3 đệm, 5 đã nạp
  if (state === 0) return;
  if (Math.abs(player.getTime() - pos) > tolerance) {
    player.seek(pos);
    if (!desired.playing) player.pause();
  }
  if (desired.playing && state !== 1 && state !== 3) player.play();
  if (!desired.playing && state === 1) player.pause();
}

function setDesired(video) {
  if (!video) return;
  desired = { ...video, receivedAt: performance.now() };
  applyDesired();
}

setInterval(() => applyDesired(SYNC_TOLERANCE), 2000);

// Nút điều khiển: gửi lên server, server phát lại cho mọi người (kể cả mình)
$('load').addEventListener('click', () => {
  const id = parseVideoId($('url').value);
  if (!id) {
    msg.textContent = 'Link YouTube không hợp lệ.';
    return;
  }
  msg.textContent = '';
  room.loadVideo(id);
});
const currentTime = () => (player ? player.getTime() : 0);
$('play').addEventListener('click', () => room.playVideo(currentTime()));
$('pause').addEventListener('click', () => room.pauseVideo(currentTime()));
$('back').addEventListener('click', () => room.seekVideo(Math.max(0, currentTime() - 10)));
$('forward').addEventListener('click', () => room.seekVideo(currentTime() + 10));

const avatars = new Avatars(scene);
let myId = null;
const names = new Map(); // id -> tên, để báo ai vào/rời phòng

// Voice chat: mặc định tắt mic, bấm M (hoặc nút trong menu) để nói
const hud = $('voice-status');
let voiceMode = null; // null (chưa bật) | 'mic' | 'listen-only'
let micOn = false;
function updateHud() {
  if (voiceMode === null) hud.textContent = 'Voice: chưa bật';
  else if (voiceMode === 'listen-only') hud.textContent = 'Voice: chỉ nghe (không có mic)';
  else if (isTouch) hud.textContent = micOn ? 'Mic: BẬT' : 'Mic: tắt';
  else hud.textContent = micOn ? 'Mic: BẬT (nhấn M để tắt)' : 'Mic: tắt (nhấn M để nói)';
  touch?.setMicOn(micOn);
}
const voice = createVoice({
  sendSignal: (to, data) => room.sendSignal(to, data),
  onSpeaking: (id, speaking) => avatars.setSpeaking(id, speaking),
});
function toggleMic() {
  if (voiceMode !== 'mic') return;
  micOn = voice.toggleMic();
  updateHud();
}
function startVoice() {
  if (voiceMode !== null) return;
  voice.start().then((mode) => {
    voiceMode = mode;
    if (mode === 'listen-only') msg.textContent = 'Không dùng được mic, bạn chỉ nghe được người khác.';
    updateHud();
  });
}
$('mic').addEventListener('click', () => (voiceMode === null ? startVoice() : toggleMic()));

// Chat text: tin mới hiện ít giây rồi mờ đi; mở menu hoặc đang gõ thì hiện lại toàn bộ
const chatLog = $('chat-log');
const chatInput = $('chat-input');
let chatting = false;

function addChatLine(text, { author = null, system = false } = {}) {
  const line = document.createElement('div');
  line.className = system ? 'line system' : 'line';
  if (author) {
    const b = document.createElement('b');
    b.textContent = `${author}: `;
    line.append(b);
  }
  line.append(document.createTextNode(text)); // textContent: không chèn HTML từ người khác
  chatLog.appendChild(line);
  while (chatLog.children.length > 50) chatLog.firstChild.remove();
  setTimeout(() => line.classList.add('old'), 12000);
}

function startChat() {
  chatting = true;
  document.body.classList.add('show-chat');
  if (!isTouch) controls.unlock(); // điện thoại không khoá con trỏ nên không cần mở khoá
  chatInput.style.display = 'block';
  chatInput.focus();
}

function endChat(send) {
  const text = chatInput.value.trim();
  if (send && text && room) room.sendChat(text);
  chatInput.value = '';
  chatInput.style.display = 'none';
  chatInput.blur();
  chatting = false;
  if (isTouch) {
    if (isActive()) document.body.classList.remove('show-chat');
  } else {
    controls.lock();
  }
}

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') endChat(true);
  else if (e.key === 'Escape') endChat(false);
});

// Mạng
let room = null;
const setNetStatus = (text) => ($('net').textContent = text);

function joinRoom(profile) {
  room = connectToRoom(profile, {
    onInit: (id, others, video, iceServers) => {
      myId = id;
      names.clear();
      seatOwners.clear();
      mySeat = null;
      others.forEach((p) => {
        avatars.add(p);
        names.set(p.id, p.name);
        if (p.seat !== null) seatOwners.set(p.seat, p.id);
      });
      voice.setRoster(id, others.map((p) => p.id), iceServers);
      loadedVideoId = null; // kết nối lại: nạp lại từ đầu theo trạng thái server
      setDesired(video);
    },
    onVideo: setDesired,
    onJoin: (p) => {
      avatars.add(p);
      names.set(p.id, p.name);
      voice.peerJoined(p.id);
      addChatLine(`${p.name} vào rạp`, { system: true });
    },
    onMove: (d) => avatars.setTarget(d.id, d),
    onSeat: ({ id, seat }) => {
      for (const [index, owner] of seatOwners) if (owner === id) seatOwners.delete(index);
      if (seat !== null) seatOwners.set(seat, id);
      if (id !== myId) {
        avatars.setSeated(id, seat !== null);
        return;
      }
      const previous = mySeat;
      mySeat = seat;
      if (seat !== null) {
        lookForward(); // ngồi xuống thì nhìn về phía màn hình
      } else if (previous !== null) {
        // đứng dậy: bước ra phía trước ghế
        camera.position.x = SEATS[previous].x;
        camera.position.z = SEATS[previous].z - STAND_OFFSET;
      }
    },
    onSeatDenied: () => addChatLine('Ghế này đã có người ngồi.', { system: true }),
    onLeave: (id) => {
      for (const [index, owner] of seatOwners) if (owner === id) seatOwners.delete(index);
      avatars.remove(id);
      voice.peerLeft(id);
      if (names.has(id)) addChatLine(`${names.get(id)} rời rạp`, { system: true });
      names.delete(id);
    },
    onSignal: (from, data) => voice.handleSignal(from, data),
    onChat: (m) => addChatLine(m.text, { author: m.name }),
    onFull: () => {
      room.close();
      room = null;
      showLogin('Phòng đã đủ 10 người, thử lại sau nhé.');
    },
    onStatus: (connected) => {
      if (!room) return; // đã rời phòng (ví dụ phòng đầy)
      if (!connected) {
        for (const id of [...avatars.items.keys()]) avatars.remove(id);
        myId = null;
        names.clear();
        seatOwners.clear();
        mySeat = null;
        voice.reset();
        setNetStatus('○ Mất kết nối, đang thử lại...');
        msg.textContent = 'Mất kết nối tới server, đang thử lại...';
      } else {
        setNetStatus('● Đã kết nối');
        msg.textContent = '';
      }
    },
  });
}

// Màn hình vào: nhập tên, chọn màu (nhớ lại lần sau)
const login = $('login');
const PROFILE_KEY = 'cinema-profile';

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
  } catch {
    return {};
  }
}

function showLogin(message = '') {
  $('login-msg').textContent = message;
  login.style.display = 'flex';
  menu.style.display = 'none';
  setNetStatus('○ Chưa vào phòng');
}

const savedProfile = loadProfile();
$('name').value = savedProfile.name ?? '';
$('color').value = savedProfile.color ?? '#' + new THREE.Color().setHSL(Math.random(), 0.6, 0.55).getHexString();

login.addEventListener('submit', (e) => {
  e.preventDefault();
  const profile = { name: $('name').value.trim() || 'Khách', color: $('color').value };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // không lưu được thì thôi
  }
  login.style.display = 'none';
  menu.style.display = 'flex';
  joinRoom(profile);
});

// Ngồi ghế: đứng gần ghế trống thì ngồi được (phím E, hoặc nút "Ngồi" trên điện thoại).
// Server quyết định ghế có trống không; client chỉ dời camera sau khi server xác nhận.
const SEAT_REACH = 1.4; // m: cách ghế trong khoảng này mới ngồi được
const SEATED_EYE_HEIGHT = 0.75; // mắt cao hơn mặt nệm
const STAND_OFFSET = 1.2; // đứng dậy thì bước ra phía trước ghế chừng này
const seatOwners = new Map(); // chỉ số ghế -> id người đang ngồi
let mySeat = null; // ghế mình đang ngồi (đã được server xác nhận)
let lastSitText = null;
let lastJoyVisible = null;

function nearestFreeSeat() {
  const p = camera.position;
  const feetY = p.y - EYE_HEIGHT;
  let best = -1;
  let bestDist = SEAT_REACH;
  SEATS.forEach((s, i) => {
    if (seatOwners.has(i) || Math.abs(feetY - s.floorY) > 0.6) return; // có người ngồi / khác bậc
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

function toggleSit() {
  if (!room || !myId) return;
  if (mySeat !== null) {
    room.stand();
    return;
  }
  const seat = nearestFreeSeat();
  if (seat >= 0) room.sit(seat);
}

const sitPrompt = $('sit-prompt');
function updateSitPrompt() {
  // Điện thoại: ngồi thì ẩn cần gạt đi (không đi được), đứng dậy thì hiện lại
  const joyVisible = mySeat === null;
  if (touch && joyVisible !== lastJoyVisible) {
    lastJoyVisible = joyVisible;
    touch.setJoyVisible(joyVisible);
  }

  let text = '';
  if (isActive()) {
    if (mySeat !== null) text = isTouch ? 'Đứng' : 'Nhấn E để đứng dậy';
    else if (nearestFreeSeat() >= 0) text = isTouch ? 'Ngồi' : 'Nhấn E để ngồi';
  }
  if (text === lastSitText) return;
  lastSitText = text;
  if (isTouch) {
    touch.setSitButton(text || null);
  } else {
    sitPrompt.textContent = text;
    sitPrompt.style.display = text ? 'block' : 'none';
  }
}

// Điều khiển góc nhìn thứ nhất: máy tính dùng chuột + phím (khoá con trỏ), điện thoại dùng cảm ứng
const controls = new PointerLockControls(camera, document.body);
const keys = new Set();
let touchActive = false;
const isActive = () => (isTouch ? touchActive : controls.isLocked);

let yaw = 0;
let pitch = 0;
function lookForward() {
  yaw = 0;
  pitch = 0;
  camera.rotation.set(0, 0, 0);
}

const LOOK_SENSITIVITY = 0.005; // rad mỗi px khi kéo ngón tay
const touch = isTouch
  ? createTouchControls({
      onLook: (dx, dy) => {
        yaw -= dx * LOOK_SENSITIVITY;
        pitch = THREE.MathUtils.clamp(pitch - dy * LOOK_SENSITIVITY, -1.4, 1.4);
        camera.rotation.set(pitch, yaw, 0);
      },
      onMenu: () => setActive(false),
      onMic: () => (voiceMode === null ? startVoice() : toggleMic()),
      onChat: () => startChat(),
      onSit: toggleSit,
    })
  : null;

// Vào/ra chế độ chơi (đóng/mở menu)
function setActive(active) {
  if (isTouch) {
    touchActive = active;
    touch.setVisible(active);
  }
  keys.clear();
  if (active) {
    menu.style.display = 'none';
    document.body.classList.remove('show-chat');
    applyDesired(); // sau thao tác click đầu tiên, trình duyệt cho phép phát có tiếng
  } else {
    document.body.classList.add('show-chat');
    if (!chatting && login.style.display === 'none') menu.style.display = 'flex'; // đang chat thì không hiện menu
  }
}

$('enter').addEventListener('click', () => {
  if (isTouch) {
    setActive(true);
    // Toàn màn hình cho rộng chỗ, rồi khoá ngang (Android Chrome cho khoá khi đang toàn màn hình; iPhone thì không,
    // nên vẫn có màn hình nhắc xoay ngang ở index.html)
    try {
      document.documentElement
        .requestFullscreen?.()
        ?.then(() => screen.orientation?.lock?.('landscape'))
        .catch(() => {});
    } catch {
      // không hỗ trợ thì thôi
    }
  } else {
    controls.lock();
  }
  startVoice(); // lần đầu trình duyệt sẽ hỏi quyền mic
});
controls.addEventListener('lock', () => setActive(true));
controls.addEventListener('unlock', () => setActive(false));

addEventListener('keydown', (e) => {
  if (!controls.isLocked) return;
  if (e.code === 'KeyM' && !e.repeat) toggleMic();
  else if (e.code === 'KeyE' && !e.repeat) toggleSit();
  else if (e.code === 'Enter' && !e.repeat) startChat();
  else keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));

if (isTouch) $('hint').textContent = 'Cần gạt bên trái để đi, kéo bên phải để nhìn quanh. Dùng các nút ở góc để ngồi, chat, mic.';

const SPEED = 4;
const EYE_HEIGHT = 1.6;
const clock = new THREE.Clock();
const SEND_INTERVAL = 1 / 15;
let sendTimer = 0;
let frames = 0;
let fpsStart = performance.now();

// Tự hạ độ nét khi FPS thấp (card yếu / màn hình độ phân giải cao). Chỉ giảm, không tăng lại, để không dao động.
const MIN_PIXEL_RATIO = 0.5;
const WARMUP_MS = 4000; // bỏ qua vài giây đầu: nạp shader, nạp video
const startTime = performance.now();
let pixelRatio = START_PIXEL_RATIO;
function adaptResolution(fps, now) {
  if (now - startTime < WARMUP_MS || fps >= 30 || pixelRatio <= MIN_PIXEL_RATIO) return;
  pixelRatio = Math.max(MIN_PIXEL_RATIO, pixelRatio - 0.25);
  renderer.setPixelRatio(pixelRatio);
}
let lastSent = null;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  const p = camera.position;
  const seat = mySeat !== null ? SEATS[mySeat] : null;

  if (isActive()) {
    const forward = THREE.MathUtils.clamp(
      (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + (touch ? touch.move.y : 0), -1, 1);
    const right = THREE.MathUtils.clamp(
      (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + (touch ? touch.move.x : 0), -1, 1);
    // đang ngồi thì không đi được, phải đứng dậy trước (phím E / nút Đứng)
    if (!seat && (Math.abs(forward) > 0.1 || Math.abs(right) > 0.1)) {
      controls.moveForward(forward * SPEED * dt);
      controls.moveRight(right * SPEED * dt);
    }
  }

  let targetY;
  if (seat) {
    // ngồi: bám vào chỗ ngồi, mắt ngang tầm mặt nệm + chút ít
    const k = Math.min(1, dt * 10);
    p.x += (seat.x - p.x) * k;
    p.z += (seat.z - p.z) * k;
    targetY = seat.y + SEATED_EYE_HEIGHT;
  } else {
    // giữ trong phòng và bước theo độ cao bậc thang
    p.x = THREE.MathUtils.clamp(p.x, ROOM.minX + 0.5, ROOM.maxX - 0.5);
    p.z = THREE.MathUtils.clamp(p.z, ROOM.minZ + 0.5, ROOM.maxZ - 0.5);
    targetY = floorHeight(p.z) + EYE_HEIGHT;
  }
  p.y += (targetY - p.y) * Math.min(1, dt * 12);
  updateSitPrompt();

  // Gửi vị trí ~15 lần/giây, chỉ khi có thay đổi (y là độ cao chân)
  sendTimer += dt;
  if (myId && sendTimer >= SEND_INTERVAL) {
    sendTimer = 0;
    const eye = seat ? SEATED_EYE_HEIGHT : EYE_HEIGHT;
    const state = { x: p.x, y: p.y - eye, z: p.z, ry: camera.rotation.y };
    if (!lastSent || Object.keys(state).some((k) => Math.abs(state[k] - lastSent[k]) > 1e-3)) {
      room.sendMove(state);
      lastSent = state;
    }
  }

  frames++;
  const now = performance.now();
  if (now - fpsStart >= 1000) {
    const fps = Math.round((frames * 1000) / (now - fpsStart));
    $('fps').textContent = `${fps} FPS · ${renderer.info.render.calls} lệnh vẽ · độ nét ${pixelRatio.toFixed(2)}x${lowQuality ? ' · chế độ nhẹ' : ''}`;
    adaptResolution(fps, now);
    frames = 0;
    fpsStart = now;
  }

  avatars.update(dt);
  renderer.render(scene, camera);
  if (!NO_CSS) cssRenderer.render(cssScene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  cssRenderer.setSize(innerWidth, innerHeight);
});
