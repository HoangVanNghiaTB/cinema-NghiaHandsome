// Mini game treo tường rạp. Mỗi game là một đối tượng { state(), brief(), act(player, data), leave(id) }:
//   state()  trạng thái đầy đủ, gửi cho những ai đang mở game đó
//   brief()  một dòng ngắn hiện trên tranh ngoài tường (ai cũng thấy)
//   act()    xử lý thao tác của người chơi, trả về true nếu trạng thái đổi
//   leave()  người chơi đóng game / thoát, trả về true nếu trạng thái đổi
// createGames(io, players).attach(socket) gắn các sự kiện 'game-open' / 'game-close' / 'game-act' cho từng socket.

import { DUEL_STAKES, DUEL_STAKE_DEFAULT } from '../client/src/economy.js';
import { makeWerewolf } from './werewolf.js';

const LEADERBOARD_SIZE = 5;

// ----- Bàn hai người có cược (Cờ Caro, Nối 4) -----
// Người ngồi trước chọn mức cược (DUEL_STAKES); người ngồi sau ngồi xuống là đồng ý. Đủ hai người thì trừ cược của cả hai
// (giữ trong "pot"), hết ván: thắng nhận cả pot, hoà hoàn lại mỗi người phần của mình. Bỏ bàn / mất kết nối giữa ván (đã đi ít nhất
// một nước) là thua; chưa đi nước nào thì hoàn cược. Đóng cửa sổ game giữa ván thì được DUEL_AWAY_MS để quay lại rồi mới bị xử thua.
// Chơi lại ("Ván mới") cần cả hai cùng bấm, vì mỗi ván lại trừ cược.
const DUEL_AWAY_MS = 60000;

