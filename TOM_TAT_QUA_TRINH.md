# Tóm tắt quá trình làm dự án Rạp chiếu phim 3D

Tài liệu này tóm tắt **toàn bộ cuộc trò chuyện** làm dự án: đã làm gì, quyết định gì, gặp vấn đề gì, và còn gì dang dở. Mô tả hệ thống hiện tại xem ở [DESIGN.md](DESIGN.md).

- Repo GitHub: https://github.com/HoangVanNghiaTB/cinema-NghiaHandsome
- Hosting: Render (tự build lại mỗi khi có commit mới trên nhánh `main`)
- Node.js cài ở `C:\Software\NodeJs\` (không nằm trong PATH mặc định của một số terminal)

---

## 1. Mục tiêu và các quyết định ban đầu

Web 3D bối cảnh rạp chiếu phim: dán link YouTube thì chiếu lên màn hình lớn, ~10 người cùng vào, xem đồng bộ.

Các quyết định đã chốt:
- Ai cũng điều khiển được video (không cần host).
- Có voice chat ngay trong bản đầu.
- Đồ hoạ tối giản nhất có thể.
- Triển khai trên hosting (Render), không chỉ chạy local.

## 2. Các giai đoạn đã làm

### 2.1 Dựng nền tảng (7 bước theo kế hoạch ban đầu)
1. **Khung client**: Vite + Three.js, camera góc nhìn thứ nhất (WASD + chuột).
2. **Dựng rạp**: sàn, tường, màn hình 16:9, ghế bậc thang.
3. **Chiếu video**: iframe YouTube đặt trong không gian 3D bằng CSS3DRenderer, ghép với lớp WebGL qua "lỗ" alpha ở mặt màn hình.
4. **Server realtime**: Node + Socket.IO, avatar (viên nhộng + nhãn tên).
5. **Đồng bộ video**: server giữ `{videoId, playing, position}`, người vào sau vào đúng đoạn đang chiếu, tự tua lại nếu lệch hơn 2 giây.
6. **Voice chat**: WebRTC thuần (mesh), báo hiệu qua Socket.IO (thay cho PeerJS ghi trong kế hoạch cũ).
7. **Hoàn thiện**: màn hình nhập tên và chọn màu, chat chữ, giới hạn 10 người, trạng thái kết nối.

Triển khai: server Express phục vụ luôn client đã build; `render.yaml`; TURN cấu hình qua biến môi trường; đẩy code lên GitHub và deploy trên Render (thành công).

### 2.2 Hiệu năng (FPS thấp)
- Người dùng báo FPS chỉ 12–20. Qua `chrome://gpu` phát hiện máy chỉ có **đồ hoạ phần mềm** (Microsoft Basic Render Driver, WebGL "Software only").
- Người dùng muốn **không phải sửa máy**, nên làm: tối ưu vật liệu (Lambert), ghế dùng InstancedMesh, hạ độ nét, **chế độ nhẹ tự bật** khi phát hiện đồ hoạ phần mềm, tự hạ độ nét khi FPS dưới 30, ô chọn chất lượng đồ hoạ, ô ẩn/hiện FPS.
- Kết quả: bản local chạy khoảng 60 FPS ở chế độ nhẹ.

### 2.3 Chỉnh phòng và nội thất (theo yêu cầu từng bước)
Giảm đèn trần còn 2 đèn ở cuối phòng, thêm ánh sáng nền; sàn `#770000`; bậc thang màu xám tối kèm vạch sáng ở mép; tường navy `#2b3a5c`; rút ngắn phòng (còn 20 × 18 m); ghế làm lại (nệm, lưng tựa, tay vịn, chân đế), **18 ghế** (3 hàng × 2 cột × 3 ghế); ảnh treo giữa tường sau (ban đầu để trên trần, sau chuyển xuống tường).

### 2.4 Điện thoại
Điều khiển cảm ứng (cần gạt, kéo nhìn, nút Menu/Chat/Mic/Đánh/Ngồi), **bắt buộc xoay ngang**, menu cuộn được. Ngồi ghế thì không đi được và cần gạt bị ẩn.

