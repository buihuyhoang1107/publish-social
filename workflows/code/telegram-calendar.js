const calendarTools = (() => {
  const dayMs = 86400000;
  const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const date = value => {
    const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? '');
    const normalized = local ? `${local[3]}-${local[2]}-${local[1]}` : value;
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(normalized ?? '')) return;
    const time = Date.parse(normalized + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === normalized ? normalized : undefined;
  };
  const shift = (value, days) => new Date(Date.parse(value + 'T00:00:00Z') + days * dayMs).toISOString().slice(0, 10);
  const short = value => value.slice(8) + '/' + value.slice(5, 7);
  const button = (text, callback) => ({ text, additionalFields: { callback_data: callback } });
  const keyboard = rows => ({ rows: rows.map(buttons => ({ row: { buttons } })) });
  const callback = (mode, value, page = 1) => `calendar:${mode}:${value}:${page}`;
  const render = (state, context, args) => {
    const mode = ['day', 'week', 'month'].includes(args[0]) ? args[0] : 'month';
    const input = ['day', 'week', 'month'].includes(args[0]) ? args[1] : args[0];
    const anchor = date(/^20\d{2}-\d{2}$/.test(input ?? '') ? input + '-01' : input ?? today());
    if (!anchor) return { text: 'Ngày không hợp lệ. Dùng /calendar day 01/11/2026, /calendar week 2026-11-01 hoặc /calendar month 2026-11.' };
    const timestamp = Date.parse(anchor + 'T00:00:00Z');
    const weekday = (new Date(timestamp).getUTCDay() + 6) % 7;
    const start = mode === 'month' ? anchor.slice(0, 7) + '-01' : mode === 'week' ? shift(anchor, -weekday) : anchor;
    const end = mode === 'month' ? new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 1)).toISOString().slice(0, 10) : shift(start, mode === 'week' ? 7 : 1);
    const posts = state.posts.filter(post => post.chatId === context.chatId && post.status !== 'cancelled');
    const planned = posts.filter(post => post.dueAt && new Date(Date.parse(post.dueAt) + 7 * 3600000).toISOString().slice(0, 10) >= start && new Date(Date.parse(post.dueAt) + 7 * 3600000).toISOString().slice(0, 10) < end).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    const counts = {};
    for (const post of planned) {
      const key = new Date(Date.parse(post.dueAt) + 7 * 3600000).toISOString().slice(0, 10);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    const title = mode === 'month' ? 'Tháng ' + start.slice(5, 7) + '/' + start.slice(0, 4) : mode === 'week' ? 'Tuần ' + short(start) + ' – ' + short(shift(end, -1)) : 'Ngày ' + short(start) + '/' + start.slice(0, 4);
    const unscheduled = posts.filter(post => !post.dueAt && ['approved', 'draft', 'batch'].includes(post.status)).length;
    let text = `📅 ${title} · giờ Việt Nam\n${planned.length} bài có lịch trong khoảng này. Chưa có ngày/giờ trong kho: ${unscheduled} bài.\nSố trên nút ngày là số bài, không phải số kênh.\n`;
    const rows = [[button('Ngày', callback('day', anchor)), button('Tuần', callback('week', anchor)), button('Tháng', callback('month', anchor))]];
    if (mode === 'month') {
      rows.push(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(label => button(label, callback('month', anchor))));
      const offset = (new Date(start + 'T00:00:00Z').getUTCDay() + 6) % 7;
      for (let cell = 0; cell < offset + Math.round((Date.parse(end) - Date.parse(start)) / dayMs); cell += 7) {
        const row = [];
        for (let day = 0; day < 7; day++) {
          const value = shift(start, cell + day - offset);
          const inMonth = value >= start && value < end;
          row.push(button(inMonth ? `${Number(value.slice(8))}${counts[value] ? '·' + counts[value] : ''}` : '·', callback(inMonth ? 'day' : 'month', inMonth ? value : start)));
        }
        rows.push(row);
      }
      text += 'Bấm một ngày để xem từng bài.\n';
    } else {
      if (mode === 'week') {
        rows.push(Array.from({ length: 7 }, (_, index) => { const value = shift(start, index); return button(short(value) + (counts[value] ? '·' + counts[value] : ''), callback('day', value)); }));
      }
      const total = Math.max(1, Math.ceil(planned.length / 6));
      const page = Math.min(total, Math.max(1, /^\d+$/.test(args[2] ?? '') ? Number(args[2]) : 1));
      const visible = planned.slice((page - 1) * 6, page * 6);
      text += visible.length ? '\n' + visible.map(post => {
        const label = post.status === 'approved' && post.scheduleLocked ? 'Đã giữ lịch, chờ gửi Buffer' : queueStore.labels[post.status];
        const channels = (post.targets ?? []).map(target => `${queueStore.platforms[target.service]}: ${target.status}`).join(' · ');
        return `#${post.messageId} · ${queueStore.formatTime(post.dueAt)}\n${label}\n${Array.from(post.caption).slice(0, 80).join('')}${channels ? '\n' + channels : ''}`;
      }).join('\n\n') : '\nChưa có bài trong khoảng này.';
      if (total > 1) { text += `\nTrang ${page}/${total}.`; rows.push([button('‹ Bài trước', callback(mode, anchor, Math.max(1, page - 1))), button('Bài tiếp ›', callback(mode, anchor, Math.min(total, page + 1)))]); }
    }
    const previous = mode === 'month' ? shift(start, -1).slice(0, 7) + '-01' : shift(anchor, mode === 'week' ? -7 : -1);
    const next = mode === 'month' ? end : shift(anchor, mode === 'week' ? 7 : 1);
    rows.push([button('‹ Trước', callback(mode, previous)), button('Hôm nay', callback(mode, today())), button('Sau ›', callback(mode, next))]);
    const owner = context.ownerId ?? context.chatId;
    const session = state.batchSessions?.[context.chatId + ':' + owner];
    rows.push([session ? button('📦 Xem đợt đang gom', `batch:preview:${session}:1`) : button('📦 Gom bài theo đợt', `batch:start:${anchor < today() ? today() : anchor}`)]);
    return { text, calendarKeyboard: keyboard(rows), runQueue: false };
  };
  return { today, date, shift, short, button, keyboard, render };
})();
