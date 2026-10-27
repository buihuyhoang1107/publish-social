const response = $input.first().json;
const context = $('Telegram Intake').first().json;
const created = response.data?.createPost;
const post = created ? created.post : response.data?.post;
let status = post?.status ?? 'unknown';
let text;
if (response.errors?.length) {
  text = 'API chưa xác nhận kết quả: ' + response.errors.map((error) => error.message).join('\n');
} else if (created && created.__typename !== 'PostActionSuccess') {
  status = 'rejected';
  text = 'Yêu cầu đăng bị từ chối: ' + (created.message ?? created.__typename);
} else if (!post?.id) {
  text = 'Chưa xác nhận được mã bài. Chưa gửi lại cùng bài để tránh đăng trùng.';
} else if (post.status === 'sent') {
  text = 'Đã đăng TikTok thành công.';
} else if (post.status === 'error') {
  text = 'Đăng TikTok không thành công: ' + (post.error?.message ?? 'Nền tảng báo lỗi.');
} else if (['draft', 'needs_approval'].includes(post.status)) {
  text = 'Bài chưa được đăng. Trạng thái: ' + post.status;
} else {
  text = 'Đã gửi yêu cầu đăng TikTok, đang xử lý.';
}
const terminal = ['sent', 'error', 'draft', 'needs_approval', 'rejected', 'unknown'].includes(status);
return [{ json: {
  ...context, postId: post?.id ?? context.postId, status,
  shouldPoll: !terminal && $runIndex < 12,
  text: `${text}${post?.externalLink ? '\n' + post.externalLink : ''}\nMã tin nhắn: ${context.messageId}${post?.id ? '\nMã bài: ' + post.id : ''}${status !== 'sent' ? '\nGửi /status để kiểm tra. Chưa gửi lại cùng bài khi chưa rõ kết quả.' : ''}`,
} }];