### 2.5 Tương tác giữa người chơi
- **Ngồi ghế** (E / nút), server giữ ghế (một ghế một người).
- **Đánh** (chuột trái/F/nút): server kiểm tra tầm 1.8 m, góc trước mặt, chờ 1 giây; người bị đánh **choáng 2 giây** (không đi/xoay, màn hình rung, vòng sao 3D quay quanh đầu), bị văng khỏi ghế hoặc sân khấu.
- **Âm thanh hiệu ứng** từ file có sẵn: tiếng bước chân (tối đa 1/20, xa nhỏ gần to), tiếng tát (tối đa 1/2).

### 2.6 Sân khấu và karaoke
- **2 sân khấu** ở hai góc phía trước, mỗi sân khấu: mic đứng, 2 loa ở 2 góc, màn hình nhắc lời có chân đứng, đèn treo.
- **Hát** (E gần sân khấu): đứng im sau mic, mic tự bật, giọng cả phòng nghe đều (3/4), có **chuỗi hiệu ứng** (lọc, EQ, nén, echo lặp 1–2 lần, reverb, limiter); người hát không nghe lại giọng mình.
- **Màn hình nhắc lời** chiếu song song với màn hình lớn bằng một trình phát YouTube thứ hai (tắt tiếng, chỉ dựng cho người đang hát). Đã tính hình học để **cột mic không che** màn hình (lệch sang bên, xoay vào mắt người hát).
- **Đèn sân khấu**: chùm sáng và vòng sáng tròn, chỉ sáng khi có người hát, mọi người đều thấy.

### 2.6b Voice chat: luật gần xa và sự cố
- Ban đầu voice nghe cả phòng ở mức tối đa. Đã thêm **luật gần xa**: nghe tối đa khi đứng trong 1.8 m, **im từ 8 m**; mức tối đa bằng 3/5.
- **Sự cố 1**: bạn của người dùng dùng **iPhone** ở mạng khác nghe người dùng ở mọi khoảng cách (luật gần xa không áp dụng). Nguyên nhân khả dĩ: iPhone không cho web chỉnh âm lượng và đường dự phòng chưa hoạt động. Đã chuyển sang cách **người nói tự hạ âm lượng riêng cho từng người nghe** (kèm cơ chế dự phòng về cách cũ). **Chưa kiểm chứng trên iPhone thật.**
- **Sự cố 2**: có lúc người dùng báo mất tiếng và đèn "đang nói" không sáng. Thử bằng Chrome tự động với micro giả thì tiếng và đèn đều chạy. Đã thêm chỉ báo **"nối x/y"** ở góc màn hình để chẩn đoán lần sau. Nguyên nhân thật ở máy người dùng **chưa xác định** (nghi ngờ voice không nối được giữa hai mạng do thiếu TURN, hoặc khoảng cách).

### 2.7 Menu và điều khiển video
- 3 thanh âm lượng: **video**, **voice** (% so với mức thiết kế, mặc định 100), **hiệu ứng**.
- Nút video gọn lại chỉ có biểu tượng: một nút **phát/tạm dừng** gộp, tua **±10 giây / 30 giây / 5 phút / 30 phút**.
- **Tắt phụ đề tự động** của YouTube (gỡ mô-đun phụ đề). *Chưa kiểm chứng trên YouTube thật.*

### 2.8 Hành động nhân vật (mới nhất)
Phím **1** vỗ tay (có tiếng vỗ tay khán giả, cả phòng nghe, tối đa 0.04), **2** pháo giấy (bắn lên rồi biến mất, không rơi), **3** lightstick (theo màu avatar), **4** trái tim (hai tay chạm đầu). Điện thoại có nút **Hành động** mở hàng biểu tượng. Cú tát nay có tay: người tát thấy tay của mình, người khác thấy tay avatar vung ra.

### 2.9 Tài liệu
Tạo [DESIGN.md](DESIGN.md) mô tả thiết kế hệ thống; xoá `PLAN.md` (kế hoạch ban đầu đã lỗi thời).

## 3. Cách kiểm tra mà mình đã dùng
Vì không có thiết bị thật, phần lớn được thử bằng **Chrome tự động (puppeteer-core) với micro giả**: mở hai cửa sổ vào cùng phòng, bấm phím, đo mức tín hiệu âm thanh, chụp ảnh màn hình. Cách này kiểm chứng được logic và hiển thị cơ bản, nhưng **không thay thế được thử trên máy thật** (đặc biệt iPhone, mạng khác nhau, độ to thực tế của âm thanh).

## 4. Trạng thái hiện tại