function makeDuel(sides, { players, wallet, notify, onChange, label, reset, moves, setWinner, awayMs = () => DUEL_AWAY_MS }) {
  const seats = Object.fromEntries(sides.map((s) => [s, null]));
  const ready = new Set();
  const awayTimers = new Map(); // bên -> hẹn giờ xử thua
  let amount = DUEL_STAKE_DEFAULT;
  let pot = 0;
  const full = () => sides.every((s) => seats[s]);
  const sideOf = (id) => sides.find((s) => seats[s]?.id === id) ?? null;
  const other = (s) => sides.find((x) => x !== s);
  const cidOf = (id) => players.get(id)?.cid;
  const ptsOf = (id) => {
    const cid = cidOf(id);
    return cid ? wallet.pts(cid) : 0;
  };
  const give = (id, amt, reason) => {
    const cid = cidOf(id);
    if (cid && amt > 0) wallet.add(cid, amt, reason);
  };
  const clearAway = (s) => {
    clearTimeout(awayTimers.get(s));
    awayTimers.delete(s);
  };

  // Hai người đã ngồi: trừ cược của cả hai và bắt đầu ván mới. Ai không đủ điểm thì bị mời đứng dậy (ván không bắt đầu).
  function begin() {
    const poor = sides.filter((s) => ptsOf(seats[s].id) < amount);
    if (poor.length) {
      for (const s of poor) {
        notify(seats[s].id, `Bạn không đủ ${amount} điểm để cược, đã rời bàn.`);
        clearAway(s);
        seats[s] = null;
      }
      ready.clear();
      return false;
    }
    for (const s of sides) wallet.pay(cidOf(seats[s].id), amount, `Cược ${label}`);
    pot = amount * sides.length;
    ready.clear();
    reset();
    return true;
  }

  // Kết thúc ván: result = bên thắng hoặc 'draw'
  function settle(result) {
    if (pot <= 0) return;
    if (result === 'draw') for (const s of sides) give(seats[s]?.id, amount, `${label}: hoà, hoàn cược`);
    else give(seats[result]?.id, pot, `Thắng cược ${label}`);
    pot = 0;
  }

  function leave(id) {
    const side = sideOf(id);
    if (!side) return false;
    const opp = seats[other(side)];
    if (pot > 0 && opp) {
      if (moves() === 0) {
        settle('draw');
        notify(opp.id, 'Đối thủ rời bàn khi chưa đi nước nào, cược được hoàn lại.');
      } else {
        const won = pot;
        settle(other(side));
        setWinner(other(side));
        notify(opp.id, `${seats[side].name} bỏ cuộc, bạn ăn ${won} điểm.`);
      }
    }
    clearAway(side);
    seats[side] = null;
    ready.clear();
    if (sides.every((s) => !seats[s])) reset();
    return true;
  }

  return {
    seats,
    sideOf,
    settle,
    leave,
    info: () => ({ stake: amount, pot, ready: [...ready], away: [...awayTimers.keys()] }),
    // Người chơi đóng cửa sổ game giữa ván: cho quay lại trong DUEL_AWAY_MS rồi mới xử thua. Trả về true nếu đã áp dụng.
    away(id) {
      const side = sideOf(id);
      if (!side || pot <= 0 || moves() === 0) return false;
      clearAway(side);
      awayTimers.set(side, setTimeout(() => {
        awayTimers.delete(side);
        if (leave(id)) onChange();
      }, awayMs()));
      return true;
    },
    back(id) {
      const side = sideOf(id);
      if (side && awayTimers.has(side)) {
        clearAway(side);
        return true;
      }
      return false;
    },
    // Xử lý thao tác ngồi / chọn cược / chơi lại / rời bàn; trả về undefined nếu không phải thao tác của bàn cược
    act(p, d) {
      if (d.op === 'sit') {
        const side = sides.includes(d.side) ? d.side : null;
        if (!side || seats[side] || sideOf(p.id)) return false;
        if (ptsOf(p.id) < amount) {
          notify(p.id, `Cần ít nhất ${amount} điểm để ngồi bàn cược này.`);
          return false;
        }
        seats[side] = { id: p.id, name: p.name };
        if (full() && pot === 0) begin();
        return true;
      }
      if (d.op === 'stake') {
        const n = Math.floor(d.amount);
        // chỉ người ngồi một mình mới đổi được mức cược (người sau ngồi xuống là đồng ý mức đang hiện)
        if (!DUEL_STAKES.includes(n) || !sideOf(p.id) || full() || pot > 0) return false;
        if (ptsOf(p.id) < n) {
          notify(p.id, `Bạn không đủ ${n} điểm để đặt mức cược này.`);
          return false;
        }
        amount = n;
        return true;
      }
      if (d.op === 'new') {
        const side = sideOf(p.id);
        if (!side || pot > 0 || !full()) return false;
        ready.add(side);
        if (ready.size === sides.length) begin();
        return true;
      }
      if (d.op === 'stand') return leave(p.id);
      return undefined;
    },
    dispose() {
      for (const t of awayTimers.values()) clearTimeout(t);
    },
  };
}

// ----- Cờ Caro: 2 người ngồi hai phía (X, O), 5 quân liền hàng thắng; người khác xem -----
const CARO_N = 13;
const CARO_WIN = 5;

