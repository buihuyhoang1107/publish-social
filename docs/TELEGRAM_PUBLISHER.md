# Đăng album và nhiều nền tảng từ Telegram

Luồng: **Telegram → n8n → Buffer → TikTok / Facebook Page / Threads → kết quả về Telegram**.
Bạn dùng bot Telegram hiện có để đăng bài. Buffer chỉ cần mở khi kết nối tài khoản.
Đã bật tự phát hiện các kênh thuộc ba nền tảng này trong Buffer mỗi lần đăng.
API đã xác nhận: TikTok `thieponline.org`, Facebook Page `Thiệp online Trọng Hoàng`,
Threads `bhhoang_1107`; cả ba không bị khóa hoặc ngắt kết nối. Cấu hình hiện tại
không bao gồm Instagram; bot không báo thiếu kênh Instagram.

## Cách dùng

1. Gửi `/start` trong bot cũ để xem hướng dẫn mới.
2. Gửi **một ảnh, album tối đa 10 ảnh hoặc một video kèm caption**. Khi gửi nhiều
   ảnh, chọn các ảnh và gửi chung thành một album, nhập caption một lần.
3. Bot tự gom album, giữ thứ tự ảnh, gửi một bài cho mỗi kênh. Không có bước duyệt.
   Kết quả riêng từng nền tảng; chỉ báo đã đăng khi trạng thái kênh đó là `sent`.
4. Gửi `/status` để xem bài gần nhất. Có thể trả lời bài bằng `/status`, hoặc dùng `/status <mã tin nhắn>`.

Ảnh JPG/JPEG, PNG, WEBP; video MP4, MOV hoặc WEBM, tối đa 20 MB mỗi file theo giới
hạn tải của Telegram Bot API. Có thể gửi dạng photo/video hoặc file tài liệu.
Không hỗ trợ album trộn video/ảnh hoặc nhiều video. Bài chỉ có chữ hiện chưa được đăng.

## Kết nối kênh

