const response = $input.first().json;
if (response.errors?.length) throw new Error(response.errors.map((error) => error.message).join('\n'));
const created = response.data?.createPost;
if (created && created.__typename !== 'PostActionSuccess') {
  throw new Error(created.message ?? `Buffer không nhận bài: ${created.__typename}`);
}
const post = created ? created.post : response.data?.post;
if (!post?.id) throw new Error('Buffer chưa trả mã bài đăng. Kiểm tra execution trước khi gửi lại để tránh đăng trùng.');
const terminal = ['sent', 'error', 'draft', 'needs_approval'].includes(post.status);
const message = post.status === 'sent'
  ? 'Đã đăng TikTok thành công.'
  : post.error?.message
    ? `Đăng không thành công: ${post.error.message}`
    : post.status === 'draft' || post.status === 'needs_approval'
      ? 'Buffer đang giữ bài ở trạng thái cần xử lý, chưa đăng.'
      : 'Đã gửi yêu cầu đăng. Buffer đang xử lý; xem kết quả trong Buffer → Sent hoặc Executions của n8n. Không gửi lại cùng bài khi chưa kiểm tra kết quả.';
return [{ json: {
  postId: post.id,
  status: post.status,
  shouldPoll: !terminal && $runIndex < 12,
  formMessage: `${message}\nMã bài: ${post.id}\nTrạng thái: ${post.status}${post.externalLink ? '\n' + post.externalLink : ''}`,
} }];
