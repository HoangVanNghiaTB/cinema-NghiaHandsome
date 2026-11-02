// Trang quản lý /admin + API của nó, và cơ chế giữ server không ngủ (Render gói free ngủ sau 15 phút không có ai truy cập).
// Mật khẩu admin lấy từ biến môi trường ADMIN_PASSWORD (repo công khai nên không ghi vào code); chưa đặt thì trang admin tắt.
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import { WW_FIELDS, wwDefaults } from '../client/src/games/werewolf/roles.js';

const TOKEN_MS = 12 * 60 * 60 * 1000;
const MAX_FAILS = 6;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const KEEPALIVE_EVERY_MS = 10 * 60 * 1000; // ngủ sau 15 phút, nên ping mỗi 10 phút
const digest = (v) => createHash('sha256').update(String(v ?? '')).digest();
const getPath = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
const setPath = (o, path, v) => {
  const parts = path.split('.');
  const last = parts.pop();
  parts.reduce((a, k) => a[k], o)[last] = v;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : lo));

// Tự gọi /healthz của chính mình qua địa chỉ công khai: yêu cầu đi vào qua bộ cân bằng tải nên được tính là có truy cập.
// Chỉ giữ được khi server đang thức; đã ngủ rồi thì phải có dịch vụ ngoài (UptimeRobot, cron-job.org) gọi /healthz để đánh thức.
function createKeepAlive() {
  const url = (process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
  const k = { url, enabled: !!url, everyMs: KEEPALIVE_EVERY_MS, lastAt: null, lastOk: null, lastError: '', count: 0 };
  let timer = null;
  async function ping() {
    if (!k.url) return;
    k.lastAt = Date.now();
    k.count++;
    try {
      const res = await fetch(`${k.url}/healthz`, { signal: AbortSignal.timeout(15000) });
      k.lastOk = res.ok;
      k.lastError = res.ok ? '' : `HTTP ${res.status}`;
    } catch (err) {
      k.lastOk = false;
      k.lastError = String(err.message ?? err).slice(0, 120);
    }
  }
  function schedule() {
    clearInterval(timer);
    timer = k.enabled && k.url ? setInterval(ping, k.everyMs) : null;
    timer?.unref();
  }
  return {
    state: () => ({ url: k.url, enabled: k.enabled, everyMs: k.everyMs, lastAt: k.lastAt, lastOk: k.lastOk, lastError: k.lastError, count: k.count }),
    start: schedule,
    ping,
    set({ enabled, everyMs }) {
      if (typeof enabled === 'boolean') k.enabled = enabled;
      if (everyMs !== undefined) k.everyMs = clamp(everyMs, 60000, 14 * 60000);
      schedule();
    },
  };
}

export function createAdmin(app, { rooms, settings, bans, clientIp }) {
  const keepAlive = createKeepAlive();
  const tokens = new Map(); // token -> hết hạn
  const failures = new Map(); // ip -> { n, since }
  const log = []; // nhật ký thao tác admin, mới nhất ở đầu
  const note = (text) => {
    log.unshift({ at: Date.now(), text });
    log.length = Math.min(log.length, 60);
  };
  const roomOf = (id) => rooms.find((r) => r.cfg.id === id);
  let cpuMark = { usage: process.cpuUsage(), at: Date.now(), pct: 0 };
  function cpuPct() {
    const now = Date.now();
    if (now - cpuMark.at >= 2000) {
      const u = process.cpuUsage(cpuMark.usage);
      cpuMark = { usage: process.cpuUsage(), at: now, pct: Math.round(((u.user + u.system) / 1000 / (now - cpuMark.at)) * 1000) / 10 };
    }
    return cpuMark.pct;
  }

  const router = express.Router();
  router.use(express.json({ limit: '10kb' }));

  router.post('/login', (req, res) => {
    const secret = process.env.ADMIN_PASSWORD;
    if (!secret) return res.status(503).json({ error: 'Chưa đặt biến môi trường ADMIN_PASSWORD trên server.' });
    const ip = clientIp({ handshake: { headers: req.headers, address: req.socket.remoteAddress } });
    const f = failures.get(ip);
    if (f && f.n >= MAX_FAILS && Date.now() - f.since < FAIL_WINDOW_MS) return res.status(429).json({ error: 'Nhập sai quá nhiều lần, thử lại sau ít phút.' });
    if (!timingSafeEqual(digest(secret), digest(req.body?.password))) {
      const now = Date.now();
      failures.set(ip, !f || now - f.since >= FAIL_WINDOW_MS ? { n: 1, since: now } : { n: f.n + 1, since: f.since });
      return res.status(401).json({ error: 'Sai mật khẩu.' });
    }
    failures.delete(ip);
    const token = randomBytes(24).toString('hex');
    tokens.set(token, Date.now() + TOKEN_MS);
    res.json({ token });
  });

  // Mọi API bên dưới cần token
  router.use((req, res, next) => {
    const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    const until = tokens.get(token);
    if (!until || until < Date.now()) {
      tokens.delete(token);
      return res.status(401).json({ error: 'auth' });
    }
    next();
  });

  router.get('/state', (req, res) => {
    const mem = process.memoryUsage();
    const now = Date.now();
    res.json({
      now,
      server: {
        uptimeS: Math.round(process.uptime()),
        rssMB: Math.round(mem.rss / 1048576),
        heapMB: Math.round(mem.heapUsed / 1048576),
        cpuPct: cpuPct(),
        node: process.version,
      },
      keepAlive: keepAlive.state(),
      settings,
      wwFields: WW_FIELDS,
      rooms: rooms.map((r) => r.admin.info()),
      bans: [...bans].filter(([, until]) => until > now).map(([key, until]) => ({ key, until: until === Infinity ? null : until })),
      log,
    });
  });

  // Mỗi thao tác nhận { room, id/cid, ... } và trả { ok } hoặc { error }
  const act = (handler) => async (req, res) => {
    const b = req.body ?? {};
    try {
      res.json((await handler(b, b.room ? roomOf(b.room) : null)) ?? { ok: true });
    } catch (err) {
      res.status(400).json({ error: String(err.message ?? err) });
    }
  };
  const needRoom = (r) => {
    if (!r) throw new Error('Không có phòng này.');
    return r;
  };
  const nameOf = (r, id) => r.admin.info().players.find((p) => p.id === id)?.name ?? id;
  const cleanText = (v) => String(v ?? '').trim().slice(0, 200);

  router.post('/kick', act((b, r) => {
    needRoom(r);
    const name = nameOf(r, b.id);
    if (!r.admin.kick(b.id, b.ban ? Infinity : 60000)) throw new Error('Người này không còn trong phòng.');
    note(`${b.ban ? 'Cấm' : 'Đá'} ${name} khỏi phòng ${r.cfg.name}`);
  }));
  router.post('/unban', act((b) => {
    if (!bans.delete(String(b.key))) throw new Error('Không có mục này.');
    note(`Bỏ cấm ${b.key}`);
  }));
  router.post('/mute', act((b, r) => {
    needRoom(r);
    if (!r.admin.mute(b.id, !!b.muted)) throw new Error('Người này không còn trong phòng.');
    note(`${b.muted ? 'Khoá' : 'Mở'} chat ${nameOf(r, b.id)} (${r.cfg.name})`);
  }));
  router.post('/notice', act((b) => {
    const text = cleanText(b.text);
    if (!text) throw new Error('Chưa nhập nội dung.');
    const targets = b.room ? [needRoom(roomOf(b.room))] : rooms;
    for (const r of targets) r.admin.notice(`📢 ${text}`);
    note(`Thông báo (${b.room ? targets[0].cfg.name : 'cả rạp'}): ${text}`);
  }));
  router.post('/points', act((b, r) => {
    needRoom(r);
    const amt = Math.floor(Number(b.amount));
    if (!Number.isFinite(amt) || Math.abs(amt) > 100000) throw new Error('Số điểm không hợp lệ.');
    const w = r.admin.wallet;
    const who = r.admin.playerByCid(b.cid)?.name ?? b.cid;
    if (b.mode === 'set') w.setPts(b.cid, amt, 'Quản trị viên đặt lại điểm');
    else if (amt >= 0) w.add(b.cid, amt, 'Quản trị viên tặng điểm');
    else w.setPts(b.cid, w.pts(b.cid) + amt, 'Quản trị viên trừ điểm');
    note(`${b.mode === 'set' ? `Đặt ${amt}` : amt >= 0 ? `Cộng ${amt}` : `Trừ ${-amt}`} điểm cho ${who} (${r.cfg.name})`);
  }));
  router.post('/video-stop', act((b, r) => {
    needRoom(r).admin.stopVideo();
    note(`Tắt video phòng ${r.cfg.name}`);
  }));
  router.post('/reset-room', act((b, r) => {
    needRoom(r).admin.resetData();
    note(`Xoá điểm / game / rác phòng ${r.cfg.name}`);
  }));
  router.post('/trash', act((b, r) => {
    needRoom(r);
    if (b.op === 'spawn') r.admin.trash.spawn();
    else if (b.op === 'clear') r.admin.trash.clear();
    else throw new Error('Thao tác không hợp lệ.');
    note(`${b.op === 'spawn' ? 'Thả rác' : 'Dọn rác'} phòng ${r.cfg.name}`);
  }));
  router.post('/settings', act((b) => {
    if (b.werewolfReset) {
      // về mặc định nhưng giữ nguyên các object (game đang giữ tham chiếu tới chúng)
      const d = wwDefaults();
      for (const f of WW_FIELDS) setPath(settings.werewolf, f.path, getPath(d, f.path));
      note('Ma Sói: về thông số mặc định');
    }
    if (b.werewolf && typeof b.werewolf === 'object') {
      const changed = [];
      for (const f of WW_FIELDS) {
        const v = getPath(b.werewolf, f.path);
        if (v === undefined) continue;
        setPath(settings.werewolf, f.path, Math.round(clamp(v, f.min, f.max)));
        changed.push(f.path);
      }
      const w = settings.werewolf;
      if (w.max < w.min) w.max = w.min; // ghế không ít hơn số người tối thiểu
      if (w.minHumans > w.min) w.minHumans = w.min;
      if (changed.length) note(`Ma Sói: chỉnh ${changed.length} thông số`);
    }
    if (b.startPoints !== undefined) {
      settings.startPoints = Math.floor(clamp(b.startPoints, 0, 100000));
      note(`Điểm khi mới vào: ${settings.startPoints}`);
    }
    if (b.trashEnabled === undefined && b.trashEverySec === undefined && b.trashMax === undefined) return;
    const t = settings.trash;
    if (typeof b.trashEnabled === 'boolean') t.enabled = b.trashEnabled;
    if (b.trashEverySec !== undefined) t.everyMs = clamp(b.trashEverySec, 10, 600) * 1000;
    if (b.trashMax !== undefined) t.max = Math.floor(clamp(b.trashMax, 1, 20));
    note(`Chỉnh rác: ${t.enabled ? 'bật' : 'tắt'}, ${t.everyMs / 1000}s/món, tối đa ${t.max}`);
  }));
  router.post('/keepalive', act(async (b) => {
    if (b.ping) {
      await keepAlive.ping();
      return { ok: true };
    }
    keepAlive.set({ enabled: b.enabled, everyMs: b.everySec === undefined ? undefined : b.everySec * 1000 });
    const k = keepAlive.state();
    note(`Giữ thức: ${k.enabled ? 'bật' : 'tắt'}, ${k.everyMs / 60000} phút/lần`);
  }));

  app.use('/api/admin', router);
  const adminPage = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'admin.html');
  app.get('/admin', (req, res) => res.sendFile(adminPage));

  return { keepAlive };
}
