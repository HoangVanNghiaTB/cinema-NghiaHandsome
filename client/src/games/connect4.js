import { el, watchSize } from './util.js';

// Nối 4: 7 cột x 6 hàng, hai người (đỏ / vàng) thả quân vào cột, 4 quân liền hàng thắng. Luật nằm ở server/games.js.
const COLOR = { R: '#d93636', Y: '#f5d020' };

export default {
  id: 'connect4',
  title: 'Nối 4',
  mount(root, ctx) {
    const wrap = el('div', 'g-split');
    const canvas = el('canvas', 'g-canvas');
    const side = el('div', 'g-side');
    const seatEls = {};
    for (const k of ['R', 'Y']) {
      const row = el('div', 'g-seat');
      const label = el('span', 'g-seat-name');
      const btn = el('button', 'g-btn', 'Ngồi');
      btn.addEventListener('click', () => ctx.send({ op: 'sit', side: k }));
      row.append(el('b', '', k === 'R' ? '🔴' : '🟡'), label, btn);
      seatEls[k] = { label, btn };
      side.appendChild(row);
    }
    const status = el('div', 'g-status');
    const newBtn = el('button', 'g-btn', 'Ván mới');
    newBtn.addEventListener('click', () => ctx.send({ op: 'new' }));
    const standBtn = el('button', 'g-btn', 'Rời bàn');
    standBtn.addEventListener('click', () => ctx.send({ op: 'stand' }));
    side.append(status, newBtn, standBtn, el('div', 'g-dim', 'Chạm vào cột để thả quân. 4 quân liền hàng (ngang, dọc, chéo) là thắng.'));
    wrap.append(canvas, side);
    root.appendChild(wrap);

    let s = null;
    let cell = 40;
    const COLS = 7;
    const ROWS = 6;
    const mySide = () => (s?.seats.R?.id === ctx.me().id ? 'R' : s?.seats.Y?.id === ctx.me().id ? 'Y' : null);

    function layout() {
      cell = Math.max(20, Math.floor(Math.min((root.clientWidth - 170) / COLS, root.clientHeight / ROWS)));
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.style.width = `${cell * COLS}px`;
      canvas.style.height = `${cell * ROWS}px`;
      canvas.width = cell * COLS * dpr;
      canvas.height = cell * ROWS * dpr;
      draw();
    }

    // Quân vừa thả rơi từ trên xuống (rơi nhanh dần, chạm đáy thì nảy nhẹ), nằm sau khung xanh nên thấy qua các lỗ
    let anim = null; // { idx, color, start, fall, total }
    let raf = 0;
    const FALL_BASE_MS = 260;
    const FALL_PER_ROW_MS = 55;
    const BOUNCE_MS = 220;

    // Độ cao (đơn vị ô) của quân đang rơi tại thời điểm t ms, so với ô đích: 0 là đã nằm đúng chỗ
    function dropOffset(a, t) {
      if (t < a.fall) {
        const k = t / a.fall;
        return -(1 - k * k) * (a.row + 1); // từ trên mép khung, rơi nhanh dần
      }
      const k = (t - a.fall) / BOUNCE_MS;
      return k < 1 ? -Math.sin(k * Math.PI) * 0.12 * Math.max(0.4, 1 - k) : 0; // nảy lên nhẹ rồi nằm yên
    }

    function draw() {
      const g = canvas.getContext('2d');
      const dpr = canvas.width / (cell * COLS);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = cell * COLS;
      const H = cell * ROWS;
      const now = performance.now();
      const animating = anim && now - anim.start < anim.total;
      g.fillStyle = '#0e1a3a';
      g.fillRect(0, 0, W, H);

      // Quân cờ (phía sau khung)
      for (let i = 0; i < COLS * ROWS; i++) {
        const c = s?.board[i] ?? '.';
        if (c === '.') continue;
        const cx = ((i % COLS) + 0.5) * cell;
        let cy = (Math.floor(i / COLS) + 0.5) * cell;
        if (animating && i === anim.idx) cy += dropOffset(anim, now - anim.start) * cell;
        g.fillStyle = COLOR[c];
        g.beginPath();
        g.arc(cx, cy, cell * 0.4, 0, Math.PI * 2);
        g.fill();
      }

      // Khung xanh đục lỗ tròn (nửa trong suốt tại các lỗ để thấy quân phía sau)
      g.fillStyle = '#1f4fc4';
      g.beginPath();
      g.rect(0, 0, W, H);
      for (let i = 0; i < COLS * ROWS; i++) {
        const cx = ((i % COLS) + 0.5) * cell;
        const cy = (Math.floor(i / COLS) + 0.5) * cell;
        g.moveTo(cx + cell * 0.4, cy);
        g.arc(cx, cy, cell * 0.4, 0, Math.PI * 2, true);
      }
      g.fill('evenodd');

      // Viền nước vừa đi và hàng thắng (chỉ hiện sau khi quân đã rơi xong)
      if (!animating) {
        const win = new Set(s?.line ?? []);
        for (const i of [...win, s?.last ?? -1]) {
          if (i < 0) continue;
          g.strokeStyle = win.has(i) ? '#7dff7d' : 'rgba(255,255,255,0.7)';
          g.lineWidth = Math.max(2, cell * 0.08);
          g.beginPath();
          g.arc(((i % COLS) + 0.5) * cell, (Math.floor(i / COLS) + 0.5) * cell, cell * 0.4, 0, Math.PI * 2);
          g.stroke();
        }
      }
      if (animating) raf = requestAnimationFrame(draw);
    }

    function refresh() {
      if (!s) return;
      const me = mySide();
      for (const k of ['R', 'Y']) {
        const seat = s.seats[k];
        seatEls[k].label.textContent = seat ? seat.name + (seat.id === ctx.me().id ? ' (bạn)' : '') : '(trống)';
        seatEls[k].btn.style.display = !seat && !me ? '' : 'none';
      }
      standBtn.style.display = me ? '' : 'none';
      newBtn.style.display = me && s.winner ? '' : 'none';
      let text;
      if (s.winner === 'draw') text = 'Hoà!';
      else if (s.winner) text = `${s.seats[s.winner]?.name ?? s.winner} thắng! 🎉`;
      else if (!s.seats.R || !s.seats.Y) text = me ? 'Chờ đối thủ...' : 'Chọn chỗ ngồi để chơi';
      else text = s.seats[s.turn].id === ctx.me().id ? 'Đến lượt bạn!' : `Lượt của ${s.seats[s.turn].name}`;
      status.textContent = text;
      draw();
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (!s || s.winner || mySide() !== s.turn || !s.seats.R || !s.seats.Y) return;
      // offsetX là toạ độ trong chính bàn cờ, đúng cả khi điện thoại cầm dọc (trang bị xoay ngang bằng CSS); clientX là toạ độ màn hình nên lệch cột
      const col = Math.floor(e.offsetX / (canvas.clientWidth / COLS));
      if (col >= 0 && col < COLS) ctx.send({ op: 'drop', col });
    });

    const stopWatch = watchSize(root, layout);
    layout();
    return {
      state(next) {
        const count = (st) => (st ? st.board.split('').filter((c) => c !== '.').length : 0);
        // Có đúng một quân mới so với trạng thái trước thì cho quân đó rơi từ trên xuống
        if (s && next.last >= 0 && count(next) === count(s) + 1) {
          const row = Math.floor(next.last / COLS);
          const fall = FALL_BASE_MS + FALL_PER_ROW_MS * row;
          anim = { idx: next.last, row, start: performance.now(), fall, total: fall + BOUNCE_MS };
        } else {
          anim = null;
        }
        s = next;
        cancelAnimationFrame(raf);
        refresh();
      },
      destroy() {
        cancelAnimationFrame(raf);
        stopWatch();
      },
    };
  },
};
