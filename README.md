# Social Publisher — Telegram + n8n

**Luồng đang dùng:** gửi ảnh, album tối đa 10 ảnh hoặc một video kèm caption trong
bot Telegram → gửi đăng TikTok, Facebook Page, Threads đã kết nối → báo
kết quả từng kênh tại Telegram. Không có bước duyệt. Buffer chạy phía sau.
API đã xác nhận cả ba kênh: TikTok `thieponline.org`, Facebook Page `Thiệp online Trọng Hoàng`, Threads `bhhoang_1107`.
Gửi `/start` để xem hướng dẫn, `/status` để kiểm tra bài gần nhất.
Xem [hướng dẫn hiện tại](docs/TELEGRAM_PUBLISHER.md). Phần menu/duyệt bên dưới là lịch sử triển khai.

Triển khai theo [flow gốc](SOCIAL_PUBLISHER_TELEGRAM_N8N.md), từng phase.
Phase hiện tại: **/new → loại thiệp → dạng nội dung → bài → preview → Duyệt/Sửa/Hủy**.
Menu và preview đã được người dùng xác nhận trên Telegram. Các nút duyệt đã
triển khai và người dùng đang kiểm tra. Bài duyệt lưu thành `APPROVED` trong n8n;
chưa tích hợp social, không đăng bài tự động.

Trong instance hiện tại, [workflow](http://localhost:5678/workflow/seKtuQgWny3K7y5m)
đã cập nhật thành **Social Publisher - Telegram Menu**, dùng credential cũ.
Gửi `/new` trong chat riêng với bot để bắt đầu, `/preview` để mở lại bài và các nút,
`/cancel` để hủy bản nháp.
Không cần import lại hay bấm Execute. Xem [menu V2](docs/TELEGRAM_MENU.md).

## Chạy trên Windows

Với instance Telegram hiện tại đã thiết lập, mở Docker Desktop rồi chạy:

```powershell
node scripts/start-telegram.cjs
```

Lệnh này khởi động n8n, mở hoặc dùng lại Cloudflare Tunnel, cập nhật URL webhook
và media, rồi xác nhận webhook với Telegram. Có thể chạy lại khi bot mất kết nối.
Tunnel chạy ẩn và cần mở lại bằng lệnh này sau khi khởi động lại máy.
Không cần bấm Execute workflow. Gửi `/queue` để kiểm tra.

Các bước dưới đây dành cho cài đặt lần đầu:

1. Mở Docker Desktop, chờ Engine sẵn sàng.
2. Tại `D:\publish-social`:

   ```powershell
   Copy-Item .env.example .env
   docker compose up -d
   docker compose ps
   ```

   Chỉ copy `.env` lần đầu, không ghi đè cấu hình đã có.
3. Mở **http://localhost:5678**, tạo tài khoản owner của n8n.
4. Khi cài instance mới, làm [hướng dẫn Telegram V1](docs/TELEGRAM_SETUP.md): mở tunnel, cập nhật
   `.env`, tạo Credential và import `workflows/telegram-intake.json`.
5. Gửi bot `Test bai dang thiep cuoi online`. Kết quả cần thấy: `PREVIEW BAI DANG`,
   đúng nội dung, `WEDDING`, `GENERAL`, trạng thái `DRAFT`.

## Vận hành

```powershell
docker compose logs --tail 50 n8n
docker compose stop
docker compose up -d
node scripts/check-workflow.cjs
```

SQLite, credentials, encryption key và binary data nằm trong volume `n8n_data`.
Không dùng `docker compose down -v` vì sẽ xóa dữ liệu. Backup volume trước khi
nâng cấp; tag `stable` có thể đổi phiên bản khi pull. Không tự nâng cấp giữa lúc test.
Editor chỉ bind loopback; Quick Tunnel vẫn có thể công khai editor qua HTTPS,
vì vậy phải tạo owner trước khi mở tunnel. Không chia sẻ mật khẩu hoặc token.

Workflow V1 lưu ở `workflows/telegram-intake.json` để tham khảo bước khởi đầu.
V1 nhận text; trigger bật tải file theo tài liệu gốc, nhưng chưa preview media,
chưa gom album, chưa có lịch sử Master Post riêng. Tin nhắn không có text sẽ nhận
hướng dẫn gửi text. Master Post giữ toàn bộ nội dung; preview dài được rút gọn có
thông báo để không vượt giới hạn Telegram. `YES` trong preview là danh sách đích
dự kiến, không phải kết quả đăng bài.

## Kiểm tra và các phase sau

Tình trạng môi trường và kiểm tra thật nằm ở [SETUP_STATUS.md](SETUP_STATUS.md).
Lệnh `check-workflow.cjs` chỉ kiểm tra V1 offline; không thay test n8n và Telegram thật.
Kiểm tra V2: `node scripts/check-menu-workflow.cjs`. Quy trình runtime test trong
[menu và duyệt](docs/TELEGRAM_MENU.md). Sau khi kiểm tra duyệt đạt, làm Facebook Page,
Instagram, Threads và TikTok Draft lần lượt, mỗi nền tảng có test riêng.

Contract node đối chiếu với [source Telegram Trigger](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Telegram/TelegramTrigger.node.ts)
và [source Edit Fields](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Set/v2/SetV2.node.ts).
Cấu hình webhook theo [tài liệu n8n](https://docs.n8n.io/hosting/configuration/configuration-examples/webhook-url/).
