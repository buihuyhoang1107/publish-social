# Telegram menu V2

## Cách dùng trên instance hiện tại

Workflow hiện tại đã được cập nhật và publish, giữ nguyên credential và ID.
Mở [workflow](http://localhost:5678/workflow/seKtuQgWny3K7y5m), F5 nếu đang thấy
canvas V1 ba node. Không import lại workflow và không bấm Execute khi test bot
production.

1. Mở chat riêng với bot, gửi `/new` mới.
2. Chọn một trong 7 loại thiệp.
3. Chọn một trong 9 dạng nội dung.
4. Gửi text, hoặc **một** ảnh/video có caption.
5. Bot trả `PREVIEW BAI DANG`, loại thiệp/dạng đã chọn, nội dung và `DRAFT`.

`/start` cũng mở menu. `/cancel` xóa phiên/bản nháp hiện tại. `/new` thay phiên cũ;
nút cũ được báo hết hiệu lực. Phiên tồn tại 24 giờ sau lần tương tác gần nhất.
V2 lưu một phiên và bản nháp mới nhất cho mỗi người dùng trong chat riêng, chưa
phải lịch sử nhiều bài. Sau preview, dùng `/new` để tạo bài khác.

Chưa có duyệt, sửa, hủy bằng inline button hoặc publisher social. `DRAFT` và `YES`
trong preview chưa xác nhận nội dung đã được đăng. Album, document và chat nhóm
chưa được hỗ trợ; gửi từng ảnh/video bằng chức năng media của Telegram.
Nếu Telegram gửi lỗi và không thấy phản hồi, kiểm tra execution trong n8n;
có thể dùng `/new` để bắt đầu lại.

## Lưu phiên và Master Post

```text
Telegram Trigger (message + callback_query)
  → Ensure Sessions Table
  → Load Session
  → Telegram Menu Router
  → Save Session
  → Is Callback → Answer Callback (nếu là nút)
  → Chọn nhánh Service Options / Content Type Options / Telegram Menu Reply
```

Data Table `social_publisher_sessions` được tạo khi nhận update đầu tiên, gồm
`sessionKey` (chat ID + user ID) và `sessionJson`. n8n lưu trong SQLite hiện tại;
không thêm database ngoài. Phiên hết hạn bị thay thế ở lần tương tác tiếp theo,
không có lịch xóa tự động. Có thể xem bảng trong tab Data tables của project.

Master Post trong `sessionJson.post` giữ nội dung đầy đủ, taxonomy đã chọn,
`goal=LEAD`, `status=DRAFT`, platforms và thông tin media. Ảnh/video lưu
`telegramFileId`; `mediaPath` để trống vì không có đường dẫn local hoặc URL public.
Các trường `topic`, `hook`, `cta` để trống, không tự suy đoán nội dung. Preview rút
gọn nội dung dài và báo rõ; HTML được escape để giữ nguyên ký tự người dùng.

Compose đặt `N8N_CONCURRENCY_PRODUCTION_LIMIT=1` để xử lý lần lượt các update,
tránh hai lượt ghi đè phiên. Đây là giới hạn production cho toàn instance local,
không phải khóa dùng chung cho nhiều n8n replica. Không chạy listener test đồng
thời với production trên cùng bot. Không bật retry tự động cho node gửi tin nhắn.
Update đã ghi nhận được bỏ qua khi Telegram giao lại; đây chưa phải cơ chế đảm
bảo gửi tin nhắn đúng một lần khi có lỗi mạng.

Các phương án đã cân nhắc:

| Phương án | Đánh giá |
| --- | --- |
| Data Tables | Chọn: lưu phiên qua test/production, dùng SQLite sẵn có |
| Workflow Static Data | Ít node hơn, nhưng có giới hạn khi test và tần suất cao |
| Database ngoài | Có thể hỗ trợ quy mô lớn hơn, thêm vận hành ngoài kiến trúc hiện tại |

Theo [hướng dẫn n8n về lưu state](https://docs.n8n.io/code/cookbook/builtin/get-workflow-static-data/),
Data Tables dùng được giữa các lượt chạy, kể cả khi test. Contract Data Table
và Telegram được đối chiếu source chính thức và source cài trong image 2.44.7.
V2 tắt Download Images/Files vì menu và bản nháp chỉ cần `file_id`; V1 gốc vẫn
giữ cấu hình Download ON. Khi làm publisher sẽ bổ sung bước lấy file cần thiết.

## Source và kiểm tra

`workflows/code/telegram-menu.js` là source Code node; taxonomy trong
`workflows/code/telegram-menu.constant.json` được dùng chung để build router và
các nút Telegram. Sau khi sửa:

```powershell
node scripts/build-menu-workflow.cjs
node scripts/check-menu-workflow.cjs
```

JSON tạo ra không có credential, luôn inactive để import vào instance mới an toàn.
Khi cài instance mới, chọn cùng credential ở Trigger và tất cả node Telegram
(Answer Callback, Service Options, Content Type Options, Menu Reply).
Chỉ một workflow được dùng bot này tại một thời điểm.

Các nút được khai báo bằng object/array `fixedCollection`; chỉ `callback_data` của
từng nút dùng expression. Không đặt toàn bộ `inlineKeyboard` thành expression:
n8n chuẩn hóa cấu hình đó về object rỗng và Telegram chỉ nhận câu hỏi, không có nút.
Lỗi này đã được tái hiện và sửa; người dùng xác nhận `/new` hiện nút chọn.
Kiểm tra regression native trong image n8n đang dùng:

```powershell
docker compose cp workflows/telegram-menu.json n8n:/tmp/menu-options-check.json
docker compose cp scripts/check-menu-native.cjs n8n:/tmp/check-menu-native.cjs
docker compose exec -T n8n node /tmp/check-menu-native.cjs /tmp/menu-options-check.json
```

Lệnh kiểm tra n8n Workflow normalization, expression engine và hàm Telegram tạo
`reply_markup`, xác nhận đúng 7/9 nút và callback, không gọi Telegram API.

Runtime test dùng **instance tạm riêng** trên loopback 5680, table riêng, không có
credential Telegram và thay các node gọi Telegram bằng node local:

```powershell
node scripts/check-menu-runtime.cjs --prepare
# Khởi động image n8n 2.44.7 trong container test riêng, publish 127.0.0.1:5680:5678.
# Chờ healthz 200 trước khi import fixture để tránh SQLite migration chạy đồng thời.
# Import temp/menu-webhook-check.json, publish ID socialMenuWebhookCheck, restart.
node scripts/check-menu-runtime.cjs
```

Kiểm tra này thực thi Data Table create/get/upsert, Code runner, If branches và
expressions qua HTTP trên n8n thật. CLI `n8n execute` không khởi tạo Data Table
module trong phiên bản đang dùng, nên không dùng CLI execution để kết luận test
Data Tables. Test runtime đã đạt, gồm kiểm tra phiên vẫn đúng sau restart container.
Telegram keyboard đã được người dùng xác nhận hiển thị; callback và preview cuối
vẫn đang được kiểm tra trên bot.
