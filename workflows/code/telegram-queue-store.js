// Shared durable queue. All mutations are synchronous under one short filesystem lock.
const queueStore = (() => {
  const fs = require('fs');
  const crypto = require('crypto');
  const file = '/files/telegram-content-queue.json';
  const lock = file + '.lock';
  const labels = { draft: 'Chờ duyệt', approved: 'Đã duyệt, chờ xếp lịch', scheduling: 'Đang gửi lịch', scheduled: 'Đã lên lịch', partial: 'Một số kênh cần kiểm tra', sent: 'Đã đăng', attention: 'Cần kiểm tra', cancelled: 'Đã hủy' };
  const platforms = { tiktok: 'TikTok', facebook: 'Facebook', threads: 'Threads', instagram: 'Instagram' };
  const now = () => Date.now();
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return { version: 1, posts: [], commands: {}, notices: [], lowNotified: {} }; }
  };
  const write = (name, value) => {
    const temporary = name + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(temporary, name);
  };
  const transact = (operation) => {
    let descriptor;
    try { descriptor = fs.openSync(lock, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // No transaction contains network calls or awaits. A five-minute lock is abandoned.
      let modifiedAt;
      try { modifiedAt = fs.statSync(lock).mtimeMs; }
      catch (statError) { if (statError.code !== 'ENOENT') throw statError; return { busy: true }; }
      if (now() - modifiedAt > 300000) {
        try { fs.unlinkSync(lock); } catch (cleanupError) { if (cleanupError.code !== 'ENOENT') throw cleanupError; }
      }
      return { busy: true };
    }
    try { const state = read(); const result = operation(state); write(file, state); return result; }
    finally { fs.closeSync(descriptor); fs.unlinkSync(lock); }
  };
  const formatTime = (value) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  const slots = (timestamp) => {
    const local = new Date(timestamp + 7 * 3600000);
    const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 7 * 3600000;
    return publisherConfig.queue.hours.map(hour => midnight + hour * 3600000);
  };
  const nextSlot = (state, chatId, remoteDates = []) => {
    const occupied = new Set([...state.posts.filter(post => post.chatId === chatId && post.dueAt && post.status !== 'cancelled').map(post => post.dueAt), ...remoteDates.filter(Boolean).map(value => new Date(value).toISOString())]);
    for (let day = 0; day < 366; day++) for (const time of slots(now() + day * 86400000)) {
      const value = new Date(time).toISOString();
      if (time > now() + 300000 && !occupied.has(value)) return value;
    }
    throw new Error('Không tìm được khung giờ trống trong một năm tới.');
  };
  const addNotice = (state, id, chatId, text) => {
    if (!state.notices.some(notice => notice.id === id)) state.notices.push({ id, chatId, text, status: 'ready' });
  };
  const refresh = (state, post) => {
    if (!post.targets?.length) return;
    const targets = post.targets;
    if (targets.some(target => ['planned', 'submitting'].includes(target.status))) post.status = 'scheduling';
    else if (targets.every(target => target.status === 'sent')) post.status = 'sent';
    else if (targets.some(target => ['sent', 'scheduled', 'sending'].includes(target.status))) post.status = targets.some(target => ['error', 'unknown', 'rejected', 'unavailable', 'skipped'].includes(target.status)) ? 'partial' : 'scheduled';
    else post.status = 'attention';
    if (targets.some(target => ['planned', 'submitting'].includes(target.status))) return;
    const signature = crypto.createHash('sha256').update(JSON.stringify(targets.map(target => [target.channelId, target.status, target.error, target.externalLink]))).digest('hex');
    const text = `Bài #${post.messageId} — ${labels[post.status]}\nLịch: ${formatTime(post.dueAt)} (giờ Việt Nam)\n` + targets.map(target => `${platforms[target.service] ?? target.service}${target.channelName ? ' (' + target.channelName + ')' : ''}: ${{ scheduled: 'Đã lên lịch', sending: 'Đang đăng', sent: 'Đã đăng', skipped: 'Bỏ qua', unavailable: 'Chưa sẵn sàng', rejected: 'Bị từ chối', error: 'Lỗi', unknown: 'Chưa xác nhận, không tự gửi lại' }[target.status] ?? target.status}${target.error ? ' — ' + target.error : ''}${target.externalLink ? '\n' + target.externalLink : ''}`).join('\n');
    addNotice(state, post.id + ':' + signature, post.chatId, text);
  };
  const maintain = (state) => {
    for (const post of state.posts) for (const target of post.targets ?? []) {
      if (target.status === 'submitting' && now() - target.claimedAt > 600000) {
        target.status = 'unknown'; target.error = 'Lần gửi trước bị gián đoạn. Kiểm tra Buffer trước khi gửi lại.'; refresh(state, post);
      }
    }
    for (const chatId of publisherConfig.allowedChatIds) {
      const posts = state.posts.filter(post => post.chatId === chatId);
      const available = posts.filter(post => post.status === 'approved' || (post.dueAt && Date.parse(post.dueAt) > now() && ['scheduling', 'scheduled', 'partial'].includes(post.status))).length;
      if (available > publisherConfig.queue.lowWatermark) state.lowNotified[chatId] = false;
      else if (!state.lowNotified[chatId] && posts.some(post => post.approvedAt)) {
        addNotice(state, 'low:' + chatId + ':' + now(), chatId, `Kho sắp hết: còn ${available} bài đã duyệt/đã lên lịch cho các khung giờ tới. Gửi thêm bài để tự động duyệt và xếp lịch; dùng /queue để xem.`);
        state.lowNotified[chatId] = true;
      }
      for (const time of slots(now())) if (now() >= time && now() - time < 300000 && !posts.some(post => post.dueAt === new Date(time).toISOString() && post.status !== 'cancelled')) {
        addNotice(state, 'empty:' + chatId + ':' + time, chatId, `Bỏ qua khung ${formatTime(time)}: không có bài đã được duyệt và xếp lịch. Bot không tự tạo hoặc đăng lại nội dung cũ. Gửi thêm bài để tự động duyệt và xếp lịch.`);
      }
    }
  };
  return { fs, crypto, read, write, transact, labels, platforms, now, formatTime, nextSlot, addNotice, refresh, maintain };
})();
