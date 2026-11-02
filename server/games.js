// Mini game treo tường rạp. Mỗi game là một đối tượng { state(), brief(), act(player, data), leave(id) }:
//   state()  trạng thái đầy đủ, gửi cho những ai đang mở game đó
//   brief()  một dòng ngắn hiện trên tranh ngoài tường (ai cũng thấy)
//   act()    xử lý thao tác của người chơi, trả về true nếu trạng thái đổi
//   leave()  người chơi đóng game / thoát, trả về true nếu trạng thái đổi
// createGames(io, players).attach(socket) gắn các sự kiện 'game-open' / 'game-close' / 'game-act' cho từng socket.

const LEADERBOARD_SIZE = 5;

// Thưởng điểm khi hết ván cờ hai người: thắng +40, hoà +10 mỗi người; ván quá ngắn (đi chưa đủ nước) thì không thưởng
function awardBoardGame(reward, board, seats, winner, minMoves, label) {
  if (board.filter((c) => c !== '.').length < minMoves) return;
  if (winner === 'draw') {
    for (const seat of Object.values(seats)) reward(seat.id, 10, `${label}: hoà`);
  } else {
    reward(seats[winner].id, 40, `Thắng ${label}`);
  }
}

// ----- Cờ Caro: 2 người ngồi hai phía (X, O), 5 quân liền hàng thắng; người khác xem -----
const CARO_N = 13;
const CARO_WIN = 5;

