# Tiếp tục công việc

## Cập nhật mới nhất 27/10/2026

- User yêu cầu nhiều ảnh và nhiều nền tảng, đã chọn Facebook Page + Instagram + Threads ngoài TikTok. Workflow live cùng ID đã nâng thành Social Publisher - Telegram Multi Platform.
- Album <=10 ảnh qua media_group_id: spool từng update, một coordinator, chờ quiet period, giữ thứ tự message_id/caption, tải đủ trước đăng; receipt aliases và khóa từng kênh chống lặp.
- Fan-out đọc account/channels mỗi bài, gửi đồng thời tới mọi kênh kết nối thuộc services [tiktok,facebook,instagram,threads]. Kênh thiếu/khóa/lỗi báo riêng không chặn kênh khác. /status không tạo lại bài; receipt single TikTok cũ vẫn đọc được.
- PASS real isolated n8n: album3/10 ảnh, đúng thứ tự, quiet, dedup/alias, tải thiếu không đăng album nửa, 4 publish đồng thời (maxActive=4), lỗi GraphQL/HTTP từng kênh, missing connections, ảnh/video/AI.
- API live xác nhận mới có TikTok thieponline.org. User phải kết nối Facebook Page, Instagram Professional, Threads tại https://publish.buffer.com/settings/channels một lần; không xin secret. Sau kết nối tự phát hiện, không sửa channelId. Free chỉ3channels nên4channels cần plan phù hợp; chưa mua/đổi plan.
- Không tự đăng thử lại nội dung cũ lên tài khoản thật khi nâng flow. PASS sau deploy: activeVersionId đúng, whitelist4services/owner, public GET/HEAD byte đúng. PASS legacy status migration không publish; album giao lại sau restart không tạo bài trên bất kỳ kênh nào. Container test đã dọn; không xóa dữ liệu test local.

- FIX sau ảnh chụp user: bot trước đó chỉ nhận video nên đã bỏ qua ảnh+caption (message 53, execution 48). Đã nhận photo/document image, asset image đúng contract, MIME JPG/PNG/WEBP; /status không tham số tự xem bài gần nhất. Không bắt user gửi lại.
- Đã phục hồi đúng update ảnh 53 trong temp/telegram-recover-photo.json và chạy recovery workflow inactive telegramRecoverPhoto53. Buffer nhận bài ID 6ae05a8f124181c6d9a8531c; receipt downloads/buffer-media/telegram-post-6729441444-53.json. Đang theo dõi sending, tuyệt đối không tạo lại bài.
- Media webhook hỗ trợ GET + HEAD vì Buffer có HEAD probe. Test runtime đã PASS cả ảnh, MIME, HEAD, latest status và video flow cũ.

- Người dùng muốn chỉ dùng Telegram. Đã nối Telegram -> n8n -> Buffer -> TikTok thieponline.org -> trả kết quả Telegram, không duyệt.
- Live workflow cùng ID seKtuQgWny3K7y5m đã đổi thành Social Publisher - Telegram TikTok, publish và recreate n8n. Buffer connection workflow giữ inactive.
- Giữ credential hiện có. Read Buffer account/channels đã chạy thành công. Không import credential trống.
- Source: workflows/telegram-publisher.json, workflows/code/telegram-publisher-*.js; builder và runtime test trong scripts. Hướng dẫn docs/TELEGRAM_PUBLISHER.md.
- Local config/deploy/backup trong temp/telegram-publisher-*.json và temp/telegram-config-before.json. Deploy phải gán versionId mới trước import/publish.
- Owner allowlist từ phiên duyệt cũ; receipt file atomic wx chặn redelivery đồng thời và sau restart. Không retry publish mutation.
- Runtime test n8n riêng PASS: auth/help/validation/AI/binary/media/publish/poll/status/dedup/errors. Không gửi Telegram hoặc đăng TikTok thật trong test.
- Đã SENT lúc 15:06 ngày 27/10/2026: ảnh/caption message 53 phục hồi đã đăng TikTok thành công, https://tiktok.com/@thieponline.org/video/7701254909521349908 . Không yêu cầu user gửi lại. Recovery workflow hiện chỉ còn nhánh đọc trạng thái, không chứa mutation publish. /status trên bot tự lấy bài gần nhất.
- Docker/n8n/tunnel cần tiếp tục chạy. Quick Tunnel đổi URL cần build/import/publish lại. Không git, không xin token trong chat.

## Lịch sử trước khi đổi sang Telegram publisher

- Trạng thái: in_progress
- Cập nhật: 2026-10-27T14:12:36+07:00
- Mục tiêu: Buffer+n8n dang TikTok: cho APIkey trong credential
- File: docs/BUFFER_SETUP.md
- File: workflows/buffer-publisher.json
- Đã làm / quyết định: Scope user: dua content/media -> hethongpublish nhieunen tang; hienTikTok; KHONG duyetTelegram. User chonBuffer+n8n; anhBufferxacnhan TikTok thieponline.org connected.
- Đã làm / quyết định: Da tao n8n credential Buffer API typehttpBearerAuth IDbufferApiMain20261027 tokenrong. Userphai nhapAPIkey truc tiep vao BearerToken (khong prefixBearer). KHONG reimport temp/buffer-credential-empty.json sau khi usernhapkey.
- Đã làm / quyết định: Da import workflow Social Publisher - Buffer IDsocialBufferPublisher Start->Read Buffer Account; chi GraphQLGetOrganizations theo officialQuickStart, chua publish. Sourceworkflows/buffer-publisher.json khongcredentials; deployedrefcred dattemp. ChuadungappTikTokSandbox/OAuth2.
- Kiểm tra: PASS JSONparse query va CLIimport credential/workflow; NOT_RUN BufferAPIthat vi chuatoken
- Bước tiếp theo: User mo https://publish.buffer.com/settings/api taokey. n8n /home/credentials -> Buffer API -> BearerToken -> Save. Workflow http://localhost:5678/workflow/socialBufferPublisher Execute docorgs, checkGraphQLerrors; sau do querychannels va publisher. Khongxinsecretchat,khonggit.
