# Kết nối TikTok Draft

> Hướng cũ, lưu để tham khảo. Người dùng hiện chọn [Buffer + n8n](BUFFER_SETUP.md)
> để đăng TikTok công khai và không cần duyệt Telegram. Không tiếp tục cấu hình
> OAuth2 trực tiếp theo tài liệu này nếu không có yêu cầu mới.

Người dùng chọn thử TikTok trước vì chưa hoàn thành xác minh SMS Meta Developer.
Giữ Telegram làm nơi soạn/preview/duyệt; không tạo Telegram Channel. Chưa có
TikTok credential hoặc workflow upload.

## Bước hiện tại: tài khoản developer và app

1. Mở [TikTok Developer signup](https://developers.tiktok.com/signup).
2. Nhập email, chọn **Send PIN to email**, hoàn thành đăng ký. Nếu đã có tài khoản,
   dùng Log in.
3. Vào [Manage apps](https://developers.tiktok.com/portal/apps).
4. Chọn **Connect an app**, rồi làm theo màn hình chọn chủ sở hữu/app details.
   Xem màn hình thực tế để hướng dẫn tiếp; không gửi PIN, Client secret hay token.

Theo [Register Your App](https://developers.tiktok.com/docs/en/getting-started-create-an-app),
tài khoản developer đăng ký qua email. App được cấu hình sản phẩm và quyền trước
khi gửi xét duyệt; không coi việc tạo app là đã kết nối tài khoản đăng nội dung.

## Mục tiêu kết nối

Thêm Content Posting API, dùng luồng Upload với quyền `video.upload` được TikTok
cấp và tài khoản đích cho phép. Upload gửi ảnh/video để người dùng tiếp tục xem,
sửa và hoàn tất đăng trong TikTok; không triển khai Direct Post ở bước đầu.
Lần kiểm tra cần ảnh hoặc video, không chỉ một bài text. Video local có thể dùng
FILE_UPLOAD; upload ảnh cần URL thuộc domain/URL prefix đã xác minh. Chưa cấu hình
redirect URI hay URL media khi chưa có thông tin app thực tế.

Nguồn: [TikTok Get Started — Upload](https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content).
