# Rạp chiếu phim 3D – Thiết kế hệ thống

Tài liệu này mô tả hệ thống **đang có trong code** (không phải kế hoạch).

## 1. Hệ thống là gì

Một trang web 3D mô phỏng phòng chiếu phim. Có **3 phòng** (1 phòng riêng cần mật khẩu, 2 phòng khách), mỗi phòng tối đa **10 người** (cả rạp tối đa 30), đi lại, nói chuyện bằng giọng, nhắn tin, cùng xem **một video YouTube đồng bộ** trên màn hình lớn, ngồi ghế, lên sân khấu hát karaoke và đánh nhau cho vui. Chạy được trên máy tính và điện thoại (điện thoại phải xoay ngang).

Phong cách đồ hoạ tối giản (toàn hình khối cơ bản, không có model 3D hay ảnh nền).

## 2. Kiến trúc tổng thể

```
 Trình duyệt A ──┐                                   ┌── Trình duyệt B
  (Three.js,     │   WebSocket (Socket.IO)            │    (Three.js,
   WebRTC,       ├──────────► Server Node.js ◄───────┤     WebRTC,
   YouTube API)  │   - trạng thái phòng               │     YouTube API)
                 │   - chuyển tiếp tín hiệu voice     │
                 │                                    │
                 └──────── WebRTC (giọng nói) ◄───────┘   (trực tiếp giữa các trình duyệt, kiểu mesh)

 Mỗi trình duyệt ──► YouTube (khung nhúng IFrame) : video tải thẳng từ YouTube, không qua server mình
```

- **Server** (Express + Socket.IO) giữ trạng thái chung trong **bộ nhớ**: danh sách người chơi, ai ngồi ghế nào, ai hát, video đang chiếu. Server cũng phục vụ luôn file web đã build.
- **Client** vẽ cảnh 3D, gửi vị trí của mình, nhận trạng thái của người khác, và tự lo âm thanh.
- **Giọng nói đi thẳng giữa các trình duyệt** (WebRTC mesh); server chỉ chuyển tiếp tin báo hiệu để họ tìm thấy nhau. Chỉ nối với người ở gần (và người đang hát), xa quá thì ngắt, nên phòng đông cũng chỉ giữ vài đường.
- **Video không đi qua server**: mỗi người tự tải từ YouTube; server chỉ giữ "đang chiếu gì, đang ở giây nào, đang phát hay dừng" để mọi người bám theo.

## 3. Công nghệ

| Phần | Dùng | Ghi chú |
|---|---|---|
| Đồ hoạ 3D | Three.js + Vite | WebGL cho cảnh; CSS3DRenderer cho video |
| Realtime | Node.js + Express + Socket.IO | mỗi phòng một namespace (`/ae`, `/khach1`, `/khach2`), trạng thái trong RAM |
| Video | YouTube IFrame Player API | chỉ nhúng trình phát chính thức |
| Giọng nói | WebRTC thuần (mesh) | báo hiệu qua Socket.IO, STUN Google + TURN tuỳ chọn |
| Âm thanh | Web Audio API | hiệu ứng bước chân, tát, chuỗi hiệu ứng mic hát |
| Triển khai | Render (Blueprint `render.yaml`) | một dịch vụ web phục vụ cả client lẫn server |

## 4. Cấu trúc thư mục

