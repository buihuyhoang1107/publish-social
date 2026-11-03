const fs = require('fs');
const crypto = require('crypto');
const update = $input.first().json;
const callback = update.callback_query;
const message = callback ? { ...callback.message, from: callback.from, text: '' } : update.message;
if (!message || message.chat?.type !== 'private' || !publisherConfig.allowedUserIds.includes(message.from?.id) || !publisherConfig.allowedChatIds.includes(message.chat.id)) return [];
const context = { chatId: message.chat.id, ownerId: message.from.id, messageId: message.message_id, shouldPublish: false, queryStatus: false, isAlbum: false };
const reply = (text) => [{ json: { ...context, text } }];
if (callback) {
  const match = /^queue_retry:(\d+)$/.exec(callback.data ?? '');
  const calendar = /^calendar:(day|week|month):(20\d{2}-\d{2}-\d{2}):(\d{1,6})$/.exec(callback.data ?? '');
  const batch = /^batch:(start|preview|confirm|cancel):([a-f0-9]{12}|20\d{2}-\d{2}-\d{2})(?::([a-f0-9]{8}|\d{1,6}))?$/.exec(callback.data ?? '');
  const menu = /^menu:(import|queue|calendar|batch)$/.exec(callback.data ?? '');
  const importAction = /^import:(preview|cancel|remove|files|drop|dropfile):([a-f0-9]{12})(?::([a-f0-9]{8}|\d{1,6}))?(?::(\d{1,6}))?$/.exec(callback.data ?? '');
  if (!publisherConfig.queue?.enabled || !(match || calendar || batch || menu || importAction)) return [];
  const commandText = match ? '/retry ' + match[1] : calendar ? '/calendar ' + calendar.slice(1).join(' ') : menu ? '/' + menu[1] + (menu[1] === 'batch' ? ' start' : '') : importAction ? '/import ' + importAction[1] + ' ' + importAction.slice(3).filter(Boolean).join(' ') : '/batch ' + batch.slice(1).filter(Boolean).join(' ');
  return [{ json: { ...context, ...(importAction ? { importBatchId: importAction[2] } : {}), queueCommand: true, commandText, commandKey: 'callback:' + callback.id, callbackQueryId: callback.id } }];
}
const command = (message.text ?? '').split(/\s/, 1)[0].split('@', 1)[0];
const sessionKey = context.chatId + ':' + context.ownerId;
const queueState = publisherConfig.queue?.enabled ? queueStore.read() : undefined;
if (publisherConfig.queue?.enabled) context.calendarKeyboard = { rows: [
  { row: { buttons: [{ text: '📥 Nhập danh sách', additionalFields: { callback_data: 'menu:import' } }, { text: '📦 Gom bài', additionalFields: { callback_data: 'menu:batch' } }] } },
  { row: { buttons: [{ text: '📋 Kho nội dung', additionalFields: { callback_data: 'menu:queue' } }, { text: '📅 Xem lịch', additionalFields: { callback_data: 'menu:calendar' } }] } },
] };
const batchId = queueState?.batchSessions?.[sessionKey];
if (command === '/done' && batchId && !queueState.cropSessions?.[sessionKey]) return [{ json: { ...context, queueCommand: true, commandText: '/batch preview' } }];
if (publisherConfig.queue?.enabled && command === '/import') return [{ json: { ...context, queueCommand: true, commandText: (message.text ?? '').replace(/^\/import(?:@\w+)?/, '/import') } }];
const importResult = handleListImportMessage(message, context);
if (importResult) return importResult;
const cropResult = handleCropMessage(message, context);
if (cropResult) return cropResult;
const platformLabels = { tiktok: 'TikTok', facebook: 'Facebook Page', instagram: 'Instagram', threads: 'Threads' };
const help = publisherConfig.queue?.enabled ? `Gửi một ảnh, album tối đa 10 ảnh hoặc một video kèm caption. Bài gửi vào được tự động duyệt và xếp lịch, không cần /approve.\n/queue — xem kho và lịch\n/cancel <mã bài> — hủy bài chưa gửi Buffer\n/status — xem bài gần nhất\nLịch: 09:00, 14:00, 20:00 hằng ngày (giờ Việt Nam), lên các kênh ${publisherConfig.services.map(service => platformLabels[service]).join(', ')} đã kết nối.\nNhập album một lần, tối đa 10 ảnh. Mỗi file tối đa 20 MB. /ai ở đầu caption cho video AI. Threads tối đa 499 ký tự; bài dài sẽ bỏ qua kênh này.\nMáy, Docker và tunnel phải chạy đến khi các bài đăng xong để Buffer lấy media.` : `Gửi một ảnh, album tối đa 10 ảnh hoặc một video kèm caption. Bot tự gửi đăng lên ${publisherConfig.services.map((service) => platformLabels[service]).join(', ')} đã kết nối. Không cần duyệt.\nVới nhiều ảnh: chọn các ảnh và gửi chung thành một album, nhập caption một lần. Mỗi file tối đa 20 MB.\nVideo AI: thêm /ai ở đầu caption.\nGửi /status để xem kết quả từng nền tảng của bài gần nhất.`;
if (publisherConfig.queue?.enabled && ['/queue', '/approve', '/cancel', '/retry', '/calendar', '/lich', '/batch'].includes(command)) return [{ json: { ...context, queueCommand: true, commandText: (message.text ?? '').replace(/^\/\w+(?:@\w+)?/, command === '/lich' ? '/calendar' : command), replyMessageId: message.reply_to_message?.message_id } }];
if (command === '/status') {
  let target = message.reply_to_message?.message_id ?? Number((message.text ?? '').split(/\s+/)[1]);
  if (!Number.isSafeInteger(target) || target <= 0) {
    target = 0;
    const prefix = `telegram-post-${context.chatId}-`;
    for (const file of fs.readdirSync('/files')) {
      if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;
      const id = Number(file.slice(prefix.length, -5));
      if (Number.isSafeInteger(id) && id > target) target = id;
    }
  }
  if (!target) return reply('Chưa có yêu cầu đăng nào được ghi nhận.');
  let journalFile = `/files/telegram-post-${context.chatId}-${target}.json`;
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
    if (saved.canonicalFile) {
      journalFile = saved.canonicalFile;
      saved = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return reply('Chưa có yêu cầu đăng cho tin nhắn này.');
  }
  if (publisherConfig.queue?.enabled && saved.queuePostId) {
    const post = queueStore.read().posts.find(item => item.id === saved.queuePostId && item.chatId === context.chatId);
    if (post?.targets?.some(target => !target.retryRequested && (target.status === 'error' && target.postId || target.status === 'rejected' && !target.postId))) context.retryMessageId = post.messageId;
    if (post) return reply(`Bài #${post.messageId} — ${queueStore.labels[post.status]}${post.dueAt ? '\nLịch: ' + queueStore.formatTime(post.dueAt) + ' (giờ Việt Nam)' : ''}\n${post.caption.slice(0, 800)}\n` + (post.targets ?? []).map(target => `${queueStore.platforms[target.service] ?? target.service}: ${target.status}${target.error ? ' — ' + target.error : ''}${target.externalLink ? '\n' + target.externalLink : ''}`).join('\n'));
  }
  if (!saved.targets?.length && !saved.postId) return reply(saved.text ?? 'Bài đang được chuẩn bị, chưa có kết quả đăng.');
  return [{ json: { ...context, messageId: saved.messageId, journalFile, queryStatus: true } }];
}
if (command.startsWith('/')) return reply(help + '\n\n📥 /import — nhập danh sách content và ảnh theo mã bài\n📅 /calendar hoặc /lich — xem lịch ngày/tuần/tháng\n📦 /batch start — gom nhiều bài, xem trước và xác nhận lịch\n/batch preview — kiểm tra đợt đang gom\n✂️ /crop — bật chế độ cắt ảnh dài thành 3 cột có viền trắng và nền mờ.\n/done — xem trước đợt hoặc thoát chế độ cắt ảnh.');
const photo = message.photo?.[message.photo.length - 1];
const file = photo ?? message.video ?? message.document;
if (!file) return reply('Bài chưa có ảnh/video. Bạn có thể gửi một ảnh, album ảnh hoặc video có caption.');
const mediaType = photo || file.mime_type?.startsWith('image/') ? 'image' : 'video';
const extension = photo ? 'jpg' : (file.file_name?.split('.').pop() ?? (file.mime_type === 'video/mp4' ? 'mp4' : '')).toLowerCase();
const caption = (message.caption ?? '').replace(/^\/ai(?:\s|$)/i, '').trim();
const medium = { messageId: message.message_id, fileId: file.file_id, mediaType, extension, caption, isAiGenerated: /^\/ai(?:\s|$)/i.test(message.caption ?? '') };
if (!(mediaType === 'image' ? ['jpg', 'jpeg', 'png', 'webp'] : ['mp4', 'mov', 'webm']).includes(extension)) medium.error = 'Định dạng file chưa hỗ trợ. Ảnh: JPG, PNG, WEBP; video: MP4, MOV, WEBM.';
if (file.file_size > 20 * 1024 * 1024) medium.error = 'Có file vượt giới hạn tải 20 MB của Telegram Bot.';
const receiptPath = (id) => `/files/telegram-post-${context.chatId}-${id}.json`;
if (batchId) { context.batchId = batchId; context.batchUpload = true; }
if (message.media_group_id) {
  const albumKey = crypto.createHash('sha256').update(`${context.chatId}:${message.media_group_id}`).digest('hex');
  const albumPrefix = `telegram-album-${albumKey}`;
  const claimFile = `/files/${albumPrefix}.claim.json`;
  let claim;
  try { claim = JSON.parse(fs.readFileSync(claimFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const partFile = `/files/${albumPrefix}-${message.message_id}.part.json`;
  // Redelivery must not extend the quiet period or create another coordinator.
  if (fs.existsSync(partFile)) return [];
  if (claim && fs.existsSync(`/files/${albumPrefix}.sealed`)) return reply('Ảnh này đến sau khi album đã được gửi xử lý nên chưa được thêm vào bài. Những ảnh đã gửi đăng không bị đăng lại.');
  try { fs.writeFileSync(partFile, JSON.stringify({ ...medium, receivedAt: Date.now() }), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code === 'EEXIST') return []; throw error; }
  let coordinator = false;
  try {
    claim = { chatId: context.chatId, ownerId: context.ownerId, batchId: context.batchId, batchUpload: context.batchUpload, messageId: context.messageId, journalFile: receiptPath(context.messageId), albumPrefix };
    fs.writeFileSync(claimFile, JSON.stringify(claim), { flag: 'wx', mode: 0o600 });
    coordinator = true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    claim = JSON.parse(fs.readFileSync(claimFile, 'utf8'));
  }
  if (!coordinator) {
    try { fs.writeFileSync(receiptPath(context.messageId), JSON.stringify({ canonicalFile: claim.journalFile }), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    return [];
  }
  fs.writeFileSync(claim.journalFile, JSON.stringify({ ...claim, status: 'collecting', createdAt: new Date().toISOString(), text: 'Đang gom các ảnh trong album thành một bài.' }), { flag: 'wx', mode: 0o600 });
  return [{ json: { ...context, ...claim, isAlbum: true } }];
}
if (medium.error) return reply(medium.error + ' Bài chưa được đăng.');
if (!caption) return reply('Ảnh/video này chưa có caption nên chưa được đăng.');
const journalFile = receiptPath(context.messageId);
try { fs.writeFileSync(journalFile, JSON.stringify({ ...context, status: 'received', createdAt: new Date().toISOString(), text: 'Đã nhận bài, đang chuẩn bị đăng.' }), { flag: 'wx', mode: 0o600 }); }
catch (error) { if (error.code === 'EEXIST') return []; throw error; }
return [{ json: { ...context, journalFile, caption, isAiGenerated: medium.isAiGenerated, media: [medium], shouldPublish: true } }];
