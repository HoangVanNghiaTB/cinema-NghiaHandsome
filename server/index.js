import { createServer } from 'http';
import { createHash, timingSafeEqual } from 'crypto';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import { Server } from 'socket.io';
import { MIX_PARAMS, MIX_DEFAULTS, cleanMixValue } from '../client/src/audio/mixParams.js';
import { cleanLook, limitLook } from '../client/src/scene/looks.js';
import { SING_COST, SING_PROMPT_MS, TIP_AMOUNTS } from '../client/src/economy.js';
import { ROOMS, MAX_PLAYERS } from '../client/src/rooms.js';
import { createGames } from './games.js';
import { createWallet } from './wallet.js';
import { createTrash } from './trash.js';
import { createAdmin } from './admin.js';
import { TRASH_EVERY_MS, TRASH_MAX } from '../client/src/economy.js';

const PORT = process.env.PORT || 3000;
const SEAT_COUNT = 18; // phải khớp SEATS.length ở client/src/scene/cinema.js
const STAGE_COUNT = 2; // phải khớp STAGES.length ở client/src/scene/cinema.js; mỗi sân khấu một mic, một người hát

// Hành động (emote): server chỉ nhận loại có trong danh sách này, và chặn gửi liên tục (thời gian chờ mỗi loại, ms).
// clap, confetti, heart là hành động bắn một lần; lightstick và eat (bát đũa) là trạng thái bật/tắt (server nhớ để người vào sau thấy)
const EMOTE_COOLDOWN_MS = { clap: 3000, confetti: 2500, heart: 3500, lightstick: 400, eat: 400 };
const HOLDABLE_EMOTES = ['lightstick', 'eat'];

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

// Cài đặt chỉnh được lúc đang chạy qua trang admin (server/admin.js); khởi động lại thì về mặc định
const settings = { trash: { enabled: true, everyMs: TRASH_EVERY_MS, max: TRASH_MAX } };

// Cấm vào: khoá `cid:<clientId>` hoặc `ip:<địa chỉ>` -> thời điểm hết cấm (Infinity = tới khi server khởi động lại)
const bans = new Map();
const isBanned = (...keys) => {
  const now = Date.now();
  return keys.some((k) => {
    const until = bans.get(k);
    if (until === undefined) return false;
    if (until <= now) bans.delete(k);
    return until > now;
  });
};

// Mật khẩu phòng khoá nằm ở biến môi trường ROOM_PASSWORD_<ID viết hoa> (ví dụ ROOM_PASSWORD_AE), KHÔNG ghi vào code vì repo công khai.
// Phòng khoá mà chưa đặt biến thì không ai vào được (báo "chưa cài mật khẩu").
const secretOf = (cfg) => (cfg.locked ? process.env[`ROOM_PASSWORD_${cfg.id.toUpperCase()}`] || '' : null);
const digest = (v) => createHash('sha256').update(String(v ?? '')).digest();
const passwordOk = (secret, given) => timingSafeEqual(digest(secret), digest(given));
// Chống dò mật khẩu: một địa chỉ sai quá MAX_FAILS lần trong FAIL_WINDOW_MS thì bị chặn một lúc
const MAX_FAILS = 8;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const failures = new Map(); // ip -> { n, since }
const clientIp = (socket) => String(socket.handshake.headers['x-forwarded-for'] ?? socket.handshake.address).split(',')[0].trim();


const httpServer = createServer(app);
// Khi chạy thật, trang và socket cùng origin nên không cần CORS; chỉ mở khi dev (client ở cổng 5173)
const io = new Server(httpServer, isProd ? {} : { cors: { origin: true } });