function makeCaro({ players, wallet, notify, onChange, awayMs }) {
  let board, turn, winner, line, last;
  const duel = makeDuel(['X', 'O'], {
    players, wallet, notify, onChange, awayMs, label: 'Cờ Caro',
    reset: () => reset(),
    moves: () => board.filter((c) => c !== '.').length,
    setWinner: (s) => { winner = s; },
  });
  const seats = duel.seats;
  const reset = () => {
    board = Array(CARO_N * CARO_N).fill('.');
    turn = 'X';
    winner = null;
    line = [];
    last = -1;
  };
  reset();
  const sideOf = duel.sideOf;

  // Các ô cùng quân liền nhau qua ô idx theo 4 hướng; đủ CARO_WIN thì trả về cả hàng.
  // Luật phổ biến ở Việt Nam: hàng bị quân đối thủ (hoặc mép bàn) chặn cả hai đầu thì không tính thắng.
  function winLine(idx, c) {
    const x = idx % CARO_N;
    const y = Math.floor(idx / CARO_N);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const cells = [idx];
      let blockedEnds = 0;
      for (const s of [1, -1]) {
        let k = 1;
        for (; ; k++) {
          const nx = x + dx * k * s;
          const ny = y + dy * k * s;
          if (nx < 0 || ny < 0 || nx >= CARO_N || ny >= CARO_N) {
            blockedEnds++; // chạm mép bàn
            break;
          }
          const cell = board[ny * CARO_N + nx];
          if (cell !== c) {
            if (cell !== '.') blockedEnds++; // quân đối thủ
            break;
          }
          cells.push(ny * CARO_N + nx);
        }
      }
      if (cells.length >= CARO_WIN && blockedEnds < 2) return cells;
    }
    return null;
  }

  return {
    state: () => ({ n: CARO_N, board: board.join(''), seats, turn, winner, line, last, ...duel.info() }),
    brief() {
      const bet = `cược ${duel.info().stake}`;
      if (seats.X && seats.O) return winner ? (winner === 'draw' ? 'Hoà!' : `${seats[winner].name} thắng!`) : `${seats.X.name} vs ${seats.O.name} · ${bet}`;
      if (seats.X || seats.O) return `${(seats.X ?? seats.O).name} chờ đối thủ · ${bet}`;
      return 'Bàn trống, vào chơi đi!';
    },
    act(p, d) {
      const handled = duel.act(p, d);
      if (handled !== undefined) return handled;
      if (d.op === 'move') {
        const side = sideOf(p.id);
        const idx = d.idx;
        if (!side || side !== turn || winner || !seats.X || !seats.O) return false;
        if (!Number.isInteger(idx) || idx < 0 || idx >= board.length || board[idx] !== '.') return false;
        board[idx] = side;
        last = idx;
        const l = winLine(idx, side);
        if (l) {
          winner = side;
          line = l;
          duel.settle(winner);
        } else if (!board.includes('.')) {
          winner = 'draw';
          duel.settle(winner);
        } else {
          turn = side === 'X' ? 'O' : 'X';
        }
        return true;
      }
      return false;
    },
    leave: duel.leave,
    away: duel.away,
    back: duel.back,
    dispose: duel.dispose,
  };
}

// ----- Đập chuột: cả phòng đua nhau, mỗi ván 30 giây, chuột nào ai ấn trước người đó ăn điểm -----
const WHACK_HOLES = 9;
const WHACK_MS = 30000;
const WHACK_POINTS = { n: 1, g: 3, b: -2 }; // chuột thường, chuột vàng, bom
const WHACK_HIT_GAP_MS = 60; // chống bấm tự động quá nhanh

