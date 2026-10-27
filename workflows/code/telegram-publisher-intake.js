// Embedded by build-telegram-publisher.cjs. Files are durable receipts, not media URLs.
const fs = require('fs');
const update = $input.first().json;
const message = update.message;
if (!message || message.chat?.type !== 'private' ||
    !publisherConfig.allowedUserIds.includes(message.from?.id) ||
    !publisherConfig.allowedChatIds.includes(message.chat.id)) return [];

const help = 'Gửi một ảnh hoặc video kèm caption để đăng ngay lên TikTok thieponline.org. Không cần duyệt.\nẢnh JPG, PNG, WEBP; video MP4, MOV, WEBM; tối đa 20 MB mỗi file. Gửi từng bài, không gửi album.\nNếu video tạo bằng AI, bắt đầu caption bằng /ai (phần này không được đăng).\nGửi /status để xem kết quả bài gần nhất.';
const context = { chatId: message.chat.id, messageId: message.message_id, shouldPublish: false, queryStatus: false };
const reply = (text) => [{ json: { ...context, text } }];
const command = (message.text ?? '').split(/\s/, 1)[0].split('@', 1)[0];
if (command === '/status') {
  let target = message.reply_to_message?.message_id ?? Number((message.text ?? '').split(/\s+/)[1]);
  if (!Number.isSafeInteger(target) || target <= 0) {
    target = 0;
    const prefix = `telegram-post-${message.chat.id}-`;
    for (const file of fs.readdirSync('/files')) {
      if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;
      const id = Number(file.slice(prefix.length, -5));
      if (Number.isSafeInteger(id) && id > target) target = id;
    }
    if (!target) return reply('Chưa có yêu cầu đăng nào được ghi nhận.');
  }
  const journalFile = `/files/telegram-post-${message.chat.id}-${target}.json`;
  let saved;
  try { saved = JSON.parse(fs.readFileSync(journalFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return reply('Chưa có yêu cầu đăng cho tin nhắn này.');
  }
  if (!saved.postId) return reply(Date.now() - Date.parse(saved.createdAt) > 180000
    ? 'Chưa xác nhận được kết quả đăng của bài này. Cần kiểm tra yêu cầu trước để tránh đăng trùng.'
    : saved.text ?? 'Yêu cầu đang xử lý hoặc chưa xác nhận được kết quả.');
  return [{ json: { ...context, messageId: target, journalFile, postId: saved.postId, queryStatus: true } }];
}
if (command.startsWith('/')) return reply(help);
if (message.media_group_id) return reply('Album chưa được hỗ trợ; bài này chưa được đăng. Bot hiện nhận một ảnh hoặc video cho mỗi bài.');
const photo = message.photo?.[message.photo.length - 1];
const media = photo ?? message.video ?? message.document;
if (!media) return reply(command ? help : 'Tin nhắn này chỉ có chữ nên chưa thể đăng TikTok. Bot hiện nhận ảnh hoặc video có caption.');
const mediaType = photo || media.mime_type?.startsWith('image/') ? 'image' : 'video';
const extension = photo ? 'jpg' : (media.file_name?.split('.').pop() ?? (media.mime_type === 'video/mp4' ? 'mp4' : '')).toLowerCase();
if (!(mediaType === 'image' ? ['jpg', 'jpeg', 'png', 'webp'] : ['mp4', 'mov', 'webm']).includes(extension)) return reply('Định dạng file chưa hỗ trợ. Bài chưa được đăng. Ảnh: JPG, PNG, WEBP; video: MP4, MOV, WEBM.');
if (media.file_size > 20 * 1024 * 1024) return reply('File vượt giới hạn tải 20 MB của Telegram Bot. Bài chưa được đăng.');
const isAiGenerated = /^\/ai(?:\s|$)/i.test(message.caption ?? '');
const caption = (message.caption ?? '').replace(/^\/ai(?:\s|$)/i, '').trim();
if (!caption) return reply('Ảnh/video này chưa có caption nên chưa được đăng.');

const journalFile = `/files/telegram-post-${message.chat.id}-${message.message_id}.json`;
const receipt = { chatId: message.chat.id, messageId: message.message_id, status: 'received', text: 'Đã nhận bài và đang xử lý. Gửi /status để kiểm tra kết quả.', createdAt: new Date().toISOString() };
try {
  // Atomic create prevents concurrent redelivery of the same Telegram message from publishing twice.
  fs.writeFileSync(journalFile, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
} catch (error) {
  if (error.code === 'EEXIST') return [];
  throw error;
}
return [{ json: { ...context, shouldPublish: true, journalFile, fileId: media.file_id, mediaType, extension, caption, isAiGenerated } }];