**Đã đẩy lên GitHub và Render** (commit mới nhất `6c55ce1`): mọi thứ tới hết đèn sân khấu.

**Chưa commit, chưa đẩy lên** (chỉ có ở máy local):
- Nút video mới (tua 30 giây/5 phút/30 phút, nút phát/dừng gộp) và việc tắt phụ đề.
- Toàn bộ hệ thống hành động nhân vật (vỗ tay, pháo giấy, lightstick, trái tim, tay tát): file mới `avatarHands.js`, `confetti.js`, `fpHand.js`, `clap.mp3`, và các chỗ sửa ở `main.js`, `avatars.js`, `sounds.js`, `touch.js`, `socket.js`, `server/index.js`, `index.html`.
- `DESIGN.md` mới và việc xoá `PLAN.md`.
- File tóm tắt này.

Muốn đưa lên bản Render thì commit và push, Render sẽ tự build lại.

## 5. Còn dang dở / chưa kiểm chứng

- **Voice trên iPhone/iPad** với cách "người nói tự hạ âm lượng": chưa thử trên thiết bị thật.
- **Mất tiếng voice giữa hai mạng**: chưa tìm ra nguyên nhân thật; nếu "nối 0/1" thì cần thêm máy chủ TURN (biến `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` trên Render).
- **Tắt phụ đề YouTube**: dựa trên lệnh không có trong tài liệu chính thức; cần thử trên Chrome đang hay hiện phụ đề.
- **Âm lượng**: các tỉ lệ (bước chân 1/20, tát 1/2, vỗ tay 0.04, mic hát 3/4, voice 3/5) là mức cài đặt, **không phải độ to đo được** so với YouTube; cần nghe bằng tai rồi chỉnh các hằng số.
- **Hiệu ứng nhìn bằng mắt thật**: đèn sân khấu, hành động nhân vật, hình karaoke có khớp khung màn hình không (mình chỉ kiểm tra bằng ảnh chụp từ môi trường tự động độ nét thấp).
- **Quảng cáo YouTube** có thể làm lệch hình giữa những người xem khác nhau (chưa xử lý).
- Người đang hát mà chưa cho phép micro thì không hát được (chỉ báo bằng tin nhắn trong khung chat).
- Ở bản tự động chưa kiểm chứng cú tát **trúng người** thật trong ảnh chụp.

## 6. Ý tưởng chưa làm
- Cho người khác cũng thấy màn hình nhắc lời sáng khi có người hát (hiện chỉ người hát thấy hình).
- Thêm hành động khác (nhảy, vẫy tay, thả tim bay lên).
- Tiếng "bụp" cho pháo giấy nếu có file âm thanh.
- Thấy hiệu ứng hành động của chính mình (hiện chỉ người khác thấy).
- Lưu trạng thái phòng ra ngoài RAM (hiện server ngủ hoặc khởi động lại là mất phòng và video).

## Nhân vật trái cây + phụ kiện
- Nhân vật kiểu hoạt hình robot trái cây: thân tròn mập mặc áo màu trái cây, mặt hồng nhô ra như cửa sổ (mắt trắng đồng tử đen, lông mày cau, má hồng, miệng tròn/vuông/"-" đổi khi nói), tay chân bé xíu, lá/cuống trên đầu. Không dùng file mô hình: toàn hình học đơn giản (`client/src/scene/fruitRig.js`), động tác là co giãn/lắc theo thời gian (đi nhún, nhảy khi cầm lightstick, lắc khi choáng, thở nhẹ, chớp mắt). Hai tay là hai quả cầu lơ lửng của `AvatarHands` (các hành động cũ vẫn chạy).
- Loại trái (táo, cam, chuối, dâu, nho, đào, chanh xanh; dâu có hạt), mũ, kính, tai nghe/tai mèo, balo/cánh/đuôi, màu thân: `looks.js` (dữ liệu, server cũng dùng để kiểm tra), `accessories.js` (dựng hình). Chọn ở menu (mục "Nhân vật"), lưu localStorage `cinema-look`, gửi qua server (`look` / `look-update`). Chọn trái thì thân đổi màu theo trái; chọn "Màu thân" thì đè lên.
- Thân cao ~1.1 m nên mắt hạ xuống `EYE_HEIGHT = 0.9` (ngồi `SEATED_EYE_HEIGHT = 0.65`), bán kính va chạm `PLAYER_RADIUS = 0.38`; mic sân khấu, màn karaoke, bảng chỉnh âm hạ theo. (Trước đó đã thử robot RobotExpressive CC0 dạng xương, đã bỏ.)
- 4 kiểu nhân vật (`KINDS` trong `looks.js`): mập mặt nam, mập mặt nữ (mắt to có mi, má hồng đậm, môi hồng, nơ), gầy đầu tròn mặt nam (tóc ngắn), gầy đầu tròn mặt nữ (tóc có hai búi). Chọn ở menu mục "Kiểu"; đổi kiểu thì dựng lại thân (`Avatars.build`). Thân được nâng lên khỏi sàn, mỗi chân là một nhóm xoay quanh hông (bàn chân bé xíu, vung khi đi). Miệng im là nụ cười cong, nói thì đổi tròn / vuông / "-". Mắt người chơi `EYE_HEIGHT = 1.0`, ngồi `0.7`.

