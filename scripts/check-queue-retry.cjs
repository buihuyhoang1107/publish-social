const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(root, 'temp/retry-check-'));
const local = name => { assert.ok(name.startsWith('/files/')); return path.join(directory, name.slice(7)); };
const fakeFs = {};
for (const method of ['readFileSync', 'writeFileSync', 'openSync', 'unlinkSync', 'statSync', 'existsSync', 'readdirSync']) fakeFs[method] = (name, ...args) => fs[method](local(name), ...args);
fakeFs.renameSync = (from, to) => fs.renameSync(local(from), local(to)); fakeFs.closeSync = fd => fs.closeSync(fd);
const config = { allowedChatIds: [456], allowedUserIds: [456], services: ['facebook', 'tiktok', 'threads'], publicBaseUrl: 'https://example.com', mediaWebhookId: 'media', queue: { enabled: true, hours: [9, 14, 20], lowWatermark: 3, maxPendingPerChannel: 9 } };
const helper = fs.readFileSync(path.join(root, 'workflows/code/telegram-queue-store.js'), 'utf8');
const source = name => fs.readFileSync(path.join(root, 'workflows/code/' + name + '.js'), 'utf8');
const stateFile = path.join(directory, 'telegram-content-queue.json');
const state = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const write = value => fs.writeFileSync(stateFile, JSON.stringify(value));
const buffers = [Buffer.from('image-one'), Buffer.from('image-two')];
const mediaFiles = buffers.map((bytes, index) => {
  const name = 'queue_' + String(index).repeat(32) + '.jpg';
  fakeFs.writeFileSync('/files/' + name, bytes);
  return { name, mediaType: 'image', hash: crypto.createHash('sha256').update(bytes).digest('hex') };
});
const initial = () => ({ version: 1, posts: [{ id: '456:110', chatId: 456, messageId: 110, caption: 'caption', dueAt: new Date(Date.now() + 3600000).toISOString(), status: 'partial', mediaFiles, targets: [
  { channelId: 'facebook', service: 'facebook', postId: 'sent-id', status: 'sent' },
  { channelId: 'tiktok', service: 'tiktok', postId: 'failed-id', status: 'error' },
  { channelId: 'threads', service: 'threads', status: 'rejected' },
] }], commands: {}, notices: [], lowNotified: { 456: true } });
const sandbox = (json, work, prepared) => ({ require: name => name === 'fs' ? fakeFs : crypto, $runIndex: 0,
  $input: { first: () => ({ json }), all: () => json },
  $: name => ({ isExecuted: false, first: () => ({ json: {} }), itemMatching: () => ({ json: name === 'Prepare Queue Retry' ? prepared : work }) }),
});
const run = (name, json, work) => JSON.parse(JSON.stringify(vm.runInNewContext('(()=>{ const publisherConfig=' + JSON.stringify(config) + ';\n' + helper + '\n' + (name === 'telegram-album-intake' ? source('telegram-image-crop-intake') + '\n' + source('telegram-list-import-intake') + '\n' : '') + source(name) + '\n})()', sandbox(json, work))));
const verify = async (prepared, inputBuffers = buffers) => JSON.parse(JSON.stringify(await vm.runInNewContext('(async function(){ const publisherConfig=' + JSON.stringify(config) + ';\n' + helper + '\n' + source('telegram-queue-verify-retry') + '\n}).call({helpers:{getBinaryDataBuffer:async index=>testBuffers[index]}})', { ...sandbox(inputBuffers.map(() => ({ json: {}, binary: { data: {} } })), undefined, prepared), testBuffers: inputBuffers })));
const callback = (id, user = 456) => ({ callback_query: { id, from: { id: user }, data: 'queue_retry:110', message: { message_id: 999, chat: { id: 456, type: 'private' } } } });
const next = () => {
  let work;
  while ((work = run('telegram-queue-work', {})[0].json).action === 'notify') run('telegram-queue-notified', {}, work);
  return work;
};
const request = id => run('telegram-queue-command', run('telegram-album-intake', callback(id))[0].json)[0].json;
const remote = status => ({ data: { post: { id: 'failed-id', channelId: 'tiktok', status, text: 'caption' } } });

