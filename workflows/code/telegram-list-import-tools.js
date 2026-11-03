const listImportTools = (() => {
  const key = context => context.chatId + ':' + (context.ownerId ?? context.chatId);
  const active = (state, context) => state.batches?.[state.batchSessions?.[key(context)]];
  const dirty = batch => { delete batch.preview; };
  const counts = batch => `${Object.keys(batch.importItems).length} content, ${Object.keys(batch.importFiles).length} file ảnh/video`;
  const keyboard = batch => ({ rows: [
    { row: { buttons: [{ text: '👀 Xem trước / Kiểm tra lại', additionalFields: { callback_data: `import:preview:${batch.id}` } }] } },
    { row: { buttons: [{ text: '🗑 Bỏ bài', additionalFields: { callback_data: `import:remove:${batch.id}:1` } }, { text: '🗂 Bỏ riêng file', additionalFields: { callback_data: `import:files:${batch.id}:1` } }] } },
    { row: { buttons: [{ text: 'Hủy đợt nhập', additionalFields: { callback_data: `import:cancel:${batch.id}` } }, { text: '📅 Xem lịch', additionalFields: { callback_data: 'menu:calendar' } }] } },
  ] });
  const saveContents = (batch, text, messageId) => {
    const items = parseImportList(text);
    const newCount = items.filter(item => !batch.importItems[item.code]).length;
    if (Object.keys(batch.importItems).length + newCount > 1000) throw new Error('Đợt chỉ nhận tối đa 1.000 bài.');
    for (const item of items) {
      const previous = batch.importItems[item.code];
      if (previous && previous.messageId > messageId) continue;
      batch.importItems[item.code] = { ...item, messageId, order: previous?.order ?? batch.importNextOrder++ };
    }
    dirty(batch);
    return items.length;
  };
  const prepare = (state, batch) => {
    for (const receipt of Object.values(batch.importReceipts)) if (receipt.status === 'processing' && Date.now() - Date.parse(receipt.startedAt) > 300000) receipt.status = 'failed';
    const uploading = Object.values(batch.importReceipts).filter(receipt => receipt.status === 'processing');
    if (uploading.length) return { text: `Đã nhận ${counts(batch)}; còn ${uploading.length} file đang tải. Chờ tải xong rồi /import preview. Chưa bài nào được gửi lên lịch.` };
    const items = Object.values(batch.importItems).sort((a, b) => a.order - b.order);
    const files = Object.values(batch.importFiles);
    if (!items.length) return { text: 'Chưa có danh sách content. Gửi tin nhắn hoặc file TXT UTF-8 theo mẫu:\n[POST01]\nCaption bài 1…\n\n[POST02]\nCaption bài 2…\nSau đó gửi POST01.png hoặc POST01.mp4, POST02.png… dạng File/Tài liệu.' };
    const pairs = [];
    const issues = [];
    const used = new Set();
    for (const item of items) {
      const matches = files.filter(file => item.fileName ? file.fileName.toLowerCase() === item.fileName.toLowerCase() : file.fileName.replace(/\.[^.]+$/, '').toUpperCase() === item.code);
      if (!matches.length) { issues.push(`${item.code}: thiếu ${item.fileName ?? 'file ảnh/video cùng mã ' + item.code}`); continue; }
      if (matches.length > 1) { issues.push(`${item.code}: có nhiều file cùng mã; dùng /import remove <tên file> để bỏ file thừa`); continue; }
      const file = matches[0];
      if (used.has(file.fileName.toLowerCase())) { issues.push(`${file.fileName}: đang được gán cho nhiều bài`); continue; }
      used.add(file.fileName.toLowerCase());
      const isAiGenerated = file.mediaType === 'video' && /^\/ai(?:\s|$)/i.test(item.caption);
      const caption = isAiGenerated ? item.caption.replace(/^\/ai(?:\s|$)/i, '').trim() : item.caption;
      if (!caption) { issues.push(`${item.code}: cần có caption sau /ai`); continue; }
      const fingerprint = queueStore.crypto.createHash('sha256').update(JSON.stringify([caption, [file.hash], isAiGenerated])).digest('hex');
      const duplicate = state.posts.find(post => post.batchId !== batch.id && post.chatId === batch.chatId && post.fingerprint === fingerprint && post.status !== 'cancelled');
      if (duplicate) { issues.push(`${item.code}: trùng bài #${duplicate.messageId} trong kho; /import remove ${item.code} để bỏ khỏi đợt`); continue; }
      pairs.push({ item, file, fingerprint, caption, isAiGenerated });
    }
    for (const file of files) if (!used.has(file.fileName.toLowerCase())) issues.push(`${file.fileName}: chưa có content tương ứng`);
    if (issues.length) return { text: `Chưa thể chốt lịch: ${counts(batch)}.\n` + issues.slice(0, 15).join('\n') + (issues.length > 15 ? `\nCòn ${issues.length - 15} mục khác.` : '') + '\n\nGửi bổ sung hoặc gửi lại content/file cùng mã để sửa. /import remove POST01 — bỏ bài và file tương ứng; /import remove file.mp4 — bỏ riêng file. Sau đó /import preview.' };
    const ids = new Set(pairs.map(pair => batch.chatId + ':' + pair.file.messageId));
    for (const post of state.posts) if (post.batchId === batch.id && post.importCode && post.status === 'batch' && !ids.has(post.id)) post.status = 'cancelled';
    for (const { item, file, fingerprint, caption, isAiGenerated } of pairs) {
      const id = batch.chatId + ':' + file.messageId;
      let post = state.posts.find(value => value.id === id);
      if (post && (post.batchId !== batch.id || !['batch', 'cancelled'].includes(post.status))) return { text: `File ${file.fileName} đã thuộc một bài khác. Hãy gửi file bằng tin nhắn mới.` };
      if (!post) { post = { id, createdAt: new Date().toISOString() }; state.posts.push(post); }
      const journalFile = `/files/telegram-post-${batch.chatId}-${file.messageId}.json`;
      Object.assign(post, { chatId: batch.chatId, ownerId: batch.ownerId, messageId: file.messageId, journalFile, caption, isAiGenerated, mediaFiles: [{ name: file.mediaName, mediaType: file.mediaType ?? 'image', hash: file.hash }], fingerprint, status: 'batch', batchId: batch.id, importCode: item.code, importFileName: file.fileName, importOrder: item.order });
      queueStore.write(journalFile, { status: 'batch', batchId: batch.id, queuePostId: id, chatId: batch.chatId, messageId: file.messageId, text: 'Đã ghép content và file ảnh/video; đang chờ xác nhận lịch.' });
    }
  };
  const handle = (state, context, args) => {
    const action = args[0] ?? 'start';
    if (action === 'start') {
      const existing = active(state, context);
      if (existing?.status === 'collecting') return { text: existing.importMode ? `Đang nhập ${counts(existing)}. Gửi tiếp content/ảnh, /import preview để xem hoặc /import cancel để hủy.` : 'Bạn đang gom bài bằng /batch. Hãy xác nhận hoặc /batch cancel trước khi mở đợt nhập danh sách.' };
      const response = bulkPlanTools.handle(state, context, ['start', ...args.slice(1)]);
      const batch = active(state, context);
      if (!batch || batch.status !== 'collecting') return response;
      Object.assign(batch, { importMode: true, importItems: {}, importFiles: {}, importReceipts: {}, importNextOrder: 0 });
      return { text: '📥 Đã mở đợt nhập danh sách.\n1. Dán content hoặc gửi file TXT UTF-8:\n[POST01]\nCaption bài 1…\n\n[POST02]\nCaption bài 2…\nCó thể gửi nhiều tin nhắn; cũng nhận bảng 3 cột Mã bài | Tên file | Content đăng bài.\n2. Chọn ảnh hoặc video POST01.png, POST02.mp4… và gửi dạng File/Tài liệu. Mỗi content ghép một ảnh hoặc một video theo tên file, không theo thứ tự gửi. Video MP4/MOV/WEBM, tối đa 20 MB/file. Bot lưu file, không trả lời từng file.\n3. /import preview — xem ghép file và lịch; chỉ bấm Xác nhận khi đã kiểm tra.\n/import remove POST01 — bỏ một bài; /import cancel — hủy đợt.\nCác bài chưa được gửi lên lịch cho đến khi bạn xác nhận.', calendarKeyboard: response.calendarKeyboard };
    }
    const batch = active(state, context);
    if (context.importBatchId && batch?.id !== context.importBatchId) return { text: 'Nút thuộc đợt nhập cũ. Hãy mở lại đợt hiện tại.' };
    if (!batch?.importMode || batch.status !== 'collecting') return { text: 'Chưa có đợt nhập danh sách. Gửi /import để bắt đầu.' };
    if ((action === 'remove' && !args[1]) || action === 'files' || (action === 'remove' && /^\d+$/.test(args[1]))) {
      const fileMode = action === 'files';
      const values = fileMode ? Object.keys(batch.importFiles) : Object.keys(batch.importItems);
      const page = Math.min(Math.max(1, Math.ceil(values.length / 8)), Math.max(1, Number(args[1]) || 1));
      const token = queueStore.crypto.randomBytes(4).toString('hex');
      batch.importRemoval = { token, values, fileMode };
      const buttons = values.slice((page - 1) * 8, page * 8).map((value, index) => ({ row: { buttons: [{ text: '🗑 ' + (fileMode ? batch.importFiles[value].fileName : value), additionalFields: { callback_data: `import:${fileMode ? 'dropfile' : 'drop'}:${batch.id}:${token}:${(page - 1) * 8 + index}` } }] } }));
      buttons.push({ row: { buttons: [{ text: '‹ Trước', additionalFields: { callback_data: `import:${action}:${batch.id}:${Math.max(1, page - 1)}` } }, { text: 'Tiếp ›', additionalFields: { callback_data: `import:${action}:${batch.id}:${page + 1}` } }] } });
      return { text: `Chọn ${fileMode ? 'file' : 'bài và file tương ứng'} cần bỏ · Trang ${page}.`, calendarKeyboard: { rows: [...buttons, ...keyboard(batch).rows] } };
    }
    if (action === 'drop' || action === 'dropfile') {
      const selection = batch.importRemoval;
      if (!selection || selection.token !== args[1] || selection.fileMode !== (action === 'dropfile') || !selection.values[Number(args[2])]) return { text: 'Danh sách chọn đã thay đổi. Bấm Bỏ bài/Bỏ riêng file để chọn lại.' };
      const value = selection.values[Number(args[2])];
      delete batch.importRemoval;
      return handle(state, context, ['remove', value]);
    }
    if (action === 'preview' || action === 'cancel') return bulkPlanTools.handle(state, context, [action]);
    if (action === 'remove') {
      if (Object.values(batch.importReceipts).some(receipt => receipt.status === 'processing')) return { text: 'Còn file đang tải. Chờ tải xong rồi gửi lại lệnh bỏ bài/ảnh.' };
      const value = args.slice(1).join(' ');
      const code = value.toUpperCase();
      const item = batch.importItems[code];
      if (item) {
        for (const [name, file] of Object.entries(batch.importFiles)) if (item.fileName ? name === item.fileName.toLowerCase() : file.fileName.replace(/\.[^.]+$/, '').toUpperCase() === code) delete batch.importFiles[name];
        delete batch.importItems[code];
      } else if (batch.importFiles[value.toLowerCase()]) delete batch.importFiles[value.toLowerCase()];
      else return { text: 'Không tìm thấy mã bài hoặc tên file. Ví dụ /import remove POST01 hoặc /import remove POST01.mp4.' };
      dirty(batch);
      return { text: `Đã bỏ ${value} khỏi đợt nhập. Còn ${counts(batch)}. /import preview để kiểm tra.` };
    }
    if (action === 'content' && context.importText) {
      try { const count = saveContents(batch, context.importText, context.messageId); return { text: `Đã lưu ${count} content. Hiện có ${counts(batch)}. Gửi ảnh/video dạng File/Tài liệu rồi /import preview. Gửi lại một mã để sửa nội dung trước khi xác nhận.` }; }
      catch (error) { return { text: error.message }; }
    }
    return { text: 'Dùng /import để bắt đầu, /import preview để xem, /import remove <mã bài hoặc tên ảnh> để bỏ, /import cancel để hủy.' };
  };
  const finish = (context, bytes) => queueStore.transact(state => {
    const batch = state.batches?.[context.importBatchId];
    if (!batch || batch.status !== 'collecting' || batch.chatId !== context.chatId || batch.ownerId !== context.ownerId || state.batchSessions?.[key(context)] !== batch.id) return { text: 'Đợt nhập đã đóng hoặc hủy. File vừa gửi chưa được đưa vào lịch.' };
    const receipt = batch.importReceipts[context.messageId];
    if (!receipt || receipt.status !== 'processing') return { silent: true };
    if (!bytes) { receipt.status = 'failed'; return { text: `Không tải được ${context.importFileName} từ Telegram. Hãy gửi lại file; /import preview để xem mục còn thiếu.` }; }
    try {
      if (context.importKind === 'text') {
        if (bytes.length > 1024 * 1024) throw new Error('File TXT vượt 1 MB. Hãy chia nhỏ danh sách.');
        const text = bytes.toString('utf8');
        if (text.includes('\uFFFD')) throw new Error('File TXT cần lưu bằng UTF-8 để giữ đúng dấu tiếng Việt.');
        const count = saveContents(batch, text, context.messageId);
        receipt.status = 'stored';
        return { text: `Đã đọc ${count} content từ ${context.importFileName}. Hiện có ${counts(batch)}. Gửi ảnh/video dạng File/Tài liệu rồi /import preview.` };
      }
      if (bytes.length > 20 * 1024 * 1024) throw new Error('File ảnh/video vượt 20 MB.');
      const name = context.importFileName.toLowerCase();
      const previous = batch.importFiles[name];
      if (previous?.messageId > context.messageId) { receipt.status = 'stored'; return { silent: true }; }
      if (!previous && Object.keys(batch.importFiles).length >= 1000) throw new Error('Đợt chỉ nhận tối đa 1.000 file ảnh/video.');
      const extension = name.split('.').pop();
      const mediaName = `queue_${queueStore.crypto.randomBytes(16).toString('hex')}.${extension}`;
      queueStore.fs.writeFileSync('/files/' + mediaName, bytes, { mode: 0o600 });
      batch.importFiles[name] = { fileName: context.importFileName, messageId: context.messageId, mediaName, mediaType: context.importKind, hash: queueStore.crypto.createHash('sha256').update(bytes).digest('hex') };
      receipt.status = 'stored'; dirty(batch);
      return { silent: true };
    } catch (error) { receipt.status = 'failed'; return { text: error.message }; }
  });
  return { prepare, handle, finish, keyboard };
})();
