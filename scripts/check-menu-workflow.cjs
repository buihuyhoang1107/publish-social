const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const menuOptions = JSON.parse(fs.readFileSync(path.join(root, 'workflows/code/telegram-menu.constant.json'), 'utf8'));
const code = 'const menuOptions = ' + JSON.stringify(menuOptions) + ';\n' + fs.readFileSync(path.join(root, 'workflows/code/telegram-menu.js'), 'utf8');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'workflows/telegram-menu.json'), 'utf8'));
const nodes = Object.fromEntries(workflow.nodes.map((node) => [node.name, node]));
assert.equal(nodes['Telegram Menu Router'].parameters.jsCode, code, 'Rebuild JSON after editing router');
assert.deepEqual(nodes['Telegram Trigger'].parameters.updates, ['message', 'callback_query']);
assert.equal(nodes['Telegram Menu Reply'].parameters.additionalFields.parse_mode, 'HTML');
assert.equal(nodes['Load Session'].alwaysOutputData, true);
assert.equal(nodes['Save Session'].parameters.operation, 'upsert');
assert.equal(workflow.active, false);
assert.equal(nodes['Service Options'].parameters.inlineKeyboard.rows.length, 7);
assert.equal(nodes['Content Type Options'].parameters.inlineKeyboard.rows.length, 9);
assert.equal(nodes['Preview Actions'].parameters.inlineKeyboard.rows.length, 3);
assert.equal(nodes['Telegram Menu Reply'].parameters.replyMarkup, 'none');
for (const node of workflow.nodes) assert.equal(node.credentials, undefined);

let nextId = 100;
const sessions = new Map();
const message = (text, userId = 1, extra = {}) => ({ update_id: nextId++, message: {
  message_id: nextId, chat: { id: userId, type: 'private' }, from: { id: userId }, text, ...extra,
} });
const callback = (data, userId = 1) => ({ update_id: nextId++, callback_query: {
  id: `cb-${nextId}`, from: { id: userId }, data,
  message: { chat: { id: userId, type: 'private' }, message_id: nextId, from: { id: 999, is_bot: true } },
} });
const run = (update) => {
  const user = update.callback_query?.from.id ?? update.message.from.id;
  const sessionKey = `${user}:${user}`;
  // Fresh VM per event, as in separate n8n executions; only persisted row survives.
  const result = vm.runInNewContext(`(() => { ${code}\n })()`, {
    $: () => ({ first: () => ({ json: update }) }),
    $input: { first: () => ({ json: { sessionJson: sessions.get(sessionKey) } }) },
  }, { timeout: 1000 });
  const out = JSON.parse(JSON.stringify(result));
  if (!out.length) return undefined;
  const value = out[0].json;
  sessions.set(sessionKey, value.sessionJson);
  for (const row of value.keyboard.rows) for (const b of row.row.buttons) {
    assert.ok(Buffer.byteLength(b.additionalFields.callback_data) <= 64);
  }
  return value;
};
const pick = (reply, suffix) => reply.keyboard.rows.flatMap((row) => row.row.buttons)
  .find((button) => button.additionalFields.callback_data.endsWith(suffix)).additionalFields.callback_data;

let reply = run(message('/new'));
assert.equal(reply.keyboard.rows.length, 7);
assert.equal(reply.menuKind, 'service');
assert.ok(!reply.textHtml.includes('PREVIEW BAI DANG'));
const oldServiceButton = pick(reply, ':service:WEDDING');
reply = run(callback(pick(reply, ':service:BIRTHDAY')));
assert.equal(reply.keyboard.rows.length, 9);
assert.equal(reply.menuKind, 'type');
reply = run(callback(pick(reply, ':type:FEATURE')));
assert.ok(reply.textHtml.includes('Sinh nhật'));
reply = run(message('Thiệp <online> & RSVP *test* 💌'));
assert.equal(reply.masterPost.service, 'BIRTHDAY');
assert.equal(reply.masterPost.contentType, 'FEATURE');
assert.equal(reply.masterPost.status, 'DRAFT');
assert.equal(reply.masterPost.content, 'Thiệp <online> & RSVP *test* 💌');
assert.ok(reply.textHtml.includes('&lt;online&gt; &amp;'));
assert.ok(reply.textHtml.includes('PREVIEW BAI DANG'));
assert.equal(reply.menuKind, 'action');
assert.equal(reply.archiveApprovedPost, false);
const originalPostId = reply.masterPost.postId;
const oldApprove = pick(reply, ':action:APPROVE');
reply = run(callback(pick(reply, ':action:EDIT')));
assert.equal(JSON.parse(reply.sessionJson).stage, 'CONTENT');
reply = run(callback(oldApprove));
assert.ok(reply.textHtml.includes('phiên cũ'));
assert.equal(reply.archiveApprovedPost, false);
reply = run(message('Nội dung đã sửa'));
assert.equal(reply.masterPost.postId, originalPostId);
assert.equal(reply.masterPost.status, 'DRAFT');
assert.equal(reply.masterPost.content, 'Nội dung đã sửa');
const approvedButton = pick(reply, ':action:APPROVE');
reply = run(callback(approvedButton));
assert.equal(reply.masterPost.status, 'APPROVED');
assert.equal(reply.masterPost.approvedBy, 1);
assert.ok(reply.masterPost.approvedAt);
assert.equal(reply.archiveApprovedPost, true);
assert.ok(reply.textHtml.includes('Chưa đăng mạng xã hội'));
reply = run(callback(approvedButton));
assert.equal(reply.archiveApprovedPost, false, 'Repeated approval must not archive again');
reply = run(message('/preview'));
assert.ok(reply.textHtml.includes('đã được duyệt'));
assert.equal(reply.keyboard.rows.length, 0);

