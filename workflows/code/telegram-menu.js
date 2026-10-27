// Embedded into the n8n Code node by scripts/build-menu-workflow.cjs.
const update = $('Telegram Trigger').first().json;
const callback = update.callback_query;
const message = callback ? callback.message : update.message;
const actor = callback ? callback.from : message?.from;
if (!message?.chat || !actor || message.chat.type !== 'private') return [];

const { services, contentTypes, previewActions } = menuOptions;
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sessionKey = `${message.chat.id}:${actor.id}`;
const stored = $input.first().json.sessionJson;
let session = stored ? JSON.parse(stored) : { stage: 'IDLE' };
const now = Date.now();
// TTL also lets a user recover after Telegram resets its update sequence following inactivity.
if (session.expiresAt && session.expiresAt < now) session = { stage: 'IDLE' };
if (session.lastUpdateId !== undefined && update.update_id <= session.lastUpdateId) return [];
const command = (message.text ?? '').split(/\s/, 1)[0].split('@', 1)[0];
let text = '';
let keyboard = { rows: [] };
let menuKind = 'none';
let archiveApprovedPost = false;
const menu = (options, kind) => ({ rows: Object.entries(options).map(([value, label]) => ({
  row: { buttons: [{ text: label, additionalFields: { callback_data: `sp:${session.id}:${kind}:${value}` } }] },
})) });
const showServices = () => {
  text = 'Bạn muốn tạo nội dung cho loại thiệp nào?';
  keyboard = menu(services, 'service');
  menuKind = 'service';
};
const showTypes = () => {
  text = `Loại thiệp: ${services[session.service]}\nBạn muốn tạo dạng nội dung nào?`;
  keyboard = menu(contentTypes, 'type');
  menuKind = 'type';
};
const requestContent = () => {
  text = `Loại thiệp: ${services[session.service]}\nDạng: ${contentTypes[session.contentType]}\n\nGửi nội dung bằng text hoặc gửi một ảnh/video có caption.\nDùng /cancel để hủy, /new để bắt đầu lại.`;
  if (session.editing) text += '\n\nKhi sửa: gửi text để giữ ảnh/video hiện có; gửi file mới có caption để thay ảnh/video. Gửi /preview để quay lại bản nháp hiện tại.';
};
const showPreview = () => {
  const post = session.post;
  const shown = post.content.length > 2400 ? Array.from(post.content).slice(0, 2400).join('') + '\n[Preview rút gọn; bản nháp giữ nguyên nội dung.]' : post.content;
  text = `PREVIEW BAI DANG\n\nLoại: ${services[post.service]} (${post.service})\nDạng: ${contentTypes[post.contentType]} (${post.contentType})\n\nNội dung:\n${shown}\n\nĐính kèm: ${post.mediaType}\n\nNền tảng dự kiến (chưa đăng):\nFacebook YES\nInstagram YES\nThreads YES\nTikTok YES\n\nTrạng thái: DRAFT\n\nChọn Duyệt, Sửa hoặc Hủy bên dưới. Duyệt chỉ xác nhận bản nháp; chưa đăng mạng xã hội.`;
  keyboard = menu(previewActions, 'action');
  menuKind = 'action';
};

