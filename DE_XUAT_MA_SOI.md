# Đề xuất: thêm game Ma Sói vào rạp

Tài liệu để hai bên cùng bàn và chốt trước khi làm. Mục 2 liệt kê những gì đã chốt. Mục còn lại là đề xuất của mình, kèm lý do.

## 1. Tóm tắt

- Thêm **một tranh game "Ma Sói"** treo tường, mở bằng phím E như các tranh khác (giống Cờ Caro, Nối 4).
- **Server làm quản trò tự động**: chia bài, chạy ban đêm / ban ngày, đếm giờ, tính kết quả. Không cần người dẫn.
- **15 vai**, chia ba phe: Dân làng (9 vai), Ma Sói (4 vai) và phe thứ ba (2 vai). Chi tiết ở mục 4.
- **Vai được xáo ngẫu nhiên** mỗi ván, nhưng đội hình luôn được kiểm tra để tổng điểm cân bằng nằm trong khoảng **−3 đến +3** (mục 4.2).
- Mỗi ván **từ 5 đến 10 người**. Phải có **đủ 5 người ngồi vào bàn** mới được bắt đầu.
- **Phí 100 điểm mỗi người mỗi ván.** Thắng thì được lãi: **Sói và phe thứ ba lãi 100 điểm, Dân lãi 50 điểm**. Thua thì mất 100 phí (mục 5).
- **Điểm chỉ bị trừ ở đúng lúc ván bắt đầu.** Ngồi rồi mà không đủ người thì rời bàn không mất điểm. Ai dưới 100 điểm thì **không vào chơi được**.
- **Ban ngày thảo luận bằng mic voice thường của rạp** (người chơi đứng quanh tranh nên nghe nhau được). Game chỉ **tự tắt mic ban đêm, bật lại ban ngày**. Người chết bị tắt mic và tắt chat tới hết ván (mục 7.3).
- **Người chết hoặc bị treo cổ không bị lộ vai**; hết ván mới lật hết bài.

## 2. Những điều đã chốt

| # | Nội dung | Quyết định |
|---|---|---|
| 1 | Quản trò | Hệ thống tự làm, không cần người dẫn. |
| 2 | Điểm thưởng | Sói và phe thứ ba thắng lãi 100 điểm, Dân thắng lãi 50 điểm (mục 5). |
| 3 | Nói chuyện ban ngày | Dùng mic voice thường của rạp, không làm chế độ voice riêng. Game chỉ tắt mic ban đêm và bật lại ban ngày (mục 7.3). |
| 4 | Người chết | Được xem tiếp nhưng bị tắt mic và tắt chat. Hết trận mới được bật lại, hoặc thoát ra thì tự bật tắt được; thoát giữa trận là bỏ cuộc (mục 5, 7.3). |
| 5 | Vào giữa ván | Không được. Người vào sau chờ ván kế tiếp. |
| 6 | Chơi tiếp | Hết ván mọi người đứng khỏi bàn, ngồi lại và trả 100 điểm cho ván sau. |
| 7 | Chia vai | Hệ thống tự random, đội hình có tổng điểm từ −3 đến +3 (mục 4.2). |
| 8 | Điểm tối thiểu | Dưới 100 điểm không vào chơi được, hiện thông báo nhỏ (mục 3.1). |
| 9 | Ban ngày | Khoảng 120 giây (mục 3.2). |
| 10 | Người chết / bị treo | Không lộ vai, hết ván mới lật hết (mục 3.2). |
| 11 | Thoát giữa trận (kể cả người đã chết) | Mất phí, không hoàn điểm, không nhận lãi dù phe còn lại thắng (mục 5). |
| 12 | Nhóm thông đồng kiếm điểm | Không xử lý (mục 8). |
| 13 | Luật các vai phức tạp | Đồng ý theo cách hiểu ở mục 4.4. |

## 3. Một ván diễn ra thế nào

