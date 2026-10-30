# Tiếp tục công việc

- Cập nhật: 30/10/2026. Trạng thái: hoàn tất yêu cầu gỡ chức năng tạo phim.
- User đã hủy hướng làm phim; chỉ tiếp tục đăng bài tự động. Không khởi động lại bộ dựng/tải model hoặc khôi phục tính năng đã gỡ.
- Bắt buộc theo codex-workflow/README.md và AGENTS.md; tuyệt đối không dùng Git.
- Production n8n seKtuQgWny3K7y5m đã publish bản 75 nodes, activeVersionId=versionId, không còn nhánh/lịch/metadata tạo phim.
- Giữ nguyên các node đăng bài, credentials, connections còn lại; chỉ gỡ 7 node phim và phần xử lý lệnh trong Telegram Intake. Bản clean kiểm chứng: temp/social-publisher-clean-active.json.
- Đã dừng worker và các tiến trình dựng/tải liên quan; xóa code, scripts/test riêng, model, môi trường Python riêng, bản thử, job/session/dữ liệu tạm và các bản sao phục vụ phim trong workspace. Dọn các bản runtime thử riêng trong /tmp của n8n.
- Giữ nguyên Python hệ thống, Docker, image-tools, tunnel, ảnh/video và dữ liệu hàng đợi đăng bài của người dùng. Không xóa hay đăng lại bài trên các kênh thật.
- /film không còn được hỗ trợ hoặc xuất hiện trong hướng dẫn bot. scripts/start-telegram.cjs không còn khởi động worker phim.
- Vận hành: gửi ảnh/album/video kèm caption để tự duyệt và xếp lịch; /queue xem kho/lịch, /status xem kết quả, /retry đăng lại kênh lỗi, /cancel hủy bài chưa gửi.
- Lịch giữ 09:00, 14:00, 20:00 giờ Việt Nam. Retry bài tương lai phải giữ dueAt; chỉ bài quá giờ mới shareNow.
- Crop giữ /crop JPG, /crop png, /crop parts ZIP, /done; giữ cách chia3 cột đã duyệt và link tải dự phòng24h, không tự bỏ vùng đen.
- PASS: crop routing, queue retry, content queue trong Linux; syntax source; so khớp tham số/credentials/connections sau publish; kiểm tra live75nodes không code/metadata phim; local/public health200.
- Bước tiếp: tiếp tục vận hành đăng bài như trước. Không còn việc tồn đọng của yêu cầu gỡ tính năng.
