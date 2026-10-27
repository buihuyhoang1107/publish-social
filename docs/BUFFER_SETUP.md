# Kết nối Buffer với n8n — TikTok trước

> Cập nhật 27/10/2026: đã chuyển sang thao tác hoàn toàn trong Telegram, không duyệt.
> Buffer chạy phía sau để đăng TikTok. Xem [luồng đang dùng](TELEGRAM_PUBLISHER.md).
> Các bước bên dưới ghi lại quá trình thiết lập kết nối ban đầu.

## Yêu cầu hiện tại

Người dùng đã đổi mục tiêu: tự chuẩn bị nội dung, hệ thống đăng lên các nền tảng,
không có bước duyệt qua Telegram. Trước mắt chỉ tích hợp TikTok; các nền tảng khác
làm sau. Người dùng đã chọn Buffer + n8n để xuất bản công khai.

Luồng đích: nội dung + ảnh/video → n8n → Buffer → TikTok → kết quả đăng.
Workflow Telegram cũ là phần đã làm trước đây; chưa tự động nối nó vào publisher.
Đã chuẩn bị workflow kết nối trong n8n, chưa triển khai thao tác đăng bài.
Người dùng đã gửi ảnh Buffer hiển thị kênh TikTok `thieponline.org`.

## Bước 1 — Kết nối TikTok trong Buffer

1. Tạo tài khoản tại [Buffer](https://buffer.com/) hoặc đăng nhập tài khoản đang có.
2. Mở [Channels](https://publish.buffer.com/settings/channels).
3. Chọn kết nối kênh, chọn **TikTok**.
4. Đăng nhập tài khoản TikTok muốn đăng và chấp thuận quyền Buffer yêu cầu.
5. Xác nhận tài khoản xuất hiện trong danh sách kênh. Với bài tự đăng, chọn chế độ
   **Automatic**, không dùng chế độ thông báo để người dùng đăng thủ công.

Theo [Using TikTok with Buffer](https://support.buffer.com/articles/using-tiktok-with-buffer-oGEroY9Of2),
video đáp ứng yêu cầu có thể tự đăng; nội dung cần âm thanh/effect trong thư viện
TikTok có thể cần chế độ Notify Me. Kiểm tra loại media và khả năng tự đăng cho
bài cụ thể, không coi mọi loại nội dung đều tự đăng được.

## Bước 2 — API key và n8n

Sau khi kênh đã kết nối, tạo API key trong [API settings](https://publish.buffer.com/settings/api).
Lưu key trực tiếp trong n8n Credentials dưới dạng Bearer auth; không gửi key trong
chat hoặc ghi vào workflow JSON. Không dùng credential OAuth2 TikTok đang tạo dở
cho hướng Buffer: việc cấp quyền TikTok được thực hiện trong Buffer.

API hiện tại dùng GraphQL tại `https://api.buffer.com`, với Authorization Bearer.
Bắt đầu bằng query đọc account/organizations/channels, xác nhận đúng TikTok đích,
sau đó mới xây và test publish. Chưa có API key hoặc media để test; chưa đọc
channel ID qua API.

Đã tạo credential **Buffer API** (Bearer Auth, ID `bufferApiMain20261027`) với
token trống trong n8n. Người dùng mở Credentials, điền API key vào **Bearer Token**
và Save; chỉ điền key, thư viện tự thêm tiền tố Bearer. Không import lại file
credential trống trong `temp/` vì có thể ghi đè key sau khi người dùng điền.

Workflow [Social Publisher - Buffer](http://localhost:5678/workflow/socialBufferPublisher)
đã import với Start → Read Buffer Account, dùng credential trên. Source:
`workflows/buffer-publisher.json` (không chứa credential/token). Bản hiện tại chỉ
chạy query đọc organizations theo official Quick Start, không tạo/đăng bài. Sau
khi lưu key, bấm Execute để kiểm tra; cần kiểm tra cả trường `errors` của GraphQL,
không chỉ HTTP status. Chưa chạy API thật vì token đang trống.

Nguồn: [Buffer API Quick Start](https://developers.buffer.com/guides/getting-started.html),
[Buffer API Help](https://support.buffer.com/en-us/articles/what-is-buffers-api-GtIYIQilz5).
API hỗ trợ nhiều nền tảng và hiện có trên mọi gói, kể cả Free; giới hạn sử dụng
vẫn phụ thuộc gói và kênh đã kết nối.

## Vì sao chuyển khỏi TikTok app tự xây

Sandbox không đăng video công khai. TikTok Direct Post chưa qua audit chỉ đăng
riêng tư; hướng dẫn cũng không chấp nhận client chỉ dùng cho tài khoản của chính
người phát triển/nhóm nội bộ. Đây là giới hạn nền tảng ảnh hưởng mục tiêu xuất bản
công khai, không phải lỗi n8n. Người dùng đã chọn Buffer sau khi biết giới hạn này.

Nguồn: [TikTok Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines),
[Sandbox](https://developers.tiktok.com/docs/en/add-a-sandbox).