const firstUserSession = sessions.get('1:1');
reply = run(message('/new', 2));
assert.equal(sessions.get('1:1'), firstUserSession, 'Sessions must not cross users');
reply = run(callback(oldServiceButton, 2));
assert.ok(reply.textHtml.includes('phiên cũ'));
reply = run(message('/new'));
reply = run(callback(oldServiceButton));
assert.ok(reply.textHtml.includes('phiên cũ'));
reply = run(callback('sp:bad:type:NOT_A_TYPE'));
assert.ok(reply.textHtml.includes('phiên cũ'));
reply = run(message('/cancel'));
assert.equal(JSON.parse(reply.sessionJson).post, undefined);
const duplicate = message('/new');
run(duplicate);
assert.equal(run(duplicate), undefined, 'Same update must not create another reply');

const enterContent = () => {
  let r = run(message('/new'));
  r = run(callback(pick(r, ':service:HOUSE_WARMING')));
  return run(callback(pick(r, ':type:DEMO')));
};
enterContent();
reply = run(message(undefined, 1, { photo: [{ file_id: 'small' }, { file_id: 'large' }] }));
assert.ok(reply.textHtml.includes('kèm caption'));
assert.equal(JSON.parse(reply.sessionJson).stage, 'CONTENT');
reply = run(message(undefined, 1, { photo: [{ file_id: 'large' }], caption: 'Thiệp tân gia' }));
assert.equal(reply.masterPost.mediaType, 'IMAGE');
assert.equal(reply.masterPost.telegramFileId, 'large');
assert.equal(reply.masterPost.mediaPath, '');
const photoPostId = reply.masterPost.postId;
reply = run(callback(pick(reply, ':action:EDIT')));
reply = run(message('Caption mới, giữ ảnh'));
assert.equal(reply.masterPost.postId, photoPostId);
assert.equal(reply.masterPost.mediaType, 'IMAGE');
assert.equal(reply.masterPost.telegramFileId, 'large');
const oldPhotoApprove = pick(reply, ':action:APPROVE');
reply = run(message('/preview'));
assert.equal(reply.menuKind, 'action');
reply = run(callback(oldPhotoApprove));
assert.equal(reply.archiveApprovedPost, false);
reply = run(message('/preview'));
const cancelledApproval = pick(reply, ':action:APPROVE');
reply = run(callback(pick(reply, ':action:CANCEL')));
assert.equal(JSON.parse(reply.sessionJson).stage, 'IDLE');
assert.equal(reply.masterPost.status, undefined);
reply = run(callback(cancelledApproval));
assert.equal(reply.archiveApprovedPost, false);
enterContent();
reply = run(message(undefined, 1, { video: { file_id: 'video-id' }, caption: 'Demo video' }));
assert.equal(reply.masterPost.mediaType, 'VIDEO');
assert.equal(reply.masterPost.telegramFileId, 'video-id');
enterContent();
reply = run(message(undefined, 1, { media_group_id: 'album', photo: [{ file_id: 'x' }], caption: 'Album' }));
assert.ok(reply.textHtml.includes('không gửi album'));
assert.equal(JSON.parse(reply.sessionJson).stage, 'CONTENT');
reply = run(message('/unsupported'));
assert.ok(reply.textHtml.includes('/new'));
reply = run(message('a'.repeat(2399) + '💌'.repeat(800)));
assert.ok(reply.textHtml.includes('Preview rút gọn'));
assert.ok(!reply.textHtml.includes('\ud83d\n'), 'Truncation must preserve emoji');
assert.equal(reply.masterPost.content.length, 3999);
const expired = JSON.parse(sessions.get('1:1'));
expired.expiresAt = 1;
sessions.set('1:1', JSON.stringify(expired));
reply = run(message('Bài ngoài phiên'));
assert.equal(reply.masterPost.content, undefined);
assert.ok(reply.textHtml.includes('/new'));
assert.equal(run(message('/new', 3, { chat: { id: 3, type: 'group' } })), undefined);
console.log('PASS: menu, approval/edit/cancel, stable post ID, edit retains media, reapproval, stale/duplicate callbacks, escaping, sessions, TTL and Unicode.');