function makeWhack({ onChange, roomSize, reward }) {
  let phase = 'idle'; // idle | playing | result
  let endsAt = 0;
  let spawnAt = 0;
  let moles = [];
  let nextId = 1;
  let timer = null;
  let winner = null;
  const scores = new Map(); // id -> { name, score }
  const lastHit = new Map();
  let records = [];

  const ranking = () => [...scores].map(([id, s]) => ({ id, ...s })).sort((a, b) => b.score - a.score);

  function stop() {
    clearInterval(timer);
    timer = null;
  }
  function finish() {
    stop();
    phase = 'result';
    moles = [];
    const rank = ranking();
    winner = rank[0]?.score > 0 ? { name: rank[0].name, score: rank[0].score } : null;
    for (const r of rank) if (r.score > 0) records.push({ name: r.name, score: r.score });
    records = records.sort((a, b) => b.score - a.score).slice(0, LEADERBOARD_SIZE);
    // Thưởng điểm rạp: mỗi 2 điểm ván được 1 (tối đa 30), hạng nhất (có đối thủ) thêm 15
    for (const r of rank) reward(r.id, Math.min(30, Math.floor(r.score / 2)), 'Đập chuột');
    if (rank.length >= 2 && rank[0].score > 0) reward(rank[0].id, 15, 'Hạng nhất Đập chuột');
    onChange();
  }
  function tick() {
    const now = Date.now();
    if (!roomSize()) {
      stop();
      phase = 'idle';
      moles = [];
      onChange();
      return;
    }
    if (now >= endsAt) {
      finish();
      return;
    }
    let changed = false;
    const alive = moles.filter((m) => m.until > now);
    if (alive.length !== moles.length) {
      moles = alive;
      changed = true;
    }
    if (now >= spawnAt) {
      const progress = 1 - (endsAt - now) / WHACK_MS; // càng về cuối càng nhanh
      const free = [...Array(WHACK_HOLES).keys()].filter((h) => !moles.some((m) => m.hole === h));
      if (free.length) {
        const r = Math.random();
        moles.push({
          id: nextId++,
          hole: free[Math.floor(Math.random() * free.length)],
          kind: r < 0.1 ? 'b' : r < 0.22 ? 'g' : 'n',
          until: now + 1300 - 600 * progress,
        });
      }
      spawnAt = now + 650 - 350 * progress + Math.random() * 200;
      changed = true;
    }
    if (changed) onChange();
  }

  return {
    state: () => ({
      phase,
      msLeft: phase === 'playing' ? Math.max(0, endsAt - Date.now()) : 0,
      holes: WHACK_HOLES,
      moles: moles.map(({ id, hole, kind }) => ({ id, hole, kind })),
      ranking: ranking(),
      winner,
      records,
    }),
    brief() {
      if (phase === 'playing') return `Đang đua! ${scores.size} người chơi`;
      if (winner && phase === 'result') return `${winner.name} thắng: ${winner.score} điểm`;
      return records[0] ? `Kỷ lục: ${records[0].name} ${records[0].score}` : 'Ai đập nhanh nhất?';
    },
    act(p, d) {
      if (d.op === 'start') {
        if (phase === 'playing') return false;
        scores.clear();
        moles = [];
        winner = null;
        phase = 'playing';
        endsAt = Date.now() + WHACK_MS;
        spawnAt = Date.now() + 500;
        stop();
        timer = setInterval(tick, 100);
        return true;
      }
      if (d.op === 'hit') {
        const now = Date.now();
        if (phase !== 'playing' || now - (lastHit.get(p.id) ?? 0) < WHACK_HIT_GAP_MS) return false;
        lastHit.set(p.id, now);
        const i = moles.findIndex((m) => m.id === d.id);
        if (i < 0) return false;
        const [m] = moles.splice(i, 1);
        const cur = scores.get(p.id) ?? { name: p.name, score: 0 };
        cur.score = Math.max(0, cur.score + WHACK_POINTS[m.kind]);
        scores.set(p.id, cur);
        return true;
      }
      return false;
    },
    leave: () => false,
    dispose: stop, // dừng đồng hồ của ván đang chạy khi dọn phòng
  };
}

// ----- Game chơi một mình (Rắn, 2048...): chơi ở client, server chỉ giữ bảng kỷ lục -----
// rewardOf(điểm) = số điểm rạp thưởng; mỗi người chỉ được thưởng một lần mỗi SOLO_REWARD_GAP_MS
const SOLO_REWARD_GAP_MS = 20000;
function makeSolo(maxScore, { reward, label, rewardOf, gapMs = () => SOLO_REWARD_GAP_MS }) {
  const top = [];
  const lastAt = new Map();
  const lastReward = new Map();
  return {
    state: () => ({ top }),
    brief: () => (top[0] ? `Kỷ lục: ${top[0].name} ${top[0].score}` : 'Chưa có kỷ lục'),
    act(p, d) {
      const v = Math.floor(d.value);
      const now = Date.now();
      if (d.op !== 'score' || !(v > 0 && v <= maxScore) || now - (lastAt.get(p.id) ?? 0) < 3000) return false;
      lastAt.set(p.id, now);
      top.push({ name: p.name, score: v });
      top.sort((a, b) => b.score - a.score);
      top.length = Math.min(top.length, LEADERBOARD_SIZE);
      if (now - (lastReward.get(p.id) ?? 0) >= gapMs()) {
        lastReward.set(p.id, now);
        reward(p.id, rewardOf(v), label);
      }
      return true;
    },
    leave: () => false,
  };
}

// ----- Nối 4: 7 cột x 6 hàng, hai người (R đỏ, Y vàng) thả quân vào cột, 4 quân liền hàng thắng -----
const C4_COLS = 7;
const C4_ROWS = 6;

