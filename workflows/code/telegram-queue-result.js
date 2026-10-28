const work = $('Next Queue Work').itemMatching(0).json;
const response = $input.first().json;
const result = queueStore.transact(state => {
  const post = state.posts.find(item => item.id === work.queuePostId);
  const target = post?.targets?.find(item => item.channelId === work.channelId);
  if (!target) throw new Error('Không tìm được bài/kênh trong kho.');
  const created = response.data?.createPost;
  const published = work.action === 'create' ? created?.post : response.data?.post;
  if (published?.id && published.status) {
    if (target.status !== 'sent' || published.status === 'sent') {
      target.postId = published.id; target.status = published.status;
      target.externalLink = published.externalLink; target.error = published.error?.message;
    }
  } else if (work.action === 'create') {
    // GraphQL/network errors may have happened after the mutation committed.
    target.status = created && created.__typename !== 'PostActionSuccess' ? 'rejected' : 'unknown';
    target.error = created?.message ?? response.errors?.map(error => error.message).join('\n') ?? 'Không xác nhận được kết quả. Kiểm tra Buffer trước khi gửi lại; bot không tự retry.';
  } else {
    target.pollError = response.errors?.map(error => error.message).join('\n') ?? 'Chưa đọc được trạng thái Buffer; bot sẽ kiểm tra lại.';
    queueStore.addNotice(state, 'poll-error:' + post.id + ':' + target.channelId + ':' + Math.floor(Date.now() / 86400000), post.chatId, `Chưa kiểm tra được trạng thái bài #${post.messageId} trên ${queueStore.platforms[target.service]}. Bot giữ trạng thái cũ và không đăng lại.`);
  }
  target.updatedAt = new Date().toISOString();
  queueStore.refresh(state, post);
  return { recorded: true };
});
if (result.busy) throw new Error('Chưa ghi được kết quả Buffer. Bài sẽ không được tự gửi lại; cần kiểm tra trạng thái.');
return [{ json: result }];
