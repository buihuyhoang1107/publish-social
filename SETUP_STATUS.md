# Setup status — Phase 1 và menu V2

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
| Menu V2 native keyboard | PASS — kiểm tra n8n normalization, expression engine và Telegram reply_markup, đúng 7/9 nút và callback |
| Menu V2 deployed | PASS — workflow Telegram Menu đã cập nhật thành 12 node và Published, giữ credential references |
| Menu V2 Telegram /new | PASS theo xác nhận người dùng — đã thấy các nút lựa chọn sau khi sửa lỗi fixedCollection expression |
| Menu V2 Telegram callback và preview | Đang kiểm tra — người dùng đang chọn loại/dạng và gửi nội dung |
| Approval và Social APIs | Chưa triển khai — phase sau |

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

Bước tiếp theo: chọn loại thiệp và dạng nội dung bằng nút trên Telegram,
gửi text rồi xác nhận preview đúng lựa chọn và `DRAFT`. V2 đã Published, không cần
bấm Execute. Xem [hướng dẫn menu](docs/TELEGRAM_MENU.md).
