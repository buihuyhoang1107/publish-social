const work = $('Next Queue Work').itemMatching(0).json;
const response = $input.first().json;
const result = queueStore.transact(state => {
  const post = state.posts.find(item => item.id === work.queuePostId);
  const target = post?.targets?.find(item => item.channelId === work.channelId);
  if (!target || target.status !== 'retrying' || target.retryId !== work.retryId) return { hasRetry: false };
  const stop = (status, message) => {
    target.status = status; target.error = message;
    queueStore.refresh(state, post);
    return { hasRetry: false };
  };
  if (work.postId) {
    const remote = response.data?.post;
    if (!remote?.id || remote.id !== work.postId || remote.channelId !== target.channelId) return stop('unknown', 'Chưa xác nhận được bài trên Buffer. Không tự gửi lại; kiểm tra Buffer trước.');
    if (remote.status !== 'error') {
      target.status = remote.status; target.externalLink = remote.externalLink; target.error = remote.status === 'error' ? remote.error?.message : undefined; target.polledAt = 0;
      queueStore.refresh(state, post);
      return { hasRetry: false };
    }
    if (remote.text !== post.caption) return stop('error', 'Nội dung trên Buffer đã thay đổi. Chưa đăng lại; kiểm tra Buffer trước.');
  }
  for (const medium of post.mediaFiles) {
    if (!queueStore.fs.existsSync('/files/' + medium.name) || queueStore.crypto.createHash('sha256').update(queueStore.fs.readFileSync('/files/' + medium.name)).digest('hex') !== medium.hash) {
      return stop(target.retryPreviousStatus, 'Thiếu hoặc sai file ảnh/video trong kho. Chưa đăng lại.');
    }
  }
  const assets = post.mediaFiles.map(medium => ({ [medium.mediaType]: { url: `${publisherConfig.publicBaseUrl}/webhook/${publisherConfig.mediaWebhookId}/buffer-media/${medium.name}` } }));
  const metadata = target.service === 'facebook' ? { facebook: { type: 'post' } } : target.service === 'tiktok' && post.mediaFiles[0].mediaType === 'video' ? { tiktok: { isAiGenerated: post.isAiGenerated } } : {};
  const schedule = Date.parse(post.dueAt) > Date.now() ? { mode: 'customScheduled', dueAt: post.dueAt } : { mode: 'shareNow' };
  const input = work.postId ? { id: work.postId, assets, ...schedule, metadata } : { channelId: target.channelId, text: post.caption, assets, ...schedule, schedulingType: 'automatic', needsApproval: false, saveToDraft: false, metadata };
  return { hasRetry: true, ...work, input, mediaFiles: post.mediaFiles };
});
return [{ json: result.busy ? { hasRetry: false } : result }];