### 3.1 Bàn chờ
1. **Dưới 100 điểm thì không vào chơi được.** Mở tranh game Ma Sói mà chưa đủ 100 điểm thì hiện thông báo nhỏ "Cần ít nhất 100 điểm để chơi Ma Sói" và không mở cửa sổ game. Đủ điểm thì ngồi vào bàn được, tối đa 10 chỗ.
2. **Ngồi rồi đứng dậy lúc nào cũng được, không mất điểm**, miễn là ván chưa bắt đầu.
3. Khi có **từ 5 người ngồi trở lên**, nút "Bắt đầu" sáng lên. Ai trong bàn bấm thì server **đếm ngược 15 giây** cho người khác kịp ngồi. Đủ 10 người thì bắt đầu ngay.
4. Trong lúc đếm ngược, nếu có người đứng dậy và **tụt xuống dưới 5 người** thì **huỷ đếm ngược, không ai bị trừ điểm**.
5. Hết đếm ngược mà vẫn đủ 5 người thì server **kiểm tra điểm lần cuối rồi trừ 100 điểm của từng người**. Ai tới lúc đó không còn đủ 100 điểm (ví dụ vừa tiêu điểm chỗ khác) bị mời đứng dậy kèm thông báo nhỏ. Còn dưới 5 người thì ván huỷ và những người còn lại cũng không mất điểm.

### 3.2 Trong ván
1. **Chia bài.** Server xáo trộn rồi chia vai (mục 4.2). Mỗi người chỉ thấy vai của mình. Các Sói thấy nhau.
2. **Ban đêm** (khoảng 30 đến 45 giây). Mỗi vai có việc riêng, làm cùng lúc cho nhanh (mục 4). Vai không có việc cũng phải bấm "xong" sau một lúc ngẫu nhiên để người ngoài không đoán được vai qua thời gian chờ. **Ban đêm cả bàn không nói được.**
3. **Ban ngày** (khoảng **120 giây**). Server công bố ai chết đêm qua. **Chỉ nói tên, không nói vì sao chết và không lộ vai.** Cả bàn thảo luận bằng mic voice thường rồi **bầu treo cổ** một người. Phiếu nhiều nhất bị loại, hoà phiếu thì không ai bị loại. Phiếu bầu hiện công khai để có chất liệu thảo luận. **Người bị treo cũng không lộ vai.**
4. **Lặp lại** đêm rồi ngày tới khi có phe thắng (mục 4.3).

Hai vai buộc phải lộ ra qua hành động của chúng, dù không lật bài: **Thợ Săn** (khi chết còn được chọn một người chết theo) và **Hoàng Tử** (bị treo mà không chết). Server chỉ thông báo tên người chết, nhưng người chơi có thể suy ra vai. Mình để vậy cho hợp luật gốc.

### 3.3 Kết thúc
**Lật hết bài** cho cả bàn thấy và công bố phe thắng. Chia điểm theo mục 5. Mọi người đứng khỏi bàn, ai muốn chơi tiếp ngồi lại và trả 100 điểm cho ván sau.

## 4. Vai trò và cân bằng điểm

Mình dùng bảng điểm trong tài liệu bạn gửi (masoi.online) làm thước đo. Đây không phải chuẩn chính thức nên cần chơi thử rồi chỉnh.

Mình chọn 15 vai **không phụ thuộc chỗ ngồi** (bỏ Hiệp Sĩ Kiếm Rỉ, Kẻ Khủng Bố, Kẻ Mất Ngủ, Sói Đại Ca...) vì rạp không có "người ngồi bên trái" như bàn thật.

### 4.1 Danh sách 15 vai

**Phe Dân làng (9 vai)**

| Vai | Điểm | Việc làm |
|---|---|---|
| Dân làng | +1 | Không có chức năng. Chỉ thảo luận và bầu. |
| Tiên Tri | +7 | Mỗi đêm soi một người có phải Sói không. Kẻ Phản Bội soi ra là người. Sói Trắng soi ra là Sói. |
| Bảo Vệ | +4 | Mỗi đêm bảo vệ một người khỏi Sói. Không chọn cùng người hai đêm liền. |
| Thợ Săn | +3 | Khi chết (cả bị treo cổ) được chọn một người chết theo. |
| Phù Thủy | +5 | Một bình cứu, một bình độc, mỗi bình dùng một lần. Thấy ai bị Sói cắn trong đêm đó. |
| Thị Trưởng | +2 | Phiếu bầu treo cổ tính hai phiếu. Mọi người đều biết ai là Thị Trưởng (lộ vai từ đầu ván). |
| Hoàng Tử | +2 | Bị treo cổ lần đầu thì không chết, và lộ vai cho cả bàn. |
| Nhà Ngoại Cảm | +4 | Mỗi đêm chọn hai người, biết họ có cùng phe không (phe Dân hay phe Sói, phe thứ ba tính riêng). |
| Thần Tình Yêu | +3 | Đêm đầu chọn hai người thành đôi. Một người chết thì người kia cũng chết. Cặp đôi có thể thuộc bất cứ phe nào. |

