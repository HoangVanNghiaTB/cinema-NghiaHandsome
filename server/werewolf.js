// Ma Sói: server làm quản trò. Luật ở đây; vai và hằng số ở client/src/games/werewolf/roles.js, lịch ban đêm (thứ tự gọi vai,
// thời gian chờ, tên file giọng) ở client/src/games/werewolf/narration.js. Xem DE_XUAT_MA_SOI.md.
//
// Trạng thái gửi cho mỗi người KHÁC NHAU (stateFor): ai cũng chỉ thấy vai của mình; người chết không lộ vai tới hết ván.
// Interface giống các game khác ở games.js, thêm: stateFor(id), canOpen(p), chatBlocked(id), away/back/leave, và `emit` để
// phát giọng quản trò (sự kiện 'game-cue') tới những người đang mở game.
import { ROLES, FACTION_NAMES, dealRoles } from '../client/src/games/werewolf/roles.js';
import { nightSteps, CLIP_MS, START_PAUSE_MS, GAP_MS, END_PAUSE_MS } from '../client/src/games/werewolf/narration.js';

// Chỉ để thử: WW_SPEED=20 cho mọi đồng hồ chạy nhanh gấp 20 lần
const SPEED = Number(process.env.WW_SPEED) || 1;
const T = (ms) => Math.max(1, Math.round(ms / SPEED));

const PACK = (role) => !!ROLES[role].pack;
const FACTION_LABEL = (f) => FACTION_NAMES[f];
const cleanText = (v) => String(v ?? '').trim().slice(0, 120);