(async () => {
  write(initial());
  assert.deepEqual(run('telegram-album-intake', callback('unauthorized', 123)), []);
  assert.equal(request('click-1').runQueue, true);
  assert.equal(request('click-1').runQueue, false, 'Telegram redelivery cannot repeat retry');
  assert.equal(request('click-2').runQueue, false, 'Double click while requested cannot queue twice');
  assert.equal(state().posts[0].targets[0].retryRequested, undefined, 'Sent channel is untouched');
  let work = next(); assert.equal(work.action, 'retry'); assert.equal(work.retryKind, 'edit');
  let prepared = run('telegram-queue-prepare-retry', remote('error'), work)[0].json;
  assert.equal(prepared.hasRetry, true); assert.equal(prepared.input.mode, 'customScheduled'); assert.equal(prepared.input.dueAt, state().posts[0].dueAt); assert.equal(prepared.input.id, 'failed-id');
  assert.equal((await verify(prepared))[0].json.hasVerifiedRetry, true);
  run('telegram-queue-result', { data: { editPost: { __typename: 'PostActionSuccess', post: { id: 'failed-id', status: 'scheduled' } } } }, work);
  assert.equal(state().posts[0].targets[1].status, 'scheduled');
  work = next(); assert.equal(work.retryKind, 'create');
  prepared = run('telegram-queue-prepare-retry', {}, work)[0].json;
  assert.equal(prepared.input.channelId, 'threads'); assert.equal(prepared.input.mode, 'customScheduled'); assert.equal(prepared.input.dueAt, state().posts[0].dueAt);
  assert.equal((await verify(prepared))[0].json.hasVerifiedRetry, true);
  run('telegram-queue-result', { error: 'timeout' }, work);
  assert.equal(state().posts[0].targets[2].status, 'unknown');
  assert.equal(request('click-3').runQueue, false, 'Unknown mutation is never retried');
  assert.equal(next().hasWork, false, 'Future restored schedule is not polled early');

  const overdue = initial(); overdue.posts[0].dueAt = new Date(Date.now() - 3600000).toISOString();
  write(overdue); request('overdue'); work = next();
  prepared = run('telegram-queue-prepare-retry', remote('error'), work)[0].json;
  assert.equal(prepared.input.mode, 'shareNow', 'Only posts already due can publish immediately');
  assert.equal(prepared.input.dueAt, undefined);

  write(initial()); request('stale'); work = next();
  assert.equal(run('telegram-queue-prepare-retry', remote('sent'), work)[0].json.hasRetry, false, 'Stale button rechecks remote sent status');
  assert.equal(state().posts[0].targets[1].status, 'sent');
  write(initial()); request('bad-media'); work = next(); prepared = run('telegram-queue-prepare-retry', remote('error'), work)[0].json;
  assert.equal((await verify(prepared, [Buffer.from('HTML error'), buffers[1]]))[0].json.hasVerifiedRetry, false);
  assert.equal(state().posts[0].targets[1].status, 'error');
  assert.ok(state().notices.some(notice => notice.retryMessageId === 110), 'Failure notice has retry button');
  write(initial()); request('missing-file'); work = next(); fs.unlinkSync(local('/files/' + mediaFiles[0].name));
  assert.equal(run('telegram-queue-prepare-retry', remote('error'), work)[0].json.hasRetry, false);
  write(initial()); request('missing-status'); work = next();
  assert.equal(run('telegram-queue-prepare-retry', { error: 'network' }, work)[0].json.hasRetry, false);
  assert.equal(state().posts[0].targets[1].status, 'unknown');
  console.log('PASS retry: authorized callbacks, redelivery/double-click dedup, skip successful/unknown channels, remote status check, ordered media/hash verification, missing/corrupt media stop, edit vs create, timeout safety and polling.');
})().catch(error => { console.error(error); process.exitCode = 1; });
