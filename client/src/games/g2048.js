import { el, onDirKeys, onSwipe, renderTop, watchSize } from './util.js';

// 2048: chơi một mình, điểm lên bảng kỷ lục chung. Mũi tên / WASD hoặc vuốt.
const N = 4;
const COLORS = {
  0: '#2a2f3a', 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b',
  128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e',
};

// Các dãy ô theo hướng vuốt, mỗi dãy xếp từ phía ô sẽ dồn về
function lines(dir) {
  const out = [];
  for (let a = 0; a < N; a++) {
    const line = [];
    for (let b = 0; b < N; b++) {
      if (dir === 'left') line.push(a * N + b);
      else if (dir === 'right') line.push(a * N + (N - 1 - b));
      else if (dir === 'up') line.push(b * N + a);
      else line.push((N - 1 - b) * N + a);
    }
    out.push(line);
  }
  return out;
}

export default {
  id: 'g2048',
  title: '2048',
  mount(root, ctx) {
    const wrap = el('div', 'g-split');
    const board = el('div', 'g-2048');
    const tiles = Array.from({ length: N * N }, () => board.appendChild(el('div', 'g-tile')));
    const side = el('div', 'g-side');
    const scoreEl = el('div', 'g-timer', '0');
    const status = el('div', 'g-status', 'Dồn các số giống nhau để lên 2048');
    const newBtn = el('button', 'g-btn', 'Ván mới');
    const top = el('div', 'g-list');
    side.append(scoreEl, status, newBtn, top, el('div', 'g-dim', 'Mũi tên / WASD, hoặc vuốt.'));
    wrap.append(board, side);
    root.appendChild(wrap);

    let cells, score, over;
    let sent = true; // ván hiện tại đã gửi điểm chưa
    function submit() {
      if (!sent && score > 0) ctx.send({ op: 'score', value: score });
      sent = true;
    }
    function spawn() {
      const free = cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
      if (!free.length) return;
      cells[free[Math.floor(Math.random() * free.length)]] = Math.random() < 0.9 ? 2 : 4;
    }
    function reset() {
      submit();
      cells = Array(N * N).fill(0);
      score = 0;
      over = false;
      sent = false;
      spawn();
      spawn();
      render();
    }
    function canMove() {
      return ['left', 'right', 'up', 'down'].some((d) => slide(d, false));
    }
    // Dồn các ô theo hướng d; apply = false thì chỉ kiểm tra có đi được không
    function slide(d, apply = true) {
      let moved = false;
      let gained = 0;
      const next = cells.slice();
      for (const line of lines(d)) {
        const vals = line.map((i) => cells[i]).filter(Boolean);
        const merged = [];
        for (let k = 0; k < vals.length; k++) {
          if (vals[k] === vals[k + 1]) {
            merged.push(vals[k] * 2);
            gained += vals[k] * 2;
            k++;
          } else {
            merged.push(vals[k]);
          }
        }
        line.forEach((idx, k) => {
          const v = merged[k] ?? 0;
          if (next[idx] !== v) moved = true;
          next[idx] = v;
        });
      }
      if (moved && apply) {
        cells = next;
        score += gained;
      }
      return moved;
    }
    function move(d) {
      if (over || !slide(d)) return;
      spawn();
      if (!canMove()) {
        over = true;
        status.textContent = `Hết nước đi! ${score} điểm`;
        submit();
      }
      render();
    }
    function render() {
      scoreEl.textContent = String(score);
      tiles.forEach((t, i) => {
        const v = cells[i];
        t.textContent = v || '';
        t.style.background = COLORS[v] ?? '#3c3a32';
        t.style.color = v <= 4 ? '#776e65' : '#fff';
        t.style.fontSize = v >= 1024 ? '0.5em' : v >= 128 ? '0.65em' : '0.85em';
      });
    }
    function layout() {
      const size = Math.max(150, Math.min(root.clientHeight, root.clientWidth - 170));
      board.style.width = board.style.height = `${size}px`;
      board.style.fontSize = `${size / 6}px`;
    }

    newBtn.addEventListener('click', () => {
      status.textContent = 'Dồn các số giống nhau để lên 2048';
      reset();
    });
    onSwipe(root, move, 18);
    const offKeys = onDirKeys(move);
    const stopWatch = watchSize(root, layout);
    layout();
    reset();
    return {
      state(s) {
        renderTop(top, s.top);
      },
      destroy() {
        submit();
        offKeys();
        stopWatch();
      },
    };
  },
};