```
cinema-3d/
  package.json          build/start cho hosting (npm run build, npm start)
  render.yaml           cấu hình dịch vụ Render
  DESIGN.md             tài liệu thiết kế (file này)
  server/
    index.js            toàn bộ server: phòng, ghế, sân khấu, đánh nhau, video, chat, chuyển tiếp tín hiệu
  client/
    index.html          giao diện HTML/CSS: đăng nhập, menu, HUD, chat, nút cảm ứng
    public/             file tĩnh: ảnh treo tường, âm thanh bước chân và tiếng tát
    src/
      main.js           "bộ não" client: nối mọi phần lại, vòng lặp vẽ, điều khiển, mạng
      scene/
        cinema.js       dựng phòng: tường, sàn, ghế, sân khấu, mic, loa, màn hình karaoke, đèn sân khấu
        avatars.js      avatar người chơi (viên nhộng + nhãn tên), ngồi, sao choáng, đèn sáng khi nói
        stunRing.js     vòng sao 3D gắn camera của người bị choáng
        avatarHands.js  bàn tay avatar: vỗ tay, trái tim, lightstick, tay tát
        fpHand.js       bàn tay nhìn từ mắt mình khi mình tát
        confetti.js     pháo giấy (một đối tượng Points dùng chung)
      net/
        socket.js       lớp mỏng bọc Socket.IO (nhận/gửi sự kiện)
        voice.js        voice chat WebRTC mesh, âm lượng gần/xa, mic hát, dự phòng
      audio/
        sounds.js       tiếng bước chân, tiếng tát (có vị trí, xa nhỏ gần to)
        vocalChain.js   chuỗi hiệu ứng cho mic hát (EQ, nén, echo, reverb, limiter)
      player/
        youtube.js      bọc YouTube IFrame API (đọc link, tạo trình phát)
      ui/
        touch.js        điều khiển cảm ứng (cần gạt, kéo nhìn, nút)
```

## 5. Tính năng

### 5.1 Phòng chiếu
- Phòng 20 × 18 × 9 m. Màn hình lớn 16:9 (12.8 × 7.2 m) sát tường trước.
- **18 ghế** xếp 3 hàng bậc thang, mỗi hàng 2 cột (trái/phải) cách nhau lối đi.
- **2 sân khấu nhỏ** ở hai góc phía trước, hai bên màn hình (xem 5.7).
- Ảnh treo giữa tường sau, ánh sáng mờ (2 đèn trần ở cuối phòng), tường navy, sàn đỏ.

### 5.2 Video đồng bộ
- Bất kỳ ai dán link YouTube vào menu rồi bấm **Chiếu**; ai cũng được phát, tạm dừng, tua ±10 giây.
- Server giữ `{videoId, playing, position, updatedAt}` và tính sẵn vị trí hiện tại khi gửi, nên người vào sau vào **đúng đoạn đang chiếu**.
- Client bám theo: có lệnh mới thì tua nếu lệch quá 0.5 giây; cứ **2 giây** lại kiểm tra, lệch quá **2 giây** thì tự tua lại.
- Video hiển thị bằng iframe YouTube đặt trong không gian 3D (xem 6.1). Link không nhúng được hoặc bị cấm thì báo lỗi thân thiện.
- Mỗi người có thanh âm lượng video riêng (chỉ ảnh hưởng máy mình).

### 5.3 Người chơi và avatar
- Vào bằng tên và màu tự chọn (nhớ cho lần sau). Avatar là viên nhộng màu kèm nhãn tên và một khối nhỏ chỉ hướng nhìn.
- Vị trí gửi khoảng **15 lần/giây** khi có thay đổi; người nhận nội suy cho mượt.
- Người đang nói thì **avatar sáng lên**.
- Chat chữ: **cả phòng đều thấy** (khác với voice), giới hạn 200 ký tự và 1 tin mỗi 0.3 giây.
- Phòng đủ 10 người thì người thứ 11 bị từ chối và quay về màn hình đăng nhập.

### 5.4 Ngồi ghế
- Đứng gần ghế trống (trong 1.4 m) thì hiện gợi ý; **E** (máy tính) hoặc nút **Ngồi** (điện thoại).
- Server quyết định ghế có trống hay không (một ghế một người). Ngồi thì đứng im, nhìn về màn hình, vẫn xoay đầu được; muốn đi phải đứng dậy.
- Người khác thấy avatar thấp xuống như đang ngồi.

