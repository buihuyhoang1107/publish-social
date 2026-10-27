# Setup status — Telegram menu và duyệt bản nháp

> Cập nhật 27/10/2026: **Social Publisher - Telegram Multi Platform** đã bật,
> nhận một ảnh, album tối đa 10 ảnh hoặc video + caption; gửi đăng các kênh TikTok,
> Facebook Page, Threads đã kết nối. TikTok đã đăng bài thật thành công.
> API đã xác nhận đủ TikTok thieponline.org, Facebook Page Thiệp online Trọng Hoàng,
> Threads bhhoang_1107; cấu hình đã thu gọn về đúng ba nền tảng, không gồm Instagram.
> Runtime test riêng PASS album 10 ảnh, 4 kênh song song, lỗi từng kênh và chống lặp.
> Sửa Facebook thiếu loại bài `post`; Threads cảnh báo và bỏ qua trước API từ 500 ký tự,
> cho đăng tối đa 499 ký tự. Runtime test riêng PASS mốc 498/499/500/501, emoji và album dài.
> Xem [luồng hiện tại](docs/TELEGRAM_PUBLISHER.md). Các trạng thái dưới đây là lịch sử.

Cập nhật: 27/10/2026, giờ Việt Nam (UTC+7).

| Hạng mục | Kết quả thực tế |
| --- | --- |
| Docker CLI | PASS — 28.1.1 |
| Docker Compose | PASS — v2.35.1-desktop.1 |
| Docker Engine | PASS — 28.1.1, đã mở Docker Desktop |
| cloudflared | PASS — portable 2026.10.4, chữ ký Authenticode Cloudflare Valid |
| Cài cloudflared qua winget | Không hoàn tất — installer trả 1602; dùng portable thay thế |
| Compose validation | PASS — `docker compose config --quiet` |
| n8n local | PASS — 2.44.7, `http://localhost:5678/healthz` trả 200 |
| Cloudflare Quick Tunnel | PASS — tunnel kết nối QUIC, HTTPS `/healthz` trả 200 |
| Webhook configuration | PASS — `.env` và container dùng cùng URL tunnel HTTPS |
| Import workflow thật | PASS — `Social Publisher - Telegram Intake`; người dùng đã chọn Telegram account ở hai node |
| Workflow offline | PASS — `node scripts/check-workflow.cjs`: Master Post, preview, text đặc biệt, preview dài và non-text |
| n8n runtime | PASS — import và execute smoke workflow trên n8n 2.44.7, `status=success`; Edit Fields và biểu thức Preview tạo đúng output |
| Telegram V1 | PASS theo ảnh và xác nhận người dùng — bot trả preview và DRAFT sau Publish |
| Menu V2 offline | PASS — `node scripts/check-menu-workflow.cjs`, lựa chọn, state riêng, TTL, duplicate/stale update, media, HTML/Unicode |
| Menu V2 runtime | PASS — instance n8n tạm 5680 chạy Data Table + Code + If qua các HTTP executions riêng; session giữ đúng sau restart |
| Native keyboard | PASS — n8n normalization, expressions, Telegram reply_markup: 7/9 options và 3 nút preview |
| Workflow deployed | Đã publish bản duyệt với 17 node trên cùng workflow, giữ credential references |
| Menu V2 Telegram /new | PASS theo xác nhận người dùng — đã thấy các nút lựa chọn sau khi sửa lỗi fixedCollection expression |
| Menu V2 Telegram callback và preview | PASS theo ảnh — WEDDING/VIRAL, đúng nội dung, DRAFT |
| Approval runtime | PASS — Duyệt/Sửa/Hủy, sửa giữ media/post ID, nút cũ, duyệt lặp và lưu Data Table riêng |
| Approval archive | PASS — bảng test chỉ có 1 bài APPROVED sau duyệt lặp và /new; bài hủy không được lưu |
| Approval Telegram | PASS theo ảnh người dùng — bot xác nhận đã duyệt và lưu, trạng thái APPROVED |
| Facebook Page | Đang hướng dẫn tạo/chọn Meta app; chưa có credential hoặc test kết nối |
| Social APIs | Chưa triển khai |

Workflow V2 đã có sẵn: [mở trong n8n](http://localhost:5678/workflow/seKtuQgWny3K7y5m).
Không import lại nếu đang dùng instance này. File JSON vẫn được cung cấp để kiểm
tra hoặc cài instance mới. Smoke test dùng DB riêng ở `/tmp/social-runtime-check`
trong container, không thêm workflow test vào workspace n8n chính và không gọi
Telegram API. Output kiểm tra cục bộ nằm trong `temp/runtime-output.txt` (bị ignore).

Image đã tải: `docker.n8n.io/n8nio/n8n:stable`, digest
`sha256:942bc274709f27f99f7c6024a785d8e8f75ac06838cabcba448abb8d9127ec7b`.
Không pin phiên bản chưa xác minh. Phiên bản thực tế trên đã được kiểm tra bằng
`docker compose exec -T n8n n8n --version`.

Tunnel hiện chạy ẩn, PID ghi trong `temp/tunnel.pid`, log ở `temp/tunnel.log`.
URL hiện tại nằm trong `.env`, không cố định sau khi restart tunnel.
Muốn dừng, kiểm tra process trước:

```powershell
$tunnelProcessId = [int](Get-Content temp/tunnel.pid)
Get-Process -Id $tunnelProcessId | Select-Object Id, ProcessName, Path
# Chỉ chạy khi đúng tools/cloudflared.exe của workspace:
Stop-Process -Id $tunnelProcessId
```

Không cần cài cloudflared toàn hệ thống; dùng `tools/cloudflared.exe` theo
[hướng dẫn](docs/TELEGRAM_SETUP.md). Portable tải từ
[release Cloudflare 2026.10.4](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.4).

Bước tiếp theo: [tạo/chọn Meta app để kết nối Facebook Page](docs/FACEBOOK_SETUP.md).
Telegram đã Published và duyệt được; chưa có publisher social.
