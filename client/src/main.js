import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { buildCinema, floorHeight, ROOM, SCREEN } from './scene/cinema.js';
import { createYouTubePlayer, parseVideoId } from './player/youtube.js';
import { Avatars } from './scene/avatars.js';
import { connectToRoom } from './net/socket.js';
import { createVoice } from './net/voice.js';

const scene = new THREE.Scene(); // không đặt background để lớp CSS3D phía sau lộ ra qua "lỗ" màn hình

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.6, -4);

// Lớp WebGL (phía trên, nền trong suốt)
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.getElementById('gl-layer').appendChild(renderer.domElement);

// Lớp CSS3D (phía dưới, chứa iframe YouTube)
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(innerWidth, innerHeight);
document.getElementById('css-layer').appendChild(cssRenderer.domElement);
const cssScene = new THREE.Scene();

buildCinema(scene);

// Màn hình video: div 1280x720 px thu nhỏ cho khớp màn hình 3D
const VIDEO_PX = { w: 1280, h: 720 };
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
  else hud.textContent = micOn ? 'Mic: BẬT (nhấn M để tắt)' : 'Mic: tắt (nhấn M để nói)';
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
  controls.unlock();
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
  controls.lock();
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
      others.forEach((p) => {
        avatars.add(p);
        names.set(p.id, p.name);
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
    onLeave: (id) => {
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

// Điều khiển góc nhìn thứ nhất
const controls = new PointerLockControls(camera, document.body);
$('enter').addEventListener('click', () => {
  controls.lock();
  startVoice(); // lần đầu trình duyệt sẽ hỏi quyền mic
});
controls.addEventListener('lock', () => {
  menu.style.display = 'none';
  document.body.classList.remove('show-chat');
  keys.clear();
  applyDesired(); // sau thao tác click đầu tiên, trình duyệt cho phép phát có tiếng
});
controls.addEventListener('unlock', () => {
  document.body.classList.add('show-chat');
  keys.clear();
  if (!chatting && login.style.display === 'none') menu.style.display = 'flex'; // đang chat thì không hiện menu
});

const keys = new Set();
addEventListener('keydown', (e) => {
  if (!controls.isLocked) return;
  if (e.code === 'KeyM' && !e.repeat) toggleMic();
  else if (e.code === 'Enter' && !e.repeat) startChat();
  else keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));

const SPEED = 4;
const EYE_HEIGHT = 1.6;
const clock = new THREE.Clock();
const SEND_INTERVAL = 1 / 15;
let sendTimer = 0;
let lastSent = null;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (controls.isLocked) {
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    controls.moveForward(forward * SPEED * dt);
    controls.moveRight(right * SPEED * dt);
  }

  // Giữ trong phòng và bước theo độ cao bậc thang
  const p = camera.position;
  p.x = THREE.MathUtils.clamp(p.x, ROOM.minX + 0.5, ROOM.maxX - 0.5);
  p.z = THREE.MathUtils.clamp(p.z, ROOM.minZ + 0.5, ROOM.maxZ - 0.5);
  const targetY = floorHeight(p.z) + EYE_HEIGHT;
  p.y += (targetY - p.y) * Math.min(1, dt * 12);

  // Gửi vị trí ~15 lần/giây, chỉ khi có thay đổi (y là độ cao chân)
  sendTimer += dt;
  if (myId && sendTimer >= SEND_INTERVAL) {
    sendTimer = 0;
    const state = { x: p.x, y: p.y - EYE_HEIGHT, z: p.z, ry: camera.rotation.y };
    if (!lastSent || Object.keys(state).some((k) => Math.abs(state[k] - lastSent[k]) > 1e-3)) {
      room.sendMove(state);
      lastSent = state;
    }
  }

  avatars.update(dt);
  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  cssRenderer.setSize(innerWidth, innerHeight);
});