### 5.5 Đánh nhau
- **Chuột trái hoặc F** (điện thoại: nút **Đánh**). Server kiểm tra: người gần nhất trong **1.8 m**, trong góc ±60° phía trước, đánh cách nhau tối thiểu **1 giây**.
- Người bị đánh **choáng 2 giây**: không đi, không xoay, không đánh/ngồi được. Màn hình rung nhẹ và có vòng sao 3D quay quanh "đầu" (vật thể thật gắn vào camera nên có phối cảnh). Người khác thấy 3 ngôi sao trên đầu người đó.
- Đang ngồi hoặc đang hát mà bị đánh thì **bị văng khỏi ghế/sân khấu**.
- Sau khi hết choáng được miễn nhiễm thêm 1 giây để không bị khoá liên tục.
- Có **tiếng tát** (cả phòng nghe, xa thì nhỏ).

### 5.5b Hành động của nhân vật
- Avatar có **hai bàn tay** (hai quả cầu nhỏ) để diễn hành động. Máy tính bấm **phím số**; điện thoại bấm nút **Hành động** rồi chọn biểu tượng.

| Phím | Hành động | Mô tả |
|---|---|---|
| 1 | Vỗ tay | hai tay chụm vào tách ra trước ngực ~3 giây; **tiếng vỗ tay khán giả** cả phòng nghe như nhau (không theo gần xa), rất nhỏ (tối đa 0.04) |
| 2 | Pháo giấy | hai tay hất lên, hạt giấy nhiều màu **bắn từ ngực lên trên đầu rồi tan biến** (không rơi xuống sàn); không có âm thanh |
| 3 | Lightstick | cầm/cất gậy phát sáng **theo màu avatar** ở tay trái, đung đưa; server nhớ nên người vào sau vẫn thấy |
| 4 | Trái tim | hai tay chạm nhau trên đỉnh đầu, kèm trái tim nhỏ đập nhẹ ~3 giây |

- **Tát (chuột trái/F)** nay có tay: mọi cú tát (trúng hay hụt) đều hiện **tay vung ra**. Người tát thấy **tay của chính mình từ góc nhìn của mình**, những người khác (kể cả người bị tát) thấy **tay avatar của người tát** vung về phía trước.
- Thời gian chờ do server giữ: vỗ tay 3 giây, pháo giấy 2.5 giây, trái tim 3.5 giây, lightstick 0.4 giây. Bị choáng thì không làm được và các hành động đang diễn bị dừng. Ngồi hoặc đang hát vẫn làm được.
- Pháo giấy dùng **một đối tượng Points duy nhất** (một lệnh vẽ) cho mọi đợt, 40 hạt mỗi đợt (24 ở chế độ nhẹ), không có hạt thì không tốn gì.

### 5.6 Voice chat
- Mic **mặc định tắt**, bấm **M** (hoặc nút Mic) để nói. Cần cho phép micro; không cho thì vẫn nghe được người khác.
- **Luật gần xa**: nghe rõ nhất khi đứng trong **1.8 m**, nhỏ dần, **im từ 8 m**. Âm lượng tối đa bằng 3/5 mức tối đa.
- Người đang **hát** thì cả phòng nghe đều ở mức 3/4, không theo gần xa.
- Cách làm: xem 6.3.

### 5.7 Sân khấu và karaoke
- Mỗi sân khấu có **1 mic đứng**, **2 loa ở hai góc phía khán giả**, **1 màn hình nhắc lời** có chân đứng và **1 đèn treo**.
- Đứng trong 3 m quanh chỗ hát thì hiện **Hát** (E / nút). Bấm thì bạn đứng im sau mic, quay mặt về khán giả, **mic tự bật** (hát xong trả về như cũ). Mỗi sân khấu một người hát.
- **Mic hát khác mic voice thường**: đi qua chuỗi hiệu ứng (6.4) trước khi gửi. Người hát **không nghe lại giọng của mình**.
- **Màn hình nhắc lời** chiếu song song với màn hình lớn (cùng video, tắt tiếng, bám đúng thời điểm). Hình chỉ hiện trên máy người hát; người khác thấy màn hình đen. Đặt lệch sang bên và xoay vào mắt người hát để cột mic không che (đã kiểm tra bằng tính toán hình học).
- **Đèn sân khấu** chỉ sáng khi có người hát: chùm sáng hình nón và vòng sáng tròn trên sàn, mọi người đều thấy.

