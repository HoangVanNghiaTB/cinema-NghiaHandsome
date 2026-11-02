// Danh sách phòng của rạp. File thuần dữ liệu (không dùng DOM / three), server cũng import.
// Mỗi phòng là một namespace socket.io riêng (/<id>): người chơi, video, bảng âm, điểm và game không lẫn sang phòng khác.
// Mật khẩu của phòng khoá KHÔNG nằm ở đây (repo công khai): server đọc từ biến môi trường ROOM_PASSWORD_<ID viết hoa>.

export const MAX_PLAYERS = 10; // mỗi phòng; có 3 phòng nên cả rạp tối đa 30 người

export const ROOMS = [
  { id: 'ae', name: 'ae siêu nhân', locked: true, photo: true }, // phòng riêng: cần mật khẩu, có ảnh treo tường
  { id: 'khach1', name: 'Phòng khách 1', locked: false, photo: false },
  { id: 'khach2', name: 'Phòng khách 2', locked: false, photo: false },
];

export const DEFAULT_ROOM = ROOMS[0].id;
export const roomById = (id) => ROOMS.find((r) => r.id === id) ?? ROOMS[0];
