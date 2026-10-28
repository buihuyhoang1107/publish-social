// Offline transactional queue tests. All files are isolated in a unique temp directory.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(root, 'temp/queue-check-'));
const local = name => { assert.ok(name.startsWith('/files/')); return path.join(directory, name.slice(7)); };
const fakeFs = {};
for (const method of ['readFileSync', 'writeFileSync', 'openSync', 'unlinkSync', 'statSync', 'existsSync']) fakeFs[method] = (name, ...args) => fs[method](local(name), ...args);
fakeFs.renameSync = (from, to) => fs.renameSync(local(from), local(to)); fakeFs.closeSync = fd => fs.closeSync(fd);
let timestamp = Date.parse('2026-10-28T01:30:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [timestamp])); } static now() { return timestamp; } }
const config = { allowedChatIds: [456], allowedUserIds: [456], services: ['facebook', 'threads', 'tiktok'], publicBaseUrl: 'https://example.com', mediaWebhookId: 'media', queue: { enabled: true, hours: [9, 14, 20], lowWatermark: 3, maxPendingPerChannel: 9 } };
const helper = fs.readFileSync(path.join(root, 'workflows/code/telegram-queue-store.js'), 'utf8');
const source = name => fs.readFileSync(path.join(root, 'workflows/code/' + name + '.js'), 'utf8');
const channels = config.services.map(service => ({ id: service, service, name: service }));
let remote = [];
const run = (name, json, work) => JSON.parse(JSON.stringify(vm.runInNewContext('(()=>{ const publisherConfig=' + JSON.stringify(config) + ';\n' + helper + '\n' + source(name) + '\n})()', {
  require: name => name === 'fs' ? fakeFs : crypto, Date: Clock, $runIndex: 0,
  $input: { first: () => ({ json }) }, $: name => ({ isExecuted: true, first: () => ({ json: name === 'Queue Pending Posts' ? { data: { posts: { edges: remote.map(node => ({ node })), pageInfo: { hasNextPage: false } } } } : { data: { channels } } }), itemMatching: () => ({ json: work }) }),
})));
const state = () => JSON.parse(fs.readFileSync(path.join(directory, 'telegram-content-queue.json'), 'utf8'));
const writeState = value => fs.writeFileSync(path.join(directory, 'telegram-content-queue.json'), JSON.stringify(value));
const save = (id, caption = 'Bài ' + id, content = 'media:' + id) => {
  const name = 'queue_' + crypto.createHash('md5').update(content).digest('hex') + '.jpg';
  fakeFs.writeFileSync('/files/' + name, content);
  const journalFile = '/files/telegram-post-456-' + id + '.json'; fakeFs.writeFileSync(journalFile, '{}');
  return run('telegram-queue-save', { chatId: 456, messageId: id, journalFile, caption, isAiGenerated: false, assets: [{ image: { url: 'https://example.com/' + name } }] })[0].json;
};
let commandId = 1000;
const command = text => run('telegram-queue-command', { chatId: 456, messageId: commandId++, commandText: text })[0].json;
const next = () => run('telegram-queue-work', {})[0]?.json;
const complete = (work, response) => run('telegram-queue-result', response, work);
const drain = (options = {}) => {
  const creates = [], notifications = []; let work;
  for (let i = 0; i < 200 && (work = next())?.hasWork; i++) {
    if (work.action === 'notify') { notifications.push(work.text); run('telegram-queue-notified', { ok: true }, work); }
    else if (work.action === 'create') { creates.push(work); complete(work, options.reject ? { data: { createPost: { __typename: 'InvalidInputError', message: 'Mock rejected' } } } : { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'mock-' + creates.length + '-' + work.queuePostId, status: 'scheduled' } } } }); }
    else complete(work, { data: { post: { id: work.postId, status: 'sent', externalLink: 'https://example.com/sent' } } });
  }
  return { creates, notifications };
};
const saved = save(1); assert.equal(saved.status, 'approved'); assert.equal(saved.runQueue, true);
assert.equal(state().posts[0].approvedAt, state().posts[0].createdAt);
assert.equal(run('telegram-queue-start', {})[0].json.needsChannels, true, 'New posts are eligible without an approval command');
const duplicate = save(2, 'Bài 1', 'media:1'); assert.equal(duplicate.status, 'duplicate'); assert.notEqual(duplicate.runQueue, true); assert.equal(state().posts.length, 1);
assert.match(command('/queue').text, /#1/);
const legacy = state(); legacy.posts[0].status = 'draft'; delete legacy.posts[0].approvedAt; writeState(legacy);
assert.equal(next().hasWork, false, 'Legacy drafts still require explicit approval');
const repeated = { chatId: 456, messageId: commandId++, commandText: '/approve all' };
assert.equal(run('telegram-queue-command', repeated)[0].json.runQueue, true);
assert.equal(run('telegram-queue-command', repeated)[0].json.runQueue, false);
assert.equal(command('/approve all').runQueue, false);
for (let id = 3; id <= 13; id++) save(id, id === 3 ? '💌'.repeat(500) : 'Bài ' + id);
assert.match(command('/cancel 13').text, /Đã hủy/);
assert.equal(command('/approve all').runQueue, false, 'New posts are already approved');
const scheduled = drain();
assert.equal(scheduled.creates.length, 26, 'Nine slots x three channels minus overlong Threads');
const current = state();
const assigned = current.posts.filter(post => post.dueAt);
assert.equal(assigned.length, 9); assert.equal(new Set(assigned.map(post => post.dueAt)).size, 9);
assert.deepEqual(assigned.slice(0, 4).map(post => post.dueAt), ['2026-10-28T02:00:00.000Z', '2026-10-28T07:00:00.000Z', '2026-10-28T13:00:00.000Z', '2026-10-29T02:00:00.000Z']);
assert.equal(current.posts.filter(post => post.status === 'approved').length, 2, 'Overflow stays approved for automatic refill');
assert.equal(current.posts.find(post => post.messageId === 3).targets.find(target => target.service === 'threads').status, 'skipped');
for (const work of scheduled.creates) { assert.equal(work.input.mode, 'customScheduled'); assert.equal(work.input.schedulingType, 'automatic'); assert.ok(Date.parse(work.input.dueAt) > timestamp); if (work.channelId === 'facebook') assert.deepEqual(work.input.metadata, { facebook: { type: 'post' } }); }
assert.equal(drain().creates.length, 0, 'Restart/repeated dispatcher cannot create duplicates');
assert.match(command('/cancel 1').text, /Không đổi/);
timestamp = Date.parse('2026-10-28T02:05:00Z');
const refill = drain(); assert.equal(refill.creates.length, 3, 'After sent status frees one slot, refill automatically');
assert.equal(state().posts.find(post => post.messageId === 1).status, 'sent');
const sentNotices = refill.notifications.filter(text => text.startsWith('✅ Vừa đăng bài #1 '));
assert.equal(sentNotices.length, 3, 'Notify as each platform confirms publication');
assert.match(sentNotices[2], /thành công trên 3\/3 kênh/);
assert.match(sentNotices[2], /Nội dung: Bài 1/);
assert.match(sentNotices[2], /Xác nhận lúc:/);
assert.match(sentNotices[2], /https:\/\/example.com\/sent/);
assert.ok(!scheduled.notifications.some(text => text.includes('Vừa đăng')), 'Scheduling is not publication');
const sentPost = state().posts.find(post => post.messageId === 1);
const repeatedWork = { action: 'poll', queuePostId: sentPost.id, channelId: sentPost.targets[0].channelId, postId: sentPost.targets[0].postId };
const sentNoticeCount = state().notices.length;
complete(repeatedWork, { data: { post: { id: repeatedWork.postId, status: 'sent', externalLink: 'https://example.com/sent' } } });
assert.equal(state().notices.length, sentNoticeCount, 'Repeated sent status cannot repeat the notice');
complete(repeatedWork, { data: { post: { id: repeatedWork.postId, status: 'scheduled' } } });
assert.equal(state().notices.length, sentNoticeCount, 'Stale scheduled status cannot regress a published post');
const partialState = state();
partialState.posts = [JSON.parse(JSON.stringify(sentPost))]; partialState.notices = [];
partialState.posts[0].targets[1].status = 'error'; partialState.posts[0].targets[1].error = 'Mock publish failure';
partialState.posts[0].targets[2].status = 'skipped';
writeState(partialState);
complete(repeatedWork, { data: { post: { id: repeatedWork.postId, status: 'sent', externalLink: 'https://example.com/sent' } } });
assert.match(state().notices[0].text, /thành công trên 1\/3 kênh/);
assert.match(state().notices[0].text, /Lỗi — Mock publish failure/);
assert.match(state().notices[0].text, /Bỏ qua/);
const isolated = { version: 1, posts: [], commands: {}, notices: [], lowNotified: {} }; writeState(isolated);
timestamp = Date.parse('2026-10-28T07:00:01Z');
const empty = drain(); assert.equal(empty.creates.length, 0); assert.equal(empty.notifications.filter(text => text.includes('Bỏ qua khung')).length, 1);
assert.equal(drain().notifications.length, 0, 'Empty-slot notice is deduplicated');
timestamp = Date.parse('2026-10-28T07:06:00Z'); assert.equal(drain().notifications.length, 0, 'No catch-up posts or repeated skipped-slot notifications');
save(50); command('/approve all'); let work = next(); if (work.action === 'notify') { run('telegram-queue-notified', {}, work); work = next(); }
assert.equal(work.action, 'create');
complete(work, { error: 'Network closed' });
const ambiguous = drain(); assert.ok(ambiguous.creates.every(item => item.channelId !== work.channelId), 'Ambiguous mutation must never retry');
assert.equal(state().posts[0].targets.find(target => target.channelId === work.channelId).status, 'unknown');
writeState(isolated); save(60); command('/approve all'); work = next(); if (work.action === 'notify') { run('telegram-queue-notified', {}, work); work = next(); }
timestamp += 601000; drain(); assert.equal(state().posts[0].targets.find(target => target.channelId === work.channelId).status, 'unknown', 'Crash after claim does not retry');
assert.ok(drain().creates.every(item => item.channelId !== work.channelId));
writeState(isolated); save(70); command('/approve all');
remote = Array.from({ length: 9 }, (_, index) => ({ id: 'external-' + index, channelId: 'facebook', dueAt: '2026-10-28T13:00:00.000Z' }));
assert.equal(drain().creates.length, 0, 'External Buffer posts also consume channel capacity');
assert.equal(state().posts[0].status, 'approved');
remote = remote.slice(0, 1); const externalSlot = remote[0].dueAt; const afterExternal = drain();
assert.equal(afterExternal.creates.length, 3); assert.ok(afterExternal.creates.every(item => item.input.dueAt !== externalSlot), 'Avoid occupied Buffer slots');
assert.equal(run('telegram-queue-start', {})[0].json.needsChannels, false, 'No approved backlog means no repeated account/channel queries');
console.log('PASS queue: auto-approval/legacy approval/cancel, content and command dedup, timezone/slots, local/external cap and refill, occupied Buffer slots, Threads limit, skipped-slot notice, ambiguous results and crash safety.');
console.log('Isolated artifacts: ' + directory);