**Phe Ma Sói (4 vai)**

| Vai | Điểm | Việc làm |
|---|---|---|
| Ma Sói | −6 | Cùng bầy Sói chọn một người để cắn mỗi đêm. |
| Sói Con | −8 | Khi bị loại, bầy Sói được cắn thêm một người vào đêm kế tiếp. |
| Sói Đầu Đàn | −9 | Từ đêm 2, một lần trong ván, biến người bị cắn thành Sói thay vì giết. Chỉ biến được khi sau đó số Sói vẫn ít hơn số người còn lại và Bảo Vệ không che người đó. |
| Kẻ Phản Bội | −6 | Biết Sói là ai và giúp Sói thắng, nhưng Sói không biết nó. Tiên Tri soi ra là người. |

**Phe thứ ba (2 vai)**

| Vai | Điểm | Việc làm và cách thắng |
|---|---|---|
| Chán Đời | −2 | Chỉ thắng nếu **bị dân làng treo cổ ban ngày**. Thắng thì ván kết thúc ngay, cả hai phe kia thua. |
| Sói Trắng | −2 | Thức dậy cùng bầy Sói, cứ hai đêm được giết thêm một Sói khác. Chỉ thắng nếu **là người cuối cùng còn sống**. Tiên Tri soi ra là Sói. |

### 4.2 Cách random vai (tổng điểm từ −3 đến +3)

Mỗi ván server tự chia vai, không cố định theo số người. Cách làm:

1. Biết số người N (5 đến 10), server **rút ngẫu nhiên N lá bài** từ bộ 15 vai theo các luật sau:
   - Số phe Sói (Ma Sói, Sói Con, Sói Đầu Đàn, Kẻ Phản Bội) phải đủ theo cỡ bàn: **1** người khi N = 5, **2** người khi N = 6 hoặc 7, **3** người khi N từ 8 đến 10. Trong đó luôn có ít nhất một **Sói thật** (không chỉ Kẻ Phản Bội).
   - Ma Sói được rút tối đa 3 lá. Dân làng không giới hạn. Các vai còn lại mỗi vai tối đa **một lá**.
   - **Phe thứ ba** (Chán Đời, Sói Trắng) chỉ xuất hiện khi N ≥ 8, và mỗi ván tối đa **một** vai phe thứ ba.
   - Thần Tình Yêu chỉ xuất hiện khi N ≥ 6.
2. **Cộng điểm** các lá vừa rút. Nếu tổng nằm trong khoảng **−3 đến +3** thì dùng, không thì rút lại. Thử tối đa vài trăm lần cho tới khi được.
3. Nếu không rút ra đội hình hợp lệ (hiếm), dùng **đội hình mẫu** ở bảng dưới, rồi **xáo ngẫu nhiên** vai cho từng người.

Cách này giúp mỗi ván khác nhau, người chơi không đoán được vai dựa vào số người trong bàn.

**Đội hình mẫu** (dùng khi rút lại không thành, và để bạn hình dung):

| Số người | Vai trong ván | Tổng điểm |
|---|---|---|
| **5** | Sói Đầu Đàn, Tiên Tri, Hoàng Tử, Dân làng ×2 | **+2** |
| **6** | Ma Sói, Sói Con, Tiên Tri, Bảo Vệ, Thợ Săn, Dân làng | **+1** |
| **7** | Ma Sói, Sói Đầu Đàn, Tiên Tri, Bảo Vệ, Thợ Săn, Dân làng ×2 | **+1** |
| **8** | Ma Sói, Sói Con, Kẻ Phản Bội, Tiên Tri, Bảo Vệ, Phù Thủy, Thợ Săn, Nhà Ngoại Cảm | **+3** |
| **9** | Ma Sói, Sói Con, Kẻ Phản Bội, Tiên Tri, Bảo Vệ, Phù Thủy, Thợ Săn, Thần Tình Yêu, Chán Đời | **0** |
| **10** | Ma Sói ×2, Sói Con, Sói Trắng, Tiên Tri, Bảo Vệ, Phù Thủy, Thợ Săn, Thị Trưởng, Hoàng Tử | **+1** |

Cách tính ví dụ bàn 8: phe Sói −6 −8 −6 = −20; phe Dân 7 + 4 + 5 + 3 + 4 = +23; tổng +3.

