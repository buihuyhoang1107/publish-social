const bulkPlanTools = (() => {
  const owner = context => context.ownerId ?? context.chatId;
  const key = context => context.chatId + ':' + owner(context);
  const postsFor = (state, batch) => state.posts.filter(post => post.chatId === batch.chatId && post.batchId === batch.id && post.status === 'batch').sort((a, b) => (a.importOrder ?? a.messageId) - (b.importOrder ?? b.messageId));
  const pending = batch => queueStore.fs.readdirSync('/files').filter(name => name.startsWith(`telegram-post-${batch.chatId}-`) && name.endsWith('.json')).reduce((count, name) => {
    const record = JSON.parse(queueStore.fs.readFileSync('/files/' + name, 'utf8'));
    return count + Number(record.batchId === batch.id && ['received', 'collecting'].includes(record.status));
  }, 0);
  const proposal = (state, batch, posts) => {
    const occupied = new Set(state.posts.filter(post => post.chatId === batch.chatId && post.dueAt && post.status !== 'cancelled').map(post => post.dueAt));
    const result = [];
    const midnight = Date.parse(batch.startDate + 'T00:00:00Z') - 7 * 3600000;
    for (let day = 0; day < 366 && result.length < posts.length; day++) for (const hour of publisherConfig.queue.hours) {
      const time = midnight + day * 86400000 + hour * 3600000;
      const dueAt = new Date(time).toISOString();
      if (time <= Date.now() + 300000 || occupied.has(dueAt) || result.length >= posts.length) continue;
      result.push({ postId: posts[result.length].id, dueAt });
      occupied.add(dueAt);
    }
    return result.length === posts.length ? result : undefined;
  };
  const preview = (state, batch, pageInput = '1') => {
    if (batch.importMode) {
      const readiness = listImportTools.prepare(state, batch);
      if (readiness) return readiness;
    }
    const posts = postsFor(state, batch);
    const inflight = pending(batch);
    const button = calendarTools.button;
    if (inflight) return { text: `Đợt đã lưu ${posts.length} bài; còn ${inflight} bài/album đang nhận file. Chưa thể chốt lịch. Bấm kiểm tra lại khi file tải xong.`, calendarKeyboard: calendarTools.keyboard([[button('Kiểm tra lại', `batch:preview:${batch.id}:1`)], [button('Hủy đợt', `batch:cancel:${batch.id}`)]]) };
    if (!posts.length) return { text: 'Đợt chưa có bài. Gửi từng ảnh/album/video kèm caption, rồi /batch preview. Mỗi album là một bài; các bài đang được giữ, chưa gửi Buffer.', calendarKeyboard: calendarTools.keyboard([[button('Hủy đợt', `batch:cancel:${batch.id}`)]]) };
    const planned = proposal(state, batch, posts);
    if (!planned) return { text: 'Không đủ khung giờ trống trong một năm để xếp hết đợt này. Chưa gửi bài nào. Dùng /batch cancel để hủy đợt và chia thành đợt nhỏ hơn.' };
    if (!batch.preview || JSON.stringify(batch.preview.assignments) !== JSON.stringify(planned)) batch.preview = { token: queueStore.crypto.randomBytes(4).toString('hex'), assignments: planned };
    const totalPages = Math.ceil(posts.length / 6);
    const page = Math.min(totalPages, Math.max(1, /^\d+$/.test(pageInput) ? Number(pageInput) : 1));
    const visible = planned.slice((page - 1) * 6, page * 6);
    const caption = new Map(posts.map(post => [post.id, post]));
    const text = `📦 Xem trước ${posts.length} bài · giờ Việt Nam\nTừ ${queueStore.formatTime(planned[0].dueAt)}\nĐến ${queueStore.formatTime(planned[planned.length - 1].dueAt)}\nKhung: 09:00, 14:00, 20:00; bỏ qua chỗ đã có bài.\nKênh: ${publisherConfig.services.map(service => queueStore.platforms[service]).join(', ')}.\nChưa gửi bài của đợt này sang Buffer.\n\n` + visible.map(item => {
      const post = caption.get(item.postId);
      return `${post.importCode ? post.importCode + ' · ' + post.importFileName + '\n' : ''}#${post.messageId} · ${queueStore.formatTime(item.dueAt)}\n${Array.from(post.caption).slice(0, 70).join('')}${publisherConfig.services.includes('threads') && Array.from(post.caption).length > 499 ? '\n⚠ Threads vượt 499 ký tự, sẽ bỏ qua.' : ''}`;
    }).join('\n\n') + `\n\nTrang ${page}/${totalPages}. Chọn Xác nhận để giữ lịch cho toàn đợt. Lịch phát sinh ngoài bot trên Buffer sẽ được kiểm tra lại khi gửi từng bài.`;
    return { text, calendarKeyboard: calendarTools.keyboard([
      [button('‹ Bài trước', `batch:preview:${batch.id}:${Math.max(1, page - 1)}`), button('Bài tiếp ›', `batch:preview:${batch.id}:${Math.min(totalPages, page + 1)}`)],
      [button(`✅ Xác nhận ${posts.length} bài`, `batch:confirm:${batch.id}:${batch.preview.token}`)],
      [button('Hủy đợt', `batch:cancel:${batch.id}`)],
    ]) };
  };
  const handle = (state, context, args) => {
    state.batches ??= {};
    state.batchSessions ??= {};
    const [action, value, extra] = args;
    if (action === 'start') {
      const startDate = calendarTools.date(value ?? calendarTools.today());
      if (!startDate || startDate < calendarTools.today() || startDate > calendarTools.shift(calendarTools.today(), 365)) return { text: 'Chọn ngày từ hôm nay đến một năm tới. Ví dụ /batch start 01/11/2026 hoặc /batch start 2026-11-01.' };
      const active = state.batches[state.batchSessions[key(context)]];
      if (active?.status === 'collecting') return { text: 'Bạn đang có một đợt gom bài. /batch preview — xem trước; /batch cancel — hủy đợt trước khi tạo đợt mới.' };
      const batch = { id: queueStore.crypto.randomBytes(6).toString('hex'), chatId: context.chatId, ownerId: owner(context), startDate, status: 'collecting', createdAt: new Date().toISOString() };
      state.batches[batch.id] = batch;
      state.batchSessions[key(context)] = batch.id;
      if (state.cropSessions) delete state.cropSessions[key(context)];
      return { text: `📦 Đã mở đợt gom bài từ ${calendarTools.short(startDate)}/${startDate.slice(0, 4)}.\nGửi từng ảnh, album hoặc video kèm caption; mỗi album là một bài. Tối đa 1.000 bài/đợt.\nBot lưu bài, chưa gửi Buffer. Để tránh nhiều tin nhắn, bot không trả lời từng bài trong đợt.\n/batch preview hoặc /done — xem số bài nhận xong và lịch đề xuất\nChỉ sau khi bạn xác nhận, đợt mới được xếp lịch.\n/batch cancel — hủy đợt.`, calendarKeyboard: calendarTools.keyboard([[calendarTools.button('📅 Xem trước lịch', `batch:preview:${batch.id}:1`)], [calendarTools.button('Hủy đợt', `batch:cancel:${batch.id}`)]]) };
    }
    const id = value && /^[a-f0-9]{12}$/.test(value) ? value : state.batchSessions[key(context)];
    const batch = state.batches[id];
    if (!batch || batch.chatId !== context.chatId || batch.ownerId !== owner(context)) return { text: 'Chưa có đợt đang gom. Dùng /batch start 01/11/2026 để bắt đầu, gửi nhiều bài rồi /batch preview.' };
    if (batch.status !== 'collecting') return { text: `Đợt đã ${batch.status === 'confirmed' ? 'xác nhận' : 'hủy'}. /calendar — xem lịch; /batch start để tạo đợt mới.` };
    if (action === 'cancel') {
      for (const post of postsFor(state, batch)) post.status = 'cancelled';
      batch.status = 'cancelled';
      delete state.batchSessions[key(context)];
      return { text: 'Đã hủy đợt gom bài. Không gửi bài của đợt này lên Buffer. Đã thoát chế độ gom; bài gửi tiếp theo sẽ tự xếp lịch theo luồng bình thường.' };
    }
    if (action === 'confirm') {
      if (batch.importMode) {
        const readiness = listImportTools.prepare(state, batch);
        if (readiness) return readiness;
      }
      const posts = postsFor(state, batch);
      if (!posts.length || pending(batch)) return preview(state, batch);
      const planned = proposal(state, batch, posts);
      if (!planned || !batch.preview || batch.preview.token !== extra || JSON.stringify(batch.preview.assignments) !== JSON.stringify(planned)) {
        const response = preview(state, batch);
        response.text = 'Lịch hoặc số bài đã thay đổi. Chưa chốt lịch; xem lại bản mới rồi xác nhận.\n\n' + response.text;
        return response;
      }
      const byId = new Map(posts.map(post => [post.id, post]));
      for (const item of planned) {
        const post = byId.get(item.postId);
        post.dueAt = item.dueAt;
        post.scheduleLocked = true;
        post.status = 'approved';
        post.approvedAt = new Date().toISOString();
      }
      batch.status = 'confirmed';
      batch.confirmedAt = new Date().toISOString();
      delete state.batchSessions[key(context)];
      return { text: `✅ Đã giữ lịch ${posts.length} bài của đợt này trong kho.\nTừ ${queueStore.formatTime(planned[0].dueAt)} đến ${queueStore.formatTime(planned[planned.length - 1].dueAt)}.\nBot gửi tối đa ${publisherConfig.queue.maxPendingPerChannel} bài chờ/kênh sang Buffer, phần còn lại tự bổ sung khi có chỗ. Nếu slot trên Buffer bị trùng, bot báo kiểm tra và giữ giờ đã chọn, không tự đăng ngay hoặc dời lịch.\nĐã đóng chế độ gom. Bài gửi tiếp theo sẽ tự xếp lịch theo luồng bình thường.\n/calendar — xem lịch.`, runQueue: true, calendarKeyboard: calendarTools.keyboard([[calendarTools.button('📅 Xem lịch tháng', `calendar:month:${batch.startDate}:1`)]]) };
    }
    return preview(state, batch, extra ?? '1');
  };
  return { handle };
})();
