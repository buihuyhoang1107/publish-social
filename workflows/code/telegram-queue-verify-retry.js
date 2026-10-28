const context = $('Prepare Queue Retry').itemMatching(0).json;
const items = $input.all();
let valid = items.length === context.mediaFiles.length;
for (let index = 0; valid && index < items.length; index++) {
  if (items[index].json.error || !items[index].binary?.data) { valid = false; break; }
  const buffer = await this.helpers.getBinaryDataBuffer(index, 'data');
  valid = queueStore.crypto.createHash('sha256').update(buffer).digest('hex') === context.mediaFiles[index].hash;
}
const result = queueStore.transact(state => {
  const post = state.posts.find(item => item.id === context.queuePostId);
  const target = post?.targets?.find(item => item.channelId === context.channelId);
  if (!target || target.status !== 'retrying' || target.retryId !== context.retryId) return { hasVerifiedRetry: false };
  if (!valid) {
    target.status = target.retryPreviousStatus; target.error = 'Không tải được đầy đủ ảnh/video qua link công khai hoặc nội dung file không khớp. Chưa đăng lại; kiểm tra tunnel rồi bấm lại.';
    queueStore.refresh(state, post);
    return { hasVerifiedRetry: false };
  }
  target.status = 'submitting'; target.claimedAt = Date.now();
  return { ...context, hasVerifiedRetry: true };
});
return [{ json: result.busy ? { hasVerifiedRetry: false } : result }];
