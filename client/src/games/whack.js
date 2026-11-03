import { el, renderTop, watchSize } from './util.js';
import { sfx } from '../audio/sfx.js';

// Đập chuột đua nhau: mỗi ván 30 giây, chuột nào ai ấn trước người đó ăn điểm. 🐹 +1, 🌟 +3, 💣 -2 (xem server/games.js)
const MOLE_ICON = { n: '🐹', g: '🌟', b: '💣' };

export default {
  id: 'whack',
  title: 'Đập chuột',
  mount(root, ctx) {
    const wrap = el('div', 'g-split');
    sfx.preload(['bonk']);
    const grid = el('div', 'g-whack');
    const holes = [];
    for (let i = 0; i < 9; i++) {
      const h = el('button', 'g-hole');
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const id = Number(h.dataset.mole);
        if (!id) {
          if (s?.phase === 'playing') sfx.play('miss'); // đập vào ô trống
          return;
        }
        sfx.play(h.dataset.kind === 'g' ? 'gold' : h.dataset.kind === 'b' ? 'bomb' : 'bonk');
        h.dataset.mole = '';
        h.textContent = '';
        ctx.send({ op: 'hit', id });
      });
      holes.push(h);
      grid.appendChild(h);
    }
    const side = el('div', 'g-side');
    const timer = el('div', 'g-timer', '30');
    const status = el('div', 'g-status');
    const startBtn = el('button', 'g-btn', 'Bắt đầu ván');
    startBtn.addEventListener('click', () => ctx.send({ op: 'start' }));
    const rank = el('div', 'g-list');
    const records = el('div', 'g-list');
    side.append(timer, status, startBtn, rank, records, el('div', 'g-dim', '🐹 +1 · 🌟 +3 · 💣 -2'));
    wrap.append(grid, side);
    root.appendChild(wrap);

    let s = null;
    let receivedAt = 0;

    function layout() {
      const size = Math.max(150, Math.min(root.clientHeight, root.clientWidth - 170));
      grid.style.width = grid.style.height = `${size}px`;
      grid.style.fontSize = `${size / 6}px`;
    }
    const secsLeft = () => (s?.phase === 'playing' ? Math.max(0, Math.ceil((s.msLeft - (performance.now() - receivedAt)) / 1000)) : 0);
    let lastSecond = -1;
    const tickTimer = setInterval(() => {
      const left = s?.phase === 'playing' ? secsLeft() : 30;
      timer.textContent = String(left);
      // 5 giây cuối mỗi giây một tiếng tích
      if (s?.phase === 'playing' && left <= 5 && left > 0 && left !== lastSecond) sfx.play('tick');
      lastSecond = left;
    }, 200);

    function refresh() {
      const moleAt = new Map(s.moles.map((m) => [m.hole, m]));
      holes.forEach((h, i) => {
        const m = moleAt.get(i);
        h.dataset.mole = m ? m.id : '';
        h.dataset.kind = m ? m.kind : '';
        h.textContent = m ? MOLE_ICON[m.kind] : '';
        h.classList.toggle('gold', m?.kind === 'g');
      });
      const playing = s.phase === 'playing';
      startBtn.style.display = playing ? 'none' : '';
      startBtn.textContent = s.phase === 'result' ? 'Chơi lại' : 'Bắt đầu ván';
      timer.textContent = String(playing ? secsLeft() : 30);
      status.textContent = playing ? 'Đập nhanh lên!' : s.winner ? `${s.winner.name} thắng: ${s.winner.score} điểm 🎉` : s.phase === 'result' ? 'Hết ván!' : 'Cả phòng cùng đua';
      rank.replaceChildren(el('h4', '', 'Điểm ván này'));
      if (!s.ranking.length) rank.appendChild(el('div', 'g-dim', 'Chưa ai ghi điểm'));
      for (const r of s.ranking) {
        const row = el('div', r.id === ctx.me().id ? 'g-top me' : 'g-top');
        row.append(el('span', '', r.name), el('b', '', String(r.score)));
        rank.appendChild(row);
      }
      renderTop(records, s.records, 'Kỷ lục (từ lúc mở rạp)');
    }

    const stopWatch = watchSize(root, layout);
    layout();
    return {
      state(next) {
        // bắt đầu ván -> tiếng go; hết ván -> chuông, và fanfare nếu mình thắng
        if (s && s.phase !== 'playing' && next.phase === 'playing') sfx.play('go');
        if (s && s.phase === 'playing' && next.phase === 'result') {
          sfx.play('bell');
          if (next.winner?.id === ctx.me().id) setTimeout(() => sfx.play('win'), 500);
        }
        s = next;
        receivedAt = performance.now();
        refresh();
      },
      destroy() {
        stopWatch();
        clearInterval(tickTimer);
      },
    };
  },
};
