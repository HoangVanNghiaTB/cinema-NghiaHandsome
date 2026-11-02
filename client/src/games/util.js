import { mapDelta } from '../ui/viewport.js';

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
