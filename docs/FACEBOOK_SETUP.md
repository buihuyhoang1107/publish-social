# Kết nối Facebook Page

Telegram menu và duyệt đã đạt: người dùng gửi ảnh bot xác nhận `APPROVED`.
Hiện chưa có credential Facebook và chưa có workflow đăng Facebook.

## Bước 1 — Tạo hoặc chọn Meta app

1. Mở [Meta App Dashboard](https://developers.facebook.com/apps/).
2. Đăng nhập tài khoản Facebook đang quản lý Page sẽ đăng bài.
3. Nếu đã có app phù hợp, mở app đó. Nếu chưa có, chọn **Create App**.
4. Nhập App name, ví dụ `ThiepOnline Social Publisher`, và email liên hệ.
5. Khi đến màn chọn **Use cases**, đối chiếu màn hình thực tế trước khi chọn:
   giao diện Meta có thể khác giữa tài khoản. Chụp màn này để tiếp tục hướng dẫn,
   không chụp App Secret hay access token.

Hướng dẫn tạo app tham khảo từ [tài liệu n8n chính thức](https://docs.n8n.io/integrations/builtin/credentials/facebookgraph/).
Tài liệu Pages API trên Meta trả HTTP 429 khi kiểm tra trong phiên này; chưa dùng
tên use case chưa xác nhận để hướng dẫn người dùng chọn.

## Các bước tiếp theo

Sau khi app sẵn sàng: cấp quyền cho đúng Page, lấy Page access token và Page ID,
lưu token trực tiếp trong n8n Credentials, kiểm tra đọc thông tin Page trước khi
triển khai workflow đăng bài riêng. Không dùng App access token để thay Page access
token cho tác vụ đăng bài của Page. Không gửi token trong chat hoặc lưu vào JSON.

Đã đối chiếu credential `FacebookGraphApi` của image n8n 2.44.7: có trường
**Access Token** được đánh dấu password. Tài liệu online có thêm lựa chọn OAuth2,
nhưng credential này trong image hiện tại chỉ có trường token; thao tác sẽ theo
giao diện và source cài thực tế.