function makeConnect4({ players, wallet, notify, onChange, awayMs }) {
  let board, turn, winner, line, last;
  const duel = makeDuel(['R', 'Y'], {
    players, wallet, notify, onChange, awayMs, label: 'Nối 4',
    reset: () => reset(),
    moves: () => board.filter((c) => c !== '.').length,
    setWinner: (s) => { winner = s; },
  });
  const seats = duel.seats;
  const reset = () => {
    board = Array(C4_COLS * C4_ROWS).fill('.'); // chỉ số = hàng * 7 + cột, hàng 0 ở trên cùng
    turn = 'R';
    winner = null;
    line = [];
    last = -1;
  };
  reset();
  const sideOf = duel.sideOf;

  function winLine(idx, c) {
    const x = idx % C4_COLS;
    const y = Math.floor(idx / C4_COLS);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const cells = [idx];
      for (const s of [1, -1]) {
        for (let k = 1; ; k++) {
          const nx = x + dx * k * s;
          const ny = y + dy * k * s;
          if (nx < 0 || ny < 0 || nx >= C4_COLS || ny >= C4_ROWS || board[ny * C4_COLS + nx] !== c) break;
          cells.push(ny * C4_COLS + nx);
        }
      }
      if (cells.length >= 4) return cells;
    }
    return null;
  }

  return {
    state: () => ({ cols: C4_COLS, rows: C4_ROWS, board: board.join(''), seats, turn, winner, line, last, ...duel.info() }),
    brief() {
      const bet = `cược ${duel.info().stake}`;
      if (seats.R && seats.Y) return winner ? (winner === 'draw' ? 'Hoà!' : `${seats[winner].name} thắng!`) : `${seats.R.name} vs ${seats.Y.name} · ${bet}`;
      if (seats.R || seats.Y) return `${(seats.R ?? seats.Y).name} chờ đối thủ · ${bet}`;
      return 'Bàn trống, vào chơi đi!';
    },
    act(p, d) {
      const handled = duel.act(p, d);
      if (handled !== undefined) return handled;
      if (d.op === 'drop') {
        const side = sideOf(p.id);
        const col = d.col;
        if (!side || side !== turn || winner || !seats.R || !seats.Y) return false;
        if (!Number.isInteger(col) || col < 0 || col >= C4_COLS) return false;
        let row = C4_ROWS - 1;
        while (row >= 0 && board[row * C4_COLS + col] !== '.') row--;
        if (row < 0) return false; // cột đầy
        const idx = row * C4_COLS + col;
        board[idx] = side;
        last = idx;
        const l = winLine(idx, side);
        if (l) {
          winner = side;
          line = l;
          duel.settle(winner);
        } else if (!board.includes('.')) {
          winner = 'draw';
          duel.settle(winner);
        } else {
          turn = side === 'R' ? 'Y' : 'R';
        }
        return true;
      }
      return false;
    },
    leave: duel.leave,
    away: duel.away,
    back: duel.back,
    dispose: duel.dispose,
  };
}

// ----- Bình chọn phim tiếp theo: ai cũng thêm link YouTube và bỏ phiếu (mỗi người một phiếu) -----
const VOTE_MAX_OPTIONS = 10;
const VOTE_MAX_PER_PLAYER = 3;

