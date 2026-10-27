# Setup status — Phase 1

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
| Telegram test thủ công | PASS theo ảnh người dùng — cả 3 node xanh, mỗi node 1 item, `Workflow executed successfully`; chưa xem nội dung preview trên Telegram |
| Production webhook | NOT_RUN — cần Publish rồi gửi tin nhắn mới mà không bấm Execute |
| Social APIs, menu, approval | Chưa triển khai — chỉ tiếp tục sau Phase 1 đạt |

Workflow đã có sẵn: [mở trong n8n](http://localhost:5678/workflow/seKtuQgWny3K7y5m).
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

Bước tiếp theo: xác nhận bot trả `PREVIEW BAI DANG`, đúng nội dung và `DRAFT`;
bấm Publish và gửi tin nhắn mới mà không bấm Execute để kiểm tra production
webhook. Chưa đánh dấu Phase 1 hoàn thành trước khi xác nhận các kết quả này.
