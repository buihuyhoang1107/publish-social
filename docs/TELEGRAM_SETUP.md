# Kết nối bot Telegram với n8n — Phase 1

## 1. BotFather và credentials

Nếu đã có bot thì dùng bot hiện tại. Nếu chưa có: mở tài khoản Telegram chính thức
`@BotFather`, gửi `/newbot`, đặt tên và username kết thúc bằng `bot`.
Không gửi token vào chat hỗ trợ hoặc lưu vào workflow JSON.

Mở http://localhost:5678, hoàn thành tạo owner. Vào Credentials → Add credential
→ Telegram API, nhập Access Token do BotFather cấp, Save và kiểm tra kết nối.
n8n lưu credential được mã hóa trong volume; không đưa token vào `.env`.

## 2. Quick Tunnel

Trong terminal riêng, giữ tiến trình chạy:

```powershell
cloudflared tunnel --url http://localhost:5678
```

Nếu dùng bản portable trong workspace:

```powershell
.\tools\cloudflared.exe tunnel --url http://localhost:5678
```

Copy URL `https://....trycloudflare.com` vừa nhận vào `.env`:

```env
N8N_WEBHOOK_URL=https://YOUR-TUNNEL.trycloudflare.com/
```

Áp dụng từ root workspace:

```powershell
docker compose up -d --force-recreate n8n
```

Chờ n8n mở lại. Vẫn dùng editor qua http://localhost:5678. URL webhook trong
Telegram Trigger phải bắt đầu bằng URL tunnel HTTPS, không phải localhost.
Compose dùng `N8N_WEBHOOK_URL` theo tài liệu n8n hiện tại; image `stable` cần hỗ trợ
biến này (từ 2.35.0). Xem phiên bản thực tế trong SETUP_STATUS.md.

## 3. Import workflow

1. Workflows → tạo workflow → menu `...` → Import from File.
2. Chọn `workflows/telegram-intake.json`.
3. Trong **Telegram Trigger** và **Telegram Preview**, chọn cùng Telegram credential.
4. Trigger On = Message; Download Images/Files = ON đã có trong JSON.
5. Có thể thêm Restrict to User IDs/Chat IDs của bạn trong Additional Fields.
   V1 không có cơ chế phân quyền riêng, nên nên giới hạn bot cho người vận hành.
6. Save workflow. JSON được cung cấp ở trạng thái inactive và không có credential.

## 4. Test thật

1. Nếu workflow đang active/published thì tắt trước khi test thủ công.
2. Bấm **Listen for test event / Execute workflow** trước khi gửi tin nhắn.
3. Mở bot trong Telegram, nhấn Start nếu chưa từng chat, rồi gửi:

   ```text
   Test bai dang thiep cuoi online
   ```

4. Kiểm tra execution: Trigger nhận `message.text`, Edit Fields tạo Master Post,
   Telegram Preview trả `PREVIEW BAI DANG`, đúng nội dung và `DRAFT`.
5. Gửi thêm `Thiep cuoi <online> & RSVP *test*` để kiểm tra text nguyên vẹn.
6. Khi test đạt: ngừng listener test, Save rồi **Publish/Activate** theo phiên bản
   n8n. Gửi một tin nhắn mới mà không bấm Execute để xác nhận production webhook.

Mỗi bot chỉ có một Telegram webhook. Không chạy workflow khác dùng cùng bot;
test listener có thể thay webhook production. Sau khi test cần bật lại production.

## 5. Khi đóng máy hoặc tunnel đổi URL

Quick Tunnel có URL mới sau mỗi lần mở lại. Mở Docker, khởi động n8n, chạy tunnel,
sửa `.env`, recreate n8n, rồi tắt/bật Publish/Activate workflow để đăng ký webhook
mới. Không tạo thêm bot hoặc credential chỉ vì URL đổi.

Nếu bot im lặng: kiểm tra Engine, `docker compose ps`, tunnel còn chạy, URL HTTPS
đúng, credential ở cả hai node và execution lỗi trong n8n. Không chụp màn hình token.
Nếu gửi ảnh/video không caption, V1 chỉ trả hướng dẫn gửi text; menu, media preview
và approval thuộc phase sau.

Tham khảo: [Telegram credential](https://docs.n8n.io/integrations/builtin/credentials/telegram/),
[Telegram Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/),
[Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