function makeVote(players, { reward }) {
  let options = []; // { id, videoId, title, by, byId }
  let nextId = 1;
  const votes = new Map(); // id người chơi -> id đề xuất
  const active = (id) => players.has(id); // chỉ tính phiếu của người còn trong phòng
  const ranked = () => {
    const count = new Map();
    for (const [pid, oid] of votes) if (active(pid)) count.set(oid, (count.get(oid) ?? 0) + 1);
    return options.map((o) => ({ ...o, votes: count.get(o.id) ?? 0 })).sort((a, b) => b.votes - a.votes || a.id - b.id);
  };
  const dropVotesFor = (optionId) => {
    for (const [pid, oid] of votes) if (oid === optionId) votes.delete(pid);
  };
  return {
    state: () => ({
      options: ranked().map((o) => ({ id: o.id, videoId: o.videoId, title: o.title, by: o.by, byId: o.byId, votes: o.votes })),
      votes: Object.fromEntries([...votes].filter(([pid]) => active(pid))), // id người -> id đề xuất, để mỗi người thấy phiếu của mình
    }),
    brief() {
      const top = ranked()[0];
      return top ? `Đang dẫn: ${top.title.slice(0, 22)} (${top.votes} phiếu)` : 'Chưa có đề xuất, thêm link đi!';
    },
    act(p, d) {
      if (d.op === 'add') {
        if (!/^[\w-]{11}$/.test(d.videoId) || options.length >= VOTE_MAX_OPTIONS) return false;
        if (options.some((o) => o.videoId === d.videoId)) return false;
        if (options.filter((o) => o.byId === p.id).length >= VOTE_MAX_PER_PLAYER) return false;
        const title = String(d.title ?? '').trim().slice(0, 80) || `Video ${d.videoId}`;
        const id = nextId++;
        options.push({ id, videoId: d.videoId, title, by: p.name, byId: p.id });
        votes.set(p.id, id); // người đề xuất tự bỏ phiếu cho đề xuất của mình
        return true;
      }
      if (d.op === 'vote') {
        if (!options.some((o) => o.id === d.id)) return false;
        if (votes.get(p.id) === d.id) votes.delete(p.id); // bấm lại để bỏ phiếu
        else votes.set(p.id, d.id);
        return true;
      }
      if (d.op === 'remove') {
        const o = options.find((x) => x.id === d.id);
        if (!o || o.byId !== p.id) return false;
        options = options.filter((x) => x !== o);
        dropVotesFor(o.id);
        return true;
      }
      if (d.op === 'played') {
        // đã chiếu video này (client vừa gửi lệnh chiếu): thưởng điểm rồi gỡ đề xuất khỏi danh sách
        const o = options.find((x) => x.id === d.id);
        if (!o) return false;
        const supporters = [...votes].filter(([pid, oid]) => oid === o.id && active(pid) && pid !== o.byId).map(([pid]) => pid);
        if (supporters.length) {
          reward(o.byId, Math.min(25, 5 * supporters.length), 'Phim bạn đề xuất được chiếu');
          for (const pid of supporters) reward(pid, 2, 'Phim bạn bầu được chiếu');
        }
        options = options.filter((x) => x !== o);
        dropVotesFor(o.id);
        return true;
      }
      return false;
    },
    leave: () => false,
  };
}

// ----- Bầu cua / Tài xỉu: cả phòng cược bằng điểm chung của rạp (xem wallet.js), server lắc 3 xúc xắc -----
const DICE_BET_MS = 20000;
const DICE_CHIPS = [10, 50, 100];
const BAUCUA = ['nai', 'bau', 'ga', 'ca', 'cua', 'tom']; // mặt xúc xắc 0..5
const DICE_TABLES = {
  taixiu: { spots: ['xiu', 'tai'], label: 'Tài xỉu' },
  baucua: { spots: BAUCUA, label: 'Bầu cua' },
};

// Tiền nhận về (gồm cả tiền cược gốc) cho các cửa đã cược, theo kết quả xúc xắc
function dicePayout(table, dice, bets) {
  let total = 0;
  if (table === 'taixiu') {
    const sum = dice[0] + dice[1] + dice[2] + 3; // dice là 0..5 (mặt 1..6)
    const triple = dice[0] === dice[1] && dice[1] === dice[2];
    const winSpot = triple ? null : sum >= 11 ? 'tai' : 'xiu'; // bộ ba: nhà cái ăn hết
    for (const [spot, amt] of Object.entries(bets)) if (spot === winSpot) total += amt * 2;
  } else {
    for (const [spot, amt] of Object.entries(bets)) {
      const k = dice.filter((d) => BAUCUA[d] === spot).length;
      if (k > 0) total += amt * (1 + k);
    }
  }
  return total;
}

