import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { buildCinema, floorHeight, resolveCollisions, ROOM, SCREEN, SEATS, STAGES } from './scene/cinema.js';
import { createTouchControls } from './ui/touch.js';
import { viewW, viewH } from './ui/viewport.js';
import { StunRing } from './scene/stunRing.js';
import { Confetti } from './scene/confetti.js';
import { FirstPersonHand } from './scene/fpHand.js';
import { createSounds, STEP_LENGTH } from './audio/sounds.js';
import { createYouTubePlayer, parseVideoId } from './player/youtube.js';
import { Avatars } from './scene/avatars.js';
import { connectToRoom } from './net/socket.js';
import { createVoice } from './net/voice.js';

const scene = new THREE.Scene(); // không đặt background để lớp CSS3D phía sau lộ ra qua "lỗ" màn hình

// Điện thoại/máy tính bảng: không có chuột nên dùng điều khiển cảm ứng (không khoá con trỏ được)
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

const camera = new THREE.PerspectiveCamera(70, viewW() / viewH(), 0.1, 100);
camera.position.set(0, 1.6, -4);
camera.rotation.order = 'YXZ'; // rotation.y là góc quay ngang thật sự, kể cả khi ngước/cúi
scene.add(camera); // để các vật gắn vào camera (vòng sao choáng) được vẽ
const sounds = createSounds(camera); // tiếng bước chân, tiếng tát; camera là "tai" người nghe

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
renderer.setSize(viewW(), viewH());
renderer.setPixelRatio(START_PIXEL_RATIO); // về sau tự hạ thêm nếu FPS thấp
document.getElementById('gl-layer').appendChild(renderer.domElement);

// Lớp CSS3D (phía dưới, chứa iframe YouTube)
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(viewW(), viewH());
document.getElementById('css-layer').appendChild(cssRenderer.domElement);
const cssScene = new THREE.Scene();

// Chẩn đoán FPS: thêm ?nocss vào link để tắt lớp video, so sánh FPS có/không có lớp đó
const NO_CSS = new URLSearchParams(location.search).has('nocss');
if (NO_CSS) document.getElementById('css-layer').style.display = 'none';

const cinema = buildCinema(scene, { lowQuality });
const confetti = new Confetti(scene, { perBurst: lowQuality ? 24 : 40 }); // ít hạt hơn ở chế độ nhẹ
const fpHand = new FirstPersonHand(camera); // bàn tay của mình khi tát

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

// Thanh âm lượng trong menu, nhớ cho lần sau. Mỗi thanh chỉ chỉnh âm lượng trên máy của chính mình.
//   video: âm lượng trình phát YouTube (0-100)
//   voice: nghe người khác nói to bao nhiêu % so với mức thiết kế (0-100; 100 = đúng mức thiết kế, VOICE_MAX).
//          Không tăng thêm được vì giọng đã được người nói đưa về mức thiết kế, trình duyệt không cho phát to hơn.
//   effects: hiệu ứng bước chân, tát (% so với thiết kế, 0-200)
// Khoá lưu đổi sang v2 vì thanh voice trước đây có nghĩa khác (mặc định 60), tránh dùng nhầm giá trị cũ.
const VOLUMES_KEY = 'cinema-volumes-v2';
const VOLUME_DEFAULTS = { video: 100, voice: 100, effects: 100 };
const VOLUME_MAX = { video: 100, voice: 100, effects: 200 };
const volumes = { ...VOLUME_DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(VOLUMES_KEY)) ?? {};
  for (const key of Object.keys(volumes)) {
    if (Number.isFinite(saved[key]) && saved[key] >= 0 && saved[key] <= VOLUME_MAX[key]) volumes[key] = saved[key];
  }
} catch {
  // không đọc được thì dùng mặc định
}
sounds.setVolume(volumes.effects / 100);

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

function applyVideoVolume() {
  player?.setVolume(volumes.video);
}
for (const key of Object.keys(volumes)) {
  const slider = $(`vol-${key}`);
  const label = $(`vol-${key}-val`);
  slider.value = volumes[key];
  label.textContent = `${volumes[key]}%`;
  slider.addEventListener('input', () => {
    volumes[key] = Number(slider.value);
    label.textContent = `${volumes[key]}%`;
    if (key === 'video') applyVideoVolume();
    if (key === 'effects') sounds.setVolume(volumes.effects / 100);
    try {
      localStorage.setItem(VOLUMES_KEY, JSON.stringify(volumes));
    } catch {
      // không lưu được thì thôi
    }
  });
}

