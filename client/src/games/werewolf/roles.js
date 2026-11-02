// Ma Sói: 15 vai, hằng số của ván và cách chia vai. File thuần dữ liệu (không dùng DOM), cả server lẫn client cùng đọc.
// Điểm của từng vai lấy theo bảng masoi.online (không phải chuẩn chính thức); xem DE_XUAT_MA_SOI.md.

export const WW = {
  FEE: 100, // điểm mỗi người mỗi ván
  PAYOUT: { dan: 150, soi: 200, chan_doi: 200, soi_trang: 200 }, // tiền nhận về nếu thắng (đã gồm phí): lãi 50 / 100 / 100 / 100
  MIN: 5,
  MAX: 10,
  COUNTDOWN_MS: 15000, // đếm ngược từ lúc bấm Bắt đầu
  DAY_MS: 120000, // thảo luận
  VOTE_MS: 30000, // bỏ phiếu
  HUNTER_MS: 15000, // Thợ Săn chọn người bắn
  END_MS: 25000, // xem kết quả rồi về bàn chờ
  AWAY_MS: 60000, // đóng cửa sổ giữa ván: bao lâu thì bị tính bỏ cuộc
  MIN_HUMANS: 3, // còn ít hơn số người thật này thì huỷ ván và hoàn phí
  SCORE_MIN: -3,
  SCORE_MAX: 3,
};

// faction: dan | soi | chan_doi | soi_trang. pack: thức dậy cùng bầy Sói. wolf: tính là "Sói" khi Tiên Tri soi.
export const ROLES = {
  dan_lang: { name: 'Dân làng', faction: 'dan', score: 1, desc: 'Không có chức năng. Thảo luận và bỏ phiếu để tìm Sói.' },
  tien_tri: { name: 'Tiên Tri', faction: 'dan', score: 7, desc: 'Mỗi đêm soi một người xem có phải Sói không. Kẻ Phản Bội soi ra là người, Sói Trắng soi ra là Sói.' },
  bao_ve: { name: 'Bảo Vệ', faction: 'dan', score: 4, desc: 'Mỗi đêm bảo vệ một người khỏi bị Sói cắn. Không chọn cùng một người hai đêm liền.' },
  tho_san: { name: 'Thợ Săn', faction: 'dan', score: 3, desc: 'Khi chết (kể cả bị treo cổ) được chọn một người chết theo.' },
  phu_thuy: { name: 'Phù Thủy', faction: 'dan', score: 5, desc: 'Một bình cứu và một bình độc, mỗi bình dùng một lần. Được biết ai sắp bị Sói cắn chết.' },
  thi_truong: { name: 'Thị Trưởng', faction: 'dan', score: 2, desc: 'Phiếu treo cổ của bạn tính hai phiếu. Cả làng biết ai là Thị Trưởng.' },
  hoang_tu: { name: 'Hoàng Tử', faction: 'dan', score: 2, desc: 'Bị treo cổ lần đầu thì không chết, nhưng lộ vai cho cả làng.' },
  ngoai_cam: { name: 'Nhà Ngoại Cảm', faction: 'dan', score: 4, desc: 'Mỗi đêm chọn hai người, biết họ có cùng phe không.' },
  tinh_yeu: { name: 'Thần Tình Yêu', faction: 'dan', score: 3, desc: 'Đêm đầu chọn hai người thành một đôi. Một người chết thì người kia chết theo.' },
  ma_soi: { name: 'Ma Sói', faction: 'soi', score: -6, pack: true, wolf: true, desc: 'Cùng bầy Sói chọn một người để cắn mỗi đêm.' },
  soi_con: { name: 'Sói Con', faction: 'soi', score: -8, pack: true, wolf: true, desc: 'Nếu bạn chết, đêm sau bầy Sói được cắn thêm một người.' },
  soi_dau_dan: { name: 'Sói Đầu Đàn', faction: 'soi', score: -9, pack: true, wolf: true, desc: 'Một lần trong ván, biến người bị cắn thành Sói thay vì giết người đó.' },
  phan_boi: { name: 'Kẻ Phản Bội', faction: 'soi', score: -6, desc: 'Biết Sói là ai và giúp Sói thắng, nhưng Sói không biết bạn. Tiên Tri soi ra là người.' },
  chan_doi: { name: 'Chán Đời', faction: 'chan_doi', score: -2, desc: 'Chỉ thắng nếu bị dân làng treo cổ ban ngày. Thắng thì ván kết thúc ngay.' },
  soi_trang: { name: 'Sói Trắng', faction: 'soi_trang', score: -2, pack: true, wolf: true, desc: 'Ở cùng bầy Sói, cứ hai đêm được giết thêm một Sói khác. Chỉ thắng nếu là người cuối cùng còn sống.' },
};

