// Giọng quản trò Ma Sói ban đêm: các file thu sẵn trong client/public/gm/ (xem KICH_BAN_QUAN_TRO.md), thứ tự gọi các vai và
// thời gian chờ mỗi vai. File thuần dữ liệu (không dùng DOM), cả server (đếm giờ) và client (phát tiếng) cùng đọc.
//
// Mỗi đêm quản trò chỉ gọi các vai CÓ TRONG VÁN này (theo bài đã chia lúc đầu), theo thứ tự cố định. Vai đã chia mà người giữ
// đã chết vẫn được gọi và chờ đúng idleSec giây (mặc định 10, để người ngoài không biết vai đó đã chết). Đổi lại, nghe lời gọi là biết ván có
// những vai nào. Server chỉ mở khung thao tác cho người đang sống giữ vai đó; khi mọi người của vai đã chọn xong thì sang vai kế tiếp.

export const GM_DIR = '/gm/';
export const clipUrl = (key) => `${GM_DIR}gm_${key}.mp3`;

// Độ dài (ms) của từng file, đo từ file thật; server dùng để biết khi nào lời gọi đọc xong
export const CLIP_MS = {
  night_start: 2500, dawn: 1900, vote_start: 2500,
  cupid_wake: 3000, cupid_sleep: 1500,
  traitor_wake: 2900, traitor_sleep: 1800,
  wolf_wake: 2900, wolf_wake_short: 1200, wolf_sleep: 1600,
  alpha_wake: 4100, alpha_sleep: 1800,
  whitewolf_wake: 3600, whitewolf_sleep: 1600,
  seer_wake: 2900, seer_sleep: 1400,
  guard_wake: 3100, guard_sleep: 1300,
  witch_wake: 4300, witch_poison: 1900, witch_sleep: 1300,
  psychic_wake: 3600,
  // psychic_sleep: chưa thu, thiếu file thì bỏ qua (game vẫn chạy, chỉ không có tiếng)
};

// Lời của quản trò dưới dạng chữ (hiện làm ghi chú ở giữa bàn cùng lúc phát giọng; ai tắt giọng đọc vẫn đọc được). Khớp KICH_BAN_QUAN_TRO.md.
export const CLIP_TEXT = {
  night_start: 'Trời tối rồi, mọi người nhắm mắt lại.',
  dawn: 'Trời sáng rồi, mọi người mở mắt.',
  vote_start: 'Hết giờ thảo luận. Mời mọi người bỏ phiếu.',
  cupid_wake: 'Thần Tình Yêu thức dậy. Hãy chọn hai người thành đôi.',
  cupid_sleep: 'Thần Tình Yêu nhắm mắt lại.',
  traitor_wake: 'Kẻ Phản Bội thức dậy. Hãy nhận ra bầy Sói.',
  traitor_sleep: 'Kẻ Phản Bội nhắm mắt lại.',
  guard_wake: 'Bảo Vệ thức dậy. Hãy chọn một người để bảo vệ.',
  guard_sleep: 'Bảo Vệ nhắm mắt lại.',
  wolf_wake: 'Ma Sói thức dậy. Hãy chọn một người để cắn.',
  wolf_sleep: 'Ma Sói nhắm mắt lại.',
  alpha_wake: 'Sói Đầu Đàn thức dậy. Bạn có muốn biến người bị cắn thành Sói không?',
  alpha_sleep: 'Sói Đầu Đàn nhắm mắt lại.',
  whitewolf_wake: 'Sói Trắng thức dậy. Bạn có muốn giết một Sói khác không?',
  whitewolf_sleep: 'Sói Trắng nhắm mắt lại.',
  seer_wake: 'Tiên Tri thức dậy. Hãy chọn một người để soi.',
  seer_sleep: 'Tiên Tri nhắm mắt lại.',
  witch_wake: 'Phù Thủy thức dậy. Đêm nay người này sẽ chết. Bạn có muốn cứu không?',
  witch_poison: 'Phù Thủy, bạn có muốn dùng bình độc với ai không?',
  witch_sleep: 'Phù Thủy nhắm mắt lại.',
  psychic_wake: 'Nhà Ngoại Cảm thức dậy. Hãy chọn hai người để so sánh.',
  psychic_sleep: 'Nhà Ngoại Cảm nhắm mắt lại.',
};

