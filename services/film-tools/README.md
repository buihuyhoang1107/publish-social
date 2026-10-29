# Cảnh thử phim cưới 2.5D

Đây là bộ kiểm chứng image-to-video trên RTX 4060 Ti 8 GB, chưa phải dịch vụ Telegram. Không gọi API trả phí, không gửi hoặc đăng nội dung lên mạng xã hội. Khung hình gốc được tạo một lần bằng built-in imagegen; chuyển động được tạo tại máy bằng LTX-Video.

Môi trường tách biệt: Python 3.11, PyTorch 2.6.0 CUDA 12.4, các gói trong `requirements.txt`. Không thay Python hoặc Docker của bot hiện tại.

```powershell
temp/film-bootstrap/bin/uv.exe pip install --python temp/film-local-venv/Scripts/python.exe torch==2.6.0 --index-url https://download.pytorch.org/whl/cu124
temp/film-bootstrap/bin/uv.exe pip install --python temp/film-local-venv/Scripts/python.exe -r services/film-tools/requirements.txt
temp/film-local-venv/Scripts/python.exe services/film-tools/render_benchmark.py --episode output/wedding-film-25d/episode-01.json
```

Lần đầu tải khoảng 25.6 GB model và lưu trong `tools/film-models`, sau đó dùng lại cache. Text encoder XXL chạy CPU để không vượt VRAM 8 GB; sau khi mã hóa prompt sẽ được giải phóng. Prompt embeddings lưu riêng để không tải text encoder khi chạy lại cùng prompt. Các bước tạo video dùng CPU offload và VAE tiling.

Nếu render thành công, script xuất MP4 cảnh thử khoảng 2 giây, ba frame kiểm tra và `benchmark.json` ghi trạng thái, thời gian, peak VRAM và revision thực tế. Cảnh thử không tạo hội thoại, âm nhạc hoặc đồng bộ miệng. `episode-01.json` mô tả kịch bản 30 giây để ghép sau khi kiểm chứng chuyển động.

Trạng thái ngày 29/10/2026: đã kiểm tra cú pháp Python và timeline 6 cảnh đủ 30 giây; chưa kiểm tra inference. Python 3.11 và uv đã cài trong workspace. Lượt tải PyTorch/model đã dừng do dung lượng và tốc độ tải; model chưa đầy đủ, PyTorch chưa cài xong. Không có MP4 chuyển động hoặc lệnh `/film` hoạt động. Khung hình hiện có là ảnh tĩnh, không phải kết quả benchmark.

Tải model có thể tiếp tục từ phần dở, sau khi cài dependencies:

```powershell
temp/film-local-venv/Scripts/python.exe services/film-tools/download_model.py --episode output/wedding-film-25d/episode-01.json
```

Thông số 320×576 chỉ để đo khả năng chạy; không phải chất lượng video bàn giao. Không upscale rồi coi là chi tiết gốc. Phải kiểm tra mặt, tay, tấm thiệp, nhấp nháy và độ nhất quán trước khi tích hợp Telegram.

Nguồn: [LTX-Video](https://github.com/Lightricks/LTX-Video), [Diffusers LTX image-to-video](https://github.com/huggingface/diffusers/blob/v0.33.1/src/diffusers/pipelines/ltx/pipeline_ltx_image2video.py). Model 2B 0.9.5 dùng [Open RAIL-M](https://huggingface.co/Lightricks/LTX-Video-0.9.5/blob/main/ltx-video-2b-v0.9.5.license.txt), có các điều kiện sử dụng/phân phối; không đồng nhất giấy phép model với giấy phép thư viện.