Ví dụ bàn 5 chỉ có một Sói: Ma Sói + 4 Dân làng = −2 (hợp lệ), Ma Sói + Bảo Vệ + 3 Dân làng = +1 (hợp lệ), nhưng Ma Sói + Tiên Tri + 3 Dân làng = +4 bị loại và rút lại. Vì vậy ván 5 người ít khi có Tiên Tri đi cùng một Sói yếu.

### 4.3 Điều kiện thắng
- **Dân thắng** khi hết Sói (Ma Sói, Sói Con, Sói Đầu Đàn, Sói Trắng) và Kẻ Phản Bội.
- **Phe Sói thắng** khi số người phe Sói còn sống **không ít hơn** số người còn lại. Sói Trắng không tính vào phe Sói để thắng.
- **Chán Đời thắng** ngay khi bị treo cổ ban ngày.
- **Sói Trắng thắng** khi là người duy nhất còn sống.
- **Cặp đôi của Thần Tình Yêu** không có điều kiện thắng riêng ở bản này, chỉ cùng chết. Nếu muốn cặp đôi khác phe có cách thắng riêng thì làm ở bản sau.

### 4.4 Chỗ mình tự chọn luật, cần bạn xem lại
Bảng của masoi.online mô tả ngắn nên có chỗ mình phải tự quyết. Nếu bạn quen luật khác thì sửa được:
- **Sói Trắng "thắng khi là Sói cuối cùng":** mình hiểu là *còn sống một mình* mới thắng. Nếu bạn hiểu là chỉ cần hết các Sói khác, và Dân vẫn còn, thì phải đổi.
- **Thị Trưởng lộ vai từ đầu:** theo thông lệ nhiều bộ, nhưng không bắt buộc.
- **Kẻ Phản Bội và đếm phe Sói:** mình tính nó vào phe Sói khi so sánh số người, nhưng Sói không biết nó.
- **Hoàng Tử** lộ vai khi bị treo lần đầu.
- **Phe thứ ba tính vào "Sói và phe thứ ba lãi 100":** cả Chán Đời và Sói Trắng thắng đều được lãi 100, như bạn chốt.

## 5. Điểm của rạp

- **Phí vào ván cố định 100 điểm mỗi người.** Trừ ở lúc ván thực sự bắt đầu (mục 3.1). Ngồi bàn chờ không mất điểm.
- **Thắng thì được lãi, thua thì mất phí:**

| Kết quả | Người thắng nhận về | Lãi | Người thua |
|---|---|---|---|
| Phe Sói thắng | 200 điểm | **+100** | Dân và phe thứ ba mất 100 |
| Phe thứ ba thắng (Chán Đời hoặc Sói Trắng) | 200 điểm | **+100** | Mọi người còn lại mất 100 |
| Phe Dân thắng | 150 điểm | **+50** | Sói và phe thứ ba mất 100 |
| Ván huỷ (kẹt quá lâu, hoặc còn dưới 3 người thật) | hoàn đủ 100 | 0 | không ai mất |

- **Ví dụ bàn 8 người** (tổng phí 800): nếu Dân thắng (5 người) thì rạp trả ra 5 × 150 = 750, thu về 800, **rạp thu thêm 50**. Nếu phe Sói thắng (3 người) thì rạp trả ra 3 × 200 = 600, **rạp thu thêm 200**.
- **Bỏ giữa ván** (rời bàn, thoát phòng, mất kết nối quá 60 giây): **chỉ mất phí, không hoàn điểm và không nhận lãi** dù phe còn lại thắng. Người đã chết thoát ra cũng vậy. Vai của người đó được **server chơi thay** (không làm gì ban đêm, không bầu) để ván không bị kẹt.
- **Người chết thoát ra giữa ván:** cũng tính như bỏ cuộc (mất phí, không hoàn, không nhận lãi).
- **Ván bị kẹt quá lâu** (đề xuất 40 phút) hoặc **còn dưới 3 người thật:** kết thúc, **hoàn 100 điểm cho những người còn lại**. Đây là trường hợp duy nhất có hoàn điểm.

**Điểm có tăng, có giảm.** Phần lớn ván làm rạp thu về nhiều hơn trả ra, nên điểm vẫn bị rút dần, trừ vài cỡ bàn nhỏ có thể làm rạp thêm điểm (mục 8).

## 6. Giao diện

