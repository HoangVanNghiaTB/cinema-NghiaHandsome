import { el } from './util.js';
import { ITEM_PRICES, LOOK_OPTIONS, LOOK_LABELS, itemKey } from '../scene/looks.js';
import { TIP_AMOUNTS, EARN_RULES, SING_COST } from '../economy.js';

// Ví điểm (mở bằng phím P, hoặc nút 💰 cạnh nút ẩn/hiện phím ảo trên điện thoại): tặng điểm cho người khác, mua phụ kiện, xem cách kiếm điểm.
// Không phải game nên không có phòng riêng ở server (local: true); điểm và phụ kiện đã mua lấy từ ctx.wallet().
const TABS = [['tip', 'Tặng điểm'], ['shop', 'Cửa hàng'], ['earn', 'Kiếm điểm']];

export default {
  id: 'wallet',
  title: 'Ví điểm',
  local: true,
  mount(root, ctx) {
    const wrap = el('div', 'g-wallet');
    const head = el('div', 'g-wallet-head');
    const pts = el('b', 'g-wallet-pts');
    const tabs = el('div', 'g-tabs');
    const tabBtns = {};
    let tab = 'tip';
    for (const [id, label] of TABS) {
      const b = el('button', 'g-btn', label);
      b.addEventListener('click', () => {
        tab = id;
        render();
      });
      tabBtns[id] = b;
      tabs.appendChild(b);
    }
    head.append(pts, tabs);
    const body = el('div', 'g-wallet-body');
    wrap.append(head, body);
    root.appendChild(wrap);

    function renderTip(w) {
      body.appendChild(el('div', 'g-dim', 'Tặng điểm cho người khác, ví dụ để khen người đang hát. Điểm bạn tặng sẽ bị trừ khỏi ví của bạn.'));
      const people = ctx.players();
      if (!people.length) body.appendChild(el('div', 'g-dim', 'Chưa có ai khác trong rạp.'));
      for (const p of people) {
        const row = el('div', 'g-wallet-row');
        row.appendChild(el('span', 'g-wallet-name', (p.singing ? '🎤 ' : '') + p.name));
        for (const amt of TIP_AMOUNTS) {
          const b = el('button', 'g-btn', `+${amt}`);
          b.disabled = w.pts < amt;
          b.addEventListener('click', () => ctx.tip(p.id, amt));
          row.appendChild(b);
        }
        body.appendChild(row);
      }
    }

    function renderShop(w) {
      body.appendChild(el('div', 'g-dim', 'Phụ kiện mua một lần là có luôn trong rạp. Mua xong chọn đeo ở menu (Esc) mục "Nhân vật".'));
      const owned = new Set(w.owned);
      for (const slot of Object.keys(ITEM_PRICES)) {
        body.appendChild(el('h4', '', LOOK_LABELS[slot]));
        for (const [id, text] of LOOK_OPTIONS[slot]) {
          if (id === 'none') continue;
          const price = ITEM_PRICES[slot][id];
          const row = el('div', 'g-wallet-row');
          row.appendChild(el('span', 'g-wallet-name', text));
          if (owned.has(itemKey(slot, id))) {
            row.appendChild(el('span', 'g-dim', 'Đã có ✔'));
          } else {
            const b = el('button', 'g-btn', `Mua · ${price}`);
            b.disabled = w.pts < price;
            b.addEventListener('click', () => ctx.buy(slot, id));
            row.appendChild(b);
          }
          body.appendChild(row);
        }
      }
    }

    function renderEarn() {
      body.appendChild(el('div', 'g-dim', `Mọi người vào rạp đều có sẵn điểm. Vào hát karaoke tốn ${SING_COST} điểm mỗi lần.`));
      for (const [game, rule] of EARN_RULES) {
        const row = el('div', 'g-earn-row');
        row.append(el('b', '', game), el('span', '', rule));
        body.appendChild(row);
      }
    }

    function render() {
      const w = ctx.wallet();
      pts.textContent = `💰 ${w.pts} điểm`;
      for (const [id] of TABS) tabBtns[id].classList.toggle('on', id === tab);
      const scroll = body.scrollTop;
      body.replaceChildren();
      if (tab === 'tip') renderTip(w);
      else if (tab === 'shop') renderShop(w);
      else renderEarn();
      body.scrollTop = scroll;
    }

    render();
    const refresh = setInterval(() => {
      if (tab === 'tip') render(); // người ra vào phòng
    }, 2500);
    return {
      onWallet: render,
      destroy() {
        clearInterval(refresh);
      },
    };
  },
};
