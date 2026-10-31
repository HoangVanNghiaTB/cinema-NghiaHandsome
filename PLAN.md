# Rạp chiếu phim 3D – Kế hoạch

Web 3D bối cảnh rạp chiếu phim. Dán link (YouTube, v.v.) → chiếu lên màn hình lớn. Quy mô nhỏ: ~10 người cùng vào, xem đồng bộ.

## 1. Mục tiêu (MVP)
- Phòng chiếu 3D: màn hình, hàng ghế, ánh sáng tối.
- Dán link YouTube → video phát trên màn hình.
- ~10 người vào cùng phòng, thấy nhau (avatar đơn giản + tên), đi lại được.
- Video đồng bộ: ai bấm play/pause/tua thì mọi người cùng thấy.

Ngoài MVP (làm sau): voice chat, chat text, emoji/phản ứng, nhiều phòng, ghế ngồi cố định, link mp4/Twitch/Vimeo.

## 2. Công nghệ đề xuất
| Phần | Chọn | Lý do |
|---|---|---|
| 3D | **Three.js** + Vite | Phổ biến, nhiều tài liệu, nhẹ cho 10 người |
| Màn hình chiếu YouTube | **CSS3DRenderer** (iframe đặt vào không gian 3D) | YouTube iframe không dùng làm texture WebGL được (cross-origin) |
| Màn hình cho file mp4 trực tiếp | `VideoTexture` | Chỉ dùng được với file mình host / có CORS |
| Realtime | **Node.js + Socket.IO** | Đồng bộ vị trí + trạng thái video, dễ làm |
| Phát YouTube | **YouTube IFrame Player API** | Điều khiển play/pause/seek/getCurrentTime bằng code |
| Voice | WebRTC thuần (mesh), báo hiệu qua Socket.IO | 10 người vẫn ổn; không cần server PeerJS riêng |
| Triển khai | Test: chạy local + `cloudflared`/ngrok. Thật: Render / Railway / Fly.io | Miễn phí/rẻ, đủ cho 10 người |

## 3. Điểm kỹ thuật cần lưu ý
1. **Kết hợp CSS3D + WebGL**: render 2 lớp chồng nhau (WebGL cho rạp, CSS3D cho iframe); dùng "lỗ" trong WebGL (material blending NoBlending) ở vị trí màn hình để iframe hiện qua.
2. **Đồng bộ video**: server giữ state `{videoId, playing, position, updatedAt}`. Người mới vào nhận state → tự seek tới `position + (now - updatedAt)`. Mỗi vài giây client lệch >1–2s thì tự chỉnh.
3. **Quyền điều khiển**: MVP cho ai cũng điều khiển; sau có thể thêm "host".
4. **Vị trí người chơi**: gửi ~10–15 lần/giây, client nội suy cho mượt.
5. **Một số video YouTube cấm embed** → cần báo lỗi thân thiện.
6. **Âm thanh**: trình duyệt chặn autoplay có tiếng → cần 1 nút "Vào rạp" (click đầu tiên) để bật.

## 4. Các bước thực hiện
**Bước 1 – Khung dự án**
- Vite + Three.js, một cảnh trống, camera góc nhìn thứ nhất (WASD + chuột).

**Bước 2 – Dựng rạp**
- Sàn, tường, màn hình (mặt phẳng 16:9), ghế xếp bậc thang (dùng hộp/mô hình đơn giản trước; sau thay model .glb), ánh sáng mờ, ánh sáng hắt từ màn hình.

**Bước 3 – Chiếu video**
- CSS3DRenderer + YouTube iframe khớp vị trí màn hình.
- Ô nhập link → parse videoId → load.

**Bước 4 – Server realtime**
- Node + Socket.IO: join phòng, danh sách người, broadcast vị trí.
- Avatar đơn giản (capsule + nhãn tên), nội suy chuyển động.

**Bước 5 – Đồng bộ video**
- Đồng bộ đổi link, play/pause/seek, người vào sau bắt kịp.

**Bước 6 – Hoàn thiện**
- Màn hình vào (nhập tên, chọn màu), giới hạn 10 người/phòng, chat text, trạng thái kết nối.

**Bước 7 – Triển khai & test với bạn bè**
- Deploy, gửi link phòng, kiểm tra độ trễ/đồng bộ.

**Sau MVP**: voice chat, emoji bay, ngồi ghế (khoá camera), nhiều phòng, model đẹp (.glb), popcorn 🍿.

## Triển khai (Render)
1. Đẩy code lên một repo GitHub (`.gitignore` đã loại `node_modules`, `client/dist`).
2. Render → New → Blueprint (đọc `render.yaml`), hoặc New Web Service với Build Command `npm run build`, Start Command `npm start`, `NODE_ENV=production`.
3. Voice qua mạng khó nối cần TURN: đặt `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` trong Environment (ví dụ lấy từ gói miễn phí của Metered).
4. Gói free của Render ngủ sau ~15 phút không dùng; lần mở đầu mất khoảng nửa phút để "thức".
5. Chạy thử production ở máy: `npm run build` rồi `$env:NODE_ENV='production'; npm start` (mặc định cổng 3000, đổi bằng `PORT`).

## 5. Cấu trúc thư mục dự kiến
```
cinema-3d/
  PLAN.md
  client/        # Vite + Three.js
    src/
      main.js, scene/, player/ (youtube), net/ (socket), ui/
  server/        # Node + Socket.IO
    index.js
```

## 6. Quyết định đã chốt
- **Điều khiển video:** ai cũng điều khiển được (không cần host).
- **Voice chat:** có, đưa vào MVP (WebRTC mesh qua PeerJS, ~10 người). Thêm bước mới sau Bước 5.
- **Đồ hoạ:** tối giản nhất có thể (hình khối cơ bản, ít màu, không model .glb).
- **Triển khai:** hosting (Render / Railway / Fly.io). Cần HTTPS để dùng micro; PeerJS cần server signaling (PeerJS Cloud miễn phí hoặc tự host).

### Bước 5b – Voice chat
- Xin quyền micro, kết nối PeerJS giữa các người trong phòng.
- Nút bật/tắt mic, chỉ báo ai đang nói trên avatar.