### 5.8 Âm thanh hiệu ứng
- **Bước chân** (file chạy trên cỏ, cắt từng bước, phát ngẫu nhiên): mỗi 1.5 m đi được một bước; xa nhỏ gần to, lệch trái/phải theo hướng nguồn âm; tối đa 1/20 mức tối đa. Tắt khi ngồi hoặc choáng.
- **Tiếng tát** (file có 4 tiếng, phát ngẫu nhiên): phát khi có người bị đánh trúng, cả phòng nghe (xa thì nhỏ), tối đa 1/2 mức tối đa.
- **Tiếng vỗ tay** (file khán giả vỗ tay, cắt một đoạn 3 giây): phát khi có người vỗ tay, cả phòng nghe như nhau, tối đa 0.04; tối đa 2 tiếng chồng nhau để không thành tiếng ồn.

### 5.9 Điều khiển

| Việc | Máy tính | Điện thoại |
|---|---|---|
| Đi | W A S D | cần gạt trái |
| Nhìn | chuột | kéo ở nửa phải màn hình |
| Bật/tắt mic | M | nút Mic |
| Ngồi / đứng / hát / dừng hát | E | nút Ngồi/Đứng/Hát |
| Đánh | chuột trái hoặc F | nút Đánh |
| Hành động (vỗ tay, pháo, lightstick, tim) | phím 1, 2, 3, 4 | nút Hành động, rồi chọn biểu tượng |
| Chat | Enter | nút Chat |
| Mở menu | Esc | nút Menu |

Điện thoại **bắt buộc xoay ngang** (dọc thì bị phủ lời nhắc). Bấm "Vào rạp" trên điện thoại sẽ vào toàn màn hình.

### 5.10 Menu và cài đặt (lưu trong trình duyệt)
- Thanh âm lượng: **video** (0–100%), **voice** (0–100% so với mức thiết kế), **hiệu ứng** bước chân và tát (0–200%).
- **Chất lượng đồ hoạ**: Tự động / Thấp / Cao.
- Ô tick **Hiện FPS**. Dòng trạng thái góc trái trên cho biết kết nối, mic, và **"nối x/y"** (x người đã nối voice được trong y người khác) để chẩn đoán khi mất tiếng.

### 5.11 Hiệu năng
- **Tự phát hiện máy chỉ có đồ hoạ phần mềm** (không có tăng tốc card đồ hoạ) và bật **chế độ nhẹ**: bỏ đèn điểm, bỏ khử răng cưa, độ nét 0.75x, video 480p, đèn sân khấu chỉ dùng hình giả.
- Nếu FPS dưới 30 thì **tự hạ độ nét** dần (thấp nhất 0.5x).
- Ghế dùng một lệnh vẽ chung cho mỗi bộ phận (InstancedMesh) thay vì hàng trăm khối riêng.

## 6. Chi tiết kỹ thuật quan trọng

### 6.1 Video 3D: ghép hai lớp
YouTube không dùng làm texture WebGL được. Nên trang có **hai lớp chồng nhau**: lớp CSS3D (phía sau) chứa iframe YouTube, và lớp WebGL (phía trước, nền trong suốt). Mặt màn hình trong cảnh WebGL là một "**lỗ**" (vật liệu alpha = 0), cho iframe hiện xuyên qua đúng chỗ, và vẫn bị ghế/tường che đúng thứ tự. Màn hình nhắc lời ở sân khấu dùng cùng cách.

### 6.2 Đồng bộ trạng thái
- Server là **nguồn sự thật** cho: ghế, sân khấu, choáng, video. Client chỉ *xin* (ngồi, hát, đánh, phát/dừng...) và chỉ thay đổi hiển thị **sau khi server xác nhận**.
- Vị trí thì client tự quyết và server chỉ chuyển tiếp (không kiểm tra), nên phù hợp nhóm bạn bè, không phải môi trường cần chống gian lận.

