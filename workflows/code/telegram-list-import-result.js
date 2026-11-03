const context = $('Telegram Intake').first().json;
const item = $input.first();
let bytes;
if (!item.json.error && item.binary?.data) {
  try { bytes = await this.helpers.getBinaryDataBuffer(0, 'data'); }
  catch { /* The shared import handler records the failed receipt. */ }
}
const result = listImportTools.finish(context, bytes);
if (result.silent) return [];
return [{ json: { ...context, calendarKeyboard: listImportTools.keyboard({ id: context.importBatchId }), text: result.busy ? 'Kho đang cập nhật. Bấm Kiểm tra lại sau ít giây; nếu thiếu file, gửi lại file đó.' : result.text, runQueue: false } }];
