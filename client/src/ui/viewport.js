// Điện thoại để dọc (kể cả khoá xoay) thì cả trang được xoay 90° bằng CSS để luôn hiển thị ngang.
// Script inline trong index.html đặt class "force-land" trên <html>; module này cho phần còn lại biết kích thước
// "ngang" và đổi độ dịch ngón tay từ toạ độ màn hình sang toạ độ trang đã xoay.

export const isRotated = () => document.documentElement.classList.contains('force-land');

export const viewW = () => (isRotated() ? innerHeight : innerWidth);
export const viewH = () => (isRotated() ? innerWidth : innerHeight);

// Trang xoay 90° theo chiều kim đồng hồ: (x, y) trên trang ứng với (W - y, x) trên màn hình
export function mapDelta(dx, dy) {
  return isRotated() ? { x: dy, y: -dx } : { x: dx, y: dy };
}
