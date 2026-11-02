// Ma Sói: 15 vai, hằng số của ván và cách chia vai. File thuần dữ liệu (không dùng DOM), cả server lẫn client cùng đọc.
// Điểm của từng vai lấy theo bảng masoi.online (không phải chuẩn chính thức); xem DE_XUAT_MA_SOI.md.

// Điểm cân bằng của đội hình (tổng điểm vai mỗi ván). Không đưa vào trang admin: gắn chặt với điểm từng vai.
export const WW_SCORE = { min: -3, max: 3 };

// Thông số ván chỉnh được ở trang admin (server/admin.js). Mặc định ở đây; server giữ một bản sống (settings.werewolf trong server/index.js).
// Cố ý KHÔNG cho chỉnh: danh sách vai, điểm từng vai, luật từng vai, điều kiện thắng, khoảng điểm cân bằng, thứ tự gọi vai và giọng quản trò,
// luật mic/chat. Số người tối đa không vượt 10 (giới hạn của một phòng).
export const wwDefaults = () => ({
  fee: 100, // điểm mỗi người mỗi ván
  profit: { dan: 50, soi: 100, chan_doi: 100, soi_trang: 100 }, // lãi khi thắng (người thắng nhận về phí + lãi)
  min: 5, // số người tối thiểu để bắt đầu
  max: 10, // số ghế quanh bàn
  countdownSec: 15, // đếm ngược từ lúc bấm Bắt đầu
  daySec: 120, // thảo luận ban ngày (cố định)
  voteSec: 30, // bỏ phiếu (xong sớm nếu mọi người đã bỏ)
  hunterSec: 15, // Thợ Săn chọn người bắn
  endSec: 25, // xem kết quả rồi về bàn chờ
  awaySec: 60, // đóng cửa sổ giữa ván: bao lâu thì bị tính bỏ cuộc
  minHumans: 3, // còn ít hơn số người thật này thì huỷ ván và hoàn phí
  idleSec: 10, // vai không ai thao tác được (người giữ đã chết...): chờ bao lâu rồi sang vai kế
  windows: { cupid: 10, wolf: 20, alpha: 8, whitewolf: 8, seer: 8, guard: 8, witch: 10, witchPoison: 8, psychic: 10 }, // thao tác ban đêm tối đa (giây)
});

// Nhãn và giới hạn từng trường (admin dựng form và server kiểm tra theo bảng này). path trỏ vào wwDefaults().
export const WW_FIELDS = [
  { group: 'Phí và lãi', path: 'fee', label: 'Phí vào ván', unit: 'điểm', min: 10, max: 1000 },
  { group: 'Phí và lãi', path: 'profit.dan', label: 'Lãi khi Dân thắng', unit: 'điểm', min: 0, max: 1000 },
  { group: 'Phí và lãi', path: 'profit.soi', label: 'Lãi khi Sói thắng', unit: 'điểm', min: 0, max: 1000 },
  { group: 'Phí và lãi', path: 'profit.chan_doi', label: 'Lãi khi Chán Đời thắng', unit: 'điểm', min: 0, max: 1000 },
  { group: 'Phí và lãi', path: 'profit.soi_trang', label: 'Lãi khi Sói Trắng thắng', unit: 'điểm', min: 0, max: 1000 },
  { group: 'Bàn chờ', path: 'min', label: 'Số người tối thiểu', unit: 'người', min: 5, max: 10 },
  { group: 'Bàn chờ', path: 'max', label: 'Số ghế (tối đa)', unit: 'người', min: 5, max: 10 },
  { group: 'Bàn chờ', path: 'countdownSec', label: 'Đếm ngược bắt đầu', unit: 'giây', min: 5, max: 60 },
  { group: 'Thời gian', path: 'daySec', label: 'Thảo luận ban ngày', unit: 'giây', min: 30, max: 600 },
  { group: 'Thời gian', path: 'voteSec', label: 'Bỏ phiếu (tối đa)', unit: 'giây', min: 10, max: 120 },
  { group: 'Thời gian', path: 'hunterSec', label: 'Thợ Săn chọn người bắn', unit: 'giây', min: 5, max: 60 },
  { group: 'Thời gian', path: 'endSec', label: 'Xem kết quả', unit: 'giây', min: 5, max: 60 },
  { group: 'Thời gian', path: 'awaySec', label: 'Cho quay lại sau khi đóng cửa sổ', unit: 'giây', min: 15, max: 300 },
  { group: 'Thời gian', path: 'idleSec', label: 'Chờ khi vai không ai thao tác được', unit: 'giây', min: 3, max: 30 },
  { group: 'Thời gian', path: 'minHumans', label: 'Còn dưới số người thật này thì huỷ ván', unit: 'người', min: 1, max: 5 },
  { group: 'Thao tác ban đêm (tối đa)', path: 'windows.cupid', label: 'Thần Tình Yêu', unit: 'giây', min: 3, max: 60 },
  { group: 'Thao tác ban đêm (tối đa)', path: 'windows.wolf', label: 'Bầy Sói cắn', unit: 'giây', min: 3, max: 60 },
  { group: 'Thao tác ban đêm (tối đa)', path: 'windows.alpha', label: 'Sói Đầu Đàn', unit: 'giây', min: 3, max: 60 },
  { group: 'Thao tác ban đêm (tối đa)', path: 'windows.whitewolf', label: 'Sói Trắng', unit: 'giây', min: 3, max: 60 },
  { group: 'Thao tác ban đêm (tối đa)', path: 'windows.seer', label: 'Tiên Tri', unit: 'giây', min: 3, max: 60 },
  { group: 'Thao tác ban đêm (tối đa)', path: 'windows.guard', label: 'Bảo Vệ', unit: 'giây', min: 3, max: 60 },
  { group: 'Thao tác ban đêm (tối đa)', path: 'windows.witch', label: 'Phù Thủy (bình cứu)', unit: 'giây', min: 3, max: 60 },
  { group: 'Thao tác ban đêm (tối đa)', path: 'windows.witchPoison', label: 'Phù Thủy (bình độc)', unit: 'giây', min: 3, max: 60 },
  { group: 'Thao tác ban đêm (tối đa)', path: 'windows.psychic', label: 'Nhà Ngoại Cảm', unit: 'giây', min: 3, max: 60 },
];

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
    if (s >= WW_SCORE.min && s <= WW_SCORE.max) return shuffle(roles, rand);
  }
  return shuffle(FALLBACK[n], rand);
}