// cfg: thông số ván chỉnh được ở trang admin (wwDefaults() ở roles.js); server giữ một bản sống dùng chung, đọc mỗi lần cần.
export function makeWerewolf({ players, wallet, notify, onChange, emit, cfg }) {
  let phase = 'lobby'; // lobby | countdown | night | day | vote | hunter | ended
  let deadline = 0;
  let timers = [];
  let seats = Array(cfg.max).fill(null); // bàn chờ: { id, name } hoặc null (số ghế đổi từ lần bàn chờ trống kế tiếp)
  let matchFee = cfg.fee; // phí và lãi của ván đang chơi, chốt lúc bắt đầu (admin đổi giữa ván cũng không ảnh hưởng)
  let matchProfit = { ...cfg.profit };
  let ps = []; // người chơi trong ván: { idx, id, cid, name, role, alive, left, lover, used, lastGuard, notes }
  let night = null;
  let steps = []; // các bước (vai được gọi) của đêm hiện tại
  const doneMap = new Map(); // khoá lựa chọn -> giá trị: mỗi khung việc chỉ chọn được MỘT lần, không đổi (kể cả bỏ qua)
  let voteTimer = null;
  let hunterTimer = null;
  let dealt = new Set(); // các vai đã chia lúc đầu ván (quản trò chỉ gọi những vai này)
  let nightNo = 0;
  let dayNo = 0;
  let votes = new Map(); // idx -> idx | null (bỏ phiếu treo cổ)
  let announce = [];
  let log = [];
  let cubExtra = false; // Sói Con vừa chết: đêm sau bầy Sói cắn thêm một người
  let hunterQueue = [];
  let hunterPick = null;
  let hunterIdx = null;
  let result = null;
  let afterHunter = null;
  const away = new Map(); // id -> hẹn giờ tính bỏ cuộc
  const lastChatAt = new Map();

  const after = (ms, fn) => {
    const t = setTimeout(fn, ms);
    timers.push(t);
    return t;
  };
  const clearTimers = () => {
    for (const t of timers) clearTimeout(t);
    timers = [];
  };
  const running = () => ['night', 'day', 'vote', 'hunter'].includes(phase);
  const seatOf = (id) => seats.findIndex((s) => s?.id === id);
  const seated = () => seats.filter(Boolean);
  const recOf = (id) => ps.find((r) => r.id === id);
  const alive = () => ps.filter((r) => r.alive);
  const humans = () => ps.filter((r) => !r.left);
  const ptsOf = (id) => {
    const p = players.get(id);
    return p ? wallet.pts(p.cid) : 0;
  };
  const give = (r, amt, reason) => {
    const p = players.get(r.id);
    if (p && amt > 0) wallet.add(p.cid, amt, reason);
  };

  // ----- bàn chờ -----
  function toLobby() {
    clearTimers();
    phase = 'lobby';
    deadline = 0;
    seats = Array(cfg.max).fill(null);
    ps = [];
    night = null;
    result = null;
    log = [];
    announce = [];
    onChange();
  }

  function startCountdown() {
    phase = 'countdown';
    deadline = Date.now() + T(cfg.countdownSec * 1000);
    after(T(cfg.countdownSec * 1000), beginMatch);
  }

  function cancelCountdown() {
    clearTimers();
    phase = 'lobby';
    deadline = 0;
  }

  // Hết đếm ngược: kiểm tra điểm lần cuối, trừ phí cả bàn một lượt rồi chia bài
  function beginMatch() {
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i];
      if (s && ptsOf(s.id) < cfg.fee) {
        notify(s.id, `Bạn không đủ ${cfg.fee} điểm, đã bị mời ra khỏi bàn.`);
        seats[i] = null;
      }
    }
    const list = seated();
    if (list.length < cfg.min) {
      cancelCountdown();
      for (const s of list) notify(s.id, `Không đủ ${cfg.min} người, ván bị huỷ và không ai mất điểm.`);
      onChange();
      return;
    }
    const roles = dealRoles(list.length);
    ps = list.map((s, idx) => {
      const p = players.get(s.id);
      wallet.pay(p.cid, cfg.fee, 'Phí chơi Ma Sói');
      return { idx, id: s.id, cid: p.cid, name: s.name, fruit: s.fruit, color: s.color, role: roles[idx], alive: true, left: false, lover: null, used: {}, lastGuard: null, notes: [] };
    });
    matchFee = cfg.fee;
    matchProfit = { ...cfg.profit };
    dealt = new Set(roles);
    doneMap.clear();
    nightNo = 0;
    dayNo = 0;
    cubExtra = false;
    log = [];
    result = null;
    for (const r of ps) {
      if (PACK(r.role) || r.role === 'phan_boi') {
        r.notes.push(`Phe Sói: ${ps.filter((o) => PACK(o.role) && o.id !== r.id).map((o) => o.name).join(', ') || '(không có ai khác)'}.`);
      }
    }
    startNight();
  }

  // ----- ban đêm -----
  function startNight() {
    nightNo++;
    phase = 'night';
    votes = new Map();
    announce = [];
    night = { n: nightNo, bite: [], votes: new Map(), window: null, protectedIdx: null, converted: null, victims: [] };
    steps = nightSteps(nightNo, dealt);
    emit({ clip: 'night_start' });
    after(T((CLIP_MS.night_start ?? 0) + START_PAUSE_MS), () => runStep(0));
    onChange();
  }

  // Chạy lần lượt từng vai: lời gọi -> khoảng thao tác (xong sớm nếu mọi người của vai đã chọn) -> lời nhắm mắt -> vai kế tiếp
  function runStep(i) {
    const step = steps[i];
    if (!step) {
      after(T(END_PAUSE_MS), () => {
        emit({ clip: 'dawn' });
        dawn();
      });
      return;
    }
    const clipMs = (c) => CLIP_MS[c] ?? 0;
    const finish = () => {
      emit({ clip: step.sleep });
      after(T(clipMs(step.sleep) + GAP_MS), () => runStep(i + 1));
    };
    emit({ clip: step.wake });
    const win = (key, fallbackMs) => (cfg.windows[key] ?? fallbackMs / 1000) * 1000;
    after(T(clipMs(step.wake)), () => openWindow(step.role, 'main', win(step.role, step.windowMs), () => {
      if (!step.then) return finish();
      emit({ clip: step.then.clip });
      after(T(clipMs(step.then.clip)), () => openWindow(step.role, 'poison', win('witchPoison', step.then.windowMs), finish));
    }));
  }

  const holder = (role) => ps.filter((r) => r.alive && !r.left && r.role === role);

  // Mở khoảng thao tác của một vai. Có người thao tác được thì chờ tối đa windowMs; không ai (người giữ vai đã chết...) thì chờ đúng idleSec giây.
  function openWindow(role, part, windowMs, done) {
    night.window = { role, part, to: 0 };
    night.windowDone = done;
    if (role === 'alpha' || role === 'witch') previewVictims();
    const ms = inputActors().length ? windowMs : cfg.idleSec * 1000;
    night.window.to = Date.now() + T(ms);
    night.windowTimer = after(T(ms), endWindow);
    onChange();
  }
  function endWindow() {
    const w = night?.window;
    if (!w) return;
    clearTimeout(night.windowTimer);
    closeWindow(w);
    const next = night.windowDone;
    night.windowDone = null;
    next?.();
  }

  // Ai sắp chết vì Sói cắn, sau khi trừ người được Bảo Vệ che và người bị Sói Đầu Đàn biến thành Sói
  function previewVictims() {
    night.victims = night.bite.filter((t, i) => t !== night.protectedIdx && !(i === 0 && t === night.converted));
  }

  function closeWindow(w) {
    if (w.role === 'cupid') {
      const c = night.cupid;
      const live = holder('tinh_yeu')[0];
      if (live && c && c[0] !== c[1] && ps[c[0]]?.alive && ps[c[1]]?.alive) {
        ps[c[0]].lover = c[1];
        ps[c[1]].lover = c[0];
        ps[c[0]].notes.push(`Bạn và ${ps[c[1]].name} là một đôi: một người chết thì người kia chết theo.`);
        ps[c[1]].notes.push(`Bạn và ${ps[c[0]].name} là một đôi: một người chết thì người kia chết theo.`);
        live.notes.push(`Bạn đã ghép đôi ${ps[c[0]].name} và ${ps[c[1]].name}.`);
      }
    } else if (w.role === 'wolf') {
      finalizeBite();
    } else if (w.role === 'alpha') {
      const a = holder('soi_dau_dan')[0];
      if (a && night.convert && !a.used.convert && night.bite[0] != null) {
        a.used.convert = true;
        night.converted = night.bite[0];
      }
      previewVictims();
    } else if (w.role === 'seer') {
      const s = holder('tien_tri')[0];
      const t = ps[night.seer];
      if (s && t && t.alive && t.id !== s.id) s.notes.push(`Đêm ${night.n}: ${t.name} ${ROLES[t.role].wolf ? 'LÀ SÓI' : 'không phải Sói'}.`);
    } else if (w.role === 'guard') {
      const g = holder('bao_ve')[0];
      if (g && night.guard != null && ps[night.guard]?.alive) {
        night.protectedIdx = night.guard;
        g.lastGuard = night.guard;
      } else if (g) {
        g.lastGuard = null;
      }
      previewVictims();
    } else if (w.role === 'psychic') {
      const p = holder('ngoai_cam')[0];
      const c = night.psy;
      if (p && c && c[0] !== c[1] && ps[c[0]]?.alive && ps[c[1]]?.alive) {
        const same = ROLES[ps[c[0]].role].faction === ROLES[ps[c[1]].role].faction;
        p.notes.push(`Đêm ${night.n}: ${ps[c[0]].name} và ${ps[c[1]].name} ${same ? 'cùng phe' : 'khác phe'}.`);
      }
    }
    night.window = null;
    onChange();
  }

  // Bầy Sói bỏ phiếu: lấy người nhiều phiếu nhất (bằng nhau thì ngẫu nhiên); Sói Con vừa chết thì cắn hai người
  function finalizeBite() {
    const tally = new Map();
    for (const [voter, t] of night.votes) {
      if (t != null && ps[voter]?.alive && !ps[voter].left && ps[t]?.alive && !PACK(ps[t].role)) tally.set(t, (tally.get(t) ?? 0) + 1);
    }
    const ranked = [...tally].sort((a, b) => b[1] - a[1] || Math.random() - 0.5).map(([t]) => t);
    night.bite = ranked.slice(0, cubExtra ? 2 : 1);
    cubExtra = false;
    previewVictims();
  }

  // Sáng: tính ai chết, rồi Thợ Săn bắn, rồi kiểm tra thắng thua
  function dawn() {
    night.window = null;
    previewVictims();
    const dying = new Set();
    const witch = holder('phu_thuy')[0];
    night.victims.forEach((t, i) => {
      if (i === 0 && night.save && witch && !witch.used.save) {
        witch.used.save = true;
        return;
      }
      dying.add(t);
    });
    if (night.converted != null) {
      const c = ps[night.converted];
      if (c.alive) {
        c.role = 'ma_soi';
        c.converted = true;
        c.notes.push('Bạn đã bị Sói Đầu Đàn biến thành Ma Sói! Từ giờ bạn thuộc phe Sói.');
        for (const o of ps) if (o.id !== c.id && PACK(o.role) && o.alive) o.notes.push(`${c.name} gia nhập bầy Sói.`);
      }
    }
    const ww = holder('soi_trang')[0];
    if (night.wwKill != null && ww && ps[night.wwKill]?.alive && PACK(ps[night.wwKill].role) && ps[night.wwKill].id !== ww.id) dying.add(night.wwKill);
    if (night.poison != null && witch && !witch.used.poison && ps[night.poison]?.alive) {
      witch.used.poison = true;
      dying.add(night.poison);
    }
    const killed = [];
    for (const i of dying) killDeep(i, killed);
    const names = killed.map((i) => ps[i].name);
    announce = [names.length ? `Đêm qua có ${names.length} người chết: ${names.join(', ')}.` : 'Đêm qua yên bình, không ai chết.'];
    runHunters(() => afterDeaths(startDay));
  }

  // Giết một người và những người chết theo (cặp đôi); ghi lại ai chết, hàng đợi Thợ Săn, cờ Sói Con
  function killDeep(i, out) {
    const r = ps[i];
    if (!r || !r.alive) return;
    r.alive = false;
    out.push(i);
    if (r.role === 'soi_con') cubExtra = true;
    if (r.role === 'tho_san') hunterQueue.push(i);
    if (r.lover != null) killDeep(r.lover, out);
  }

  // Thợ Săn chết thì được chọn một người chết theo (15 giây); xong gọi `next`
  function runHunters(next) {
    afterHunter = next;
    nextHunter();
  }
  function nextHunter() {
    while (hunterQueue.length) {
      const i = hunterQueue.shift();
      const r = ps[i];
      if (r.left) continue; // người đã bỏ cuộc thì Thợ Săn không bắn
      hunterIdx = i;
      hunterPick = null;
      phase = 'hunter';
      deadline = Date.now() + T(cfg.hunterSec * 1000);
      hunterTimer = after(T(cfg.hunterSec * 1000), finishHunter);
      onChange();
      return;
    }
    hunterIdx = null;
    const next = afterHunter;
    afterHunter = null;
    next?.();
  }
  function finishHunter() {
    const i = hunterIdx;
    const t = hunterPick;
    if (i == null) return;
    hunterIdx = null;
    if (t != null && ps[t]?.alive) {
      const out = [];
      killDeep(t, out);
      announce.push(`${ps[i].name} đã bắn chết ${out.map((k) => ps[k].name).join(', ')}.`);
    } else {
      announce.push(`${ps[i].name} không bắn ai.`);
    }
    nextHunter();
  }

  // Kiểm tra thắng thua sau mỗi lần có người chết. Hết ván thì không gọi `next`.
  function afterDeaths(next) {
    const w = winner();
    if (w) endMatch(w);
    else next();
  }
  function winner() {
    const live = alive();
    const soiTeam = live.filter((r) => ROLES[r.role].faction === 'soi').length;
    const white = live.filter((r) => r.role === 'soi_trang').length;
    if (live.length === 1 && white === 1) return 'soi_trang';
    if (live.length === 0) return 'dan';
    if (soiTeam === 0 && white === 0) return 'dan';
    if (soiTeam > 0 && soiTeam >= live.length - soiTeam) return 'soi';
    return null;
  }

  // ----- ban ngày -----
  function startDay() {
    dayNo++;
    phase = 'day';
    votes = new Map();
    deadline = Date.now() + T(cfg.daySec * 1000);
    after(T(cfg.daySec * 1000), startVote);
    onChange();
  }
  function startVote() {
    phase = 'vote';
    deadline = Date.now() + T(cfg.voteSec * 1000);
    emit({ clip: 'vote_start' });
    voteTimer = after(T(cfg.voteSec * 1000), endVote);
    onChange();
  }
  function endVote() {
    if (phase !== 'vote') return;
    clearTimeout(voteTimer);
    const tally = new Map();
    for (const r of alive()) {
      const t = votes.get(r.idx);
      if (t != null && ps[t]?.alive) tally.set(t, (tally.get(t) ?? 0) + (r.role === 'thi_truong' ? 2 : 1));
    }
    const top = Math.max(0, ...tally.values());
    const tops = [...tally].filter(([, c]) => c === top).map(([t]) => t);
    announce = [];
    if (top === 0 || tops.length !== 1) {
      announce.push('Số phiếu bằng nhau hoặc không ai được bầu, hôm nay không ai bị treo cổ.');
      return startNight();
    }
    const t = ps[tops[0]];
    if (t.role === 'hoang_tu' && !t.used.prince) {
      t.used.prince = true;
      t.revealed = true;
      announce.push(`${t.name} bị treo cổ nhưng là Hoàng Tử nên không chết!`);
      return startNight();
    }
    if (t.role === 'chan_doi') {
      t.alive = false;
      announce.push(`${t.name} bị treo cổ.`);
      return endMatch('chan_doi');
    }
    const out = [];
    killDeep(t.idx, out);
    announce.push(`Dân làng treo cổ ${out.map((k) => ps[k].name).join(', ')}.`);
    runHunters(() => afterDeaths(startNight));
  }

  // ----- kết thúc -----
  function endMatch(win) {
    clearTimers();
    phase = 'ended';
    deadline = Date.now() + T(cfg.endSec * 1000);
    const label = `${FACTION_LABEL(win)} thắng!`;
    const payouts = ps.map((r) => {
      const wins = ROLES[r.role].faction === win && !r.left;
      const amt = wins ? matchFee + matchProfit[win] : 0;
      if (amt) give(r, amt, `Thắng Ma Sói (${FACTION_LABEL(win)})`);
      return { name: r.name, delta: amt - matchFee, left: r.left };
    });
    result = { winner: win, label, payouts };
    emit({ clip: win === 'dan' ? 'win_dan' : 'win_other' });
    after(T(cfg.endSec * 1000), toLobby);
    onChange();
  }

  // Còn quá ít người thật thì huỷ ván, hoàn phí cho những người còn lại
  function checkVoid() {
    if (!running() || humans().length >= cfg.minHumans) return;
    clearTimers();
    for (const r of humans()) {
      give(r, matchFee, 'Ván Ma Sói bị huỷ, hoàn phí');
      notify(r.id, 'Còn quá ít người, ván Ma Sói bị huỷ và bạn được hoàn phí.');
    }
    phase = 'ended';
    deadline = Date.now() + T(cfg.endSec * 1000);
    result = { winner: null, label: 'Ván bị huỷ, hoàn phí cho người còn lại.', payouts: [] };
    after(T(cfg.endSec * 1000), toLobby);
  }

  // ----- thao tác của người chơi -----
  const aliveIdx = (i) => Number.isInteger(i) && ps[i]?.alive;

  // Khung việc đang mở cho người này: { kind: 'pick1' | 'pick2' | 'yesno' | 'info', text, targets? } hoặc null
  function rawPrompt(r) {
    if (r.left) return null;
    const others = alive().filter((o) => o.idx !== r.idx).map((o) => o.idx);
    if (phase === 'hunter') {
      return r.idx === hunterIdx ? { kind: 'pick1', key: 'hunter', text: 'Bạn là Thợ Săn đã chết. Chọn một người chết theo.', targets: others, allowSkip: true, deadline } : null;
    }
    if (!r.alive) return null;
    if (phase === 'day') return { kind: 'info', text: 'Thảo luận bằng mic (bật hoặc tắt tuỳ ý) hoặc khung chat. Hết 120 giây mới được bỏ phiếu.' };
    if (phase === 'vote') return { kind: 'pick1', key: 'vote', text: 'Chọn người để treo cổ (hoặc bỏ qua).', targets: others, allowSkip: true, deadline };
    if (phase !== 'night' || !night.window) return null;
    const { role, part, to } = night.window;
    switch (role) {
      case 'cupid':
        return r.role === 'tinh_yeu' ? { kind: 'pick2', key: 'cupid', text: 'Chọn hai người thành một đôi.', targets: alive().map((o) => o.idx), deadline: to } : null;
      case 'traitor':
        return r.role === 'phan_boi' ? { kind: 'info', text: `Bầy Sói: ${ps.filter((o) => PACK(o.role)).map((o) => o.name).join(', ')}.`, deadline: to } : null;
      case 'wolf': {
        if (!PACK(r.role)) return null;
        const targets = alive().filter((o) => !PACK(o.role)).map((o) => o.idx);
        const seen = [...night.votes].filter(([v]) => ps[v]?.alive).map(([v, t]) => `${ps[v].name} → ${t == null ? '—' : ps[t].name}`);
        return { kind: 'pick1', key: 'wolf', text: cubExtra ? 'Chọn người để cắn (Sói Con đã chết: cắn thêm một người, hai người nhiều phiếu nhất).' : 'Chọn người để cắn.', targets, allowSkip: true, info: seen, deadline: to };
      }
      case 'alpha':
        return r.role === 'soi_dau_dan' && !r.used.convert && night.bite[0] != null
          ? { kind: 'yesno', key: 'alpha', text: `Biến ${ps[night.bite[0]].name} thành Sói thay vì giết? (chỉ một lần)`, deadline: to }
          : null;
      case 'whitewolf':
        return r.role === 'soi_trang'
          ? { kind: 'pick1', key: 'whitewolf', text: 'Chọn một Sói khác để giết (hoặc bỏ qua).', targets: alive().filter((o) => PACK(o.role) && o.idx !== r.idx).map((o) => o.idx), allowSkip: true, deadline: to }
          : null;
      case 'seer':
        return r.role === 'tien_tri' ? { kind: 'pick1', key: 'seer', text: 'Chọn người để soi.', targets: others, deadline: to } : null;
      case 'guard':
        return r.role === 'bao_ve' ? { kind: 'pick1', key: 'guard', text: 'Chọn người để bảo vệ (không chọn lại người đêm trước).', targets: alive().map((o) => o.idx).filter((i) => i !== r.lastGuard), allowSkip: true, deadline: to } : null;
      case 'witch':
        if (r.role !== 'phu_thuy') return null;
        if (part === 'main') {
          if (r.used.save) return { kind: 'info', text: 'Bạn đã dùng bình cứu.', deadline: to };
          return night.victims[0] != null
            ? { kind: 'yesno', key: 'witchSave', text: `Đêm nay ${ps[night.victims[0]].name} sẽ chết. Dùng bình cứu? (chỉ một lần)`, deadline: to }
            : { kind: 'info', text: 'Đêm nay không ai sắp chết.', deadline: to };
        }
        return r.used.poison
          ? { kind: 'info', text: 'Bạn đã dùng bình độc.', deadline: to }
          : { kind: 'pick1', key: 'poison', text: 'Dùng bình độc với ai? (chỉ một lần, hoặc bỏ qua)', targets: others, allowSkip: true, deadline: to };
      case 'psychic':
        return r.role === 'ngoai_cam' ? { kind: 'pick2', key: 'psychic', text: 'Chọn hai người để biết họ có cùng phe không.', targets: others, deadline: to } : null;
      default:
        return null;
    }
  }

  // Khung việc của người này kèm trạng thái đã chọn chưa (done) và đã chọn gì (chosen)
  function promptFor(r) {
    const p = rawPrompt(r);
    if (p?.key) {
      const k = actKey(r, p);
      if (doneMap.has(k)) {
        p.done = true;
        p.chosen = doneMap.get(k);
      }
    }
    return p;
  }
  const actKey = (r, p) => `${r.idx}|${p.key}|${phase}|${nightNo}|${dayNo}|${night?.window?.part ?? ''}`;
  const isDone = (r) => {
    const p = rawPrompt(r);
    return !p?.key || doneMap.has(actKey(r, p));
  };
  // Những người đang có việc phải chọn (không tính khung chỉ để xem)
  const inputActors = () => ps.filter((r) => r.alive && !r.left && ((p) => p && p.kind !== 'info')(rawPrompt(r)));

  // Sau mỗi lựa chọn: mọi người của khung việc đã chọn xong thì kết thúc sớm, không chờ hết giờ
  function afterAct() {
    if (phase === 'night' && night?.window) {
      const actors = inputActors();
      if (actors.length && actors.every(isDone)) endWindow();
    } else if (phase === 'vote') {
      if (ps.filter((r) => r.alive && !r.left).every(isDone)) endVote();
    } else if (phase === 'hunter') {
      clearTimeout(hunterTimer);
      finishHunter();
    }
  }

  function doAct(r, d) {
    const p = promptFor(r);
    if (!p || p.kind === 'info' || p.done) return false; // chỉ chọn được một lần
    const v = d.value;
    if (p.kind === 'pick1') {
      if (v == null) {
        if (!p.allowSkip) return false;
      } else if (!Number.isInteger(v) || !p.targets.includes(v)) return false;
    } else if (p.kind === 'pick2') {
      if (!Array.isArray(v) || v.length !== 2 || v[0] === v[1] || !v.every((i) => p.targets.includes(i))) return false;
    } else if (p.kind === 'yesno') {
      if (typeof v !== 'boolean') return false;
    }
    switch (p.key) {
      case 'hunter': hunterPick = v; break;
      case 'vote': votes.set(r.idx, v); break;
      case 'cupid': night.cupid = v; break;
      case 'wolf': night.votes.set(r.idx, v); break;
      case 'alpha': night.convert = v; break;
      case 'whitewolf': night.wwKill = v; break;
      case 'seer': night.seer = v; break;
      case 'guard': night.guard = v; break;
      case 'witchSave': night.save = v; break;
      case 'poison': night.poison = v; break;
      case 'psychic': night.psy = v; break;
      default: return false;
    }
    doneMap.set(actKey(r, p), v ?? null);
    afterAct();
    return true;
  }

  function doChat(r, text) {
    const t = cleanText(text);
    const now = Date.now();
    if (!t || now - (lastChatAt.get(r.id) ?? 0) < 700 || !r.alive || r.left) return false;
    lastChatAt.set(r.id, now);
    let ch;
    if (phase === 'night') {
      if (!PACK(r.role)) return false;
      ch = 'wolf';
    } else if (phase === 'day' || phase === 'vote') ch = 'all';
    else return false;
    log.push({ ch, name: r.name, text: t });
    if (log.length > 80) log.shift();
    return true;
  }

  // Rời ván: bàn chờ thì bỏ ghế (không mất gì); giữa ván thì bị tính bỏ cuộc (đã mất phí, không nhận lãi)
  function leave(id) {
    clearTimeout(away.get(id));
    away.delete(id);
    const si = seatOf(id);
    if (si >= 0 && (phase === 'lobby' || phase === 'countdown')) {
      seats[si] = null;
      if (phase === 'countdown' && seated().length < cfg.min) cancelCountdown();
      return true;
    }
    const r = recOf(id);
    if (r && running() && !r.left) {
      r.left = true;
      checkVoid();
      return true;
    }
    return false;
  }

  return {
    state: () => ({ phase }), // game này luôn dùng stateFor
    brief() {
      if (phase === 'lobby') return seated().length ? `Bàn chờ ${seated().length}/${seats.length} · cần ${cfg.min} người` : 'Ma Sói · bàn trống';
      if (phase === 'countdown') return 'Ván sắp bắt đầu!';
      if (phase === 'ended') return result?.label ?? 'Ván vừa kết thúc';
      return `Đang chơi · ${alive().length} người còn sống`;
    },
    canOpen: (p) => !!recOf(p.id) || seatOf(p.id) >= 0 || ptsOf(p.id) >= cfg.fee,
    chatBlocked: (id) => running() && !!recOf(id) && !recOf(id).left,
    // Người đang trong ván mà mic phải tắt: đêm (mọi người), người chết (tới hết ván)
    stateFor(id) {
      const me = recOf(id);
      const mySeat = seatOf(id);
      const base = {
        phase,
        now: Date.now(),
        deadline,
        fee: running() || phase === 'ended' ? matchFee : cfg.fee,
        profit: running() || phase === 'ended' ? matchProfit : cfg.profit,
        min: cfg.min,
        max: seats.length,
        seats: seats.map((s) => (s ? { name: s.name, fruit: s.fruit, color: s.color } : null)),
        mySeat,
        nightNo,
        dayNo,
        announce,
        result,
      };
      if (!running() && phase !== 'ended') return { ...base, players: [], me: null, log: [], micOff: false };
      const isPack = me && PACK(me.role);
      // Số phiếu hiện trên đầu mỗi người: bỏ phiếu treo cổ (công khai, Thị Trưởng tính 2) và phiếu cắn của bầy Sói (chỉ Sói thấy)
      const tally = new Map();
      if (phase === 'vote') {
        for (const r of alive()) {
          const t = votes.get(r.idx);
          if (t != null) tally.set(t, (tally.get(t) ?? 0) + (r.role === 'thi_truong' ? 2 : 1));
        }
      }
      const wolfTally = new Map();
      if (isPack && phase === 'night' && night?.window?.role === 'wolf') {
        for (const [v, t] of night.votes) if (t != null && ps[v]?.alive) wolfTally.set(t, (wolfTally.get(t) ?? 0) + 1);
      }
      const players = ps.map((r) => ({
        idx: r.idx,
        votes: tally.get(r.idx) || undefined,
        wolfVotes: wolfTally.get(r.idx) || undefined,
        name: r.name,
        fruit: r.fruit,
        color: r.color,
        alive: r.alive,
        left: r.left,
        mayor: r.role === 'thi_truong',
        role: phase === 'ended' || r.revealed ? r.role : r.role === 'thi_truong' ? 'thi_truong' : null, // chết cũng không lộ vai; hết ván mới lật
        votedFor: phase === 'vote' && votes.has(r.idx) ? (votes.get(r.idx) == null ? -1 : votes.get(r.idx)) : undefined,
        isMe: r.id === id,
      }));
      let meOut = null;
      if (me) {
        meOut = {
          idx: me.idx,
          role: me.role,
          alive: me.alive,
          left: me.left,
          prompt: promptFor(me),
          notes: me.notes,
        };
      }
      const myLog = log.filter((m) => m.ch === 'all' || (m.ch === 'wolf' && isPack));
      const micOff = !!me && !me.left && (phase === 'night' || !me.alive) && phase !== 'ended';
      return { ...base, players, me: meOut, log: myLog, micOff };
    },
    act(p, d) {
      if (d.op === 'sit') {
        if ((phase !== 'lobby' && phase !== 'countdown') || seatOf(p.id) >= 0) return false;
        if (phase === 'lobby' && !seated().length && seats.length !== cfg.max) seats = Array(cfg.max).fill(null); // admin vừa đổi số ghế, bàn đang trống thì áp dụng luôn
        // chọn ghế cụ thể nếu còn trống, không thì ghế trống đầu tiên
        const free = Number.isInteger(d.seat) && seats[d.seat] === null ? d.seat : seats.indexOf(null);
        if (free < 0 || free >= seats.length) return false;
        if (ptsOf(p.id) < cfg.fee) {
          notify(p.id, `Cần ít nhất ${cfg.fee} điểm để chơi Ma Sói.`);
          return false;
        }
        seats[free] = { id: p.id, name: p.name, fruit: players.get(p.id)?.look?.fruit ?? 'none', color: players.get(p.id)?.color };
        return true;
      }
      if (d.op === 'stand') return leave(p.id);
      if (d.op === 'start') {
        if (phase !== 'lobby' || seatOf(p.id) < 0 || seated().length < cfg.min) return false;
        startCountdown();
        return true;
      }
      const r = recOf(p.id);
      if (!r || r.left) return false;
      if (d.op === 'act') return doAct(r, d);
      if (d.op === 'chat') return doChat(r, d.text);
      return false;
    },
    leave,
    away(id) {
      if (!running() || !recOf(id) || recOf(id).left) return false;
      clearTimeout(away.get(id));
      away.set(id, setTimeout(() => {
        away.delete(id);
        if (leave(id)) onChange();
      }, T(cfg.awaySec * 1000)));
      return true;
    },
    back(id) {
      if (!away.has(id)) return false;
      clearTimeout(away.get(id));
      away.delete(id);
      return true;
    },
    dispose() {
      clearTimers();
      for (const t of away.values()) clearTimeout(t);
    },
  };
}
