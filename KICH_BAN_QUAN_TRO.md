# Kịch bản thu giọng quản trò Ma Sói

Danh sách các câu quản trò cần thu, kèm tên file để mình ghép vào game. Mỗi câu là một file riêng. Chưa có gì trong game đọc các file này; mình sẽ làm khi bắt đầu viết game.

Chỉ gồm **thông báo trời tối, trời sáng** và **lời gọi các vai** trong một đêm.

## Cách thu

- Thu ở nơi yên tĩnh, đọc **chậm, giọng trầm, rõ chữ**, hơi kịch tính một chút. Câu "trời tối" đọc thấp, câu "trời sáng" đọc sáng hơn.
- **Mỗi câu một file**, dài khoảng 2 đến 6 giây. Chừa chừng nửa giây im lặng ở đầu và cuối.
- Định dạng **mp3** (hoặc wav, mình đổi sang mp3 được), một kênh (mono) là đủ.
- Giữ **âm lượng đều nhau** giữa các câu.
- Đặt tên file đúng như cột "Tên file". Chưa thu hết cũng được, game sẽ bỏ qua câu nào chưa có file.

## Trời tối, trời sáng

| # | Tên file | Lời đọc | Dùng khi |
|---|---|---|---|
| 1 | `gm_night_start` | "Trời tối rồi, mọi người nhắm mắt lại." | Bắt đầu đêm |
| 2 | `gm_dawn` | "Trời sáng rồi, mọi người mở mắt." | Hết đêm |

## Gọi các vai trong đêm

Mỗi vai có một câu **thức dậy** và một câu **nhắm mắt**. Riêng Phù Thủy có thêm một câu hỏi về bình độc, vì Phù Thủy có hai việc (cứu và đầu độc). Thứ tự gọi (đề xuất, giống Ma Sói thật): Thần Tình Yêu, Kẻ Phản Bội, Ma Sói, Sói Đầu Đàn, Sói Trắng, Tiên Tri, Bảo Vệ, Phù Thủy, Nhà Ngoại Cảm.

| # | Tên file | Lời đọc | Ghi chú |
|---|---|---|---|
| 3 | `gm_cupid_wake` | "Thần Tình Yêu thức dậy. Hãy chọn hai người thành đôi." | Chỉ gọi đêm đầu |
| 4 | `gm_cupid_sleep` | "Thần Tình Yêu nhắm mắt lại." | |
| 5 | `gm_traitor_wake` | "Kẻ Phản Bội thức dậy. Hãy nhận ra bầy Sói." | Chỉ gọi đêm đầu |
| 6 | `gm_traitor_sleep` | "Kẻ Phản Bội nhắm mắt lại." | |
| 7 | `gm_wolf_wake` | "Ma Sói thức dậy. Hãy chọn một người để cắn." | |
| 8 | `gm_wolf_sleep` | "Ma Sói nhắm mắt lại." | |
| 9 | `gm_alpha_wake` | "Sói Đầu Đàn thức dậy. Bạn có muốn biến người bị cắn thành Sói không?" | |
| 10 | `gm_alpha_sleep` | "Sói Đầu Đàn nhắm mắt lại." | |
| 11 | `gm_whitewolf_wake` | "Sói Trắng thức dậy. Bạn có muốn giết một Sói khác không?" | Chỉ gọi mỗi hai đêm |
| 12 | `gm_whitewolf_sleep` | "Sói Trắng nhắm mắt lại." | |
| 13 | `gm_seer_wake` | "Tiên Tri thức dậy. Hãy chọn một người để soi." | |
| 14 | `gm_seer_sleep` | "Tiên Tri nhắm mắt lại." | |
| 15 | `gm_guard_wake` | "Bảo Vệ thức dậy. Hãy chọn một người để bảo vệ." | |
| 16 | `gm_guard_sleep` | "Bảo Vệ nhắm mắt lại." | |
| 17 | `gm_witch_wake` | "Phù Thủy thức dậy. Đêm nay người này sẽ chết. Bạn có muốn cứu không?" | Tên người bị cắn hiện trên màn hình của Phù Thủy |
| 18 | `gm_witch_poison` | "Phù Thủy, bạn có muốn dùng bình độc với ai không?" | Phát sau khi Phù Thủy chọn xong chuyện cứu |
| 19 | `gm_witch_sleep` | "Phù Thủy nhắm mắt lại." | |
| 20 | `gm_psychic_wake` | "Nhà Ngoại Cảm thức dậy. Hãy chọn hai người để so sánh." | |
| 21 | `gm_psychic_sleep` | "Nhà Ngoại Cảm nhắm mắt lại." | |

Các vai **không có việc ban đêm** nên không cần lời gọi: Dân làng, Thợ Săn, Thị Trưởng, Hoàng Tử, Sói Con, Chán Đời.

## Lưu ý: chỉ gọi vai có trong ván

Mỗi đêm quản trò **chỉ gọi những vai đã được chia trong ván này**, không gọi vai không có. Vì vậy nghe lời gọi là biết ván có những vai nào, nhưng đêm ngắn hơn nhiều (chỉ vài vai thay vì cả 9). Vai nào đã chia mà người giữ đã chết thì **vẫn được gọi** và chờ như bình thường, để không ai biết vai đó đã chết.

## Tổng cộng

**21 câu**: 2 câu trời tối / sáng và 19 câu gọi vai (8 vai × 2 câu, cộng Phù Thủy 3 câu).

Không câu nào nói tên người chơi. Bạn thu xong thì bỏ file vào một thư mục (ví dụ `client/public/gm/`). Câu nào chưa có file thì game vẫn chạy, chỉ không có tiếng.