### 6.3 Voice: mesh, báo hiệu và âm lượng gần/xa
- **Kết nối**: ai bật voice thì gửi `hello` cho mọi người; khi cả hai đã bật, người có id nhỏ hơn tạo offer (tránh hai bên cùng offer). Tin báo hiệu đi qua server (`signal`).
- **Âm lượng gần/xa áp dụng ở người nói**: mỗi người nghe nhận một bản giọng có âm lượng riêng (một bộ chỉnh `GainNode` cho từng kết nối). Nhờ vậy **iPhone** (không cho web chỉnh âm lượng) nghe cũng đúng luật.
- **Dự phòng**: nếu thiết bị người nói không dùng được cách trên (Web Audio không chạy, thử âm không ra tiếng, hoặc giữa chừng bị dừng) thì tự quay về gửi giọng gốc và để **người nghe tự hạ âm lượng**. Người nói báo cách đang dùng qua tin `send-mode`.
- **Đèn sáng khi nói** đo trên tín hiệu nhận được, có bù lại phần đã hạ theo khoảng cách.

### 6.4 Mic hát
Chuỗi xử lý ngay trên máy người hát (`vocalChain.js`), mặc định cố định trong code:

| Bước | Giá trị |
|---|---|
| Lọc tiếng ù | cắt dưới 100 Hz |
| EQ | −2 dB ở 200 Hz, +2 dB ở 4 kHz |
| Nén | ngưỡng −24 dB, tỉ lệ 3:1 |
| Echo | trễ 0.3 s, mức 0.16, hồi tiếp 0.35 (lặp 1–2 lần, lần 3 rất nhỏ) |
| Reverb | vang 1.5 s, pha 22% (tiếng vang tự tạo, không cần file) |
| Chặn đỉnh | −2 dB |

Khi hát bỏ khử nhiễu và tự chỉnh âm lượng của trình duyệt (hai thứ này làm hỏng giọng hát kéo dài), giữ khử vọng, và nâng trần chất lượng truyền lên 96 kbps.

### 6.5 Hình học (đơn vị mét)
Phòng: x −10…10, z −11…7 (màn hình ở z = −10.9, khán giả nhìn về −z), cao 9. Ghế ở z từ −1 trở về sau, bậc cao dần 0.4 m mỗi hàng. Sân khấu ở x = ±8.25, cao 0.5 m. Mắt người chơi cao 1.6 m, tốc độ đi 4 m/s.
Số lượng ghế (18) và sân khấu (2) được **khai báo ở hai nơi** (`cinema.js` và `server/index.js`), đổi một nơi thì phải đổi nơi kia.

## 7. Giao thức mạng (Socket.IO)

**Client → server**

| Sự kiện | Dữ liệu | Việc |
|---|---|---|
| `join` | `{name, color}` | vào phòng |
| `move` | `{x, y, z, ry}` | gửi vị trí (~15 lần/giây) |
| `chat` | `{text}` | nhắn tin |
| `sit` / `stand` | `{seat}` / – | ngồi ghế / đứng dậy |
| `sing` / `stop-sing` | `{stage}` / – | lên / xuống sân khấu |
| `punch` | – | đánh |
| `emote` | `{type}` (`clap`, `confetti`, `heart`, `lightstick`) | làm hành động |
| `video-load` / `-play` / `-pause` / `-seek` | `{videoId}` hoặc `{position}` | điều khiển video |
| `signal` | `{to, data}` | báo hiệu WebRTC (hello, offer, answer, candidate, send-mode) |

**Server → client**