Đã kết nối đủ ba kênh tại [Buffer Channels](https://publish.buffer.com/settings/channels).
Khi cần kết nối lại, chọn đúng Facebook **Page** và tài khoản Threads.
Luồng sẽ tự đọc các kênh mới trong lần đăng tiếp theo, không cần nhập channel ID.
Một nền tảng có nhiều kênh được kết nối thì bài được gửi tới tất cả kênh của nền tảng đó.

Gói Free giới hạn 3 kênh, đủ cho cấu hình hiện tại. Nếu sau này thêm Instagram thành
kênh thứ tư thì cần gói cho phép ít nhất 4 kênh và bổ sung service vào config.
Không tự mua hoặc đổi gói trong quá trình cấu hình.
Nguồn: [kết nối kênh](https://support.buffer.com/articles/connecting-your-channels-to-buffer-HvWLgAJvL9),
[Instagram tự đăng](https://support.buffer.com/en-us/articles/scheduling-instagram-posts-reels-stories-and-notifications-3XA98S9Q5p),
[gói Buffer](https://buffer.com/pricing).

Nếu một kênh lỗi hoặc chưa kết nối, các kênh còn lại vẫn gửi đăng. Bot hiển thị lỗi
từ API từng kênh. Facebook gửi `metadata.facebook.type: post` cho bài ảnh/video.
Threads được cấu hình tối đa **499 ký tự** (gồm khoảng trắng, xuống dòng, hashtag;
đếm theo Unicode code point). Từ 500 ký tự trở lên, bot cảnh báo ngay lúc nhận bài,
bỏ qua Threads trước khi gọi API; Facebook và các nền tảng khác vẫn tiếp tục.
Áp dụng cho cả ảnh, video và album. `/status` hiển thị Threads đã bỏ qua, không tự đăng lại.
Các giới hạn caption/media khác do Buffer/nền tảng kiểm tra;
không tự cắt caption hay bỏ ảnh để ép đăng. Không bảo đảm bài hiển thị đúng cùng giây.

Video tạo bằng AI: bắt đầu caption bằng `/ai`, ví dụ `/ai Mẫu thiệp cưới mới 💌`.
Bot bỏ tiền tố này khỏi caption và gửi cờ AI cho TikTok.

## Vận hành

- Workflow đang bật thay menu cũ tại cùng ID `seKtuQgWny3K7y5m`, tên mới
  **Social Publisher - Telegram Multi Platform**. Dữ liệu bài đã duyệt trước đây vẫn được lưu.
- Chỉ tài khoản và chat Telegram xác minh từ phiên duyệt cũ được đăng; giới hạn ở
  cả Trigger và Intake, trước khi tải video. Không bật workflow khác dùng cùng bot.
- Credential Telegram và Buffer giữ trong n8n. Source JSON không chứa credential.
- Receipt `/files/telegram-post-<chatId>-<messageId>.json` được tạo bằng `wx`
  trước khi tải file. Cùng tin nhắn giao lại đồng thời hoặc sau restart không tạo
  thêm bài. Gửi lại thành **tin nhắn mới** được coi là yêu cầu mới.
- Mutation đăng bài không tự retry. Lỗi mạng không xác định kết quả thì bot nhắc
  kiểm tra trước khi gửi lại. `/status` chỉ đọc trạng thái, không tạo bài mới.
- Album: lưu từng update theo `media_group_id` + chat, chỉ một coordinator chờ 5
  giây và kiểm tra ít nhất 3 giây không có ảnh mới. Gom theo thứ tự `message_id`,
  lấy caption trong album, không đăng riêng từng ảnh. Tải/lưu thiếu một file thì
  toàn bộ bài chưa được gửi đăng. Các phần giao lại không kéo dài thời gian chờ.
- Receipt từng ảnh trong album trỏ về receipt chung; `/status` trả lời bất kỳ ảnh
  nào cũng xem cùng một bài. Album đã chốt không tự tạo bài mới khi có ảnh đến muộn.
- Receipt từng kênh riêng trong `/files/telegram-target-*.json`, tạo `wx` trước API;
  kết quả tổng hợp không ghi đè lẫn nhau khi các kênh chạy song song. Receipt cũ
  chỉ có TikTok vẫn xem được; không tự đăng lại bài cũ lên các kênh mới.
- Link video có token ngẫu nhiên, hết hạn sau 24 giờ, không chứa bot token. File
  và receipt nằm trong `downloads/buffer-media`; hết hạn link không tự xóa file.
- Docker, n8n và tunnel HTTPS phải tiếp tục chạy. Quick Tunnel đổi URL khi khởi
  động lại: cập nhật `.env`, config build, build/import/publish lại và recreate n8n.

## Source và kiểm tra

Builder: `node scripts/build-telegram-publisher.cjs`. Config local:
`temp/telegram-publisher-config.json` (allowedUserIds, allowedChatIds, services,
albumQuietMs, publicBaseUrl). Builder dùng node API/media từ `workflows/buffer-publisher.json`.
File deploy gán credential hiện có và **versionId mới** trước khi import/publish.

`scripts/check-telegram-publisher.cjs` chạy trên n8n riêng cổng loopback 5680,
mock API cổng 5681, không có credential và không đăng bài thật. `--prepare` tạo
fixture trong `temp/telegram-publisher-test`; import/publish ID
`telegramPublisherTest`, restart instance test, chạy script `--mock` trong container,
rồi chạy script không flag từ host. Instance test cần mount `/files` riêng, bật
`NODE_FUNCTION_ALLOW_BUILTIN=crypto,fs` và binary filesystem giống production.

Đã PASS runtime: album 3 và 10 ảnh, đúng thứ tự/caption, quiet period, một bài/kênh,
4 request publish chồng thời gian, lỗi GraphQL/HTTP riêng từng kênh, chưa kết nối,
dedup album và `/status` qua alias, thiếu file không đăng nửa album; hồi quy ảnh
đơn/video/AI, owner allowlist, binary và media GET/HEAD. Test dùng mock bốn kênh,
không đăng nội dung thử lên tài khoản thật. API đã xác nhận kết nối Facebook và
Threads; chưa tạo bài đăng thử thật trên hai kênh này trong bước xác minh kết nối.

Ngày 27/10/2026: đã phục hồi ảnh/caption của tin nhắn Telegram 53 từ execution 48
và gửi đúng bài đó, không yêu cầu gửi lại. Đã nhận trạng thái `sent` lúc 15:06:
https://tiktok.com/@thieponline.org/video/7701254909521349908 . Receipt giữ mã bài
Buffer để theo dõi; không tạo lại bài khi trạng thái còn `sending`.

Nguồn: [Telegram getFile](https://core.telegram.org/bots/api#getfile),
[Buffer API](https://developers.buffer.com/guides/getting-started.html).