if (!callback && (command === '/new' || command === '/start')) {
  session = { id: update.update_id.toString(36), stage: 'SERVICE' };
  showServices();
} else if (!callback && command === '/cancel') {
  const wasApproved = session.post?.status === 'APPROVED';
  session = { stage: 'IDLE' };
  text = wasApproved
    ? 'Đã đóng phiên. Bài đã duyệt vẫn được lưu. Gửi /new để tạo bài mới.'
    : 'Đã hủy bản nháp đang tạo. Gửi /new để tạo bài mới.';
} else if (!callback && command === '/preview') {
  if (session.post?.status === 'DRAFT') {
    session.id = update.update_id.toString(36);
    session.stage = 'PREVIEW';
    session.editing = false;
    showPreview();
  } else {
    text = session.post?.status === 'APPROVED'
      ? 'Bài này đã được duyệt và lưu, chưa đăng mạng xã hội. Gửi /new để tạo bài mới.'
      : 'Chưa có bản nháp để xem. Gửi /new để tạo bài mới.';
  }
} else if (callback) {
  const [prefix, sessionId, kind, value] = (callback.data ?? '').split(':');
  if (prefix !== 'sp' || sessionId !== session.id) {
    text = 'Nút này thuộc phiên cũ. Gửi /new để mở menu mới.';
  } else if (kind === 'service' && session.stage === 'SERVICE' && Object.hasOwn(services, value)) {
    session.service = value;
    session.stage = 'CONTENT_TYPE';
    showTypes();
  } else if (kind === 'type' && session.stage === 'CONTENT_TYPE' && Object.hasOwn(contentTypes, value)) {
    session.contentType = value;
    session.stage = 'CONTENT';
    requestContent();
  } else if (kind === 'action' && session.stage === 'PREVIEW' && session.post?.status === 'DRAFT' && Object.hasOwn(previewActions, value)) {
    if (value === 'APPROVE') {
      session.post.status = 'APPROVED';
      session.post.approvedAt = new Date(now).toISOString();
      session.post.approvedBy = actor.id;
      session.stage = 'APPROVED';
      archiveApprovedPost = true;
      text = `Đã duyệt và lưu bản nháp ${session.post.postId}.\nTrạng thái: APPROVED\n\nChưa đăng mạng xã hội. Bước tiếp theo là kết nối Facebook Page.\nGửi /new để tạo bài mới.`;
    } else if (value === 'EDIT') {
      session.id = update.update_id.toString(36);
      session.stage = 'CONTENT';
      session.editing = true;
      requestContent();
    } else {
      session = { stage: 'IDLE' };
      text = 'Đã hủy bản nháp này. Gửi /new để tạo bài mới.';
    }
  } else {
    text = 'Lựa chọn này không còn hiệu lực. Hãy dùng menu mới nhất hoặc gửi /new.';
  }
} else if (command.startsWith('/')) {
  text = 'Gửi /new để tạo bài mới, /preview để xem bản nháp hoặc /cancel để hủy phiên hiện tại.';
} else if (session.stage === 'SERVICE') {
  showServices();
} else if (session.stage === 'CONTENT_TYPE') {
  showTypes();
} else if (session.stage === 'CONTENT') {
  const content = message.text ?? message.caption ?? '';
  const photo = message.photo?.[message.photo.length - 1];
  const video = message.video;
  if (message.media_group_id) {
    text = 'Phiên bản này nhận từng ảnh/video riêng lẻ. Hãy gửi một file có caption, không gửi album.';
  } else if (!content.trim() || (!message.text && !photo && !video)) {
    text = 'Hãy gửi nội dung bằng text hoặc một ảnh/video kèm caption để tạo preview.';
  } else {
    const previousPost = session.editing ? session.post : undefined;
    const post = {
      postId: previousPost?.postId ?? `TG-${message.chat.id}-${message.message_id}`,
      service: session.service,
      topic: '',
      contentType: session.contentType,
      goal: 'LEAD',
      hook: '',
      content,
      cta: '',
      mediaType: video ? 'VIDEO' : photo ? 'IMAGE' : previousPost?.mediaType ?? 'TEXT',
      mediaPath: '',
      platforms: ['FACEBOOK', 'INSTAGRAM', 'THREADS', 'TIKTOK'],
      status: 'DRAFT',
    };
    if (video || photo) post.telegramFileId = (video ?? photo).file_id;
    else if (previousPost?.telegramFileId) post.telegramFileId = previousPost.telegramFileId;
    session.post = post;
    session.id = update.update_id.toString(36);
    session.stage = 'PREVIEW';
    session.editing = false;
    showPreview();
  }
} else {
  text = 'Gửi /new để tạo bài mới: chọn loại thiệp → dạng nội dung → gửi bài → xem preview.';
}

session.lastUpdateId = update.update_id;
session.expiresAt = now + 24 * 60 * 60 * 1000;
return [{ json: {
  sessionKey,
  sessionJson: JSON.stringify(session),
  chatId: message.chat.id,
  hasCallback: Boolean(callback),
  textHtml: escapeHtml(text),
  keyboard,
  menuKind,
  menuSessionId: session.id ?? '',
  masterPost: session.post ?? {},
  archiveApprovedPost,
} }];
