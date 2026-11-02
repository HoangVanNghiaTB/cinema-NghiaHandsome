// Giọng quản trò Ma Sói ban đêm: các file thu sẵn trong client/public/gm/ (xem KICH_BAN_QUAN_TRO.md), thứ tự gọi các vai và
// thời gian chờ mỗi vai. File thuần dữ liệu (không dùng DOM), cả server (đếm giờ) và client (phát tiếng) cùng đọc.
//
// Mỗi đêm quản trò chỉ gọi các vai CÓ TRONG VÁN này (theo bài đã chia lúc đầu), theo thứ tự cố định. Vai đã chia mà người giữ
// đã chết vẫn được gọi và chờ như bình thường (để người ngoài không biết vai đó đã chết). Đổi lại, nghe lời gọi là biết ván có
// những vai nào. Server chỉ mở khung thao tác cho người đang sống giữ vai đó trong khoảng chờ của vai.

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

// Thứ tự gọi và việc của từng vai. windowMs = thời gian vai đó được thao tác sau lời gọi.
// Thứ tự có lý do:
//  - Thần Tình Yêu và Kẻ Phản Bội chỉ đêm đầu: ghép đôi, nhận ra bầy Sói trước khi có ai bị cắn.
//  - Ma Sói chọn nạn nhân; Sói Đầu Đàn và Sói Trắng gọi SAU để biết nạn nhân (biến thành Sói / giết thêm một Sói).
//  - Tiên Tri, Bảo Vệ, Nhà Ngoại Cảm không phụ thuộc ai, nhưng Bảo Vệ phải xong TRƯỚC Phù Thủy.
//  - Phù Thủy gọi gần cuối: chỉ khi đó mới biết ai thật sự sắp chết (đã trừ người được Bảo Vệ che và người bị biến thành Sói).
export const NIGHT_ORDER = [
  { role: 'cupid', wake: 'cupid_wake', sleep: 'cupid_sleep', windowMs: 10000, when: (night) => night === 1 },
  { role: 'traitor', wake: 'traitor_wake', sleep: 'traitor_sleep', windowMs: 4000, when: (night) => night === 1 },
  { role: 'wolf', wake: 'wolf_wake', sleep: 'wolf_sleep', windowMs: 20000 },
  { role: 'alpha', wake: 'alpha_wake', sleep: 'alpha_sleep', windowMs: 8000 },
  { role: 'whitewolf', wake: 'whitewolf_wake', sleep: 'whitewolf_sleep', windowMs: 8000, when: (night) => night % 2 === 0 },
  { role: 'seer', wake: 'seer_wake', sleep: 'seer_sleep', windowMs: 8000 },
  { role: 'guard', wake: 'guard_wake', sleep: 'guard_sleep', windowMs: 8000 },
  // Phù Thủy hai việc liền nhau: hỏi cứu (wake), rồi hỏi bình độc (poison); mỗi việc một khoảng chờ riêng
  { role: 'witch', wake: 'witch_wake', sleep: 'witch_sleep', windowMs: 10000, then: { clip: 'witch_poison', windowMs: 8000 } },
  { role: 'psychic', wake: 'psychic_wake', sleep: 'psychic_sleep', windowMs: 10000 },
];

const START_PAUSE_MS = 1500; // sau "Trời tối rồi" cho mọi người kịp nhắm mắt
const GAP_MS = 800; // nghỉ giữa hai vai
const END_PAUSE_MS = 1000; // sau vai cuối trước "Trời sáng rồi"
const JITTER = 0.15; // khoảng chờ mỗi vai lệch ngẫu nhiên ±15%

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

// Dựng lịch của một đêm (đêm thứ `night`, tính từ 1). `dealt` là tập id vai đã chia trong ván (không truyền thì gọi hết). Trả về:
//   events  [{ at, clip }]         thời điểm (ms từ đầu đêm) phát từng file; clip thiếu file thì client bỏ qua
//   windows [{ role, part, from, to }]  khoảng thời gian vai được thao tác; part 'main' hoặc 'poison' (Phù Thủy)
//   totalMs thời gian cả đêm tới lúc phát "Trời sáng rồi" xong
// `rand` chỉ để thử (mặc định Math.random).
export function nightTimeline(night, rand = Math.random, dealt = null) {
  const events = [];
  const windows = [];
  let t = 0;
  const play = (clip) => {
    events.push({ at: t, clip });
    t += CLIP_MS[clip] ?? 0; // thiếu file (chưa thu) thì không tốn thời gian đọc
  };
  const wait = (ms) => Math.round(ms * (1 + (rand() * 2 - 1) * JITTER));

  play('night_start');
  t += START_PAUSE_MS;
  for (const step of NIGHT_ORDER) {
    if (step.when && !step.when(night)) continue;
    if (dealt && !CALL_CARDS[step.role].some((r) => dealt.has(r))) continue; // vai này không có trong ván
    play(step.wake);
    let w = wait(step.windowMs);
    windows.push({ role: step.role, part: 'main', from: t, to: t + w });
    t += w;
    if (step.then) {
      play(step.then.clip);
      w = wait(step.then.windowMs);
      windows.push({ role: step.role, part: 'poison', from: t, to: t + w });
      t += w;
    }
    play(step.sleep);
    t += GAP_MS;
  }
  t += END_PAUSE_MS - GAP_MS;
  play('dawn');
  return { events, windows, totalMs: t };
}