function makeCaro({ reward }) {
  const AWARD_MIN_MOVES = 9;
  const AWARD_LABEL = 'Cờ Caro';
  let board, turn, winner, line, last;
  const seats = { X: null, O: null };
  const reset = () => {
    board = Array(CARO_N * CARO_N).fill('.');
    turn = 'X';
    winner = null;
    line = [];
    last = -1;
  };
  reset();
  const sideOf = (id) => (seats.X?.id === id ? 'X' : seats.O?.id === id ? 'O' : null);

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
    state: () => ({ n: CARO_N, board: board.join(''), seats, turn, winner, line, last }),
    brief() {
      if (seats.X && seats.O) return winner ? (winner === 'draw' ? 'Hoà!' : `${seats[winner].name} thắng!`) : `${seats.X.name} vs ${seats.O.name}`;
      if (seats.X || seats.O) return `${(seats.X ?? seats.O).name} đang chờ đối thủ`;
      return 'Bàn trống, vào chơi đi!';
    },
    act(p, d) {
      if (d.op === 'sit') {
        const side = d.side === 'X' || d.side === 'O' ? d.side : null;
        if (!side || seats[side] || sideOf(p.id)) return false;
        seats[side] = { id: p.id, name: p.name };
        return true;
      }
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
          awardBoardGame(reward, board, seats, winner, AWARD_MIN_MOVES, AWARD_LABEL);
        } else if (!board.includes('.')) {
          winner = 'draw';
          awardBoardGame(reward, board, seats, winner, AWARD_MIN_MOVES, AWARD_LABEL);
        } else {
          turn = side === 'X' ? 'O' : 'X';
        }
        return true;
      }
      if (d.op === 'new') {
        if (!sideOf(p.id) || !winner) return false;
        reset();
        return true;
      }
      if (d.op === 'stand') return this.leave(p.id);
      return false;
    },
    leave(id) {
      const side = sideOf(id);
      if (!side) return false;
      seats[side] = null;
      if (!seats.X && !seats.O) reset(); // bàn trống hẳn thì dọn bàn cờ
      return true;
    },
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
function makeSolo(maxScore, { reward, label, rewardOf }) {
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
      if (now - (lastReward.get(p.id) ?? 0) >= SOLO_REWARD_GAP_MS) {
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

function makeConnect4({ reward }) {
  const AWARD_MIN_MOVES = 7;
  const AWARD_LABEL = 'Nối 4';
  let board, turn, winner, line, last;
  const seats = { R: null, Y: null };
  const reset = () => {
    board = Array(C4_COLS * C4_ROWS).fill('.'); // chỉ số = hàng * 7 + cột, hàng 0 ở trên cùng
    turn = 'R';
    winner = null;
    line = [];
    last = -1;
  };
  reset();
  const sideOf = (id) => (seats.R?.id === id ? 'R' : seats.Y?.id === id ? 'Y' : null);

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
    state: () => ({ cols: C4_COLS, rows: C4_ROWS, board: board.join(''), seats, turn, winner, line, last }),
    brief() {
      if (seats.R && seats.Y) return winner ? (winner === 'draw' ? 'Hoà!' : `${seats[winner].name} thắng!`) : `${seats.R.name} vs ${seats.Y.name}`;
      if (seats.R || seats.Y) return `${(seats.R ?? seats.Y).name} đang chờ đối thủ`;
      return 'Bàn trống, vào chơi đi!';
    },
    act(p, d) {
      if (d.op === 'sit') {
        const side = d.side === 'R' || d.side === 'Y' ? d.side : null;
        if (!side || seats[side] || sideOf(p.id)) return false;
        seats[side] = { id: p.id, name: p.name };
        return true;
      }
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
          awardBoardGame(reward, board, seats, winner, AWARD_MIN_MOVES, AWARD_LABEL);
        } else if (!board.includes('.')) {
          winner = 'draw';
          awardBoardGame(reward, board, seats, winner, AWARD_MIN_MOVES, AWARD_LABEL);
        } else {
          turn = side === 'R' ? 'Y' : 'R';
        }
        return true;
      }
      if (d.op === 'new') {
        if (!sideOf(p.id) || !winner) return false;
        reset();
        return true;
      }
      if (d.op === 'stand') return this.leave(p.id);
      return false;
    },
    leave(id) {
      const side = sideOf(id);
      if (!side) return false;
      seats[side] = null;
      if (!seats.R && !seats.Y) reset();
      return true;
    },
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

export function createGames(io, players, wallet) {
  // Thưởng điểm rạp cho người chơi có id socket này (đã rời phòng thì thôi)
  const reward = (id, amt, reason) => {
    const p = players.get(id);
    if (p && amt > 0) wallet.add(p.cid, amt, reason);
  };
  const roomOf = (id) => `game:${id}`;
  const briefs = {};
  const games = {};

  // Đẩy trạng thái cho người đang mở game, và dòng tóm tắt cho cả phòng nếu có đổi
  function push(id) {
    const g = games[id];
    io.to(roomOf(id)).emit('game-state', { game: id, state: g.state() });
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
    games.caro = makeCaro({ reward });
    games.whack = makeWhack({ onChange: () => push('whack'), roomSize: () => roomSize('whack'), reward });
    games.snake = makeSolo(2000, { reward, label: 'Rắn săn mồi', rewardOf: (v) => Math.min(25, Math.floor(v / 2)) });
    games.g2048 = makeSolo(1000000, { reward, label: '2048', rewardOf: (v) => Math.min(30, Math.floor(v / 150)) });
    games.connect4 = makeConnect4({ reward });
    games.vote = makeVote(players, { reward });
    games.dice = makeDice({ onChange: () => push('dice'), players, wallet });
    for (const id of Object.keys(games)) briefs[id] = games[id].brief();
  }
  init();

  return {
    // Phòng trống hẳn thì xoá hết dữ liệu game (không lưu xếp hạng giữa các lần mở phòng)
    reset: init,
    briefs: () => ({ ...briefs }),
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
        if (!g || !players.has(socket.id)) return;
        socket.join(roomOf(data.game));
        socket.emit('game-state', { game: data.game, state: g.state() });
      });
      socket.on('game-close', (data = {}) => {
        const g = games[data.game];
        if (!g || !socket.rooms.has(roomOf(data.game))) return;
        socket.leave(roomOf(data.game));
        if (g.leave(socket.id)) push(data.game);
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
