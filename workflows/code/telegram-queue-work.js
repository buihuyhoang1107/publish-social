if ($runIndex >= 100) return [];
const hasChannels = $('Queue Channels').isExecuted;
const channelResponse = hasChannels ? $('Queue Channels').first().json : { data: { channels: [] } };
const pendingResponse = $('Queue Pending Posts').isExecuted ? $('Queue Pending Posts').first().json : undefined;
const result = queueStore.transact(state => {
  queueStore.maintain(state);
  if (hasChannels && (channelResponse.errors?.length || !Array.isArray(channelResponse.data?.channels) || pendingResponse?.errors?.length || !Array.isArray(pendingResponse?.data?.posts?.edges) || pendingResponse.data.posts.pageInfo?.hasNextPage)) {
    if (state.posts.some(post => post.status === 'approved')) for (const chatId of publisherConfig.allowedChatIds) queueStore.addNotice(state, 'channels:' + chatId + ':' + Math.floor(Date.now() / 3600000), chatId, 'Chưa đọc được kênh Buffer. Các bài vẫn ở trong kho, chưa được gửi lịch. Bot sẽ kiểm tra lại sau.');
  }
  const notice = state.notices.find(item => item.status === 'ready');
  if (notice) {
    notice.status = 'claimed'; notice.claimedAt = Date.now();
    return { action: 'notify', hasWork: true, noticeId: notice.id, chatId: notice.chatId, text: notice.text, retryMessageId: notice.retryMessageId };
  }
  for (const post of state.posts) for (const target of post.targets ?? []) {
    if (!target.retryRequested || !['error', 'rejected'].includes(target.status)) continue;
    const retryId = target.retryRequested;
    delete target.retryRequested;
    target.retryPreviousStatus = target.status;
    target.status = 'retrying'; target.claimedAt = Date.now(); target.retryId = retryId;
    return { action: 'retry', hasWork: true, queuePostId: post.id, channelId: target.channelId, postId: target.postId, hasPostId: Boolean(target.postId), retryKind: target.postId ? 'edit' : 'create', retryId };
  }
  for (const post of state.posts) for (const target of post.targets ?? []) {
    if (target.postId && ['scheduled', 'sending', 'unknown'].includes(target.status) && Date.parse(post.dueAt) <= Date.now() && Date.now() - (target.polledAt ?? 0) >= 300000) {
      target.polledAt = Date.now();
      return { action: 'poll', hasWork: true, queuePostId: post.id, channelId: target.channelId, postId: target.postId };
    }
  }
  if (!hasChannels || !Array.isArray(channelResponse.data?.channels) || channelResponse.errors?.length || pendingResponse?.errors?.length || !Array.isArray(pendingResponse?.data?.posts?.edges) || pendingResponse.data.posts.pageInfo?.hasNextPage) return { hasWork: false };
  let post = state.posts.find(item => item.targets?.some(target => target.status === 'planned'));
  if (!post) {
    post = state.posts.find(item => item.status === 'approved');
    if (!post) return { hasWork: false };
    const channels = publisherConfig.services.flatMap(service => {
      const connected = channelResponse.data.channels.filter(channel => channel.service === service);
      return connected.length ? connected : [{ id: 'missing-' + service, service, missing: true }];
    });
    const eligible = channel => !channel.missing && !channel.isDisconnected && !channel.isLocked && !(channel.service === 'threads' && Array.from(post.caption).length > 499);
    const remote = pendingResponse.data.posts.edges.map(edge => edge.node);
    const remoteIds = new Set(remote.map(item => item.id));
    if (channels.some(channel => eligible(channel) && remote.filter(item => item.channelId === channel.id).length + state.posts.flatMap(item => item.targets ?? []).filter(target => target.channelId === channel.id && !remoteIds.has(target.postId) && ['planned', 'submitting', 'scheduled', 'sending', 'unknown'].includes(target.status)).length >= publisherConfig.queue.maxPendingPerChannel)) return { hasWork: false };
    if (post.mediaFiles.some(medium => !queueStore.fs.existsSync('/files/' + medium.name))) {
      post.status = 'attention';
      queueStore.addNotice(state, 'missing-media:' + post.id, post.chatId, `Bài #${post.messageId} thiếu file trong kho. Chưa gửi bất kỳ kênh nào; hãy gửi lại đầy đủ ảnh/video.`);
      return { hasWork: false };
    }
    post.dueAt = queueStore.nextSlot(state, post.chatId, remote.map(item => item.dueAt));
    post.targets = channels.map(channel => {
      const blocked = channel.missing || channel.isDisconnected || channel.isLocked;
      const tooLong = channel.service === 'threads' && Array.from(post.caption).length > 499;
      return { channelId: channel.id, channelName: channel.name, service: channel.service, status: blocked ? 'unavailable' : tooLong ? 'skipped' : 'planned', error: channel.missing ? 'Chưa kết nối Buffer.' : blocked ? 'Kênh bị khóa/ngắt kết nối.' : tooLong ? `Caption ${Array.from(post.caption).length} ký tự, vượt mức 499. Không gửi lên Threads.` : undefined };
    });
    post.status = 'scheduling';
  }
  const target = post.targets.find(item => item.status === 'planned');
  if (!target) { queueStore.refresh(state, post); return { hasWork: false }; }
  if (Date.parse(post.dueAt) <= Date.now() + 30000) {
    target.status = 'error'; target.error = 'Khung giờ đã quá gần hoặc đã qua. Không gửi muộn, không tự đăng lại.';
    queueStore.refresh(state, post);
    return { hasWork: false };
  }
  // Persist before mutation. A crash or ambiguous HTTP result never resubmits this target.
  target.status = 'submitting'; target.claimedAt = Date.now();
  const metadata = target.service === 'facebook' ? { facebook: { type: 'post' } } : target.service === 'tiktok' && post.mediaFiles[0].mediaType === 'video' ? { tiktok: { isAiGenerated: post.isAiGenerated } } : {};
  const assets = post.mediaFiles.map(medium => ({ [medium.mediaType]: { url: `${publisherConfig.publicBaseUrl}/webhook/${publisherConfig.mediaWebhookId}/buffer-media/${medium.name}` } }));
  return { action: 'create', hasWork: true, queuePostId: post.id, channelId: target.channelId, input: { channelId: target.channelId, text: post.caption, assets, mode: 'customScheduled', dueAt: post.dueAt, schedulingType: 'automatic', needsApproval: false, saveToDraft: false, metadata } };
});
return [{ json: result.busy ? { hasWork: false } : result }];