// Mỗi phòng là một namespace socket.io riêng (/ae, /khach1, ...) với người chơi, video, bảng âm, điểm và game riêng.
function createRoom(nsp, cfg) {
  const roomStart = Date.now();
  // Bảng chỉnh âm mic hát: cả phòng dùng chung một bộ thông số (xem client/src/audio/mixParams.js)
  let mix = { ...MIX_DEFAULTS };

  // Người chơi trong phòng này: id socket -> { id, name, color, x, y, z, ry, ... }
  const players = new Map();

  // Điểm của rạp (xem server/wallet.js) và mini game treo tường (xem server/games.js)
  const wallet = createWallet(nsp, players);
  const games = createGames(nsp, players, wallet);
  const trash = createTrash(nsp, players, wallet, settings.trash); // rác rơi trong rạp, nhặt để lấy điểm (server/trash.js)

  // Phòng trống quá ngần này thì xoá dữ liệu điểm / phụ kiện / xếp hạng game (tải lại trang một mình thì chưa mất)
  const ROOM_RESET_MS = Number(process.env.ROOM_RESET_MS) || 60000;
  let resetTimer = null;

  // Người chơi gửi cho người khác: bỏ khoá tài khoản điểm (cid) và các thứ chỉ server dùng
  const publicPlayer = ({ cid, ip, muted, emoteAt, lastPunchAt, stunnedUntil, immuneUntil, ...pub }) => pub;
  const singTimers = new Map(); // id -> hẹn giờ tự xuống sân khấu nếu không xác nhận trả điểm hát

  // Rời sân khấu (xuống, bị đánh văng, hết thời gian xác nhận)
  function leaveStage(p) {
    clearTimeout(singTimers.get(p.id));
    singTimers.delete(p.id);
    if (p.stage === null) return;
    p.stage = null;
    p.singPaid = false;
    nsp.emit('stage-update', { id: p.id, stage: null });
  }

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
    nsp.emit('video-state', videoSnapshot());
  }

  const cleanPosition = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

  // Phòng khoá: phải gửi đúng mật khẩu (auth.password) mới nối được; socket sai mật khẩu không bao giờ tới được các xử lý bên dưới
    nsp.use((socket, next) => {
      if (isBanned(`ip:${clientIp(socket)}`)) return next(new Error('banned'));
      if (!cfg.locked) return next();
      const secret = secretOf(cfg);
      if (!secret) return next(new Error('no-password-configured'));
      const ip = clientIp(socket);
      const f = failures.get(ip);
      if (f && f.n >= MAX_FAILS && Date.now() - f.since < FAIL_WINDOW_MS) return next(new Error('too-many'));
      if (passwordOk(secret, socket.handshake.auth?.password)) {
        failures.delete(ip);
        return next();
      }
      const now = Date.now();
      failures.set(ip, !f || now - f.since >= FAIL_WINDOW_MS ? { n: 1, since: now } : { n: f.n + 1, since: f.since });
      return next(new Error('bad-password'));
    });

    nsp.on('connection', (socket) => {
    let lastChatAt = 0;
    games.attach(socket);

    socket.on('chat', (data = {}) => {
      const p = players.get(socket.id);
      const text = String(data.text ?? '').trim().slice(0, 200);
      const now = Date.now();
      if (!p || p.muted || !text || now - lastChatAt < 300) return; // chống spam; người bị admin khoá chat thì không gửi được
      lastChatAt = now;
      nsp.emit('chat', { id: p.id, name: p.name, text });
    });

    socket.on('join', (data = {}) => {
      if (players.has(socket.id)) return;
      clearTimeout(resetTimer);
      const joinCid = /^[\w-]{8,64}$/.test(data.clientId) ? data.clientId : socket.id;
      if (isBanned(`cid:${joinCid}`, `ip:${clientIp(socket)}`)) {
        socket.emit('banned');
        socket.disconnect(true);
        return;
      }
      if (players.size >= MAX_PLAYERS) {
        socket.emit('room-full');
        socket.disconnect(true);
        return;
      }
      // Khoá tài khoản điểm: clientId do trình duyệt tự sinh (tải lại trang vẫn giữ điểm, không được phát lại 500)
      const cid = /^[\w-]{8,64}$/.test(data.clientId) ? data.clientId : socket.id;
      const player = {
        id: socket.id,
        cid,
        ip: clientIp(socket),
        muted: false, // admin khoá chat
        name: cleanName(data.name),
        color: cleanColor(data.color),
        look: limitLook(cleanLook(data.look), wallet.ownedSet(cid)), // phụ kiện chưa mua bị bỏ (xem client/src/scene/looks.js)
        x: 0,
        y: 0,
        z: -4,
        ry: 0,
        seat: null, // chỉ số ghế đang ngồi, hoặc null
        stage: null, // chỉ số sân khấu đang đứng, hoặc null
        singPaid: false, // đã trả điểm để hát chưa (đứng trên sân khấu mà chưa trả thì chưa phát tiếng hát)
        holding: null, // vật đang cầm ('lightstick' | 'eat'), hoặc null
        emoteAt: {}, // loại hành động -> lần cuối làm (để tính thời gian chờ)
        lastPunchAt: 0,
        stunnedUntil: 0,
        immuneUntil: 0,
      };
      players.set(socket.id, player);
      socket.emit('init', {
        id: socket.id,
        players: [...players.values()].filter((p) => p.id !== socket.id).map(publicPlayer),
        video: videoSnapshot(),
        mix,
        games: games.briefs(),
        self: { look: player.look, wallet: wallet.snapshot(cid), trash: trash.list() },
        iceServers,
      });
      socket.broadcast.emit('player-joined', publicPlayer(player));
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

    // Hành động: ngồi, hát, đang ở đâu cũng làm được; bị choáng thì không
    socket.on('emote', (data = {}) => {
      const p = players.get(socket.id);
      if (!p || !Object.hasOwn(EMOTE_COOLDOWN_MS, data.type)) return;
      const now = Date.now();
      if (now < p.stunnedUntil || now - (p.emoteAt[data.type] ?? 0) < EMOTE_COOLDOWN_MS[data.type]) return;
      p.emoteAt[data.type] = now;
      if (HOLDABLE_EMOTES.includes(data.type)) {
        // bấm để cầm, bấm lại để cất; đang cầm thứ khác thì đổi sang thứ này (mỗi người chỉ cầm một thứ)
        const previous = p.holding;
        p.holding = previous === data.type ? null : data.type;
        if (previous && previous !== data.type) nsp.emit('emote', { id: p.id, type: previous, on: false });
        nsp.emit('emote', { id: p.id, type: data.type, on: p.holding === data.type });
      } else {
        nsp.emit('emote', { id: p.id, type: data.type });
      }
    });

    // Ngồi ghế: server quyết định ghế còn trống hay không (một ghế một người)
    socket.on('sit', (data = {}) => {
      const p = players.get(socket.id);
      if (!p) return;
      const seat = data.seat;
      const valid = Number.isInteger(seat) && seat >= 0 && seat < SEAT_COUNT;
      const taken = valid && [...players.values()].some((o) => o.id !== p.id && o.seat === seat);
      if (!valid || taken || p.stage !== null) {
        socket.emit('seat-denied');
        return;
      }
      p.seat = seat;
      nsp.emit('seat-update', { id: p.id, seat });
    });

    // Hát trên sân khấu: mỗi sân khấu một mic, một người hát. Người đang hát được nghe cả phòng (xử lý ở client).
    socket.on('sing', (data = {}) => {
      const p = players.get(socket.id);
      if (!p) return;
      const stage = data.stage;
      const valid = Number.isInteger(stage) && stage >= 0 && stage < STAGE_COUNT;
      const taken = valid && [...players.values()].some((o) => o.id !== p.id && o.stage === stage);
      if (!valid || taken || p.seat !== null) {
        socket.emit('stage-denied');
        return;
      }
      // Lên sân khấu (đèn sáng) trước, chưa trả điểm thì chưa phát tiếng hát; client hỏi "dùng 50 điểm để vào hát?"
      p.stage = stage;
      p.singPaid = false;
      clearTimeout(singTimers.get(p.id));
      singTimers.set(p.id, setTimeout(() => {
        if (p.stage === stage && !p.singPaid) {
          leaveStage(p);
          nsp.to(p.id).emit('notice', { text: 'Hết thời gian xác nhận, bạn đã xuống sân khấu.' });
        }
      }, SING_PROMPT_MS + 1500));
      nsp.emit('stage-update', { id: p.id, stage, paid: false });
    });

    // Đồng ý dùng điểm để hát: trừ điểm rồi mới cho phát tiếng hát
    socket.on('sing-pay', () => {
      const p = players.get(socket.id);
      if (!p || p.stage === null || p.singPaid) return;
      if (!wallet.pay(p.cid, SING_COST, 'Vào hát karaoke')) {
        socket.emit('notice', { text: `Không đủ ${SING_COST} điểm để vào hát.` });
        leaveStage(p);
        return;
      }
      p.singPaid = true;
      clearTimeout(singTimers.get(p.id));
      singTimers.delete(p.id);
      nsp.emit('stage-update', { id: p.id, stage: p.stage, paid: true });
    });

    socket.on('stop-sing', () => {
      const p = players.get(socket.id);
      if (p) leaveStage(p);
    });

    socket.on('stand', () => {
      const p = players.get(socket.id);
      if (!p || p.seat === null) return;
      p.seat = null;
      nsp.emit('seat-update', { id: p.id, seat: null });
    });

    // Đánh: người gần nhất ở phía trước trong tầm đánh bị choáng; đang ngồi thì bị văng khỏi ghế
    socket.on('punch', () => {
      const p = players.get(socket.id);
      if (!p) return;
      const now = Date.now();
      if (now - p.lastPunchAt < PUNCH_COOLDOWN_MS || now < p.stunnedUntil) return;
      p.lastPunchAt = now;
      nsp.emit('swing', { id: p.id }); // mọi cú tát đều hiện tay vung ra, trúng hay hụt

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
        nsp.emit('seat-update', { id: target.id, seat: null });
      }
      leaveStage(target); // đang hát mà bị đánh thì bị đẩy khỏi sân khấu (không hoàn điểm)
      nsp.emit('stun', { id: target.id, by: p.id, duration: STUN_MS });
    });

    // Chuyển tiếp tín hiệu WebRTC (voice chat) giữa hai người trong phòng
    socket.on('signal', (msg = {}) => {
      if (!players.has(socket.id) || !players.has(msg.to)) return;
      nsp.to(msg.to).emit('signal', { from: socket.id, data: msg.data });
    });

    // Đổi phụ kiện / màu áo giữa chừng (menu); chuyển cho những người còn lại
    socket.on('look', (data = {}) => {
      const p = players.get(socket.id);
      if (!p) return;
      p.look = limitLook(cleanLook(data.look), wallet.ownedSet(p.cid)); // chỉ đeo được phụ kiện đã mua
      socket.broadcast.emit('look-update', { id: p.id, look: p.look });
    });

    socket.on('trash-pick', (data = {}) => {
      const p = players.get(socket.id);
      if (p && Date.now() >= p.stunnedUntil) trash.pick(p, data.id);
    });

    // Tặng điểm cho người khác (mức trong TIP_AMOUNTS), ví dụ để khen người hát
    socket.on('tip', (data = {}) => {
      const p = players.get(socket.id);
      const to = players.get(data.to);
      if (!p || !to || to.id === p.id || to.cid === p.cid || !TIP_AMOUNTS.includes(data.amt)) return;
      if (!wallet.pay(p.cid, data.amt, `Tặng ${to.name}`)) {
        socket.emit('notice', { text: 'Không đủ điểm để tặng.' });
        return;
      }
      wallet.add(to.cid, data.amt, `${p.name} tặng bạn`);
      nsp.emit('notice', { text: `${p.name} tặng ${to.name} ${data.amt} điểm 💝` });
    });

    // Mua phụ kiện bằng điểm (xem ITEM_PRICES ở client/src/scene/looks.js)
    socket.on('shop-buy', (data = {}) => {
      const p = players.get(socket.id);
      if (!p) return;
      const error = wallet.buy(p.cid, String(data.slot), String(data.item));
      if (error) socket.emit('notice', { text: error });
    });

    // Bảng chỉnh âm: ai trong phòng cũng chỉnh được; server kiểm tra giá trị rồi chuyển cho những người còn lại
    socket.on('mix-set', (data = {}) => {
      if (!players.has(socket.id) || !MIX_PARAMS.some((p) => p.key === data.key)) return;
      mix = { ...mix, [data.key]: cleanMixValue(data.key, data.value) };
      socket.broadcast.emit('mix-state', mix);
    });
    socket.on('mix-reset', () => {
      if (!players.has(socket.id)) return;
      mix = { ...MIX_DEFAULTS };
      nsp.emit('mix-state', mix);
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
      const leaving = players.get(socket.id);
      if (leaving) leaveStage(leaving);
      if (!players.delete(socket.id)) return;
      nsp.emit('player-left', socket.id);
      // Phòng trống thì xoá video cũ, trả bảng chỉnh âm về mặc định; điểm, phụ kiện và dữ liệu mini game xoá sau ROOM_RESET_MS
      if (players.size === 0) {
        video = { videoId: null, playing: false, position: 0, updatedAt: Date.now() };
        trash.clear();
        mix = { ...MIX_DEFAULTS };
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          if (players.size === 0) {
            games.reset();
            wallet.reset();
          }
        }, ROOM_RESET_MS);
      }
    });
  });

  // Giao diện cho trang admin (server/admin.js)
  const admin = {
    info: () => ({
      id: cfg.id,
      name: cfg.name,
      locked: !!cfg.locked,
      ready: !cfg.locked || !!secretOf(cfg),
      max: MAX_PLAYERS,
      video: videoSnapshot(),
      trash: trash.list().length,
      players: [...players.values()].map((p) => ({
        id: p.id, cid: p.cid, ip: p.ip, name: p.name, seat: p.seat, stage: p.stage, muted: p.muted, pts: wallet.pts(p.cid),
      })),
    }),
    // Đá người ra; banMs = thời gian cấm vào lại (Infinity: tới khi khởi động lại, cấm cả địa chỉ)
    kick(id, banMs) {
      const p = players.get(id);
      if (!p) return false;
      bans.set(`cid:${p.cid}`, Date.now() + banMs);
      if (banMs === Infinity) bans.set(`ip:${p.ip}`, Infinity);
      const s = nsp.sockets.get(id);
      s?.emit('banned');
      s?.disconnect(true);
      return true;
    },
    notice: (text) => nsp.emit('notice', { text }),
    mute(id, muted) {
      const p = players.get(id);
      if (p) p.muted = muted;
      return !!p;
    },
    stopVideo: () => setVideo({ videoId: null, playing: false, position: 0 }),
    playerByCid: (cid) => [...players.values()].find((p) => p.cid === cid),
    wallet,
    trash,
    // Xoá điểm, phụ kiện, xếp hạng game và rác của phòng
    resetData() {
      games.reset();
      wallet.reset();
      trash.clear();
      for (const p of players.values()) wallet.notify(p.cid, 0, '');
    },
  };
  return { cfg, count: () => players.size, admin, startedAt: roomStart };
}