// Ẩn/hiện dòng FPS ở góc trái trên (nhớ lựa chọn cho lần sau)
const FPS_KEY = 'cinema-show-fps';
const fpsEl = $('fps');
const fpsCheckbox = $('show-fps');
let showFps = true;
try {
  showFps = localStorage.getItem(FPS_KEY) !== 'off';
} catch {
  // không đọc được thì để mặc định là hiện
}
function applyShowFps() {
  fpsCheckbox.checked = showFps;
  fpsEl.style.display = showFps ? '' : 'none';
}
applyShowFps();
fpsCheckbox.addEventListener('change', () => {
  showFps = fpsCheckbox.checked;
  applyShowFps();
  try {
    localStorage.setItem(FPS_KEY, showFps ? 'on' : 'off');
  } catch {
    // không lưu được thì thôi
  }
});

createYouTubePlayer(playerHost, {
  width: VIDEO_PX.w,
  height: VIDEO_PX.h,
  onError: (text) => (msg.textContent = text),
}).then((p) => {
  player = p;
  followers.push({ player: p, loadedVideoId: null, volume: () => volumes.video });
  applyDesired(); // người vào sau: player sẵn sàng thì bắt kịp video đang chiếu
});

// Đồng bộ video: `desired` là trạng thái mới nhất server gửi, đã tính cả thời gian trôi qua từ lúc nhận.
// Mọi trình phát trên máy này (màn hình to, và màn hình karaoke khi mình hát) đều bám theo `desired`.
const SYNC_TOLERANCE = 2; // giây; lệch hơn thì tự tua lại (định kỳ)
const EXPLICIT_TOLERANCE = 0.5; // khi có người tua/phát/dừng
let desired = null;
const followers = []; // { player, loadedVideoId, volume(): 0..100 }

const expectedPosition = () =>
  !desired ? 0 : desired.playing ? desired.position + (performance.now() - desired.receivedAt) / 1000 : desired.position;

function applyTo(follower, tolerance) {
  if (!desired || !desired.videoId) return;
  const p = follower.player;
  const pos = expectedPosition();

  if (desired.videoId !== follower.loadedVideoId) {
    follower.loadedVideoId = desired.videoId;
    if (desired.playing) p.load(desired.videoId, pos);
    else p.cue(desired.videoId, pos);
    p.setVolume(follower.volume()); // đổi video xong giữ nguyên âm lượng đã chỉnh
    return;
  }

  const state = p.getState(); // 0 hết, 1 phát, 2 dừng, 3 đệm, 5 đã nạp
  if (state === 0) return;
  if (Math.abs(p.getTime() - pos) > tolerance) {
    p.seek(pos);
    if (!desired.playing) p.pause();
  }
  if (desired.playing && state !== 1 && state !== 3) p.play();
  if (!desired.playing && state === 1) p.pause();
}

function applyDesired(tolerance = EXPLICIT_TOLERANCE) {
  for (const follower of followers) applyTo(follower, tolerance);
}

function setDesired(video) {
  if (!video) return;
  desired = { ...video, receivedAt: performance.now() };
  updatePlayPauseButton();
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
// Vị trí video hiện tại: ưu tiên theo trạng thái chung của phòng (khớp với mọi người), không có thì lấy từ trình phát
const videoPosition = () => (desired?.videoId ? expectedPosition() : player ? player.getTime() : 0);

// Một nút duy nhất cho phát/tạm dừng: đang phát thì bấm sẽ dừng, đang dừng thì bấm sẽ phát
const playPauseBtn = $('playpause');
playPauseBtn.addEventListener('click', () => {
  if (!room || !desired?.videoId) return;
  if (desired.playing) room.pauseVideo(videoPosition());
  else room.playVideo(videoPosition());
});
function updatePlayPauseButton() {
  const playing = !!desired?.playing;
  playPauseBtn.classList.toggle('is-playing', playing); // hiện biểu tượng tạm dừng khi đang phát, ngược lại hiện biểu tượng phát
  const label = playing ? 'Tạm dừng' : 'Phát';
  playPauseBtn.title = label;
  playPauseBtn.setAttribute('aria-label', label);
}

// Các nút tua: data-seek là số giây tua (âm = lùi). Tua tới trước 0 thì về 0; quá cuối video thì YouTube tự dừng ở cuối.
document.querySelectorAll('[data-seek]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!room || !desired?.videoId) return;
    room.seekVideo(Math.max(0, videoPosition() + Number(button.dataset.seek)));
  });
});

