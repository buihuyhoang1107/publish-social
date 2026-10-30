const context = $input.first().json;
const mediaFiles = context.assets.map(asset => {
  const medium = asset.image ?? asset.video;
  const name = medium.url.split('/').pop();
  if (!/^queue_[a-f0-9]{32}\.(jpg|jpeg|png|webp|mp4|mov|webm)$/.test(name)) throw new Error('Tên media của kho không hợp lệ.');
  return { name, mediaType: asset.image ? 'image' : 'video', hash: queueStore.crypto.createHash('sha256').update(queueStore.fs.readFileSync('/files/' + name)).digest('hex') };
});
const fingerprint = queueStore.crypto.createHash('sha256').update(JSON.stringify([context.caption, mediaFiles.map(medium => medium.hash), context.isAiGenerated])).digest('hex');
const result = queueStore.transact(state => {
  const batch = context.batchId ? state.batches?.[context.batchId] : undefined;
  if (context.batchId && (!batch || batch.status !== 'collecting' || batch.chatId !== context.chatId || batch.ownerId !== context.ownerId)) return { status: 'rejected', text: 'Đợt gom bài đã đóng hoặc hủy trong lúc tải file. Bài này chưa được lên lịch; hãy mở đợt mới và gửi lại.' };
  if (batch && state.posts.filter(post => post.batchId === batch.id && post.status === 'batch').length >= 1000) return { status: 'rejected', text: 'Đợt đã đủ 1.000 bài. Bài vừa gửi chưa được lưu vào lịch. Hãy xác nhận hoặc hủy đợt trước khi tạo đợt mới.' };
  const existing = state.posts.find(post => post.chatId === context.chatId && post.fingerprint === fingerprint && post.status !== 'cancelled');
  if (existing) return { status: 'duplicate', queuePostId: existing.id, text: `Bài trùng với #${existing.messageId} (${queueStore.labels[existing.status]}). Không thêm hoặc xếp lịch lần nữa. Dùng /queue để xem kho.` };
  const createdAt = new Date().toISOString();
  const post = { id: context.chatId + ':' + context.messageId, chatId: context.chatId, messageId: context.messageId, journalFile: context.journalFile, caption: context.caption, isAiGenerated: context.isAiGenerated, mediaFiles, fingerprint, status: 'approved', createdAt, approvedAt: createdAt };
  state.posts.push(post);
  if (batch) {
    post.status = 'batch'; post.batchId = batch.id; post.ownerId = context.ownerId;
    delete post.approvedAt;
    delete batch.preview;
    return { status: 'batch', batchStored: true, runQueue: false };
  }
  const warning = publisherConfig.services.includes('threads') && Array.from(post.caption).length > 499 ? `\nThreads: ${Array.from(post.caption).length} ký tự, vượt mức 499; kênh này sẽ được bỏ qua khi xếp lịch.` : '';
  return { status: 'approved', runQueue: true, text: `Đã nhận và tự động duyệt bài #${post.messageId}: ${mediaFiles.length} ảnh/video. Đang chờ xếp lịch.\n${post.caption.slice(0, 900)}${post.caption.length > 900 ? '…' : ''}${warning}\n\n/queue — xem kho và lịch\n/cancel ${post.messageId} — hủy nếu bài chưa gửi sang Buffer\nLịch tự động: 09:00, 14:00, 20:00 (giờ Việt Nam). Không cần /approve.` };
});
if (result.busy) throw new Error('Kho đang được cập nhật. Thử gửi lại bài sau ít giây.');
const saved = JSON.parse(queueStore.fs.readFileSync(context.journalFile, 'utf8'));
queueStore.write(context.journalFile, { ...saved, queuePostId: context.chatId + ':' + context.messageId, ...result });
if (result.batchStored) return [];
return [{ json: { chatId: context.chatId, messageId: context.messageId, ...result } }];
