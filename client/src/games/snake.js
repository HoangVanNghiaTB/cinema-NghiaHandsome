import { el, onDirKeys, onSwipe, renderTop, watchSize } from './util.js';
import { sfx } from '../audio/sfx.js';

// Rắn săn mồi: chơi một mình ở máy bạn, điểm cao lên bảng kỷ lục chung. Phím mũi tên / WASD, hoặc vuốt trên điện thoại.
const COLS = 20;
const ROWS = 14;
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export default {
  id: 'snake',
  title: 'Rắn săn mồi',
  mount(root, ctx) {
    const wrap = el('div', 'g-split');
    const canvas = el('canvas', 'g-canvas');
    const side = el('div', 'g-side');
    const scoreEl = el('div', 'g-timer', '0');
    const status = el('div', 'g-status', 'Nhấn Space hoặc chạm vào bàn để bắt đầu');
    const startBtn = el('button', 'g-btn', 'Bắt đầu');
    const top = el('div', 'g-list');
    side.append(scoreEl, status, startBtn, top, el('div', 'g-dim', 'Mũi tên / WASD, hoặc vuốt trên màn hình.'));
    wrap.append(canvas, side);
    root.appendChild(wrap);

    let snake, dir, nextDir, food, score, alive = false, timer = null;
    let cell = 20;

    function placeFood() {
      do {
        food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      } while (snake.some((p) => p.x === food.x && p.y === food.y));
    }
    function start() {
      if (alive) return;
      snake = [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }];
      dir = nextDir = 'right';
      score = 0;
      alive = true;
      placeFood();
      scoreEl.textContent = '0';
      sfx.play('go');
      status.textContent = 'Ăn táo, đừng đâm tường!';
      startBtn.style.display = 'none';
      schedule();
      draw();
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(step, Math.max(65, 140 - score * 3));
    }
    function over() {
      alive = false;
      sfx.play('die');
      status.textContent = `Thua rồi! ${score} điểm. Nhấn Space để chơi lại`;
      startBtn.textContent = 'Chơi lại';
      startBtn.style.display = '';
      if (score > 0) ctx.send({ op: 'score', value: score });
    }
    function step() {
      dir = nextDir;
      const [dx, dy] = STEP[dir];
      const head = { x: snake[0].x + dx, y: snake[0].y + dy };
      if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || snake.some((p) => p.x === head.x && p.y === head.y)) {
        over();
        draw();
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score++;
        sfx.play('eat');
        scoreEl.textContent = String(score);
        placeFood();
      } else {
        snake.pop();
      }
      draw();
      schedule();
    }
    function turn(d) {
      if (!alive) return;
      if (d !== OPPOSITE[dir]) nextDir = d;
    }

    function layout() {
      cell = Math.max(8, Math.floor(Math.min((root.clientWidth - 170) / COLS, root.clientHeight / ROWS)));
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.style.width = `${cell * COLS}px`;
      canvas.style.height = `${cell * ROWS}px`;
      canvas.width = cell * COLS * dpr;
      canvas.height = cell * ROWS * dpr;
      draw();
    }
    function draw() {
      const g = canvas.getContext('2d');
      const dpr = canvas.width / (cell * COLS);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#0d1a12';
      g.fillRect(0, 0, cell * COLS, cell * ROWS);
      g.fillStyle = '#12261a';
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if ((x + y) % 2) g.fillRect(x * cell, y * cell, cell, cell);
      if (!snake) return;
      g.font = `${cell * 0.9}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🍎', (food.x + 0.5) * cell, (food.y + 0.55) * cell);
      snake.forEach((p, i) => {
        g.fillStyle = i === 0 ? '#9dff6b' : '#4cc24a';
        g.fillRect(p.x * cell + 1, p.y * cell + 1, cell - 2, cell - 2);
      });
    }

    startBtn.addEventListener('click', start);
    canvas.addEventListener('pointerdown', start);
    onSwipe(root, turn, 18);
    const offKeys = onDirKeys(turn, start);
    const stopWatch = watchSize(root, layout);
    layout();
    return {
      state(s) {
        renderTop(top, s.top);
      },
      destroy() {
        clearTimeout(timer);
        offKeys();
        stopWatch();
      },
    };
  },
};
