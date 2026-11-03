import { el } from './util.js';
import { sfx } from '../audio/sfx.js';

// Bảng chỉnh âm thanh (phím O, nút 🔊 trên điện thoại, hoặc nút trong menu): chỉ chỉnh to nhỏ trên máy của chính mình.
// Giọng đọc quản trò Ma Sói không có thanh ở đây: luôn to hết cỡ, muốn nhỏ thì hạ âm lượng máy.
// Không phải game nên không có phòng riêng ở server (local: true); giá trị đọc / ghi qua ctx.sound (xem main.js).
const ROWS = [
  { key: 'effects', label: 'Hiệu ứng', note: 'Bước chân, tát, vỗ tay và âm thanh trong các game (Caro, Nối 4, Ma Sói...)' },
  { key: 'video', label: 'Video', note: 'Âm lượng video đang chiếu trong rạp' },
  { key: 'voice', label: 'Giọng người trong rạp', note: 'Nghe người khác nói to bao nhiêu so với mức thiết kế' },
];

export default {
  id: 'sound',
  title: 'Âm thanh',
  local: true,
  mount(root, ctx) {
    const wrap = el('div', 'g-wallet');
    const body = el('div', 'g-wallet-body');
    const inputs = {};
    const labels = {};
    const sound = ctx.sound;
    const cur = sound.get();
    for (const row of ROWS) {
      const box = el('div', 'g-vol');
      const val = el('b', '', `${cur[row.key]}%`);
      const input = el('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(sound.max[row.key]);
      input.value = String(cur[row.key]);
      input.addEventListener('input', () => {
        sound.set(row.key, Number(input.value));
        val.textContent = `${input.value}%`;
      });
      // thả thanh Hiệu ứng thì kêu thử một tiếng để biết to nhỏ
      if (row.key === 'effects') input.addEventListener('change', () => sfx.play('coin'));
      inputs[row.key] = input;
      labels[row.key] = val;
      box.append(el('span', '', row.label), val, input, el('small', '', row.note));
      body.appendChild(box);
    }
    const reset = el('button', 'g-btn', 'Về mặc định');
    reset.addEventListener('click', () => {
      for (const row of ROWS) {
        const v = sound.defaults[row.key];
        sound.set(row.key, v);
        inputs[row.key].value = String(v);
        labels[row.key].textContent = `${v}%`;
      }
    });
    body.append(reset, el('div', 'g-dim', 'Giọng đọc quản trò Ma Sói luôn to hết cỡ, không chỉnh ở đây. Muốn nhỏ hơn thì hạ âm lượng của máy (điện thoại, loa, tai nghe). Trong bàn Ma Sói có nút 🔊 để bật hoặc tắt hẳn giọng đọc.'));
    wrap.appendChild(body);
    root.appendChild(wrap);
    return {};
  },
};
