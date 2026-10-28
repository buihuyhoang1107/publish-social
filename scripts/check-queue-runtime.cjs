// Real n8n fixture: isolated files, mock Buffer, no credentials and no social publishing.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const mediaRoot = path.join(root, 'temp/telegram-publisher-test-media');
if (process.argv.includes('--prepare')) {
  const workflow = JSON.parse(fs.readFileSync(path.join(root, 'workflows/telegram-publisher.json'), 'utf8'));
  const legacyFixture = JSON.parse(fs.readFileSync(path.join(root, 'temp/telegram-publisher-test/workflow.json'), 'utf8'));
  const config = { allowedUserIds: [456], allowedChatIds: [456], services: ['tiktok', 'facebook', 'instagram', 'threads'], albumQuietMs: 3000, publicBaseUrl: 'http://127.0.0.1:5678', mediaWebhookId: 'queue-runtime-media', queue: { enabled: true, hours: [9, 14, 20], lowWatermark: 3, maxPendingPerChannel: 9 } };
  workflow.id = 'telegramQueueTest'; workflow.name = 'Telegram Content Queue Isolated Test'; workflow.versionId = crypto.randomUUID();
  for (const node of workflow.nodes) {
    assert.equal(node.credentials, undefined);
    if (node.parameters.jsCode?.startsWith('const publisherConfig = ')) node.parameters.jsCode = node.parameters.jsCode.replace(/^const publisherConfig = .*;\n/, 'const publisherConfig = ' + JSON.stringify(config) + ';\n');
    if (node.name === 'Telegram Trigger' || node.name === 'Queue Schedule') {
      node.type = 'n8n-nodes-base.webhook'; node.typeVersion = 2;
      node.parameters = { httpMethod: 'POST', path: node.name === 'Telegram Trigger' ? 'queue-message' : 'queue-tick', responseMode: 'onReceived', options: {} }; node.disabled = false;
      node.webhookId = node.name === 'Telegram Trigger' ? 'queue-test-message' : 'queue-test-tick';
    }
    if (node.name === 'Telegram Intake') node.parameters.jsCode = node.parameters.jsCode.replace('$input.first().json.message', '$input.first().json.body.message');
    if (node.name === 'Download Media') { node.type = 'n8n-nodes-base.code'; node.typeVersion = 2; node.parameters = legacyFixture.nodes.find(item => item.name === 'Download Media').parameters; }
    if (node.name === 'Telegram Accepted') { node.type = 'n8n-nodes-base.noOp'; node.typeVersion = 1; node.parameters = {}; }
    if (['Telegram Reply', 'Queue Notification'].includes(node.name)) {
      const notification = node.name === 'Queue Notification';
      node.type = 'n8n-nodes-base.code'; node.typeVersion = 2;
      node.parameters = { jsCode: `const fs = require('fs'); const json = $input.first().json; fs.appendFileSync('/files/queue-runtime-replies.jsonl', JSON.stringify({ ...json, notification: ${notification} }) + String.fromCharCode(10)); return [{ json: ${notification ? '{ ok: true }' : 'json'} }];` };
    }
    if (node.type === 'n8n-nodes-base.httpRequest') { node.parameters.authentication = 'none'; delete node.parameters.genericAuthType; node.parameters.url = 'http://127.0.0.1:5681/graphql'; }
    if (node.name === 'Video Download') node.webhookId = config.mediaWebhookId;
    if (node.name === 'Wait For Buffer') node.parameters.amount = 1;
  }
  fs.writeFileSync(path.join(root, 'temp/telegram-publisher-test/queue-workflow.json'), JSON.stringify(workflow, null, 2));
  console.log('Prepared credential-free queue runtime fixture. Use a fresh /files directory or archive its queue JSON first.');
} else {
  (async () => {
    const waitFor = async (predicate, label) => {
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) { const result = await predicate(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 200)); }
      throw new Error('Timed out: ' + label);
    };
    const queue = () => { try { return JSON.parse(fs.readFileSync(path.join(mediaRoot, 'telegram-content-queue.json'), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return { posts: [], notices: [] }; throw error; } };
    const replies = () => { try { return fs.readFileSync(path.join(mediaRoot, 'queue-runtime-replies.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } };
    const stats = async () => (await fetch('http://127.0.0.1:5681/stats')).json();
    const send = async message => { const response = await fetch('http://127.0.0.1:5680/webhook/queue-message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message }) }); assert.equal(response.status, 200); };
    const base = Date.now();
    const message = (id, extra) => ({ message_id: base + id, chat: { id: 456, type: 'private' }, from: { id: 456 }, ...extra });
    const photo = (id, caption, group, fileId = 'queue-image-' + id) => message(id, { photo: [{ file_id: fileId, file_size: 100 }], caption, ...(group ? { media_group_id: group } : {}) });
    const before = (await stats()).calls.length;
    const initial = queue().posts.length;
    await send(photo(1, 'Queue single'));
    await waitFor(() => queue().posts.length === initial + 1, 'single saved');
    await waitFor(async () => (await stats()).calls.length === before + 4 && queue().posts.find(post => post.messageId === base + 1)?.status === 'scheduled', 'single automatically schedules without approval');
    assert.ok(queue().posts.find(post => post.messageId === base + 1).approvedAt);
    await send(photo(2, 'Queue single', undefined, 'queue-image-1'));
    await waitFor(() => replies().some(reply => reply.messageId === base + 2 && reply.status === 'duplicate'), 'duplicate content rejected');
    await Promise.all([send(photo(3, '💌'.repeat(500), 'album-' + base)), send(photo(4, '', 'album-' + base, 'flaky')), send(photo(5, '', 'album-' + base))]);
    await waitFor(() => queue().posts.length === initial + 2, 'album with transient middle image saved');
    const album = queue().posts.find(post => post.messageId === base + 3); assert.equal(album.mediaFiles.length, 3);
    await waitFor(async () => (await stats()).calls.length === before + 7 && queue().posts.find(post => post.messageId === base + 3)?.status === 'partial', 'album automatically schedules without approval');
    await send(message(7, { text: '/cancel ' + (base + 1) })); await waitFor(() => replies().some(reply => reply.messageId === base + 7 && reply.text.includes('Không đổi')), 'already scheduled post cannot be cancelled locally');
    const approval = message(8, { text: '/approve all' });
    await Promise.all([send(approval), send(approval)]);
    await waitFor(() => replies().some(reply => reply.messageId === base + 8 && reply.runQueue === false), 'redundant approval cannot schedule again');
    await waitFor(() => queue().notices.every(notice => notice.status !== 'ready' && notice.status !== 'claimed'), 'notices delivered');
    const calls = (await stats()).calls.slice(before);
    for (const call of calls) { assert.equal(call.mode, 'customScheduled'); assert.ok(Date.parse(call.dueAt) > Date.now()); }
    const singleCalls = calls.filter(call => call.text === 'Queue single'); assert.equal(singleCalls.length, 4); assert.equal(new Set(singleCalls.map(call => call.dueAt)).size, 1);
    const albumCalls = calls.filter(call => call.text === '💌'.repeat(500)); assert.equal(albumCalls.length, 3); assert.ok(albumCalls.every(call => call.channelId !== 'test-threads'));
    for (const call of albumCalls) assert.deepEqual(call.contents, ['test-media:queue-image-3', 'test-media:flaky', 'test-media:queue-image-5']);
    assert.ok(calls.every(call => !call.assets.some(asset => /_\d{13}\./.test((asset.image ?? asset.video).url))), 'Queue media does not expire after 24 hours');
    await send(message(9, { text: '/queue' })); await waitFor(() => replies().some(reply => reply.messageId === base + 9 && reply.text.includes('Đã lên lịch')), 'queue view');
    await send(message(10, { text: '/status', reply_to_message: { message_id: base + 4 } })); await waitFor(() => replies().some(reply => reply.messageId === base + 10 && reply.text.includes('Lịch:')), 'status through album alias');
    for (let index = 0; index < 2; index++) { const r = await fetch('http://127.0.0.1:5680/webhook/queue-tick', { method: 'POST' }); assert.equal(r.status, 200); }
    await new Promise(resolve => setTimeout(resolve, 2000)); assert.equal((await stats()).calls.length, before + 7, 'Repeated dispatcher cannot repost');
    for (const call of calls) for (const asset of call.assets) { const url = new URL((asset.image ?? asset.video).url); const response = await fetch('http://127.0.0.1:5680' + url.pathname, { method: 'HEAD' }); assert.equal(response.status, 200); }
    console.log('PASS real n8n queue: automatic approval and scheduling, content dedup, album retries/order, scheduled cancellation guard, concurrent approval dedup, 09/14/20 schedule with customScheduled, Threads skipped only, notifications, queue/status aliases, repeat ticks and permanent media GET/HEAD. No real posts.');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
