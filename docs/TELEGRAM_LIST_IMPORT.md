# Nhập danh sách content và ảnh/video trong Telegram

Gửi `/import` để mở đợt nhập. Bot giữ bài trong kho để xem trước; chỉ xếp lịch
sau khi bạn bấm **Xác nhận**. Mỗi content ghép một ảnh hoặc một video theo mã
hoặc tên file. Có thể nhập bài ảnh và bài video trong cùng một đợt.

## Cách gửi

1. Gửi `/import` hoặc `/import start 2026-11-05` để chọn ngày bắt đầu.
2. Dán nội dung theo mẫu, hoặc lưu toàn bộ danh sách thành file `.txt` UTF-8 rồi gửi:

   ```text
   [POST01]
   Caption đầy đủ của bài 1, gồm emoji và hashtag.

   [POST02]
   Caption đầy đủ của bài 2, có thể xuống nhiều dòng.
   ```

   Có thể gửi nhiều tin nhắn hoặc nhiều file TXT trong cùng đợt. Mã bài không
   phân biệt chữ hoa/thường. Gửi lại một mã để sửa caption trước khi xác nhận.
   Gửi TXT phù hợp với danh sách 30 bài dài hơn giới hạn một tin nhắn Telegram.

3. Chọn các file `POST01.png`, `POST02.mp4`, ... và gửi bằng **File/Tài liệu**
   để giữ tên file và bản gốc. Cũng nhận video gửi dạng Video nếu Telegram giữ
   tên file. Có thể chọn nhiều file cùng lúc. Mỗi file trong
   nhóm vẫn là một bài riêng, khác luồng album thông thường của bot. Thứ tự
   upload không ảnh hưởng thứ tự bài trong danh sách content.
4. Bấm **Xem trước / Kiểm tra lại**. Bot kiểm tra thiếu ảnh, ảnh thừa, ảnh trùng mã và bài
   đã có trong kho. Bản xem trước ghi mã bài, tên ảnh, caption rút gọn và lịch.
5. Bấm **Xác nhận** để giữ lịch và đưa bài vào luồng xếp lịch hiện tại. Bot dùng
   09:00, 14:00, 20:00 giờ Việt Nam; bỏ qua khung đã có bài trong kho. Khi gửi
   từng bài, worker đối chiếu thêm lịch Buffer; nếu trùng khung đã chốt, giữ bài
   để kiểm tra thay vì tự đổi giờ. Các kênh theo cấu hình hiện tại của bot.

## Dùng bảng từ ChatGPT

Bot cũng nhận bảng Markdown 3 cột:

| Mã bài | Tên file | Content đăng bài |
| --- | --- | --- |
| POST01 | IMG_4440.JPG | Caption đầy đủ của bài 1. |
| POST02 | POST02.png | Caption đầy đủ của bài 2. |
| POST03 | IMG_2479.MP4 | Caption đầy đủ cho video. |

Khi có cột tên file, bot ghép đúng tên đó; bạn không cần đổi tên thành mã bài.
Giữ bảng nguyên vẹn trong tin nhắn hoặc file TXT. Trong caption, ký tự `|`
cần viết thành `\|`; `<br>` được chuyển thành xuống dòng.

## Sửa và hủy

- Nút **Bỏ bài** mở danh sách mã bài; chọn mã để bỏ content và file tương ứng.
- Nút **Bỏ riêng file** mở danh sách tên file; chọn file cần bỏ, giữ content.
- Nút **Hủy đợt nhập** hủy đợt; **Xem lịch** mở lịch. Lệnh cũ vẫn dùng được.
- Gửi lại content cùng mã để sửa caption.
- Gửi lại ảnh cùng tên file để thay ảnh trước khi xác nhận.
- Video cũng được thay bằng cách gửi lại video cùng tên file trước khi xác nhận.
- `/import remove POST01`: bỏ content và ảnh tương ứng khỏi đợt.
- `/import remove extra.png`: bỏ riêng một ảnh gửi thừa khỏi đợt.
- `/import cancel`: hủy đợt đang nhập, không gửi bài của đợt lên lịch.
- `/done` và `/batch preview` cũng mở bản xem trước của đợt nhập hiện tại.
- Nếu danh sách hoặc ảnh thay đổi sau khi xem trước, nút xác nhận cũ không
  chốt bài; bot yêu cầu xem lại phiên bản mới.

Bot không trả lời từng ảnh nhận thành công để tránh nhiều thông báo. Lệnh
`/import preview` cho biết số content, số ảnh và file còn đang tải. Khi tải lỗi,
bot báo tên file cần gửi lại. Mở `/import` sẽ thoát chế độ crop; không mở song
song với một đợt `/batch` khác đang gom.

## Giới hạn

- Tối đa 1.000 bài và 1.000 file/đợt; ảnh JPG/PNG/WEBP hoặc video MP4/MOV/WEBM,
  tối đa 20 MB/file.
- Video tạo bằng AI: bắt đầu caption bằng `/ai`. Bot bỏ tiền tố trước khi đăng
  và giữ cờ video AI trong metadata TikTok, giống luồng gửi video thông thường.
- File TXT tối đa 1 MB, mã hóa UTF-8; mỗi caption tối đa 4.096 ký tự.
- Mỗi mã bài và mỗi ảnh chỉ thuộc một cặp trong đợt. Mã gồm chữ, số, `_`, `-`,
  bắt đầu bằng chữ; ví dụ `POST01`.
- Threads vượt 499 ký tự được cảnh báo trong preview và xử lý theo rule kênh
  hiện tại. Sức chứa Buffer theo cấu hình hiện tại; phần vượt sức chứa nằm trong
  kho, được tự bổ sung khi có chỗ.

## Triển khai và kiểm tra

Builder `scripts/build-telegram-publisher.cjs` thêm nhánh `Is Import Request` →
`Download Import File` → `Store Import File` và ghép helper vào intake/command.
Credential của `Download Import File` dùng cùng credential tải có giới hạn với
crop: cùng bot token, Base URL `http://image-tools:3000/telegram-download`.
Gateway nội bộ nhận TXT, ảnh và video từ đường dẫn documents/photos/videos.
File được tải theo đoạn 64 KB, kiểm tra Content-Range và thử lại đoạn lỗi để
không tải lại toàn bộ video khi kết nối Telegram bị đứng giữa chừng.
Hai node gửi trả lời dùng HTTP Request qua `/telegram-reply`, với credential
Header Auth riêng do script deploy tạo từ token bot. Cách này giữ nguyên
keyboard động; n8n làm mất giá trị expression ở fixedCollection inlineKeyboard
của node Telegram. Token chỉ nằm trong credential, không ghi vào workflow.
Giữ các credential và cấu hình live hiện có
khi cập nhật workflow; cập nhật `Next Queue Work` để giữ `scheduleLocked`.

Kiểm tra offline: `node scripts/check-list-import.cjs`.
Kiểm tra n8n thật với Telegram/Buffer giả lập:
`node scripts/check-list-import-runtime.cjs --prepare`, import/publish fixture
`temp/list-import-runtime/workflow.json` vào n8n riêng cổng 5680 với `/files`
mount đến thư mục fixture, rồi chạy script không có flag. Fixture không có
credential, tắt scheduler và chặn các nhánh API ngoài luồng giả lập.

Thêm flag `--video` ở bước prepare và chạy test để dùng fixture riêng tại
`temp/list-import-video-runtime`; test gồm video native, video dạng file có tên
gốc, video AI, bài ảnh trong cùng đợt và payload media đúng kiểu cho 3 kênh.