- **Toàn bộ trong cửa sổ game** (overlay giống Cờ Caro), không dựng cảnh 3D mới. Làm vậy nhẹ máy và chạy tốt trên điện thoại.
- **Bàn chờ:** danh sách ghế, nút Ngồi, nút Bắt đầu (chỉ sáng khi đủ 5 người), dòng nhắc "Ván này mất 100 điểm mỗi người". Nút "Rời bàn" luôn miễn phí cho tới khi ván bắt đầu.
- **Giữa ván:** vòng tròn tên người chơi (người chết bị làm mờ, **không hiện vai**), thanh giờ đếm ngược, khung việc của mình ("Chọn người để cắn", "Chọn người để soi"...), khung chat nhỏ.
- **Ban ngày:** nút bầu cạnh tên từng người, hiện ai đang bầu ai.
- **Người chết:** hiện dòng "Bạn đã chết, mic và chat bị tắt tới hết ván" và vẫn xem được diễn biến.
- **Kết thúc:** bảng lật vai, phe thắng và điểm nhận được.
- Điện thoại: dùng chạm chọn người, không cần bàn phím.

## 7. Phần kỹ thuật cần lưu ý

### 7.1 Trạng thái riêng cho từng người
Hiện server gửi **cùng một trạng thái cho tất cả** người đang mở game. Ma Sói cần ngược lại: mỗi người chỉ thấy vai của mình, Sói thấy nhau, người chết **xem được diễn biến nhưng không thấy vai của ai** (vì cũng không được lộ). Phải thêm kiểu gửi trạng thái riêng cho từng người. Đây là thay đổi lớn nhất so với các game hiện có.

### 7.2 Đồng hồ và giai đoạn trên server
Mọi thứ do server đếm giờ (đếm ngược bắt đầu, đêm, ngày, bầu), client chỉ hiển thị. Cách này giống game Đập chuột đã có, và không ai chỉnh giờ được. Cần dọn đồng hồ khi phòng trống.

### 7.3 Giọng nói, chat và gian lận
Voice của rạp là kết nối trực tiếp giữa các trình duyệt và hiện nghe theo khoảng cách. Với Ma Sói mình đề xuất:

- **Người chơi đứng quanh tranh.** Mở game Ma Sói phải đứng trong vòng 2,2 m quanh tranh (như mọi tranh game khác), và khi cửa sổ game đang mở thì không đi lại. Nên cả bàn nằm gần nhau (xa nhất khoảng 4 m), **voice thường của rạp đã đủ**, không cần làm chế độ voice riêng. Người ở xa nhau nhất nghe nhỏ hơn người đứng cạnh một chút, nhưng vẫn nghe được.
- **Ban ngày:** **mic được bật**, mọi người nói chuyện bình thường như ở ngoài ván.
- **Ban đêm:** game **tự tắt mic của tất cả người đang sống trong ván**, tới sáng tự bật lại. Trong lúc đó nút bật / tắt mic (phím M) bị khoá.
- **Người chết:** game **tự tắt mic** của họ và khoá nút mic, đồng thời **chặn chat** ở phía server (giống tính năng khoá chat của admin). Họ vẫn **nghe được** cuộc thảo luận để xem tiếp. Tới **hết ván** mới tự bật lại. Nếu họ **thoát khỏi ván giữa chừng** thì được tự bật tắt mic như bình thường, nhưng bị tính bỏ cuộc (mục 5).
- **Trong ván, chat chung của cả phòng bị chặn với người chơi:** để không ai nhắn riêng cho nhau ban đêm. Ban ngày dùng khung chat trong game (công khai), ban đêm Sói có **khung chat riêng** (server chỉ gửi cho Sói).

Giới hạn cần nói rõ:
- Việc tắt mic **chỉ ép được ở phía trình duyệt của chính người đó**, ai sửa được trình duyệt vẫn nói được lúc đêm hoặc lúc đã chết. Chặn chat thì ép được ở server.
- Không ngăn được người chơi **nói chuyện riêng bên ngoài** (Zalo, Discord). Đây là luật tin tưởng nhau, giống chơi với bạn bè ngoài đời.

### 7.4 Bị đánh choáng hoặc đóng cửa sổ
Dùng lại cách của bàn cược: đóng cửa sổ giữa ván thì có 60 giây để mở lại. Trong lúc vắng, server tự "bỏ qua" lượt của người đó.