## Mini game treo tường
- Mỗi game là một "tranh" ở tường trái/phải (`scene/gamePanels.js`, danh sách `GAME_PANELS`). Đứng trong 2.2 m, nhấn E (điện thoại: nút "Chơi game") mở overlay `#game`; Esc / nút Đóng / bị đánh choáng thì đóng. Dòng chữ trên tranh là trạng thái trực tiếp (ai đang chơi, kỷ lục) do server đẩy qua `game-brief`.
- Khung: `client/src/games/index.js` (`GAMES` + `createGameHost`), mỗi game một file `{ title, mount(rootEl, ctx) -> { state(s), destroy() } }`; `ctx.send(data)` gửi thao tác lên server. Server: `server/games.js`, mỗi game `{ state(), brief(), act(player, data), leave(id) }`, sự kiện `game-open` / `game-close` / `game-act`, người mở game vào socket room `game:<id>` để nhận `game-state`.
- 4 game: Cờ Caro (13x13, 5 quân liền hàng, 2 người ngồi hai phía, người khác xem; đóng game = rời bàn), Đập chuột (cả phòng đua 30 giây, server cấp chuột và quyết ai trúng trước), Rắn và 2048 (chơi ở client, server chỉ giữ top 5 kỷ lục, chặn điểm vô lý và gửi dồn dập). Kỷ lục chỉ nằm trong bộ nhớ server và bị xoá khi phòng trống quá 60 giây (`ROOM_RESET_MS`, xem mục Điểm của rạp), không lưu giữa các lần mở phòng.
- Thêm game mới: một dòng ở `GAME_PANELS`, một file ở `client/src/games/` (đăng ký ở `games/index.js`), một game ở `server/games.js` (đăng ký trong `createGames`). Tường còn chỗ: tường trái/phải ở z = 2 (sàn cao 0.8, y ≈ 1.9) và tường sau hai bên bảng mic.
- Overlay dùng % và JS tính cỡ (không dùng vh/vw) vì trang điện thoại dọc bị xoay ngang bằng CSS.
- Đợt 2 (3 game, 3 tranh): **Bầu cua / Tài xỉu** chung tranh `dice` (hai tab; ai cũng bắt đầu 1000 điểm ảo, mở ván thì cược 20 giây, server lắc 3 xúc xắc; Tài xỉu bộ ba nhà cái ăn, Bầu cua ra k con ăn k lần; hết tiền < 10 được trợ cấp 200 điểm), **Bình chọn phim** `vote` (tranh ở tường sau, x = 4.5; dán link YouTube, mỗi người 1 phiếu, tối đa 3 đề xuất mỗi người / 10 tổng, "Chiếu" gọi `video-load` rồi gỡ đề xuất; tiêu đề lấy qua noembed.com, không được thì hiện mã video), **Nối 4** `connect4` (7x6, 2 người, giống Caro). Tranh dice và connect4 ở z = 2 hai bên tường (y = 1.9). `ctx.playVideo` / `ctx.close` có sẵn cho game cần chiếu video hoặc tự đóng.
- Đồ hoạ xúc xắc / Nối 4: Tài xỉu vẽ mặt xúc xắc có chấm (nhất, tứ đỏ), Bầu cua vẽ mặt linh vật kèm tên, cả hai nảy và xoay khi lắc (CSS `die-roll`). Nối 4: quân mới rơi từ mép trên, nhanh dần rồi nảy nhẹ; quân nằm sau khung xanh (khung đục lỗ bằng `evenodd`) nên chỉ thấy qua các lỗ; viền nước đi và hàng thắng chỉ hiện sau khi quân rơi xong.

