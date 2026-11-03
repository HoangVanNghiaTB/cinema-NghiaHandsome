import { el, watchSize, createStakeBar, duelSfx } from './util.js';
import { sfx } from '../audio/sfx.js';

// Cờ Caro 13x13, 5 quân liền hàng thắng. Hai người ngồi hai phía, người khác xem. Luật chơi nằm ở server/games.js.
export default {
  id: 'caro',
  title: 'Cờ Caro',
  mount(root, ctx) {
    const wrap = el('div', 'g-split');
    const canvas = el('canvas', 'g-canvas');
    const side = el('div', 'g-side');
    const seatEls = {};
    for (const s of ['X', 'O']) {
      const row = el('div', 'g-seat');
      const label = el('span', 'g-seat-name');
      const btn = el('button', 'g-btn', 'Ngồi');
      btn.addEventListener('click', () => ctx.send({ op: 'sit', side: s }));
      row.append(el('b', s === 'X' ? 'g-x' : 'g-o', s === 'X' ? '❌' : '⭕'), label, btn);
      seatEls[s] = { label, btn };
      side.appendChild(row);
    }
    const stakeBar = createStakeBar(ctx);
    const status = el('div', 'g-status');
    const newBtn = el('button', 'g-btn', 'Chơi lại');
    newBtn.addEventListener('click', () => ctx.send({ op: 'new' }));
    const standBtn = el('button', 'g-btn', 'Rời bàn');
    standBtn.addEventListener('click', () => {
      if (s?.pot > 0 && !confirm('Bỏ bàn giữa ván là thua, mất ' + s.stake + ' điểm cược. Chắc chưa?')) return;
      ctx.send({ op: 'stand' });
    });
    side.append(stakeBar.node, status, newBtn, standBtn, el('div', 'g-dim', '5 quân liền hàng (ngang, dọc, chéo) là thắng, trừ khi bị chặn cả 2 đầu.'));
    wrap.append(canvas, side);
    root.appendChild(wrap);

    let s = null;
    const mySide = () => (s?.seats.X?.id === ctx.me().id ? 'X' : s?.seats.O?.id === ctx.me().id ? 'O' : null);
    let size = 0;

    function layout() {
      const h = root.clientHeight;
      const w = root.clientWidth;
      size = Math.max(160, Math.min(h, w - 170));
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.style.width = canvas.style.height = `${size}px`;
      canvas.width = canvas.height = Math.floor(size * dpr);
      draw();
    }

    function draw() {
      const g = canvas.getContext('2d');
      const dpr = canvas.width / size;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#e8c78a';
      g.fillRect(0, 0, size, size);
      const n = s?.n ?? 13;
      const cell = size / n;
      g.strokeStyle = '#7a5c2e';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const p = (i + 0.5) * cell;
        g.moveTo(p, cell / 2);
        g.lineTo(p, size - cell / 2);
        g.moveTo(cell / 2, p);
        g.lineTo(size - cell / 2, p);
      }
      g.stroke();
      if (!s) return;
      const win = new Set(s.line);
      for (let i = 0; i < s.board.length; i++) {
        const c = s.board[i];
        if (c === '.') continue;
        const cx = ((i % n) + 0.5) * cell;
        const cy = (Math.floor(i / n) + 0.5) * cell;
        const r = cell * 0.34;
        if (win.has(i) || i === s.last) {
          g.fillStyle = win.has(i) ? 'rgba(80,200,80,0.55)' : 'rgba(255,255,255,0.45)';
          g.fillRect(cx - cell / 2 + 1, cy - cell / 2 + 1, cell - 2, cell - 2);
        }
        g.lineWidth = Math.max(2, cell * 0.1);
        if (c === 'X') {
          g.strokeStyle = '#d42a2a';
          g.beginPath();
          g.moveTo(cx - r, cy - r);
          g.lineTo(cx + r, cy + r);
          g.moveTo(cx + r, cy - r);
          g.lineTo(cx - r, cy + r);
          g.stroke();
        } else {
          g.strokeStyle = '#1f5fd0';
          g.beginPath();
          g.arc(cx, cy, r, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }

    function refresh() {
      if (!s) return;
      const me = mySide();
      for (const k of ['X', 'O']) {
        const seat = s.seats[k];
        seatEls[k].label.textContent = seat ? seat.name + (seat.id === ctx.me().id ? ' (bạn)' : '') : '(trống)';
        seatEls[k].btn.style.display = !seat && !me ? '' : 'none';
        seatEls[k].btn.textContent = 'Ngồi (cược ' + s.stake + ')';
      }
      stakeBar.update(s, !!me && !(s.seats.X && s.seats.O) && s.pot === 0);
      standBtn.style.display = me ? '' : 'none';
      const iAmReady = s.ready.includes(me);
      newBtn.style.display = me && s.pot === 0 && s.seats.X && s.seats.O ? '' : 'none';
      newBtn.textContent = iAmReady ? 'Đã sẵn sàng, chờ đối thủ...' : 'Chơi lại (cược ' + s.stake + ')';
      newBtn.disabled = iAmReady;
      let text;
      if (s.winner === 'draw') text = 'Hoà!';
      else if (s.winner) text = `${s.seats[s.winner]?.name ?? s.winner} thắng! 🎉`;
      else if (!s.seats.X || !s.seats.O) text = me ? 'Chờ đối thủ...' : 'Chọn chỗ ngồi để chơi';
      else text = s.seats[s.turn].id === ctx.me().id ? 'Đến lượt bạn!' : `Lượt của ${s.seats[s.turn].name}`;
      const awayName = s.away?.map((k) => s.seats[k]?.name).filter(Boolean).join(', ');
      status.textContent = awayName && !s.winner ? text + ' · ' + awayName + ' đang vắng (xử thua sau ít phút)' : text;
      draw();
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (!s || s.winner || mySide() !== s.turn || !s.seats.X || !s.seats.O) return;
      // offsetX/Y là toạ độ trong chính bàn cờ, đúng cả khi điện thoại cầm dọc (trang bị xoay ngang bằng CSS)
      const cell = canvas.clientWidth / s.n;
      const x = Math.floor(e.offsetX / cell);
      const y = Math.floor(e.offsetY / cell);
      const idx = y * s.n + x;
      if (x < 0 || y < 0 || x >= s.n || y >= s.n || s.board[idx] !== '.') return;
      ctx.send({ op: 'move', idx });
    });

    const stopWatch = watchSize(root, layout);
    layout();
    return {
      state(next) {
        duelSfx(s, next, next.seats.X?.id === ctx.me().id ? 'X' : next.seats.O?.id === ctx.me().id ? 'O' : null, () => sfx.play('place'), 140);
        s = next;
        refresh();
      },
      destroy: stopWatch,
    };
  },
};