const avatars = new Avatars(scene, { onStep: (x, z) => sounds.playStepAt(x, z) });
// Avatar của chính mình, chỉ hiện ở góc nhìn thứ 3 (không tiếng bước chân vì tiếng của mình đã phát riêng)
const selfAvatar = new Avatars(scene);
const SELF = 'me';
// Góc nhìn thứ 3 chỉ dùng khi đang đứng; ngồi hoặc hát thì tự về góc nhìn thứ nhất (lựa chọn vẫn được nhớ)
let thirdPersonPref = false;
const isThirdPerson = () => thirdPersonPref && mySeat === null && myStage === null;
const THIRD_DISTANCE = 2.8;
const THIRD_PIVOT_DROP = 0.1; // m: tâm xoay thấp hơn mắt một chút (ngang đầu/cổ nhân vật)
const thirdDir = new THREE.Vector3();
// Thân mình nhìn từ mắt: gầy đi (bán kính 0.3 -> ~0.2) và lùi ra sau mắt một chút (nhỏ hơn bán kính mới, nhưng đủ
// xa để mặt trên của thân nằm dưới mắt hơn 0.1 m, tránh bị cắt bởi mặt phẳng gần của camera)
const FIRST_PERSON_BODY_WIDTH = 0.65;
const FIRST_PERSON_BODY_SETBACK = 0.18; // m

function toggleView() {
  thirdPersonPref = !thirdPersonPref;
  if (mySeat !== null || myStage !== null) {
    addChatLine('Góc nhìn thứ 3 chỉ dùng khi đứng; sẽ áp dụng khi bạn đứng dậy.', { system: true });
  }
}
let myId = null;
const names = new Map(); // id -> tên, để báo ai vào/rời phòng