function makeDice({ onChange, players, wallet }) {
  const tables = {};
  for (const t of Object.keys(DICE_TABLES)) tables[t] = { phase: 'idle', endsAt: 0, bets: new Map(), last: null, timer: null };
  const sumOf = (spots) => Object.values(spots).reduce((a, b) => a + b, 0);

  function roll(name) {
    const t = tables[name];
    t.phase = 'result';
    const dice = [0, 1, 2].map(() => Math.floor(Math.random() * 6));
    const results = [];
    for (const [, { name: pname, cid, spots }] of t.bets) {
      const payout = dicePayout(name, dice, spots);
      const net = payout - sumOf(spots);
      if (payout > 0) wallet.add(cid, payout); // tiền cược đã trừ lúc đặt, giờ trả tiền thắng (gồm cả vốn)
      wallet.notify(cid, net, net === 0 ? '' : DICE_TABLES[name].label);
      results.push({ name: pname, net });
    }
    t.last = { dice, results: results.sort((a, b) => b.net - a.net) };
    onChange();
  }

  return {
    state: () => ({
      chips: DICE_CHIPS,
      players: [...players.values()].map((p) => ({ id: p.id, name: p.name, pts: wallet.pts(p.cid) })).sort((a, b) => b.pts - a.pts),
      tables: Object.fromEntries(Object.entries(tables).map(([name, t]) => [name, {
        phase: t.phase,
        msLeft: t.phase === 'betting' ? Math.max(0, t.endsAt - Date.now()) : 0,
        bets: Object.fromEntries([...t.bets].map(([id, b]) => [id, b.spots])),
        last: t.last,
      }])),
    }),
    brief() {
      const betting = Object.entries(tables).find(([, t]) => t.phase === 'betting');
      if (betting) return `Đang cược ${DICE_TABLES[betting[0]].label}!`;
      return 'Cược điểm cùng cả phòng';
    },
    act(p, d) {
      const t = tables[d.table];
      if (!t) return false;
      if (d.op === 'start') {
        if (t.phase === 'betting') return false;
        t.phase = 'betting';
        t.endsAt = Date.now() + DICE_BET_MS;
        t.bets = new Map();
        t.last = null;
        clearTimeout(t.timer);
        t.timer = setTimeout(() => roll(d.table), DICE_BET_MS);
        return true;
      }
      if (t.phase !== 'betting') return false;
      if (d.op === 'bet') {
        if (!DICE_TABLES[d.table].spots.includes(d.spot) || !DICE_CHIPS.includes(d.amt) || !wallet.pay(p.cid, d.amt)) return false;
        const entry = t.bets.get(p.id) ?? { name: p.name, cid: p.cid, spots: {} };
        entry.spots[d.spot] = (entry.spots[d.spot] ?? 0) + d.amt;
        t.bets.set(p.id, entry);
        return true;
      }
      if (d.op === 'unbet') {
        const entry = t.bets.get(p.id);
        if (!entry) return false;
        wallet.add(p.cid, sumOf(entry.spots));
        t.bets.delete(p.id);
        return true;
      }
      return false;
    },
    leave: () => false,
    dispose() {
      for (const t of Object.values(tables)) clearTimeout(t.timer);
    },
  };
}

