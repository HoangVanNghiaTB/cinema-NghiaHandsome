// Thông số bảng chỉnh âm mic hát (treo dưới bức ảnh tường sau). Cả phòng dùng chung một bộ: ai chỉnh thì người đang hát
// nghe/khán giả nghe đổi theo ngay. File thuần dữ liệu, server cũng import để kiểm tra giá trị (nhớ giữ không dùng DOM).
// Mặc định = các giá trị đã chọn trong vocalChain.js trước khi có bảng chỉnh.

export const MIX_GROUPS = [
  { id: 'voice', title: 'Giọng' },
  { id: 'echo', title: 'Echo' },
  { id: 'reverb', title: 'Reverb' },
];

export const MIX_PARAMS = [
  // Công tắc (0/1): "giống mic thường" = hát như voice chat, bỏ hết hiệu ứng của bảng này (xem voice.js, setSingPath)
  { key: 'plain', group: 'voice', type: 'toggle', min: 0, max: 1, step: 1, def: 0 },
  { key: 'level', group: 'voice', label: 'Âm lượng mic hát', min: 20, max: 100, step: 1, def: 75, unit: '%' },
  { key: 'hp', group: 'voice', label: 'Cắt trầm (tiếng ù)', min: 60, max: 250, step: 5, def: 100, unit: 'Hz' },
  { key: 'mud', group: 'voice', label: 'Bớt đục (200 Hz)', min: -8, max: 4, step: 0.5, def: -2, unit: 'dB' },
  { key: 'presence', group: 'voice', label: 'Rõ lời (4 kHz)', min: -4, max: 8, step: 0.5, def: 2, unit: 'dB' },

  { key: 'echoWet', group: 'echo', label: 'Độ lớn echo', min: 0, max: 40, step: 1, def: 12, unit: '%' },
  { key: 'echoL', group: 'echo', label: 'Trễ kênh trái', min: 100, max: 400, step: 5, def: 210, unit: 'ms' },
  { key: 'echoR', group: 'echo', label: 'Trễ kênh phải', min: 100, max: 400, step: 5, def: 245, unit: 'ms' },
  { key: 'echoFb', group: 'echo', label: 'Số lần lặp', min: 0, max: 60, step: 1, def: 30, unit: '%' },
  { key: 'echoHp', group: 'echo', label: 'Cắt trầm echo', min: 60, max: 300, step: 5, def: 110, unit: 'Hz' },
  { key: 'echoLp', group: 'echo', label: 'Cắt cao echo', min: 2000, max: 12000, step: 100, def: 6500, unit: 'Hz' },

  { key: 'revWet', group: 'reverb', label: 'Độ lớn reverb', min: 0, max: 40, step: 1, def: 10, unit: '%' },
  { key: 'revTime', group: 'reverb', label: 'Thời gian vang', min: 0.5, max: 4, step: 0.1, def: 2, unit: 's' },
  { key: 'revPre', group: 'reverb', label: 'Pre-delay', min: 0, max: 100, step: 1, def: 30, unit: 'ms' },
  { key: 'revHp', group: 'reverb', label: 'Cắt trầm reverb', min: 60, max: 300, step: 5, def: 110, unit: 'Hz' },
  { key: 'revLp', group: 'reverb', label: 'Cắt cao reverb', min: 2000, max: 12000, step: 100, def: 7500, unit: 'Hz' },
];

export const MIX_DEFAULTS = Object.fromEntries(MIX_PARAMS.map((p) => [p.key, p.def]));

// Lấy giá trị hợp lệ (số hữu hạn, kẹp trong khoảng cho phép); sai thì trả mặc định
export function cleanMixValue(key, value) {
  const p = MIX_PARAMS.find((x) => x.key === key);
  if (!p) return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return p.def;
  const clamped = Math.min(p.max, Math.max(p.min, v));
  return p.type === 'toggle' ? Math.round(clamped) : clamped;
}