export const FACTION_NAMES = { dan: 'Dân làng', soi: 'Ma Sói', chan_doi: 'Chán Đời', soi_trang: 'Sói Trắng' };

const VILLAGE_SPECIAL = ['tien_tri', 'bao_ve', 'tho_san', 'phu_thuy', 'thi_truong', 'hoang_tu', 'ngoai_cam', 'tinh_yeu'];
const TRUE_WOLVES = ['ma_soi', 'soi_con', 'soi_dau_dan'];
const WOLF_TEAM_SIZE = (n) => (n <= 5 ? 1 : n <= 7 ? 2 : 3);

// Đội hình mẫu (tổng điểm đã kiểm tra) dùng khi rút ngẫu nhiên mãi không ra
const FALLBACK = {
  5: ['soi_dau_dan', 'tien_tri', 'hoang_tu', 'dan_lang', 'dan_lang'],
  6: ['ma_soi', 'soi_con', 'tien_tri', 'bao_ve', 'tho_san', 'dan_lang'],
  7: ['ma_soi', 'soi_dau_dan', 'tien_tri', 'bao_ve', 'tho_san', 'dan_lang', 'dan_lang'],
  8: ['ma_soi', 'soi_con', 'phan_boi', 'tien_tri', 'bao_ve', 'phu_thuy', 'tho_san', 'ngoai_cam'],
  9: ['ma_soi', 'soi_con', 'phan_boi', 'tien_tri', 'bao_ve', 'phu_thuy', 'tho_san', 'tinh_yeu', 'chan_doi'],
  10: ['ma_soi', 'ma_soi', 'soi_con', 'soi_trang', 'tien_tri', 'bao_ve', 'phu_thuy', 'tho_san', 'thi_truong', 'hoang_tu'],
};

export const scoreOf = (roleIds) => roleIds.reduce((s, r) => s + ROLES[r].score, 0);

function shuffle(a, rand) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// Rút ngẫu nhiên n vai (5..10) sao cho: đủ số người phe Sói theo cỡ bàn (có ít nhất một Sói thật), phe thứ ba chỉ từ 8 người và
// tối đa một, Thần Tình Yêu từ 6 người, mỗi vai đặc biệt tối đa một lá, và tổng điểm nằm trong [SCORE_MIN, SCORE_MAX].
// Trả về danh sách id vai (đã xáo), chưa gán cho người nào.
export function dealRoles(n, rand = Math.random) {
  for (let tries = 0; tries < 3000; tries++) {
    const wolves = [TRUE_WOLVES[Math.floor(rand() * 3)]];
    while (wolves.length < WOLF_TEAM_SIZE(n)) {
      const pick = ['ma_soi', 'ma_soi', 'soi_con', 'soi_dau_dan', 'phan_boi'][Math.floor(rand() * 5)];
      if (pick === 'ma_soi' ? wolves.filter((w) => w === 'ma_soi').length < 3 : !wolves.includes(pick)) wolves.push(pick);
    }
    const third = n >= 8 && rand() < 0.5 ? (rand() < 0.5 ? 'chan_doi' : 'soi_trang') : null;
    const rest = n - wolves.length - (third ? 1 : 0);
    const pool = shuffle(VILLAGE_SPECIAL.filter((r) => r !== 'tinh_yeu' || n >= 6), rand);
    const special = pool.slice(0, Math.min(pool.length, rest, 2 + Math.floor(rand() * Math.max(1, rest - 1))));
    const roles = [...wolves, ...(third ? [third] : []), ...special];
    while (roles.length < n) roles.push('dan_lang');
    const s = scoreOf(roles);
    if (s >= WW.SCORE_MIN && s <= WW.SCORE_MAX) return shuffle(roles, rand);
  }
  return shuffle(FALLBACK[n], rand);
}