## Điểm của rạp (ví chung)
- Ai vào phòng có 500 điểm (`economy.js`: `START_POINTS`, `SING_COST` = 50, `TIP_AMOUNTS`, `EARN_RULES`). Server giữ trong `server/wallet.js`, khoá bằng `clientId` (localStorage `cinema-client-id`, gửi lúc `join`) nên tải lại trang vẫn giữ điểm và đồ đã mua, không được phát lại 500. Dữ liệu (điểm, đồ đã mua, xếp hạng game) chỉ nằm trong bộ nhớ, xoá khi phòng trống quá `ROOM_RESET_MS` (mặc định 60 giây, biến môi trường cùng tên để thử). `cid` là khoá tài khoản nên không bao giờ gửi cho client khác (`publicPlayer` ở `server/index.js`).
- Server báo điểm cho từng người bằng sự kiện `wallet` `{ pts, owned, delta, reason }`; có `reason` thì client hiện thông báo +/− điểm nhỏ (`#toasts`). Số điểm ở góc trái trên (`#points`, chạm hoặc phím P mở ví). Ví là một "game cục bộ" (`client/src/games/wallet.js`, `local: true`) với 3 tab: Tặng điểm (sự kiện `tip`, mức 10/50/100), Cửa hàng (`shop-buy`), Kiếm điểm.
- Hát karaoke: bấm E gần sân khấu thì lên sân khấu ngay (đèn sáng, `stage-update` với `paid: false`) nhưng chưa phát tiếng; thông báo nhỏ `#sing-prompt` ở mép trên giữa: "Dùng 50 điểm để vào hát?" (Y / N hoặc chạm nút). Y gửi `sing-pay`, server trừ 50 điểm rồi phát `paid: true` mới bật mic hát, màn karaoke, chuỗi giọng. N, không đủ điểm, hoặc không trả lời trong 15 giây (`SING_PROMPT_MS`) thì tự xuống sân khấu. Chỉ người đã trả (`paidSingers`) mới được nghe vang cả phòng.
- Phụ kiện (mũ, kính, tai nghe/tai mèo, balo/cánh/đuôi) phải mua (`ITEM_PRICES` trong `scene/looks.js`); kiểu nhân vật, trái cây, màu thân miễn phí. Vào phòng chỉ có nhân vật trơn: server lọc phụ kiện chưa mua bằng `limitLook` (cả lúc vào lẫn lúc đổi `look`), menu nhân vật khoá món chưa mua và ghi giá.
- Kiếm điểm: Caro/Nối 4 thắng +40 (đã đi đủ nước), hoà +10; Đập chuột 1 điểm thưởng mỗi 2 điểm ván (tối đa 30) và hạng nhất +15; Rắn mỗi 2 điểm 1 thưởng (tối đa 25), 2048 mỗi 150 điểm 1 thưởng (tối đa 30), hai game đơn thưởng cách nhau ≥ 20 giây; Bầu cua/Tài xỉu cược bằng điểm chung (không còn điểm riêng, không trợ cấp); phim bình chọn được chiếu: chủ phim +5 mỗi phiếu của người khác (tối đa 25), người bầu +2.