const rooms = ROOMS.map((cfg) => createRoom(io.of(`/${cfg.id}`), cfg));

// Trang quản lý /admin và các API của nó; giữ server không ngủ (server/admin.js)
const adminTools = createAdmin(app, { rooms, settings, bans, isBanned, clientIp, io });
app.get('/healthz', (req, res) => res.type('text').send('ok')); // để dịch vụ ping ngoài (UptimeRobot...) giữ server thức
adminTools.keepAlive.start();

// Số người đang ở từng phòng (màn hình đăng nhập hiện "x/30") và phòng khoá đã cài mật khẩu chưa
app.get('/api/rooms', (req, res) => {
  if (!isProd) res.set('Access-Control-Allow-Origin', '*'); // dev: trang ở cổng 5173
  res.json(rooms.map((r) => ({ id: r.cfg.id, players: r.count(), max: MAX_PLAYERS, ready: !r.cfg.locked || !!secretOf(r.cfg) })));
});
for (const cfg of ROOMS) if (cfg.locked && !secretOf(cfg)) console.warn(`Phòng "${cfg.name}" bị khoá nhưng chưa đặt biến môi trường ROOM_PASSWORD_${cfg.id.toUpperCase()}: chưa ai vào được.`);

// Phục vụ client đã build (client/dist) nếu có: một server lo cả trang web và realtime
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

httpServer.listen(PORT, () => console.log(`Server chạy ở cổng ${PORT}`));