// opts.werewolf: thông số Ma Sói chỉnh được ở trang admin (xem wwDefaults ở client/src/games/werewolf/roles.js)
export function createGames(io, players, wallet, opts = {}) {
  // Thưởng điểm rạp cho người chơi có id socket này (đã rời phòng thì thôi)
  const live = () => opts.live?.() ?? {}; // cài đặt chỉnh được lúc đang chạy (trang admin), đọc mỗi lần dùng
  const reward = (id, amt, reason) => {
    const p = players.get(id);
    const scaled = Math.round((amt * (live().rewardPct ?? 100)) / 100); // hệ số thưởng game đơn do admin chỉnh
    if (p && scaled > 0) wallet.add(p.cid, scaled, reason);
  };
  const notify = (id, text) => io.to(id).emit('notice', { text });
  const roomOf = (id) => `game:${id}`;
  const briefs = {};
  const games = {};

  // Đẩy trạng thái cho người đang mở game, và dòng tóm tắt cho cả phòng nếu có đổi
  function push(id) {
    const g = games[id];
    if (g.stateFor) {
      // game có thông tin riêng từng người (Ma Sói): mỗi người nhận trạng thái của riêng mình
      for (const sid of io.adapter.rooms.get(roomOf(id)) ?? []) io.to(sid).emit('game-state', { game: id, state: g.stateFor(sid) });
    } else {
      io.to(roomOf(id)).emit('game-state', { game: id, state: g.state() });
    }
    const text = g.brief();
    if (text !== briefs[id]) {
      briefs[id] = text;
      io.emit('game-brief', { game: id, text });
    }
  }
  const roomSize = (id) => io.adapter.rooms.get(roomOf(id))?.size ?? 0;

  // Dựng (hoặc dựng lại từ đầu) mọi game: bàn cờ, điểm, bảng kỷ lục đều về trống
  function init() {
    for (const g of Object.values(games)) g.dispose?.();
    games.caro = makeCaro({ awayMs: () => live().duelAwaySec * 1000 || DUEL_AWAY_MS, players, wallet, notify, onChange: () => push('caro') });
    games.whack = makeWhack({ onChange: () => push('whack'), roomSize: () => roomSize('whack'), reward });
    games.snake = makeSolo(2000, { reward, gapMs: () => live().soloGapSec * 1000 || 0, label: 'Rắn săn mồi', rewardOf: (v) => Math.min(25, Math.floor(v / 2)) });
    games.g2048 = makeSolo(1000000, { reward, gapMs: () => live().soloGapSec * 1000 || 0, label: '2048', rewardOf: (v) => Math.min(30, Math.floor(v / 150)) });
    games.connect4 = makeConnect4({ awayMs: () => live().duelAwaySec * 1000 || DUEL_AWAY_MS, players, wallet, notify, onChange: () => push('connect4') });
    games.vote = makeVote(players, { reward });
    games.dice = makeDice({ onChange: () => push('dice'), players, wallet });
    games.werewolf = makeWerewolf({
      players, wallet, notify, cfg: opts.werewolf,
      onChange: () => push('werewolf'),
      emit: (data) => io.to(roomOf('werewolf')).emit('game-cue', { game: 'werewolf', ...data }), // giọng quản trò
    });
    for (const id of Object.keys(games)) briefs[id] = games[id].brief();
  }
  init();

  return {
    // Phòng trống hẳn thì xoá hết dữ liệu game (không lưu xếp hạng giữa các lần mở phòng)
    reset: init,
    briefs: () => ({ ...briefs }),
    // Người đang trong ván Ma Sói không nhắn chat chung của phòng (chat riêng trong ván)
    chatBlocked: (id) => Object.values(games).some((g) => g.chatBlocked?.(id)),
    attach(socket) {
      const leaveAll = () => {
        for (const id of Object.keys(games)) {
          if (!socket.rooms.has(roomOf(id))) continue;
          socket.leave(roomOf(id));
          if (games[id].leave(socket.id)) push(id);
        }
      };
      socket.on('game-open', (data = {}) => {
        const g = games[data.game];
        const p = players.get(socket.id);
        if (!g || !p) return;
        if (g.canOpen && !g.canOpen(p)) {
          notify(socket.id, 'Cần ít nhất 100 điểm để chơi Ma Sói.');
          socket.emit('game-denied', { game: data.game });
          return;
        }
        socket.join(roomOf(data.game));
        if (g.back?.(socket.id)) push(data.game); // quay lại bàn cược giữa ván: huỷ hẹn xử thua
        socket.emit('game-state', { game: data.game, state: g.stateFor ? g.stateFor(socket.id) : g.state() });
      });
      socket.on('game-close', (data = {}) => {
        const g = games[data.game];
        if (!g || !socket.rooms.has(roomOf(data.game))) return;
        socket.leave(roomOf(data.game));
        // bàn cược đang giữa ván thì cho một lúc để quay lại, không bỏ chỗ ngay (xem makeDuel)
        if (g.away?.(socket.id) || g.leave(socket.id)) push(data.game);
      });
      socket.on('game-act', (data = {}) => {
        const g = games[data.game];
        const p = players.get(socket.id);
        if (!g || !p || !socket.rooms.has(roomOf(data.game))) return;
        if (g.act(p, data)) push(data.game);
      });
      socket.on('disconnecting', leaveAll);
    },
  };
}
