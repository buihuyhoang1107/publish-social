const context = $('Telegram Intake').first().json;
const response = $input.first().json;
const sent = response.result ?? response;
const failed = response.error || response.ok === false || !sent.document?.file_id;
const fs = require('fs');
fs.writeFileSync(context.cropReceiptFile, JSON.stringify({ status: failed ? 'unknown' : 'sent', completedAt: new Date().toISOString() }), { mode: 0o600 });
if (failed) return [{ json: { ...context, text: 'Chưa xác nhận được việc gửi ảnh kết quả. Kiểm tra cuộc trò chuyện; nếu chưa nhận được, hãy gửi lại ảnh. /done để thoát.' } }];
return [];
