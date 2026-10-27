# Social Publisher — Telegram + n8n

Triển khai theo [flow gốc](SOCIAL_PUBLISHER_TELEGRAM_N8N.md), từng phase.
Phase hiện tại: **V1 — Telegram → Master Post → Preview**. Chưa tích hợp social,
menu hay nút duyệt. Một tin nhắn tạo một bản nháp; không đăng bài tự động.

## Chạy trên Windows

1. Mở Docker Desktop, chờ Engine sẵn sàng.
2. Tại `D:\publish-social`:

   ```powershell
   Copy-Item .env.example .env
   docker compose up -d
   docker compose ps
   ```

   Chỉ copy `.env` lần đầu, không ghi đè cấu hình đã có.
3. Mở **http://localhost:5678**, tạo tài khoản owner của n8n.
4. Làm tiếp [hướng dẫn Telegram](docs/TELEGRAM_SETUP.md): mở tunnel, cập nhật
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

V1 nhận text; trigger bật tải file theo tài liệu gốc, nhưng chưa preview media,
chưa gom album, chưa có lịch sử Master Post riêng. Tin nhắn không có text sẽ nhận
hướng dẫn gửi text. Master Post giữ toàn bộ nội dung; preview dài được rút gọn có
thông báo để không vượt giới hạn Telegram. `YES` trong preview là danh sách đích
dự kiến, không phải kết quả đăng bài.

## Kiểm tra và các phase sau

Tình trạng môi trường và kiểm tra thật nằm ở [SETUP_STATUS.md](SETUP_STATUS.md).
Lệnh kiểm tra Node chỉ kiểm tra workflow/expressions offline; không thay test n8n
và Telegram thật. Chỉ làm menu/approval sau khi V1 đạt, rồi Facebook Page,
Instagram, Threads và TikTok Draft lần lượt, mỗi nền tảng có test riêng.

Contract node đối chiếu với [source Telegram Trigger](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Telegram/TelegramTrigger.node.ts)
và [source Edit Fields](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Set/v2/SetV2.node.ts).
Cấu hình webhook theo [tài liệu n8n](https://docs.n8n.io/hosting/configuration/configuration-examples/webhook-url/).
