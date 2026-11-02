// Ví điểm của rạp. Mỗi người chơi có một tài khoản (khoá bằng clientId lưu ở trình duyệt, nên tải lại trang không được
// phát lại 500 điểm), gồm số điểm và các phụ kiện đã mua. Dữ liệu chỉ nằm trong bộ nhớ, xoá khi phòng trống lâu (index.js).
import { ITEM_PRICES, LOOK_OPTIONS, itemKey } from '../client/src/scene/looks.js';

// startPts: hàm trả số điểm tặng người mới vào (admin chỉnh được lúc đang chạy), chỉ áp cho tài khoản tạo sau đó
export function createWallet(io, players, startPts) {
  let accounts = new Map(); // cid -> { pts, owned: Set<itemKey> }
  const account = (cid) => {
    let a = accounts.get(cid);
    if (!a) accounts.set(cid, (a = { pts: startPts(), owned: new Set() }));
    return a;
  };
  const snapshot = (cid) => {
    const a = account(cid);
    return { pts: a.pts, owned: [...a.owned] };
  };

  // Báo số điểm mới cho mọi kết nối của tài khoản; có `reason` thì client hiện thông báo nhỏ (delta = điểm cộng/trừ)
  function notify(cid, delta = 0, reason = '') {
    const msg = { ...snapshot(cid), delta, reason };
    for (const p of players.values()) if (p.cid === cid) io.to(p.id).emit('wallet', msg);
  }

  return {
    snapshot,
    pts: (cid) => account(cid).pts,
    ownedSet: (cid) => account(cid).owned,
    notify,
    // Trừ điểm nếu đủ; trả về true/false. Có `reason` thì báo cho người chơi.
    pay(cid, amt, reason) {
      const a = account(cid);
      if (!Number.isInteger(amt) || amt <= 0 || a.pts < amt) return false;
      a.pts -= amt;
      notify(cid, reason ? -amt : 0, reason);
      return true;
    },
    add(cid, amt, reason) {
      if (!Number.isInteger(amt) || amt <= 0) return;
      account(cid).pts += amt;
      notify(cid, reason ? amt : 0, reason);
    },
    // Mua phụ kiện: trả về chuỗi lỗi hoặc null nếu thành công
    buy(cid, slot, item) {
      const price = Object.hasOwn(ITEM_PRICES, slot) && Object.hasOwn(ITEM_PRICES[slot], item) ? ITEM_PRICES[slot][item] : 0;
      if (!price) return 'Món này không có bán.';
      const key = itemKey(slot, item);
      const a = account(cid);
      if (a.owned.has(key)) return 'Bạn đã có món này rồi.';
      if (a.pts < price) return `Cần ${price} điểm để mua.`;
      a.pts -= price;
      a.owned.add(key);
      const label = LOOK_OPTIONS[slot].find(([id]) => id === item)?.[1] ?? item;
      notify(cid, -price, `Mua ${label}`);
      return null;
    },
    // Admin: đặt thẳng số điểm (không âm)
    setPts(cid, n, reason) {
      const a = account(cid);
      const before = a.pts;
      a.pts = Math.max(0, Math.floor(n));
      notify(cid, reason ? a.pts - before : 0, reason);
    },
    reset() {
      accounts = new Map();
    },
  };
}