### 7.5 Trừ điểm và chia điểm đúng lúc
- Trừ 100 điểm phải làm **một lần cho cả bàn** (nếu ai không đủ thì mời người đó ra, còn dưới 5 thì huỷ ván và không ai mất điểm), tránh trường hợp trừ nửa chừng rồi mới biết thiếu người. Việc này giống cách bàn cược đang trừ cược của hai người cùng lúc.
- Chia điểm cuối ván làm cùng một lúc cho mọi người thắng, rồi mới lật bài.

## 8. Rủi ro và giới hạn

- **Cần đủ 5 người ngồi cùng lúc.** Phòng ít người thì không bao giờ chơi được. Mỗi phòng tối đa 10 người, nên cần ít nhất nửa phòng cùng muốn chơi.
- **Gian lận qua kênh ngoài** (mục 7.3): không có cách chặn trọn vẹn.
- **Kiếm điểm bằng thông đồng:** một nhóm bạn cùng thông đồng để Dân luôn thắng sẽ lãi ròng ở bàn 5 người (100 điểm mỗi ván) và bàn 7 người (50 điểm mỗi ván). Bạn đã chốt **không xử lý**, nên giữ nguyên. Nếu về sau thấy bị lợi dụng thì xem lại mức lãi của Dân hoặc bàn 5 người.
- **Lộ vai qua thời gian thao tác:** ai bấm chọn nhanh, ai không có việc, người ngoài nhìn vào có thể đoán được vai. Mục 3.2 (vai không có việc cũng "xong" sau một lúc ngẫu nhiên) giảm được điều này nhưng không triệt để.
- **Người chết thoát ra để nói chuyện:** bị phạt bằng cách tính bỏ cuộc (mục 5). Không ngăn được hoàn toàn nếu họ không quan tâm điểm.
- **15 vai là nhiều với người mới:** ván đầu có thể rối. Nên có màn hình giải thích vai của mình ngắn gọn khi chia bài.
- **Nặng máy:** không đáng lo, vì chỉ là giao diện HTML. Phía server chỉ là vài đồng hồ và danh sách nhỏ.

## 9. Lộ trình đề xuất

1. **Bước 1 (khung):** bàn chờ (5 đến 10 người, kiểm tra 100 điểm, đếm ngược, huỷ khi thiếu người), chia bài, chuyển đêm / ngày, bầu treo cổ, kiểm tra thắng thua, chỉ có Dân và Sói. Chạy thử được cả vòng.
2. **Bước 2 (vai Dân):** thêm 8 vai Dân còn lại, và trạng thái riêng cho từng người (mục 7.1).
3. **Bước 3 (vai Sói và phe thứ ba):** thêm Sói Con, Sói Đầu Đàn, Kẻ Phản Bội, Chán Đời, Sói Trắng, cùng các điều kiện thắng riêng.
4. **Bước 4 (random vai):** rút ngẫu nhiên theo mục 4.2, kèm kiểm tra tổng điểm từ −3 đến +3.
5. **Bước 5 (điểm):** trừ 100 điểm đúng lúc, chia lãi theo phe, hoàn khi kẹt hoặc còn dưới 3 người, người chơi thay cho người bỏ giữa ván.
6. **Bước 6 (voice và chat):** tự tắt mic ban đêm và bật lại ban ngày, tắt mic và chat người chết, chat riêng của Sói.
7. **Bước 7 (hoàn thiện):** màn hình giải thích vai, giao diện điện thoại.
8. **Bước 8 (chơi thử):** cùng bạn bè chơi vài ván thật, chỉnh giờ đếm và các luật ở mục 4.4.

Sau bước 1 và 2 là có thể chơi được bản thô, nên bạn thử sớm và chỉnh hướng đi trước khi làm hết.

## 10. Điều mình chưa chắc

- **Đội hình random chưa được thử bằng ván thật.** Điểm trong tài liệu chỉ là tham khảo. Khoảng −3 đến +3 có thể vẫn cho ra ván lệch phe, nhất là ván 5 người (chỉ một Sói) cần chơi thử nhiều.
- **Luật của vai phức tạp** (Sói Trắng, Thần Tình Yêu, Kẻ Phản Bội, mục 4.4): bạn đã đồng ý cách hiểu của mình, nhưng vẫn cần thử bằng ván thật.
- **Thời gian mỗi giai đoạn** (đêm 30 đến 45 giây, đếm ngược 15 giây) là ước đoán, cần chơi thử.
- **Tốc độ cạn hay tăng điểm** (mục 5, 8): chưa đo được người chơi thực tế thắng thua ra sao.
