# Kho nội dung và lịch tự đăng

Lịch đã chọn: **09:00, 14:00 và 20:00 hằng ngày, giờ Việt Nam (UTC+7)**.
Workflow vẫn dùng bot Telegram hiện tại, n8n và Buffer; không tự sinh nội dung.

Nhập riêng một danh sách content và một nhóm ảnh bằng `/import`:
xem [hướng dẫn nhập danh sách](TELEGRAM_LIST_IMPORT.md). Bot ghép theo mã/tên
file, cho xem trước và chỉ xếp lịch sau khi xác nhận.

## Sử dụng qua Telegram

1. Gửi một ảnh, album tối đa 10 ảnh hoặc một video kèm caption. Bot tải đủ media,
   tự động duyệt, lưu vào kho và trả mã bài. **Không cần `/approve`; bài đăng theo lịch.**
2. Gửi `/queue` để xem caption rút gọn, trạng thái và lịch của các bài trong kho.
   `/queue 2`, `/queue 3`, ... xem các trang tiếp theo (8 bài/trang).
3. Bài mới mặc định đã được duyệt và bot bắt đầu xếp lịch sau khi nhận đủ media.
   `/approve all` hoặc `/approve 123` vẫn dùng được cho nháp cũ còn chờ duyệt;
   không tự thay đổi trạng thái của nháp đã có trước khi cập nhật.
4. Bot chọn khung trống tiếp theo cách hiện tại hơn 5 phút, theo thứ tự nhập kho.
   Cùng một bài có cùng lịch trên các kênh. Khung đã có bài của kho hoặc bài đang
   chờ trên Buffer được bỏ qua. Bot báo kết quả lên lịch riêng cho từng kênh.
5. `/status` xem bài gần nhất. Trả lời một ảnh bất kỳ trong album bằng `/status`
   để xem cùng bài đó. Trạng thái được kiểm tra định kỳ sau giờ hẹn; không đăng lại.
6. `/cancel 123` hủy nháp hoặc bài đã duyệt còn đang chờ trong kho. Bài đã bắt đầu
   gửi lịch sang Buffer phải được hủy tại Buffer; bot không báo hủy thành công cho bài này.
7. Thông báo lỗi có nút **🔄 Đăng lại kênh lỗi**. Bấm để yêu cầu khôi phục những
   kênh có lỗi đã xác nhận; hoặc dùng `/retry 123`. `/status 123` cũng hiện nút nếu
   còn kênh đủ điều kiện. Bot kiểm tra lại trạng thái Buffer và tải đủ media qua link
   công khai. Bài có lịch tương lai giữ đúng ngày/giờ đã hẹn, kể cả kênh từng bị từ chối
   trước khi có post ID; chỉ bài đã đến/qua giờ hẹn mới được đăng lại ngay. Bot
   đối chiếu nội dung file trước khi gửi. Kênh đã đăng/đang đăng/đã lên lịch
   hoặc chưa xác nhận kết quả không bị gửi lại. Bấm lặp khi đang xử lý không tạo thêm lần gửi.
   Kênh lỗi có post ID dùng lại bài Buffer đó; yêu cầu bị từ chối trước khi có post ID
   mới tạo bài thay thế cho riêng kênh đó. Không tự đăng lại khi chưa bấm nút/lệnh.

Ảnh/video phải có caption, mỗi file tối đa 20 MB. Album không trộn ảnh và video.
Video AI dùng `/ai` đầu caption như trước. Threads tối đa 499 ký tự Unicode code point;
từ 500 ký tự, bot cảnh báo và bỏ qua Threads, vẫn xếp lịch cho các kênh khác.

## Kho, sức chứa và thông báo

- Bài mới gửi từ tài khoản/chat được phép mặc định đã được duyệt và được gửi Buffer
  để xếp lịch. Không tự đưa bài cũ vào kho hoặc dùng lại bài đã đăng để lấp lịch.
- Mỗi kênh giữ tối đa 9 bài chờ do cấu hình này quản lý, có tính cả bài đang chờ
  đọc được từ Buffer. Giữ một chỗ dự phòng so với giới hạn Free 10 bài/kênh.
  Bài vượt sức chứa nằm ở trạng thái đã duyệt, chờ xếp lịch; sau khi bài cũ đăng
  và có chỗ, worker tự bổ sung vào khung tương lai. Không yêu cầu duyệt lại.
- Worker kiểm tra mỗi 5 phút. Khi không có bài cần xếp lịch, không gọi lại API account,
  channel và danh sách hàng đợi; chỉ kiểm tra các bài đến giờ và thông báo cần gửi.
- Khi Buffer xác nhận trạng thái `sent`, bot gửi “✅ Vừa đăng bài #… thành công trên
  …/… kênh” về chat đã gửi bài, kèm caption rút gọn, lịch, thời điểm xác nhận và link
  từng kênh nếu API trả về. Kênh lỗi/chưa đăng vẫn hiển thị đúng trạng thái riêng.
  Thông báo có thể trễ khoảng 5 phút hoặc lâu hơn nếu Buffer/mạng chưa xác nhận.
  Kết quả không đổi không tạo thông báo lặp; kênh khác đăng xong sẽ có cập nhật tiếp.
- Khi còn tối đa 3 bài đã duyệt/đã xếp lịch cho tương lai, bot nhắc bổ sung một lần.
  Nhắc được đặt lại khi kho được bổ sung vượt ngưỡng. Không lặp thông báo mỗi 5 phút.
