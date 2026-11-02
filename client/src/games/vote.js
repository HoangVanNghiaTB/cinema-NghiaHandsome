import { parseVideoId } from '../player/youtube.js';
import { el } from './util.js';

// Bình chọn phim tiếp theo: dán link YouTube để đề xuất, bấm "Bầu" cho phim muốn xem (mỗi người một phiếu, bấm lại để bỏ).
// "Chiếu" chiếu ngay video đó cho cả rạp. Tiêu đề lấy qua noembed.com (không lấy được thì hiện mã video).
async function fetchTitle(videoId) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`, { signal: ctl.signal });
    clearTimeout(timer);
    const data = await res.json();
    return typeof data.title === 'string' ? data.title : '';
  } catch {
    return '';
  }
}

export default {
  id: 'vote',
  title: 'Bình chọn phim tiếp theo',
  mount(root, ctx) {
    const wrap = el('div', 'g-vote');
    const bar = el('div', 'g-vote-bar');
    const input = el('input');
    input.type = 'text';
    input.placeholder = 'Dán link YouTube để đề xuất...';
    const addBtn = el('button', 'g-btn', 'Thêm');
    const note = el('div', 'g-dim');
    bar.append(input, addBtn);
    const list = el('div', 'g-vote-list');
    wrap.append(bar, note, list);
    root.appendChild(wrap);

    let s = null;
    async function add() {
      const videoId = parseVideoId(input.value);
      if (!videoId) {
        note.textContent = 'Link không đúng, hãy dán link YouTube.';
        return;
      }
      addBtn.disabled = true;
      note.textContent = 'Đang thêm...';
      const title = await fetchTitle(videoId);
      ctx.send({ op: 'add', videoId, title });
      input.value = '';
      addBtn.disabled = false;
      note.textContent = 'Mỗi người đề xuất tối đa 3 phim, cả danh sách tối đa 10 phim.';
    }
    addBtn.addEventListener('click', add);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') add();
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    note.textContent = 'Mỗi người đề xuất tối đa 3 phim, cả danh sách tối đa 10 phim.';

    function refresh() {
      const me = ctx.me().id;
      const mine = s.votes[me];
      list.replaceChildren();
      if (!s.options.length) list.appendChild(el('div', 'g-dim', 'Chưa có phim nào. Dán link YouTube ở trên để đề xuất.'));
      s.options.forEach((o, i) => {
        const row = el('div', i === 0 && o.votes > 0 ? 'g-vote-row lead' : 'g-vote-row');
        const img = el('img');
        img.src = `https://i.ytimg.com/vi/${o.videoId}/mqdefault.jpg`;
        img.alt = '';
        img.loading = 'lazy';
        const info = el('div', 'g-vote-info');
        info.append(el('div', 'g-vote-title', o.title), el('div', 'g-dim', `Đề xuất: ${o.by}`));
        const count = el('b', 'g-vote-count', `${o.votes} 👍`);
        const voteBtn = el('button', mine === o.id ? 'g-btn on' : 'g-btn', mine === o.id ? 'Đã bầu' : 'Bầu');
        voteBtn.addEventListener('click', () => ctx.send({ op: 'vote', id: o.id }));
        const playBtn = el('button', 'g-btn', '▶ Chiếu');
        playBtn.addEventListener('click', () => {
          ctx.playVideo(o.videoId);
          ctx.send({ op: 'played', id: o.id });
          ctx.close();
        });
        row.append(img, info, count, voteBtn, playBtn);
        if (o.byId === me) {
          const del = el('button', 'g-btn', '✕');
          del.title = 'Xoá đề xuất của bạn';
          del.addEventListener('click', () => ctx.send({ op: 'remove', id: o.id }));
          row.appendChild(del);
        }
        list.appendChild(row);
      });
    }

    return {
      state(next) {
        s = next;
        refresh();
      },
      destroy() {},
    };
  },
};
