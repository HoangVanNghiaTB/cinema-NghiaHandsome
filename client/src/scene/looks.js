// Loại trái cây, phụ kiện và màu thân của nhân vật (chọn ở menu, ai cũng thấy). File thuần dữ liệu, không dùng DOM / three,
// server cũng import để kiểm tra giá trị người chơi gửi lên.

// Mỗi loại trái cây có màu thân riêng và phần trang trí trên đầu (xem fruitRig.js). 'none' = trái tròn màu tự chọn.
export const FRUITS = {
  none: { label: 'Không (màu tự chọn)', color: null },
  apple: { label: 'Táo', color: '#e0312f' },
  orange: { label: 'Cam', color: '#ff8a1f' },
  banana: { label: 'Chuối', color: '#ffd51f' },
  strawberry: { label: 'Dâu tây', color: '#e0243a' },
  grape: { label: 'Nho', color: '#7a2fa0' },
  peach: { label: 'Đào', color: '#ff9fb0' },
  lime: { label: 'Chanh xanh', color: '#5bc236' },
};

// Kiểu nhân vật: thân mập hay gầy đầu tròn, mặt nam hay nữ (xem fruitRig.js)
export const KINDS = {
  chubby_m: { label: 'Mập - mặt nam', shape: 'chubby', gender: 'm' },
  chubby_f: { label: 'Mập - mặt nữ', shape: 'chubby', gender: 'f' },
  slim_m: { label: 'Gầy đầu tròn - mặt nam', shape: 'slim', gender: 'm' },
  slim_f: { label: 'Gầy đầu tròn - mặt nữ', shape: 'slim', gender: 'f' },
};

export const LOOK_OPTIONS = {
  kind: Object.entries(KINDS).map(([id, k]) => [id, k.label]),
  fruit: Object.entries(FRUITS).map(([id, f]) => [id, f.label]),
  hat: [
    ['none', 'Không đội'],
    ['cap', 'Mũ lưỡi trai'],
    ['party', 'Mũ sinh nhật'],
    ['crown', 'Vương miện'],
    ['tophat', 'Mũ chóp cao'],
  ],
  glasses: [
    ['none', 'Không đeo'],
    ['round', 'Kính tròn'],
    ['sun', 'Kính râm'],
  ],
  ears: [
    ['none', 'Không'],
    ['phones', 'Tai nghe chụp tai'],
    ['cat', 'Tai mèo'],
  ],
  back: [
    ['none', 'Không'],
    ['backpack', 'Balo'],
    ['wings', 'Cánh'],
    ['tail', 'Đuôi'],
  ],
};

export const LOOK_LABELS = { kind: 'Kiểu', fruit: 'Trái cây', hat: 'Mũ', glasses: 'Kính', ears: 'Tai nghe', back: 'Sau lưng' };

// Màu thân chọn tay (đè lên màu trái cây); 'same' = màu trái cây (hoặc màu chọn lúc đăng nhập nếu không chọn trái)
export const SHIRT_COLORS = ['same', '#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#ff7eb6', '#ecf0f1', '#2c3e50'];

export const DEFAULT_LOOK = { kind: 'chubby_m', fruit: 'orange', hat: 'none', glasses: 'none', ears: 'none', back: 'none', shirt: 'same' };

// Giá trị hợp lệ (thứ gì sai thì về mặc định) để không ai gửi chuỗi lạ cho người khác
export function cleanLook(v) {
  const src = v && typeof v === 'object' ? v : {};
  const look = { ...DEFAULT_LOOK };
  for (const key of Object.keys(LOOK_OPTIONS)) {
    if (LOOK_OPTIONS[key].some(([id]) => id === src[key])) look[key] = src[key];
  }
  if (SHIRT_COLORS.includes(src.shirt)) look.shirt = src.shirt;
  return look;
}