## Nhiều phòng
- 3 phòng (`client/src/rooms.js`, dữ liệu thuần, server cũng import): **ae siêu nhân** (khoá bằng mật khẩu, có ảnh treo tường) và **Phòng khách 1 / 2** (không mật khẩu, không ảnh). Mỗi phòng tối đa `MAX_PLAYERS` = 10 người, ba phòng nên cả rạp tối đa 30 người. Mỗi phòng là một namespace socket.io riêng (`/ae`, `/khach1`, `/khach2`) nên người chơi, chat, video, bảng âm, điểm, phụ kiện đã mua và xếp hạng game không lẫn sang phòng khác (điểm tính riêng từng phòng).
- Server: `createRoom(nsp, cfg)` trong `server/index.js` gói toàn bộ trạng thái và xử lý một phòng. **Mật khẩu KHÔNG ghi trong code** (repo công khai): đặt biến môi trường `ROOM_PASSWORD_<ID viết hoa>` (phòng ae: `ROOM_PASSWORD_AE`, khai báo ở `render.yaml` với `sync: false`, điền trên Render dashboard). Phòng khoá mà chưa có biến thì báo "chưa cài mật khẩu" và không ai vào được. Mật khẩu kiểm tra ở middleware namespace (socket sai mật khẩu không bao giờ tới được các xử lý game), so sánh băm SHA-256 bằng `timingSafeEqual`; một địa chỉ sai quá 8 lần trong 10 phút thì bị chặn (`too-many`). `GET /api/rooms` trả số người từng phòng cho màn hình đăng nhập.
- Client: màn hình đăng nhập có ô chọn phòng (hiện "x/10") và ô mật khẩu (chỉ hiện với phòng khoá); nhớ phòng và mật khẩu lần trước ở localStorage (`cinema-room`, `cinema-room-pass`). Ảnh treo tường bật/tắt theo phòng bằng `cinema.setPhotoVisible`. Chạy thử trên máy: `ROOM_PASSWORD_AE=<mật khẩu> node server/index.js`.
- Đo tải (giả lập bằng bot): server 30 người trong một phòng ≈ 9% một lõi CPU (cao hơn mức thực tế vì mỗi phòng chỉ 10 người, cả rạp 30). Phía người chơi mỗi nhân vật trong khung nhìn tốn khoảng 25 lệnh vẽ: 20 lệnh khi chỉ có mình, ≈ 225 lệnh với 9 người khác (phòng đầy 10 người, trường hợp xấu nhất: tất cả đứng trước mặt, đều có mũ + kính + đuôi). Voice là mạng lưới (mỗi người nối với mọi người khác trong phòng) nên mỗi phòng 10 người là 9 kết nối mỗi máy.

## Tối ưu: voice theo khoảng cách và giảm lệnh vẽ
- **Voice chỉ nối với người ở gần** (`net/voice.js` + `main.js`): vùng nghe là 7 m (`VOICE_FAR`), nên chỉ nối đường WebRTC khi người kia vào trong `VOICE_LINK_DIST` = 9 m và chỉ ngắt khi ra ngoài `VOICE_UNLINK_DIST` = 11 m (vùng đệm tránh nối/ngắt liên tục ở ranh giới). Người đã trả điểm và đang hát được nối với tất cả (cả phòng đều nghe), và khi mình đang hát thì nối với tất cả. Mỗi 0,5 giây xét lại ai cần nối / ngắt; ngắt thì gửi tin `bye` cho bên kia và chờ 3 giây mới nối lại (trừ khi họ lên hát); kết nối hỏng thì chờ 5 giây. Bên có id nhỏ hơn vẫn là bên tạo offer. Dòng "mic x/y" ở góc là số đường đã nối / số đường đang giữ (chỉ người ở gần). Đã thử bằng hai trình duyệt thật: gần thì 1/1, đi xa ~19 m thì 0/0, quay lại gần thì nối lại, người đã trả điểm hát thì nối dù ở xa, dừng hát thì ngắt.
- **Giảm lệnh vẽ mỗi nhân vật, hình không đổi**: gộp mảnh trong `fruitRig.js` và `accessories.js`. Mỗi món phụ kiện (mũ, kính, tai, đồ sau lưng) là MỘT mesh (màu từng mảnh lưu thành màu đỉnh, vật liệu Lambert `vertexColors`); lá/cuống, nơ, tóc gộp theo chất liệu (`mergedParts`); mặt gộp tròng trắng (một mesh, chớp mắt co y quanh tâm hàng mắt nên vẫn chớp y như cũ), đồng tử, lông mày + mi, lấp lánh, má (`faceTemplate`). Chân, miệng, tay, tên giữ nguyên vì cử động riêng. Số mesh vẽ (chưa tính tay và nhãn tên) trung bình mỗi nhân vật: 25,3 → 14,1; với phòng đầy 10 người, số lệnh vẽ trong game thật giảm từ ≈ 224 xuống ≈ 147. Kiểm chứng "hình y hệt": dựng song song bản cũ và bản mới cho 84 bộ nhân vật (4 kiểu, 8 loại trái, từng phụ kiện, vài bộ đủ phụ kiện) ở cả lúc mở mắt và chớp mắt, so từng tam giác hiện ra (vị trí, pháp tuyến, màu thực tế, kiểu vật liệu): 0 khác; có phép đối chứng (dịch 1 cm thì bị phát hiện).
