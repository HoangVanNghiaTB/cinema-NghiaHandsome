// Rác rơi trong rạp. Cứ settings.everyMs (khi phòng có người) thả một món ở chỗ ngẫu nhiên; ai nhặt trước được điểm theo loại,
// món đó biến mất luôn. Chỉ nằm trong bộ nhớ (tối đa settings.max món), phòng trống thì xoá hết.
import { TRASH_TIERS, TRASH_AREA } from '../client/src/economy.js';

const PICK_RANGE = 2.2; // m, server nới hơn client (TRASH_PICK_RANGE) để đỡ lệch do trễ mạng
// Dãy ghế (không đi vào giữa được): hàng ở z = 0, 2, 4; hai cột x ∈ [0.5, 3.5] và đối xứng. Khớp scene/cinema.js
const SEAT_ROW_ZS = [0, 2, 4];
const inSeatBlock = (x, z) => Math.abs(x) >= 0.5 && Math.abs(x) <= 3.5 && SEAT_ROW_ZS.some((zc) => z >= zc - 0.4 && z <= zc + 0.45);

const round1 = (v) => Math.round(v * 10) / 10;

// settings: { enabled, everyMs, max } dùng chung các phòng, admin chỉnh được lúc đang chạy (server/admin.js)
export function createTrash(nsp, players, wallet, settings) {
  let items = []; // { id, x, z, pts }
  let nextId = 1;

  const pickTier = () => {
    let r = Math.random() * TRASH_TIERS.reduce((s, t) => s + t.weight, 0);
    for (const t of TRASH_TIERS) if ((r -= t.weight) < 0) return t.pts;
    return TRASH_TIERS[0].pts;
  };

  let lastSpawnAt = Date.now();
  function spawn() {
    lastSpawnAt = Date.now();
    let x, z;
    do {
      x = round1(TRASH_AREA.minX + Math.random() * (TRASH_AREA.maxX - TRASH_AREA.minX));
      z = round1(TRASH_AREA.minZ + Math.random() * (TRASH_AREA.maxZ - TRASH_AREA.minZ));
    } while (inSeatBlock(x, z));
    const item = { id: nextId++, x, z, pts: pickTier() };
    items.push(item);
    nsp.emit('trash-add', item);
    while (items.length > settings.max) nsp.emit('trash-gone', items.shift().id); // đầy thì món cũ nhất biến mất
  }
  // Mỗi giây xem đã tới lúc thả chưa (đọc settings mỗi lần nên admin đổi chu kỳ có hiệu lực ngay)
  setInterval(() => {
    if (settings.enabled && players.size > 0 && Date.now() - lastSpawnAt >= settings.everyMs) spawn();
  }, 1000).unref();

  return {
    list: () => items,
    spawn,
    // Xoá hết rác trong phòng (cả phía client)
    clear() {
      for (const t of items) nsp.emit('trash-gone', t.id);
      items = [];
    },
    pick(p, id) {
      const i = items.findIndex((t) => t.id === id);
      if (i < 0) return;
      const t = items[i];
      if (Math.hypot(p.x - t.x, p.z - t.z) > PICK_RANGE) return;
      items.splice(i, 1);
      nsp.emit('trash-gone', t.id);
      wallet.add(p.cid, t.pts, 'Nhặt rác');
    },
  };
}