// Voice chat: mặc định tắt mic, bấm M (hoặc nút trong menu) để nói
const hud = $('voice-status');
let voiceMode = null; // null (chưa bật) | 'mic' | 'listen-only'
let micOn = false;
function updateHud() {
  if (voiceMode === null) {
    hud.textContent = 'Voice: chưa bật';
  } else {
    // "nối x/y": x người đã nối voice được với mình trong y người khác ở trong phòng
    const { connected, total } = voice.status();
    const link = total > 0 ? ` · nối ${connected}/${total}` : '';
    if (voiceMode === 'listen-only') hud.textContent = `Voice: chỉ nghe (không có mic)${link}`;
    else if (isTouch) hud.textContent = (micOn ? 'Mic: BẬT' : 'Mic: tắt') + link;
    else hud.textContent = (micOn ? 'Mic: BẬT (nhấn M để tắt)' : 'Mic: tắt (nhấn M để nói)') + link;
  }
  touch?.setMicOn(micOn);
}
const voice = createVoice({
  sendSignal: (to, data) => room.sendSignal(to, data),
  onSpeaking: (id, speaking) => avatars.setSpeaking(id, speaking),
  onSelfSpeaking: (speaking) => selfAvatar.setSpeaking(SELF, speaking),
  getVolume: (id, senderMode) => listenVoiceVolume(id, senderMode),
  getSendVolume: (id) => sendVoiceVolume(id), // người nói tự hạ âm lượng gần/xa cho từng người nghe
  getExpectedGain: (id) => expectedVoiceGain(id),
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
  selfAvatar.remove(SELF);
  selfAvatar.add({ id: SELF, name: profile.name, color: profile.color });
  room = connectToRoom(profile, {
    onInit: (id, others, video, iceServers) => {
      myId = id;
      names.clear();
      seatOwners.clear();
      stageOwners.clear();
      mySeat = null;
      myStage = null;
      stopKaraoke();
      voice.stopSinging();
      others.forEach((p) => {
        avatars.add(p);
        names.set(p.id, p.name);
        if (p.seat !== null) seatOwners.set(p.seat, p.id);
        if (p.stage !== null) stageOwners.set(p.stage, p.id);
      });
      syncStageLights(); // vào giữa lúc có người đang hát thì đèn đã sáng sẵn
      voice.setRoster(id, others.map((p) => p.id), iceServers);
      for (const f of followers) f.loadedVideoId = null; // kết nối lại: nạp lại từ đầu theo trạng thái server
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
    onStage: ({ id, stage }) => {
      for (const [index, owner] of stageOwners) if (owner === id) stageOwners.delete(index);
      if (stage !== null) stageOwners.set(stage, id);
      syncStageLights();
      if (id !== myId) return;
      const previous = myStage;
      myStage = stage;
      if (stage !== null) {
        micBeforeSing = micOn;
        setMic(true); // hát thì bật mic
        lookToward(STAGES[stage].ry); // quay mặt về phía khán giả
        startKaraoke(stage); // màn hình nhắc lời trước mặt
        voice.startSinging(); // mic hát: có echo, reverb... (khác mic voice thường)
      } else if (previous !== null) {
        // hát xong (hoặc bị đẩy khỏi sân khấu): bước xuống phía trước sân khấu, trả mic về như cũ
        camera.position.x = STAGES[previous].spotX;
        camera.position.z = STAGES[previous].spotZ + 1.8;
        setMic(micBeforeSing);
        stopKaraoke();
        voice.stopSinging(); // trả về mic thường
      }
    },
    onStageDenied: () => addChatLine('Sân khấu này đã có người hát.', { system: true }),
    onStun: ({ id, duration }) => startStun(id, duration),
    onEmote: ({ id, type, on }) => {
      if (type === 'lightstick') {
        if (id === myId) selfAvatar.setHolding(SELF, !!on);
        else avatars.setHolding(id, !!on);
        return;
      }
      if (id === myId) selfAvatar.playAction(SELF, type);
      else avatars.playAction(id, type);
      if (type === 'clap') sounds.playClap(); // cả phòng nghe như nhau, gồm cả người vỗ
      if (type === 'confetti') {
        // bắn từ ngực người bắn lên trên đầu
        const a = avatars.items.get(id);
        if (id === myId) confetti.burst(camera.position.x, camera.position.y - 0.6, camera.position.z);
        else if (a) confetti.burst(a.group.position.x, a.group.position.y + (a.seated ? 0.65 : 1.0), a.group.position.z);
      }
    },
    // Ai tát (trúng hay hụt) thì hiện tay vung ra: tay của chính mình nhìn từ mắt mình, hoặc tay avatar của người khác
    onSwing: ({ id }) => {
      if (id === myId) {
        fpHand.swing();
        selfAvatar.swing(SELF);
      } else {
        avatars.swing(id);
      }
    },
    onLeave: (id) => {
      clearTimeout(stunTimers.get(id));
      stunTimers.delete(id);
      for (const [index, owner] of seatOwners) if (owner === id) seatOwners.delete(index);
      for (const [index, owner] of stageOwners) if (owner === id) stageOwners.delete(index);
      syncStageLights(); // người đang hát rời phòng thì tắt đèn
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
        stageOwners.clear();
        syncStageLights();
        mySeat = null;
        myStage = null;
        stopKaraoke();
        voice.stopSinging();
        stunUntil = 0;
        stunRing.hide();
        controls.pointerSpeed = 1;
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

// Hát trên sân khấu: đứng gần sân khấu còn trống thì hát được (cũng bằng phím E / nút trên điện thoại).
// Hát thì đứng im sau mic như ngồi ghế; tiếng của người hát vang toàn phòng, không theo luật gần xa.
const STAGE_REACH = 3; // m: cách chỗ đứng hát trong khoảng này mới thấy nút "Hát"
const stageOwners = new Map(); // chỉ số sân khấu -> id người đang hát
// Đèn sân khấu sáng khi và chỉ khi có người đang hát ở sân khấu đó (ai trong phòng cũng thấy)
function syncStageLights() {
  STAGES.forEach((_, i) => cinema.setStageLight(i, stageOwners.has(i)));
}
let myStage = null; // sân khấu mình đang hát (đã được server xác nhận)
let micBeforeSing = false; // trước khi hát mic đang bật hay tắt, để trả lại khi hát xong

function nearestFreeStage() {
  const p = camera.position;
  let best = -1;
  let bestDist = STAGE_REACH;
  STAGES.forEach((s, i) => {
    if (stageOwners.has(i)) return;
    const d = Math.hypot(s.spotX - p.x, s.spotZ - p.z);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

// Màn hình karaoke: người đang hát có thêm một trình phát YouTube (tắt tiếng) trên màn hình nhắc lời trước mặt,
// chiếu song song với màn hình to và bám theo cùng thời điểm. Người khác không cần dựng cái này.
// Hình chỉ hiện trên máy của người hát (web không sao chép hình từ khung video của YouTube được), nên phải
// dựng một trình phát thứ hai; để đỡ nặng chỉ dựng khi hát, cỡ 640x360 vừa đủ với màn hình nhỏ.
const KARAOKE_PX = { w: 640, h: 360 };
let karaoke = null; // { obj, follower, cancelled }

function startKaraoke(stageIndex) {
  stopKaraoke();
  const m = STAGES[stageIndex].monitor;
  const el = document.createElement('div');
  el.style.cssText = `width:${KARAOKE_PX.w}px;height:${KARAOKE_PX.h}px;background:#050505;`;
  const host = document.createElement('div');
  el.appendChild(host);
  const obj = new CSS3DObject(el);
  obj.position.set(m.x, m.y, m.z);
  obj.rotation.order = 'YXZ';
  obj.rotation.set(-m.tilt, m.yaw, 0); // đúng bằng mặt "lỗ" trong cảnh (cinema.js)
  obj.scale.setScalar(m.width / KARAOKE_PX.w);
  cssScene.add(obj);

  const state = { obj, follower: null, cancelled: false };
  karaoke = state;
  createYouTubePlayer(host, { width: KARAOKE_PX.w, height: KARAOKE_PX.h }).then((p) => {
    if (state.cancelled) {
      p.destroy(); // hát xong/đổi chỗ trước khi trình phát kịp sẵn sàng
      return;
    }
    p.mute(); // tiếng đã có ở màn hình to rồi
    state.follower = { player: p, loadedVideoId: null, volume: () => 0 };
    followers.push(state.follower);
    applyDesired();
  });
}

function stopKaraoke() {
  if (!karaoke) return;
  karaoke.cancelled = true;
  if (karaoke.follower) {
    followers.splice(followers.indexOf(karaoke.follower), 1);
    try {
      karaoke.follower.player.destroy();
    } catch {
      // đã huỷ rồi thì thôi
    }
  }
  cssScene.remove(karaoke.obj);
  karaoke = null;
}

// Âm lượng giọng theo luật gần xa. Chỉ nghe rõ nhất khi đứng gần nhau (cỡ tầm đánh nhau, 1.8 m);
// xa hơn thì nhỏ dần rất nhanh, và từ VOICE_FAR trở ra thì không nghe thấy gì. Người đang hát thì cả phòng nghe đều.
const VOICE_MAX = 0.6; // 3/5 âm lượng ban đầu
const VOICE_NEAR = 1.8; // trong khoảng này nghe ở mức tối đa
const VOICE_FAR = 8; // từ khoảng này trở ra là im
const STAGE_MIC_VOLUME = 0.75; // mic sân khấu: 3/4 mức tối đa, nghe đều cả phòng

// Âm lượng theo luật trên, giữa người nói (đang hát hay không) và người nghe cách nhau d mét
function designVolume(singer, d) {
  if (singer) return STAGE_MIC_VOLUME;
  const t = THREE.MathUtils.clamp((d - VOICE_NEAR) / (VOICE_FAR - VOICE_NEAR), 0, 1);
  return VOICE_MAX * (1 - t) ** 2; // giảm nhanh ở gần rồi nhỏ dần tới 0
}
const isSinger = (id) => [...stageOwners.values()].includes(id);
function distanceTo(id) {
  const avatar = avatars.items.get(id);
  if (!avatar) return Infinity;
  return Math.hypot(avatar.group.position.x - camera.position.x, avatar.group.position.z - camera.position.z);
}
// Âm lượng người `id` gửi cho mình (người nói tự hạ trước khi gửi), dùng để đo "đang nói" cho đúng
const expectedVoiceGain = (id) => designVolume(isSinger(id), distanceTo(id));
// Âm lượng mình gửi cho người `id`: gần/xa theo khoảng cách tới họ, hoặc 3/4 nếu mình đang hát
const sendVoiceVolume = (id) => designVolume(myStage !== null, distanceTo(id));
// Hệ số mình tự áp dụng khi phát giọng người `id` (thanh "Âm lượng voice" trong menu, 0-100% so với mức thiết kế).
// Nếu thiết bị người đó đã hạ âm lượng rồi ('gain') thì chỉ cần hệ số của mình; nếu họ gửi giọng gốc ('raw')
// thì mình phải tự hạ theo khoảng cách như cách cũ.
function listenVoiceVolume(id, senderMode) {
  const own = volumes.voice / 100;
  return senderMode === 'gain' ? own : Math.min(1, own * expectedVoiceGain(id));
}

// Bật/tắt mic theo ý muốn (không đảo ngược)
function setMic(on) {
  if (voiceMode === 'mic' && micOn !== on) toggleMic();
}

// Phím E / nút trên điện thoại: đứng dậy, dừng hát, hoặc ngồi/hát nếu đang đứng gần chỗ trống
function interact() {
  if (!room || !myId || isStunned()) return;
  if (mySeat !== null) {
    room.stand();
    return;
  }
  if (myStage !== null) {
    room.stopSing();
    return;
  }
  if (nearestFreeStage() >= 0) {
    if (voiceMode !== 'mic') {
      addChatLine('Cần cho phép dùng micro để hát.', { system: true });
      return;
    }
    room.sing(nearestFreeStage());
    return;
  }
  const seat = nearestFreeSeat();
  if (seat >= 0) room.sit(seat);
}

const sitPrompt = $('sit-prompt');
function updateSitPrompt() {
  // Điện thoại: ngồi/hát thì ẩn cần gạt đi (không đi được), đứng dậy thì hiện lại
  const joyVisible = mySeat === null && myStage === null;
  if (touch && joyVisible !== lastJoyVisible) {
    lastJoyVisible = joyVisible;
    touch.setJoyVisible(joyVisible);
  }

  let text = '';
  if (isActive()) {
    if (mySeat !== null) text = isTouch ? 'Đứng' : 'Nhấn E để đứng dậy';
    else if (myStage !== null) text = isTouch ? 'Dừng hát' : 'Nhấn E để dừng hát';
    else if (nearestFreeStage() >= 0) text = isTouch ? 'Hát' : 'Nhấn E để hát';
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

// Đánh nhau: server quyết định ai trúng đòn. Bị choáng thì không đi, không xoay, không đánh/ngồi được trong vài giây.
const PUNCH_COOLDOWN_MS = 1000; // khớp server, chỉ để đỡ gửi thừa
let stunUntil = 0;
let lastPunchAt = 0;
const stunRing = new StunRing(camera); // vòng sao 3D gắn vào camera, chỉ hiện khi mình bị choáng
const stunTimers = new Map(); // id người khác -> hẹn giờ hết choáng
const isStunned = () => performance.now() < stunUntil;

function startStun(id, duration) {
  // bị choáng thì dừng mọi hành động đang diễn (vỗ tay, tát...)
  if (id === myId) {
    fpHand.cancel();
    selfAvatar.cancelActions(SELF);
  } else {
    avatars.cancelActions(id);
  }

  // Server báo đòn đã trúng: cả phòng nghe tiếng tát tại chỗ người bị đánh (xa thì nhỏ)
  const victim = id === myId ? camera.position : avatars.items.get(id)?.group.position;
  if (victim) sounds.playSlapAt(victim.x, victim.z);

  if (id === myId) {
    stunUntil = performance.now() + duration;
    stunRing.show();
    selfAvatar.setStunned(SELF, true); // thấy sao trên đầu mình ở góc nhìn thứ 3
    controls.pointerSpeed = 0; // chuột không xoay được nữa
    setTimeout(() => {
      if (isStunned()) return;
      selfAvatar.setStunned(SELF, false);
      stunRing.hide();
      controls.pointerSpeed = 1;
    }, duration + 20);
    return;
  }
  avatars.setStunned(id, true); // người khác thấy sao trên đầu
  clearTimeout(stunTimers.get(id));
  stunTimers.set(
    id,
    setTimeout(() => {
      avatars.setStunned(id, false);
      stunTimers.delete(id);
    }, duration)
  );
}

// Rung nhẹ khi bị choáng: nghiêng camera một góc rất nhỏ quanh lúc vẽ rồi trả lại (không đổi hướng nhìn thật)
const SHAKE_AMPLITUDE = 0.012; // rad (~0.7°)
const SHAKE_FADE_MS = 400;
const shakeEuler = new THREE.Euler();
const shakeQuat = new THREE.Quaternion();
const savedQuat = new THREE.Quaternion();
function applyShake(nowMs) {
  const t = nowMs / 1000;
  const fade = Math.min(1, (stunUntil - nowMs) / SHAKE_FADE_MS); // yếu dần ở cuối
  const a = SHAKE_AMPLITUDE * fade;
  savedQuat.copy(camera.quaternion);
  shakeEuler.set(a * Math.sin(t * 37), a * Math.sin(t * 29 + 1), a * 0.7 * Math.sin(t * 23 + 2));
  camera.quaternion.multiply(shakeQuat.setFromEuler(shakeEuler));
}

// Hành động: phím số 1-4 (điện thoại: nút Hành động). Server kiểm tra thời gian chờ và quyết định có làm không.
const EMOTE_KEYS = { Digit1: 'clap', Digit2: 'confetti', Digit3: 'lightstick', Digit4: 'heart' };
function doEmote(type) {
  if (!room || !myId || isStunned()) return;
  room.emote(type);
}

function punch() {
  if (!room || !myId || isStunned()) return;
  const now = performance.now();
  if (now - lastPunchAt < PUNCH_COOLDOWN_MS) return;
  lastPunchAt = now;
  room.punch();
}

// Điều khiển góc nhìn thứ nhất: máy tính dùng chuột + phím (khoá con trỏ), điện thoại dùng cảm ứng
const controls = new PointerLockControls(camera, document.body);
const keys = new Set();
let touchActive = false;
const isActive = () => (isTouch ? touchActive : controls.isLocked);

let yaw = 0;
let pitch = 0;
// Quay về một hướng ngang (ry = 0: nhìn về phía màn hình; ry = π: nhìn về phía khán giả) và nhìn thẳng
function lookToward(ry) {
  yaw = ry;
  pitch = 0;
  camera.rotation.set(0, ry, 0);
}
const lookForward = () => lookToward(0);

const LOOK_SENSITIVITY = 0.005; // rad mỗi px khi kéo ngón tay
const touch = isTouch
  ? createTouchControls({
      onLook: (dx, dy) => {
        if (isStunned()) return;
        yaw -= dx * LOOK_SENSITIVITY;
        pitch = THREE.MathUtils.clamp(pitch - dy * LOOK_SENSITIVITY, -1.4, 1.4);
        camera.rotation.set(pitch, yaw, 0);
      },
      onMenu: () => setActive(false),
      onMic: () => (voiceMode === null ? startVoice() : toggleMic()),
      onChat: () => startChat(),
      onSit: interact,
      onPunch: punch,
      onView: toggleView,
      onAction: doEmote,
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
  sounds.unlock(); // trình duyệt chỉ cho phát âm thanh sau một thao tác bấm
  if (isTouch) {
    setActive(true);
    // Toàn màn hình cho rộng chỗ. Không khoá hướng màn hình: trang tự xoay ngang bằng CSS (xem index.html),
    // khoá hướng thật sẽ xung đột với việc đó
    try {
      document.documentElement.requestFullscreen?.()?.catch(() => {});
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
  else if (e.code === 'KeyE' && !e.repeat) interact();
  else if (e.code === 'KeyF' && !e.repeat) punch();
  else if (e.code === 'KeyV' && !e.repeat) toggleView();
  else if (EMOTE_KEYS[e.code] && !e.repeat) doEmote(EMOTE_KEYS[e.code]);
  else if (e.code === 'Enter' && !e.repeat) startChat();
  else keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('mousedown', (e) => {
  if (controls.isLocked && e.button === 0) punch(); // chuột trái khi đang trong rạp
});

if (isTouch) $('hint').textContent = 'Cần gạt bên trái để đi, kéo bên phải để nhìn quanh. Dùng các nút ở góc để ngồi, chat, mic.';

const SPEED = 4;
const PLAYER_RADIUS = 0.25; // m: bề rộng thân khi va chạm với ghế, loa...
const EYE_HEIGHT = 1.6;
const clock = new THREE.Clock();
const SEND_INTERVAL = 1 / 15;
let sendTimer = 0;
let ownStepDist = 0;
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
  const stage = myStage !== null ? STAGES[myStage] : null;
  const locked = seat || stage; // ngồi hoặc đang hát thì đứng im tại chỗ
  const stepFromX = p.x;
  const stepFromZ = p.z;

  if (isActive() && !isStunned()) {
    const forward = THREE.MathUtils.clamp(
      (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + (touch ? touch.move.y : 0), -1, 1);
    const right = THREE.MathUtils.clamp(
      (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + (touch ? touch.move.x : 0), -1, 1);
    // đang ngồi/hát thì không đi được, phải đứng dậy hoặc dừng hát trước (phím E / nút trên điện thoại)
    if (!locked && (Math.abs(forward) > 0.1 || Math.abs(right) > 0.1)) {
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
  } else if (stage) {
    // hát: đứng đúng chỗ sau mic trên sân khấu
    const k = Math.min(1, dt * 10);
    p.x += (stage.spotX - p.x) * k;
    p.z += (stage.spotZ - p.z) * k;
    targetY = stage.height + EYE_HEIGHT;
  } else {
    // giữ trong phòng và bước theo độ cao bậc thang / sân khấu
    p.x = THREE.MathUtils.clamp(p.x, ROOM.minX + 0.5, ROOM.maxX - 0.5);
    p.z = THREE.MathUtils.clamp(p.z, ROOM.minZ + 0.5, ROOM.maxZ - 0.5);
    const pushed = resolveCollisions(p.x, p.z, PLAYER_RADIUS); // không đi xuyên ghế, loa, mic...
    p.x = pushed.x;
    p.z = pushed.z;
    targetY = floorHeight(p.x, p.z) + EYE_HEIGHT;
  }
  p.y += (targetY - p.y) * Math.min(1, dt * 12);

  // Tiếng bước chân của chính mình: đi đủ một bước thì phát (ngồi/choáng thì không có)
  const walked = Math.hypot(p.x - stepFromX, p.z - stepFromZ);
  if (locked || isStunned() || walked > 1.5) {
    ownStepDist = 0;
  } else {
    ownStepDist += walked;
    if (ownStepDist >= STEP_LENGTH) {
      ownStepDist -= STEP_LENGTH;
      sounds.playStepAt(p.x, p.z);
    }
  }
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
    updateHud(); // làm mới trạng thái nối voice mỗi giây
    if (showFps) fpsEl.textContent = `${fps} FPS · ${renderer.info.render.calls} lệnh vẽ · độ nét ${pixelRatio.toFixed(2)}x${lowQuality ? ' · chế độ nhẹ' : ''}`;
    adaptResolution(fps, now);
    frames = 0;
    fpsStart = now;
  }

  avatars.update(dt);
  cinema.updateEffects(dt); // đèn sân khấu sáng/tắt dần
  confetti.update(dt);
  fpHand.update(now);

  // Góc nhìn thứ 3: avatar của mình hiện ra đúng chỗ người chơi đứng, còn camera chỉ lùi ra sau lúc vẽ
  // (vị trí thật của người chơi vẫn là vị trí mắt nên mọi tính toán khác không đổi)
  const third = isThirdPerson();
  const me = selfAvatar.items.get(SELF);
  if (me) {
    // Góc nhìn thứ nhất khi đứng: vẫn hiện thân mình (lùi ra sau mắt một chút) để cúi xuống thấy người mình;
    // ẩn kính, nhãn tên và tay vì những thứ này nằm sát mắt. Ngồi/hát thì ẩn hẳn.
    const standing = mySeat === null && myStage === null;
    me.group.visible = standing;
    me.visor.visible = me.sprite.visible = me.hands.root.visible = third;
    if (standing) {
      const ry = camera.rotation.y;
      const back = third ? 0 : FIRST_PERSON_BODY_SETBACK; // lùi ngược hướng nhìn
      const width = third ? 1 : FIRST_PERSON_BODY_WIDTH; // thân gầy đi khi nhìn từ mắt, khỏi chiếm cả màn hình lúc cúi
      me.body.scale.x = me.body.scale.z = width; // chỉ thân gầy đi, hai bàn chân giữ nguyên để còn lộ ra
      const target = { x: p.x + Math.sin(ry) * back, y: p.y - EYE_HEIGHT, z: p.z + Math.cos(ry) * back, ry };
      selfAvatar.setTarget(SELF, target);
      me.group.position.set(target.x, target.y, target.z); // bám sát, không nội suy
      me.group.rotation.y = ry;
      selfAvatar.update(dt);
    }
  }
  if (third) fpHand.hand.visible = false; // tay nhìn từ mắt không dùng ở góc nhìn này
  const eyePos = third ? p.clone() : null;
  if (third) {
    // Camera xoay quanh nhân vật: lùi ra sau theo đúng hướng nhìn (gồm cả cúi/ngẩng), nên cúi xuống thì camera
    // bay lên cao nhìn xuống nhân vật, ngẩng lên thì hạ thấp (không xuống dưới sàn)
    camera.getWorldDirection(thirdDir);
    const cx = THREE.MathUtils.clamp(p.x - thirdDir.x * THIRD_DISTANCE, ROOM.minX + 0.3, ROOM.maxX - 0.3);
    const cz = THREE.MathUtils.clamp(p.z - thirdDir.z * THIRD_DISTANCE, ROOM.minZ + 0.3, ROOM.maxZ - 0.3);
    const cy = Math.min(p.y - THIRD_PIVOT_DROP - thirdDir.y * THIRD_DISTANCE, ROOM.height - 0.3);
    camera.position.set(cx, Math.max(cy, floorHeight(cx, cz) + 0.3), cz);
  }

  const shaking = isStunned();
  if (shaking) {
    applyShake(now);
    stunRing.update(now);
  }
  renderer.render(scene, camera);
  if (!NO_CSS) cssRenderer.render(cssScene, camera);
  if (shaking) camera.quaternion.copy(savedQuat);
  if (eyePos) camera.position.copy(eyePos);
}
animate();

addEventListener('resize', () => {
  camera.aspect = viewW() / viewH();
  camera.updateProjectionMatrix();
  renderer.setSize(viewW(), viewH());
  cssRenderer.setSize(viewW(), viewH());
});
