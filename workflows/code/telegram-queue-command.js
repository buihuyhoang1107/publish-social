const context = $input.first().json;
const [command, ...args] = context.commandText.split(/\s+/);
if (command === '/calendar') return [{ json: { ...context, ...calendarTools.render(queueStore.read(), context, args) } }];
const result = queueStore.transact(state => {
  const key = context.chatId + ':' + (context.commandKey ?? context.messageId);
  if (state.commands[key]) return { ...state.commands[key], runQueue: false };
  if (command === '/import') {
    const response = { runQueue: false, ...listImportTools.handle(state, context, args) };
    const batch = state.batches?.[state.batchSessions?.[context.chatId + ':' + context.ownerId]];
    if (batch?.importMode && batch.status === 'collecting') {
      if (!args.length || args[0] === 'start') response.calendarKeyboard = listImportTools.keyboard(batch);
      else response.calendarKeyboard ??= listImportTools.keyboard(batch);
    }
    state.commands[key] = response;
    return response;
  }
  if (command === '/batch') {
    const response = { runQueue: false, ...bulkPlanTools.handle(state, context, args) };
    state.commands[key] = response;
    return response;
  }
  const posts = state.posts.filter(post => post.chatId === context.chatId);
  let text;
  let runQueue = false;
  if (command === '/queue') {
    const page = /^\d+$/.test(args[0] ?? '') ? Math.max(1, Number(args[0])) : 1;
    const active = posts.filter(post => !['sent', 'cancelled'].includes(post.status));
    const counts = ['batch', 'draft', 'approved', 'scheduling', 'scheduled', 'partial', 'attention'].map(status => `${queueStore.labels[status]}: ${active.filter(post => post.status === status).length}`).join(' | ');
    const listed = active.slice((page - 1) * 8, page * 8);
    text = `Kho nội dung — 09:00, 14:00, 20:00 (giờ Việt Nam)\n${counts}\n\n` + (listed.length ? listed.map(post => `#${post.messageId} — ${queueStore.labels[post.status]}${post.dueAt ? '\n' + queueStore.formatTime(post.dueAt) : ''}\n${post.caption.slice(0, 120)}${Array.from(post.caption).length > 499 && publisherConfig.services.includes('threads') ? '\n⚠ Threads vượt 499 ký tự, sẽ bỏ qua.' : ''}`).join('\n\n') : 'Không có bài trong trang này.') + `\n\nTrang ${page}/${Math.max(1, Math.ceil(active.length / 8))}. /queue 2 để xem trang tiếp.\nBài mới được tự động duyệt và xếp lịch.\n/approve all — duyệt nháp cũ còn chờ\n/cancel <mã bài> — hủy bài chưa gửi Buffer.`;
  } else if (command === '/retry') {
    const id = args[0] ?? context.replyMessageId;
    const post = posts.find(item => String(item.messageId) === String(id));
    const failed = post?.targets?.filter(target => !target.retryRequested && (target.status === 'error' && target.postId || target.status === 'rejected' && !target.postId)) ?? [];
    if (!post) text = 'Không tìm thấy bài. Dùng /retry <mã bài> hoặc bấm nút Đăng lại kênh lỗi dưới thông báo.';
    else if (!failed.length) text = `Bài #${post.messageId} không có kênh lỗi đủ điều kiện đăng lại hoặc đang được xử lý. Kênh đã đăng, đang đăng, đã lên lịch hoặc chưa xác nhận sẽ không được gửi lại.`;
    else {
      for (const target of failed) target.retryRequested = key;
      runQueue = true;
      text = `Đã nhận yêu cầu khôi phục bài #${post.messageId} trên ${failed.map(target => queueStore.platforms[target.service]).join(', ')}. ${Date.parse(post.dueAt) > Date.now() ? 'Giữ lịch ' + queueStore.formatTime(post.dueAt) + ' (giờ Việt Nam), không đăng sớm.' : 'Lịch cũ đã đến hoặc đã qua; đăng lại ngay.'} Bot sẽ kiểm tra trạng thái và ảnh/video trước khi gửi. Các kênh khác giữ nguyên.`;
    }
  } else if (command === '/approve' || command === '/cancel') {
    const ids = args.length ? args : context.replyMessageId ? [String(context.replyMessageId)] : [];
    if (!ids.length || (ids[0] !== 'all' && ids.some(id => !/^\d+$/.test(id)))) text = `Dùng ${command} <mã bài> hoặc trả lời ảnh gốc bằng ${command}.${command === '/approve' ? ' Dùng /approve all để duyệt tất cả nháp hiện có.' : ''}`;
    else {
      const selected = posts.filter(post => (ids[0] === 'all' ? command === '/approve' && post.status === 'draft' : ids.includes(String(post.messageId))));
      const changed = [];
      const refused = [];
      for (const post of selected) {
        if (command === '/approve' && post.status === 'draft') { post.status = 'approved'; post.approvedAt = new Date().toISOString(); changed.push(post); }
        else if (command === '/cancel' && ['draft', 'approved', 'attention'].includes(post.status) && !post.targets?.length) { post.status = 'cancelled'; changed.push(post); }
        else refused.push(post);
      }
      runQueue = command === '/approve' && changed.length > 0;
      if (changed.length) text = command === '/approve' ? `Đã duyệt ${changed.length} bài: ${changed.map(post => '#' + post.messageId).join(', ')}.\nBot sẽ xếp vào các khung trống 09:00, 14:00, 20:00 theo thứ tự nhập kho; chỉ lấy khung cách hiện tại ít nhất 5 phút.\nTối đa ${publisherConfig.queue.maxPendingPerChannel} bài chờ/kênh được gửi trước sang Buffer; phần còn lại giữ trong kho và tự bổ sung khi có chỗ.\nDùng /queue để xem lịch.` : `Đã hủy ${changed.map(post => '#' + post.messageId).join(', ')}. Bài chưa được gửi lên Buffer.`;
      else text = 'Không có bài đủ điều kiện để thay đổi. Dùng /queue để kiểm tra mã và trạng thái.';
      if (refused.length) text += `\nKhông đổi ${refused.map(post => '#' + post.messageId).join(', ')}: bài đã duyệt/đã xử lý. Bài đã gửi Buffer cần hủy tại Buffer để bảo đảm dừng đăng.`;
      if (changed.length > publisherConfig.queue.lowWatermark) state.lowNotified[context.chatId] = false;
    }
  }
  const response = { text, runQueue };
  state.commands[key] = response;
  return response;
});
return [{ json: { ...context, ...result, text: result.busy ? 'Kho đang được cập nhật. Thử lại lệnh sau ít giây.' : result.text } }];
