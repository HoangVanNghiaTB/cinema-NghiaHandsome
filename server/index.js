import { createServer } from 'http';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 10;
const SEAT_COUNT = 18; // phải khớp SEATS.length ở client/src/scene/cinema.js

// Đánh nhau: server kiểm tra tầm đánh, hướng nhìn và thời gian chờ để không ai gian lận hay spam
const PUNCH_RANGE = 1.8; // m
const PUNCH_FRONT_COS = 0.5; // mục tiêu phải nằm trong góc ±60° phía trước người đánh
const PUNCH_COOLDOWN_MS = 1000;
const STUN_MS = 2000;
const STUN_IMMUNE_MS = 1000; // sau khi hết choáng được miễn nhiễm một lúc, tránh bị khoá liên tục
const isProd = process.env.NODE_ENV === 'production';

// Máy chủ STUN/TURN cho voice chat. TURN (tuỳ chọn) cần cho các mạng không nối trực tiếp được (4G, mạng công ty).
// Đặt TURN_URL (nhiều URL ngăn cách bằng dấu phẩy), TURN_USERNAME, TURN_CREDENTIAL ở biến môi trường.
const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
if (process.env.TURN_URL) {
  iceServers.push({
    urls: process.env.TURN_URL.split(',').map((u) => u.trim()),
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL,
  });
}

const app = express();

// Phục vụ client đã build (client/dist) nếu có: một server lo cả trang web và realtime
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const httpServer = createServer(app);
// Khi chạy thật, trang và socket cùng origin nên không cần CORS; chỉ mở khi dev (client ở cổng 5173)
const io = new Server(httpServer, isProd ? {} : { cors: { origin: true } });

// Một phòng duy nhất: id socket -> { id, name, color, x, y, z, ry }
const players = new Map();

const cleanName = (v) => String(v ?? '').trim().slice(0, 20) || 'Khách';
const cleanColor = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : '#888888');
const num = (v) => (Number.isFinite(v) ? v : 0);

// Trạng thái video chung. position là vị trí (giây) tại thời điểm updatedAt (ms)
let video = { videoId: null, playing: false, position: 0, updatedAt: Date.now() };

// Trạng thái gửi cho client, với position đã tính đến thời điểm hiện tại
const videoSnapshot = () => ({
  videoId: video.videoId,
  playing: video.playing,
  position: video.playing ? video.position + (Date.now() - video.updatedAt) / 1000 : video.position,
});

function setVideo(changes) {
  video = { ...videoSnapshot(), ...changes, updatedAt: Date.now() };
  io.emit('video-state', videoSnapshot());
}

const cleanPosition = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

io.on('connection', (socket) => {
  let lastChatAt = 0;

  socket.on('chat', (data = {}) => {
    const p = players.get(socket.id);
    const text = String(data.text ?? '').trim().slice(0, 200);
    const now = Date.now();
    if (!p || !text || now - lastChatAt < 300) return; // chống spam
    lastChatAt = now;
    io.emit('chat', { id: p.id, name: p.name, text });
  });

  socket.on('join', (data = {}) => {
    if (players.has(socket.id)) return;
    if (players.size >= MAX_PLAYERS) {
      socket.emit('room-full');
      socket.disconnect(true);
      return;
    }
    const player = {
      id: socket.id,
      name: cleanName(data.name),
      color: cleanColor(data.color),
      x: 0,
      y: 0,
      z: -4,
      ry: 0,
      seat: null, // chỉ số ghế đang ngồi, hoặc null
      lastPunchAt: 0,
      stunnedUntil: 0,
      immuneUntil: 0,
    };
    players.set(socket.id, player);
    socket.emit('init', {
      id: socket.id,
      players: [...players.values()].filter((p) => p.id !== socket.id),
      video: videoSnapshot(),
      iceServers,
    });
    socket.broadcast.emit('player-joined', player);
  });

  socket.on('move', (data = {}) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.x = num(data.x);
    p.y = num(data.y);
    p.z = num(data.z);
    p.ry = num(data.ry);
    socket.volatile.broadcast.emit('player-moved', { id: p.id, x: p.x, y: p.y, z: p.z, ry: p.ry });
  });

  // Ngồi ghế: server quyết định ghế còn trống hay không (một ghế một người)
  socket.on('sit', (data = {}) => {
    const p = players.get(socket.id);
    if (!p) return;
    const seat = data.seat;
    const valid = Number.isInteger(seat) && seat >= 0 && seat < SEAT_COUNT;
    const taken = valid && [...players.values()].some((o) => o.id !== p.id && o.seat === seat);
    if (!valid || taken) {
      socket.emit('seat-denied');
      return;
    }
    p.seat = seat;
    io.emit('seat-update', { id: p.id, seat });
  });

  socket.on('stand', () => {
    const p = players.get(socket.id);
    if (!p || p.seat === null) return;
    p.seat = null;
    io.emit('seat-update', { id: p.id, seat: null });
  });

  // Đánh: người gần nhất ở phía trước trong tầm đánh bị choáng; đang ngồi thì bị văng khỏi ghế
  socket.on('punch', () => {
    const p = players.get(socket.id);
    if (!p) return;
    const now = Date.now();
    if (now - p.lastPunchAt < PUNCH_COOLDOWN_MS || now < p.stunnedUntil) return;
    p.lastPunchAt = now;

    const fx = -Math.sin(p.ry);
    const fz = -Math.cos(p.ry);
    let target = null;
    let best = PUNCH_RANGE;
    for (const o of players.values()) {
      if (o.id === p.id || now < o.immuneUntil) continue;
      const dx = o.x - p.x;
      const dz = o.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= best || (dist > 0 && (dx * fx + dz * fz) / dist < PUNCH_FRONT_COS)) continue;
      target = o;
      best = dist;
    }
    if (!target) return;

    target.stunnedUntil = now + STUN_MS;
    target.immuneUntil = target.stunnedUntil + STUN_IMMUNE_MS;
    if (target.seat !== null) {
      target.seat = null;
      io.emit('seat-update', { id: target.id, seat: null });
    }
    io.emit('stun', { id: target.id, by: p.id, duration: STUN_MS });
  });

  // Chuyển tiếp tín hiệu WebRTC (voice chat) giữa hai người trong phòng
  socket.on('signal', (msg = {}) => {
    if (!players.has(socket.id) || !players.has(msg.to)) return;
    io.to(msg.to).emit('signal', { from: socket.id, data: msg.data });
  });

  // Ai trong phòng cũng điều khiển được video
  socket.on('video-load', (data = {}) => {
    if (!players.has(socket.id) || !/^[\w-]{11}$/.test(data.videoId)) return;
    setVideo({ videoId: data.videoId, playing: true, position: 0 });
  });
  socket.on('video-play', (data = {}) => {
    if (!players.has(socket.id) || !video.videoId) return;
    setVideo({ playing: true, position: cleanPosition(data.position) });
  });
  socket.on('video-pause', (data = {}) => {
    if (!players.has(socket.id) || !video.videoId) return;
    setVideo({ playing: false, position: cleanPosition(data.position) });
  });
  socket.on('video-seek', (data = {}) => {
    if (!players.has(socket.id) || !video.videoId) return;
    setVideo({ position: cleanPosition(data.position) });
  });

  socket.on('disconnect', () => {
    if (!players.delete(socket.id)) return;
    io.emit('player-left', socket.id);
    // Phòng trống thì xoá video cũ
    if (players.size === 0) video = { videoId: null, playing: false, position: 0, updatedAt: Date.now() };
  });
});

httpServer.listen(PORT, () => console.log(`Server chạy ở cổng ${PORT}`));
