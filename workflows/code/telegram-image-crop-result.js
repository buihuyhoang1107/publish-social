const context = $('Telegram Intake').first().json;
const item = $input.first();
const fs = require('fs');
const expectedMime = context.cropOutput === 'parts' ? 'application/zip' : context.cropOutput === 'png' ? 'image/png' : 'image/jpeg';
if (item.json.error || !item.binary?.data || item.binary.data.mimeType !== expectedMime) {
  const failure = item.json.error?.message ?? item.json.error ?? '';
  const text = $('Download Crop Image').first().json.error
    ? 'Không tải được ảnh từ Telegram vì kết nối lỗi hoặc quá thời gian chờ. Ảnh chưa được cắt. Hãy gửi lại file sau ít phút; không cần nhập lại /crop. /done để thoát.'
    : String(failure).includes('429')
    ? 'Bot đang cắt ảnh khác. Hãy gửi lại ảnh sau ít giây. /done để thoát.'
    : 'Chưa cắt được ảnh. Hãy gửi File/Tài liệu gốc JPG/PNG/WEBP, rộng ít nhất 240px, cao ít nhất gấp 2 lần chiều rộng, tối đa 20 MB và 40 triệu pixel. Không gửi bản ảnh đã bị Telegram nén. Nếu file hợp lệ, kiểm tra dịch vụ xử lý ảnh rồi gửi lại. /done để thoát.';
  fs.writeFileSync(context.cropReceiptFile, JSON.stringify({ status: 'failed', completedAt: new Date().toISOString() }), { mode: 0o600 });
  return [{ json: { ...context, hasCropResult: false, text } }];
}
const extension = context.cropOutput === 'parts' ? 'zip' : context.cropOutput === 'png' ? 'png' : 'jpg';
item.binary.data.fileName = (context.cropSourceName || 'anh') + (extension === 'zip' ? '-3-phan.zip' : '-ghep.' + extension);
const crypto = require('crypto');
const bytes = await this.helpers.getBinaryDataBuffer(0, 'data');
const name = crypto.randomBytes(16).toString('hex') + '_' + (Date.now() + 86400000) + '.' + extension;
fs.writeFileSync('/files/' + name, bytes, { mode: 0o600 });
const cropDownloadUrl = `${publisherConfig.publicBaseUrl}/webhook/${publisherConfig.mediaWebhookId}/buffer-media/${name}`;
return [{ json: { ...context, hasCropResult: true, cropDownloadUrl }, binary: item.binary }];
