const handleCropMessage = (message, context) => {
  const directive = (message.text ?? message.caption ?? '').split(/\s/, 1)[0].split('@', 1)[0];
  const selectedOutput = (message.text ?? message.caption ?? '').split(/\s+/)[1];
  const partsRequested = selectedOutput === 'parts';
  const key = context.chatId + ':' + message.from.id;
  const reply = text => [{ json: { ...context, text } }];
  if (directive === '/crop' || directive === '/done') {
    if (directive === '/crop' && queueStore.read().batchSessions?.[key]) return reply('Bạn đang gom bài theo đợt. /batch preview để xem và xác nhận, hoặc /batch cancel trước khi bật cắt ảnh.');
    const result = queueStore.transact(state => {
      state.cropSessions ??= {};
      if (directive === '/crop') state.cropSessions[key] = partsRequested ? 'parts' : selectedOutput === 'png' ? 'png' : 'collage';
      else delete state.cropSessions[key];
      return { updated: true };
    });
    if (result.busy) return reply('Bot đang cập nhật dữ liệu. Gửi lại lệnh sau ít giây.');
    if (directive === '/done') return reply('Đã thoát chế độ cắt ảnh. Ảnh/video gửi tiếp theo sẽ được xử lý theo luồng đăng bài như trước.');
    if (!message.photo && !message.document) return reply(partsRequested
      ? '✂️ Gửi ảnh dài dạng File/Tài liệu. Bot trả file ZIP chứa 3 phần PNG ở kích thước gốc, không thu nhỏ.\n/crop — ảnh ghép JPG dễ tải.\n/crop png — ảnh ghép PNG.\n/done — thoát chế độ cắt ảnh.'
      : `✂️ Đã bật chế độ cắt ảnh ${selectedOutput === 'png' ? 'PNG' : 'JPG chất lượng cao, dung lượng gọn hơn'}. Gửi ảnh dài dạng File/Tài liệu để giữ nét.\nKhông gửi dưới dạng Ảnh vì Telegram có thể thu nhỏ ảnh dài rất mạnh. JPG, PNG, WEBP; tối đa 20 MB và 40 triệu pixel.\n/crop png — ảnh ghép PNG.\n/crop parts — ZIP chứa 3 phần PNG ở kích thước gốc, không thu nhỏ.\nẢnh trong chế độ này chỉ được cắt và trả lại, không được lên lịch đăng.\n/done — thoát chế độ cắt ảnh.`);
  }
  if (!queueStore.read().cropSessions?.[key]) return;
  // Other commands may still be used. Media always stays in the crop branch until /done.
  if (directive.startsWith('/') && directive !== '/crop' && message.text) return;
  if (message.photo) {
    const compressed = message.photo[message.photo.length - 1];
    return reply(`Telegram đang gửi bản Ảnh${compressed.width && compressed.height ? ' ' + compressed.width + ' × ' + compressed.height + 'px' : ''}, có thể đã mất nét. Hãy gửi lại ảnh gốc bằng nút đính kèm → File/Tài liệu, hoặc bỏ chọn Nén ảnh/Compress. Bot cần file gốc để cắt rõ chữ. /done để thoát.`);
  }
  if (message.media_group_id) {
    const album = crypto.createHash('sha256').update(key + ':' + message.media_group_id).digest('hex');
    try { fs.writeFileSync('/files/telegram-crop-album-' + album + '.json', '{}', { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code === 'EEXIST') return []; throw error; }
    return reply('Chế độ cắt ảnh nhận một ảnh dài mỗi lần. Hãy gửi từng ảnh riêng dạng File/Tài liệu, thay vì gửi album. /done để thoát.');
  }
  const image = message.photo?.[message.photo.length - 1] ?? message.document;
  if (!image || message.video || message.document && !message.document.mime_type?.startsWith('image/') && !/\.(jpe?g|png|webp)$/i.test(message.document.file_name ?? '')) return reply('Đang ở chế độ cắt ảnh. Hãy gửi một ảnh JPG/PNG/WEBP dài theo chiều dọc. /done để quay lại đăng bài.');
  if (image.file_size > 20 * 1024 * 1024) return reply('Ảnh vượt giới hạn tải 20 MB. Hãy giảm dung lượng và gửi lại. /done để thoát.');
  const cropReceiptFile = `/files/telegram-crop-${context.chatId}-${context.messageId}.json`;
  try { fs.writeFileSync(cropReceiptFile, JSON.stringify({ status: 'processing', createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code === 'EEXIST') return []; throw error; }
  const output = queueStore.read().cropSessions[key];
  const cropSourceName = (message.document.file_name ?? 'anh').replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_.-]/gu, '-').slice(0, 64);
  return [{ json: { ...context, isCropRequest: true, fileId: image.file_id, cropReceiptFile, cropSourceName, cropOutput: ['parts', 'png'].includes(output) ? output : 'collage' } }];
};