- Đến khung giờ không có bài đã được xếp lịch, bot thông báo bỏ qua khung đó một lần.
  Không đăng bù hàng loạt cho các khung đã qua khi máy khởi động lại.
- Lỗi mạng khi tạo lịch có thể không xác định được kết quả: giữ trạng thái cần kiểm tra,
  không tự retry mutation. Kiểm tra Buffer trước khi gửi lại nội dung.

## Máy và media

**Máy, Docker/n8n, kết nối Internet và tunnel HTTPS phải chạy đến khi đăng xong.**
Buffer có thể tải media vào lúc đăng. Việc Buffer nhận lịch không có nghĩa là có thể tắt
máy đang phục vụ file. Đây là yêu cầu của [Buffer Hosting Media](https://developers.buffer.com/guides/hosting-media.html).

Media của kho có URL chứa token ngẫu nhiên, tên `queue_<32 hex>.<extension>`,
không hết hạn sau 24 giờ. File không tự bị xóa. Không chia sẻ link media riêng tư.
Chỉ filename đúng whitelist mới được phục vụ; không cho truy cập file kho/receipt.
Quick Tunnel hiện tại đổi URL khi khởi động lại. Chạy `node scripts/start-telegram.cjs`
để cập nhật cả webhook và link media của bài còn chờ trên Buffer. Script tải và đối
chiếu hash từng ảnh/video trước khi sửa; giữ nguyên nội dung và giờ đăng, sao lưu
trước sửa vào `/home/node/.n8n/storage/media-repair`. Bài đã lỗi, đang đăng hoặc còn
dưới 5 phút tới giờ đăng không tự được sửa/đăng lại; cần kiểm tra riêng trên Buffer.
Nếu script báo lỗi thì chưa thể coi các lịch cũ đã được khôi phục. Muốn vận hành lâu dài nên
dùng hostname cố định hoặc chuyển cả n8n và media lên máy chủ/storage ổn định.

## Dữ liệu và chống trùng

- File kho: `/files/telegram-content-queue.json`, bên trong volume `downloads/buffer-media`.
- Khóa filesystem ngắn và ghi qua file tạm/rename để approval, worker và các lần
  nhận tin đồng thời không ghi đè trạng thái lẫn nhau. Khóa bỏ lại sau crash được
  giải phóng sau 5 phút; không giữ khóa trong lúc gọi API.
- Fingerprint tính từ caption, nội dung nhị phân media theo thứ tự và cờ AI;
  gửi lại cùng nội dung bằng một tin nhắn mới cũng không tạo bài chờ thứ hai.
  Bài đã hủy có thể được thêm lại.
- Lưu claim từng kênh trước mutation. Gián đoạn sau claim thì chuyển sang chưa xác nhận
  sau 10 phút và thông báo; không tự tạo lại bài có thể đã tồn tại trên Buffer.
- Receipt Telegram cũ và alias album vẫn giữ được `/status`. Dữ liệu kho mới không
  thay đổi các bài đã đăng hoặc receipt cũ.
- Sao lưu cả volume n8n (DB và khóa mã hóa) lẫn thư mục `/files`. Không chỉ sao lưu JSON workflow.

## Source và kiểm tra

Builder: `node scripts/build-telegram-publisher.cjs`. Local config:
`temp/telegram-publisher-config.json`, thêm `queue: { enabled: true, hours: [9,14,20],
lowWatermark: 3, maxPendingPerChannel: 9 }`. Cấu hình này cũng là mặc định của builder.
Worker gửi `customScheduled` và `dueAt` UTC theo [API Buffer](https://developers.buffer.com/guides/posts-and-scheduling.html).

- `scripts/check-content-queue.cjs`: kiểm tra kho, duyệt, hủy, dedup, lịch/múi giờ,
  sức chứa local/Buffer, bổ sung lịch, thông báo hết bài và crash/mạng không xác định.
  Chạy trong Linux/n8n container với bản source trong thư mục writable tạm.
- `scripts/check-queue-retry.cjs`, `scripts/check-retry-native.cjs` và
  `scripts/check-retry-runtime.cjs`: callback phân quyền, nút Telegram thật, kiểm tra
  media, chống gửi lặp, retry bài cũ/tạo thay thế cho kênh bị từ chối và timeout.
  Runtime dùng DB/thư mục riêng `/tmp/queue-retry-runtime` cùng API giả lập,
  không có credential Telegram/Buffer và không đăng bài thật.
- `scripts/check-queue-runtime.cjs --prepare`: fixture riêng, webhook test, mock media
  và Buffer, không có credential. Chạy sau khi chuẩn bị fixture legacy bằng
  `scripts/check-telegram-publisher.cjs --prepare`. Publish fixture `telegramQueueTest`
  trên instance riêng cổng 5680; mock cổng 5681 dùng script legacy `--mock`.
  Chỉ một fixture được bật media route `buffer-media/:fileName` trong một instance.
- Chạy `node scripts/check-queue-runtime.cjs`: tự duyệt và xếp lịch, nội dung trùng,
  album với ảnh giữa lỗi tạm thời, chặn hủy bài đã gửi Buffer, duyệt lặp, lịch Buffer, Threads,
  thông báo, `/queue`, `/status` qua alias, tick lặp và media GET/HEAD.
- `scripts/check-telegram-publisher.cjs`: fixture legacy riêng giữ kiểm tra hồi quy
  luồng đăng cũ và các receipt cũ; không bật cùng fixture queue khi test media route.

Không tạo bài thử thật hoặc tự duyệt bài người dùng trong quá trình kiểm tra.
