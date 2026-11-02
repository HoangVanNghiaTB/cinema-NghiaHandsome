// Điểm của rạp: ai vào phòng cũng có START_POINTS, dùng chung cho mọi game, hát karaoke, tặng nhau và mua phụ kiện.
// File thuần dữ liệu (không dùng DOM / three), server cũng import.

export const START_POINTS = 500;
export const SING_COST = 50; // điểm để vào hát mỗi lần lên sân khấu
export const SING_PROMPT_MS = 15000; // không trả lời trong khoảng này thì tự xuống sân khấu
export const TIP_AMOUNTS = [10, 50, 100]; // mức tặng điểm cho nhau

export const DUEL_STAKES = [10, 20, 50, 100, 200]; // mức cược mỗi người ở game hai người (Cờ Caro, Nối 4)
export const DUEL_STAKE_DEFAULT = 20;

// Nhặt rác: cứ TRASH_EVERY_MS server thả một món rác ở chỗ ngẫu nhiên trong rạp (phòng có người), tối đa TRASH_MAX món cùng lúc
// (đầy thì món cũ nhất biến mất). Ai đi tới gần nhặt trước thì được điểm, rác biến mất luôn, không lưu gì.
// weight: tỉ lệ xuất hiện (càng hiếm điểm càng cao), color: màu hiện trong rạp.
export const TRASH_EVERY_MS = 30000;
export const TRASH_MAX = 6;
export const TRASH_PICK_RANGE = 1.1; // m, đi tới gần chừng này là tự nhặt
export const TRASH_TIERS = [
  { pts: 10, weight: 45, color: 0xcfd8dc },
  { pts: 20, weight: 27, color: 0x66bb6a },
  { pts: 30, weight: 15, color: 0x42a5f5 },
  { pts: 40, weight: 9, color: 0xab47bc },
  { pts: 50, weight: 4, color: 0xffca28 },
];
// Vùng thả rác (nhỏ hơn ROOM ở scene/cinema.js một chút để khỏi sát tường)
export const TRASH_AREA = { minX: -9.2, maxX: 9.2, minZ: -9.5, maxZ: 6.2 };

// Cách kiếm điểm (hiện ở tab "Kiếm điểm" trong ví, và là luật server dùng thật ở server/games.js)
export const EARN_RULES = [
  ['Cờ Caro, Nối 4', 'Hai người cược bằng điểm (mức do người ngồi trước chọn): thắng ăn cả hai phần cược, hoà thì hoàn lại, bỏ giữa chừng là thua'],
  ['Đập chuột', 'Mỗi 2 điểm trong ván được 1 điểm thưởng (tối đa 30), hạng nhất +15'],
  ['Rắn săn mồi', 'Mỗi 2 điểm được 1 điểm thưởng (tối đa 25 mỗi lần, cách nhau 20 giây)'],
  ['2048', 'Mỗi 150 điểm được 1 điểm thưởng (tối đa 30 mỗi lần, cách nhau 20 giây)'],
  ['Bầu cua, Tài xỉu', 'Cược bằng điểm của bạn, đúng thì ăn, sai thì mất'],
  ['Bình chọn phim', 'Phim bạn đề xuất được chiếu: +5 mỗi phiếu của người khác (tối đa 25); bạn bầu đúng phim được chiếu +2'],
  ['Nhặt rác', 'Cứ 30 giây rạp có rác mới (hiện sáng trên sàn), đi tới gần là nhặt: +10 đến +50 điểm, rác càng quý càng hiếm'],
  ['Được tặng', 'Bạn bè tặng điểm cho bạn (ví dụ khi bạn hát hay)'],
];