// Thứ tự gọi và việc của từng vai. windowMs = thời gian tối đa vai đó được thao tác sau lời gọi (chọn xong sớm thì sang vai kế tiếp).
// Thứ tự có lý do:
//  - Thần Tình Yêu và Kẻ Phản Bội chỉ đêm đầu: ghép đôi, nhận ra bầy Sói trước khi có ai bị cắn.
//  - Bảo Vệ gọi TRƯỚC bầy Sói: Sói Đầu Đàn chỉ biến được người bị cắn nếu Bảo Vệ không che người đó, nên phải biết Bảo Vệ che ai trước.
//  - Ma Sói chọn nạn nhân; Sói Đầu Đàn và Sói Trắng gọi SAU để biết nạn nhân (biến thành Sói / giết thêm một Sói).
//  - Tiên Tri và Nhà Ngoại Cảm không phụ thuộc ai.
//  - Phù Thủy gọi gần cuối: chỉ khi đó mới biết ai thật sự sắp chết (đã trừ người được Bảo Vệ che và người bị biến thành Sói).
export const NIGHT_ORDER = [
  { role: 'cupid', wake: 'cupid_wake', sleep: 'cupid_sleep', windowMs: 10000, when: (night) => night === 1 },
  { role: 'traitor', wake: 'traitor_wake', sleep: 'traitor_sleep', windowMs: 4000, when: (night) => night === 1 },
  { role: 'guard', wake: 'guard_wake', sleep: 'guard_sleep', windowMs: 8000 },
  { role: 'wolf', wake: 'wolf_wake', sleep: 'wolf_sleep', windowMs: 20000 },
  { role: 'alpha', wake: 'alpha_wake', sleep: 'alpha_sleep', windowMs: 8000 },
  { role: 'whitewolf', wake: 'whitewolf_wake', sleep: 'whitewolf_sleep', windowMs: 8000, when: (night) => night % 2 === 0 },
  { role: 'seer', wake: 'seer_wake', sleep: 'seer_sleep', windowMs: 8000 },
  // Phù Thủy hai việc liền nhau: hỏi cứu (wake), rồi hỏi bình độc (poison); mỗi việc một khoảng chờ riêng
  { role: 'witch', wake: 'witch_wake', sleep: 'witch_sleep', windowMs: 10000, then: { clip: 'witch_poison', windowMs: 8000 } },
  { role: 'psychic', wake: 'psychic_wake', sleep: 'psychic_sleep', windowMs: 10000 },
];

// Các lá bài (id vai ở roles.js) mà mỗi lời gọi đại diện; ván không có lá nào trong danh sách thì bỏ qua lời gọi đó.
// Bầy Sói (wolf) gọi chung cho Ma Sói, Sói Con, Sói Đầu Đàn và Sói Trắng.
export const CALL_CARDS = {
  cupid: ['tinh_yeu'],
  traitor: ['phan_boi'],
  wolf: ['ma_soi', 'soi_con', 'soi_dau_dan', 'soi_trang'],
  alpha: ['soi_dau_dan'],
  whitewolf: ['soi_trang'],
  seer: ['tien_tri'],
  guard: ['bao_ve'],
  witch: ['phu_thuy'],
  psychic: ['ngoai_cam'],
};

export const START_PAUSE_MS = 1500; // sau "Trời tối rồi" cho mọi người kịp nhắm mắt
export const GAP_MS = 800; // nghỉ giữa hai vai
export const END_PAUSE_MS = 1000; // sau vai cuối trước "Trời sáng rồi"

// Các bước của đêm thứ `night` (tính từ 1), theo thứ tự gọi, chỉ gồm vai có trong ván (`dealt` = tập id vai đã chia; không truyền thì gọi hết).
// Server chạy từng bước: phát lời gọi, mở khoảng thao tác (tối đa windowMs, xong sớm nếu mọi người của vai đó đã chọn), phát lời nhắm mắt.
export function nightSteps(night, dealt = null) {
  return NIGHT_ORDER.filter((step) => (!step.when || step.when(night)) && (!dealt || CALL_CARDS[step.role].some((r) => dealt.has(r))));
}
