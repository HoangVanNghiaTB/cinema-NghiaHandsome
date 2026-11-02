// Điểm của rạp: ai vào phòng cũng có START_POINTS, dùng chung cho mọi game, hát karaoke, tặng nhau và mua phụ kiện.
// File thuần dữ liệu (không dùng DOM / three), server cũng import.

export const START_POINTS = 500;
export const SING_COST = 50; // điểm để vào hát mỗi lần lên sân khấu
export const SING_PROMPT_MS = 15000; // không trả lời trong khoảng này thì tự xuống sân khấu
export const TIP_AMOUNTS = [10, 50, 100]; // mức tặng điểm cho nhau

// Cách kiếm điểm (hiện ở tab "Kiếm điểm" trong ví, và là luật server dùng thật ở server/games.js)
export const EARN_RULES = [
  ['Cờ Caro, Nối 4', 'Thắng một ván (đã đi đủ nước) +40, hoà +10 mỗi người'],
  ['Đập chuột', 'Mỗi 2 điểm trong ván được 1 điểm thưởng (tối đa 30), hạng nhất +15'],
  ['Rắn săn mồi', 'Mỗi 2 điểm được 1 điểm thưởng (tối đa 25 mỗi lần, cách nhau 20 giây)'],
  ['2048', 'Mỗi 150 điểm được 1 điểm thưởng (tối đa 30 mỗi lần, cách nhau 20 giây)'],
  ['Bầu cua, Tài xỉu', 'Cược bằng điểm của bạn, đúng thì ăn, sai thì mất'],
  ['Bình chọn phim', 'Phim bạn đề xuất được chiếu: +5 mỗi phiếu của người khác (tối đa 25); bạn bầu đúng phim được chiếu +2'],
  ['Được tặng', 'Bạn bè tặng điểm cho bạn (ví dụ khi bạn hát hay)'],
];
