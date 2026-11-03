import { mapDelta } from '../ui/viewport.js';
import { sfx } from '../audio/sfx.js';
import { DUEL_STAKES } from '../economy.js';

// Đồ dùng chung của các game treo tường

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Gọi cb khi thành phần đổi cỡ (overlay mở xong, xoay máy...); trả về hàm gỡ
export function watchSize(target, cb) {
  const ro = new ResizeObserver(cb);
  ro.observe(target);
  return () => ro.disconnect();
}

// Vuốt trên `target`: cb('up' | 'down' | 'left' | 'right')
export function onSwipe(target, cb, minDist = 24) {
  let start = null;
  const down = (e) => {
    start = { x: e.clientX, y: e.clientY };
  };
  const up = (e) => {
    if (!start) return;
    // điện thoại cầm dọc thì trang bị xoay 90° bằng CSS, ngón vuốt phải đổi sang toạ độ trang
    const { x: dx, y: dy } = mapDelta(e.clientX - start.x, e.clientY - start.y);
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < minDist) return;
    cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };
  target.addEventListener('pointerdown', down);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', () => (start = null));
  target.style.touchAction = 'none';
}

// Phím mũi tên / WASD -> hướng; trả về hàm gỡ. Chặn cuộn trang khi bấm phím mũi tên / Space
const DIR_KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
export function onDirKeys(cb, onSpace) {
  const handler = (e) => {
    if (DIR_KEYS[e.code]) {
      e.preventDefault();
      cb(DIR_KEYS[e.code]);
    } else if (e.code === 'Space') {
      e.preventDefault();
      onSpace?.();
    }
  };
  addEventListener('keydown', handler);
  return () => removeEventListener('keydown', handler);
}

// Bảng kỷ lục: top = [{ name, score }]
export function renderTop(container, top, title = 'Kỷ lục') {
  container.replaceChildren();
  container.appendChild(el('h4', '', title));
  if (!top?.length) {
    container.appendChild(el('div', 'g-dim', 'Chưa có'));
    return;
  }
  top.forEach((t, i) => {
    const row = el('div', 'g-top');
    row.append(el('span', '', `${i + 1}. ${t.name}`), el('b', '', String(t.score)));
    container.appendChild(row);
  });
}

// Khung cược của bàn hai người (Cờ Caro, Nối 4): hiện mức cược, và người ngồi một mình thì chọn được mức khác.
// Gọi update(state, canChange) mỗi khi có trạng thái mới; trả về { node, update }.
export function createStakeBar(ctx) {
  const node = el('div', 'g-stakebar');
  const info = el('div', 'g-dim');
  const row = el('div', '');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:4px 0';
  const buttons = DUEL_STAKES.map((n) => {
    const b = el('button', 'g-btn', String(n));
    b.addEventListener('click', () => ctx.send({ op: 'stake', amount: n }));
    row.appendChild(b);
    return [n, b];
  });
  node.append(info, row);
  return {
    node,
    update(s, canChange) {
      info.textContent = s.pot > 0 ? `Đang cược ${s.stake} điểm mỗi người · người thắng ăn ${s.pot}` : `Cược ${s.stake} điểm mỗi người · người thắng ăn ${s.stake * 2}`;
      row.style.display = canChange ? 'flex' : 'none';
      for (const [n, b] of buttons) b.style.outline = n === s.stake ? '2px solid #ffd36b' : '';
    },
  };
}

// Tiếng cho game đấu 2 người (Caro, Nối 4) mỗi khi server gửi trạng thái mới:
// có quân mới -> tiếng quân; tới lượt mình -> ting; ván xong -> thắng / thua / hoà (người xem chỉ nghe tiếng quân).
//   mine: 'X'/'O'/'R'/'Y' hoặc null; onMove(): phát tiếng quân; delay: ms chờ quân rơi xong mới phát tiếng kết quả
export function duelSfx(prev, next, mine, onMove, delay = 0) {
  if (!prev) return;
  const count = (st) => st.board.split('').filter((c) => c !== '.').length;
  const moved = count(next) === count(prev) + 1;
  if (moved) onMove();
  const later = (name) => setTimeout(() => sfx.play(name), delay);
  if (!prev.winner && next.winner) {
    if (mine) later(next.winner === 'draw' ? 'draw' : next.winner === mine ? 'win' : 'lose');
  } else if (moved && !next.winner && mine && next.turn === mine) {
    later('turn');
  }
}

// Pháo giấy bắn từ giữa khung lên trên rồi rơi xuống mờ dần (vẽ trên một canvas phủ lên `root`, tự gỡ khi xong).
// Trả về hàm dừng sớm (dùng khi đóng game).
export function confettiBurst(root, count = 110) {
  const w = root.clientWidth || 300;
  const h = root.clientHeight || 300;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5';
  c.width = Math.floor(w * dpr);
  c.height = Math.floor(h * dpr);
  root.appendChild(c);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const COLORS = ['#ff4d4d', '#ffd24d', '#4dd2ff', '#7dff7d', '#ff7de9', '#ffffff', '#ffa94d'];
  const parts = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5; // hướng lên, toả ra hai bên
    const sp = h * (0.7 + Math.random() * 1.1); // px/giây
    return {
      x: w / 2, y: h * 0.55, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14,
      size: 5 + Math.random() * 6, color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });
  const TOTAL = 3;
  const start = performance.now();
  let last = start;
  let raf = 0;
  const stop = () => {
    cancelAnimationFrame(raf);
    c.remove();
  };
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - start) / 1000;
    if (t > TOTAL) return stop();
    g.clearRect(0, 0, w, h);
    g.globalAlpha = t > TOTAL - 0.8 ? Math.max(0, (TOTAL - t) / 0.8) : 1;
    for (const p of parts) {
      p.vy += h * 1.5 * dt; // trọng lực
      p.vx *= 0.995;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      g.restore();
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return stop;
}