| Sự kiện | Việc |
|---|---|
| `init` | danh sách người trong phòng, video đang chiếu, cấu hình STUN/TURN |
| `player-joined` / `player-left` / `player-moved` | người vào, rời, di chuyển |
| `room-full` | phòng đã đủ 10 người |
| `chat` | tin nhắn của cả phòng |
| `seat-update` / `seat-denied` | ghế được cập nhật / bị từ chối |
| `stage-update` / `stage-denied` | sân khấu được cập nhật / bị từ chối |
| `stun` | có người trúng đòn (`id`, `by`, `duration`) |
| `swing` | có người vung tay tát (trúng hay hụt) |
| `emote` | có người làm hành động (lightstick kèm `on`: đang cầm hay đã cất) |
| `video-state` | trạng thái video mới |
| `signal` | báo hiệu WebRTC từ người khác |

## 8. Triển khai

- Build: `npm run build` (cài và build client, cài server). Chạy: `npm start` (một server phục vụ cả web lẫn realtime). Cổng lấy từ biến `PORT`.
- Hosting: **Render** qua `render.yaml` (gói free). Tự build lại mỗi khi có commit mới lên GitHub.
- Biến môi trường tuỳ chọn: `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` để voice nối được qua các mạng khó (4G, mạng công ty).
- Cần HTTPS để dùng micro (Render có sẵn).

## 9. Giới hạn đã biết

- **Trạng thái nằm trong RAM**: server khởi động lại hoặc ngủ (gói free Render ngủ sau ~15 phút không dùng, mở lại mất khoảng nửa phút) thì mất phòng và video; mọi người vào lại là được. Ba phòng, mỗi phòng tối đa 10 người (cả rạp tối đa 30).
- **Voice qua mạng khác nhau có thể không nối được** nếu chưa cấu hình TURN.
- **Voice trên iPhone/iPad chưa được kiểm chứng trên thiết bị thật** (chỉ thử bằng Chrome tự động). Có cơ chế dự phòng nhưng hiệu quả thực tế chưa biết.
- **Các tỉ lệ âm lượng** (bước chân 1/20, tát 1/2, mic hát 3/4, voice 3/5) là **mức cài đặt so với mức tối đa**, không phải độ to đo được so với YouTube; nghe bằng tai rồi chỉnh các hằng số.
- **Màn hình nhắc lời** cần chạy thêm một trình phát YouTube trên máy người hát (nặng hơn trên máy yếu).
- **Quảng cáo YouTube** vẫn có thể hiện và làm lệch hình giữa những người xem khác nhau (chưa xử lý).
- Server **không kiểm tra vị trí** người chơi (ví dụ có thể bấm hát từ xa nếu sửa client); phù hợp nhóm bạn bè.
- Ảnh trong repo (`wall-photo.jpg`) sẽ công khai nếu repo GitHub để Public.

## 10. Những hằng số hay muốn chỉnh

| Muốn chỉnh | Ở đâu | Hằng số |
|---|---|---|
| Voice nghe tối đa/gần/xa | `client/src/main.js` | `VOICE_MAX`, `VOICE_NEAR`, `VOICE_FAR`, `STAGE_MIC_VOLUME` |
| Echo, reverb, EQ khi hát | `client/src/audio/vocalChain.js` | `ECHO`, `REVERB`, `COMPRESSOR`... |
| Âm lượng bước chân, tát | `client/src/audio/sounds.js` | `maxGain` của từng loại |
| Độ sáng đèn trần, ánh sáng nền | `client/src/scene/cinema.js` | `CEILING_LIGHT_INTENSITY`, `AMBIENT_INTENSITY` |
| Đèn sân khấu | `client/src/scene/cinema.js` | `STAGE_BEAM_OPACITY`, `STAGE_BEAM_RADIUS`... |
| Vị trí màn hình nhắc lời | `client/src/scene/cinema.js` | `MONITOR_SIDE_OFFSET`, `MONITOR_CENTER_Y` |
| Tầm đánh, thời gian choáng | `server/index.js` | `PUNCH_RANGE`, `STUN_MS`, `PUNCH_COOLDOWN_MS` |
| Số người tối đa mỗi phòng, danh sách phòng | `client/src/rooms.js` | `MAX_PLAYERS`, `ROOMS` |
