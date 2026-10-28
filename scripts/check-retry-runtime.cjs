// Isolated n8n instance and mock Buffer in the existing container. No real credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const assert = require('node:assert/strict');
const directory = '/tmp/queue-retry-runtime';
const files = directory + '/files';
const bytes = [Buffer.from('runtime-image-1'), Buffer.from('runtime-image-2')];
const mediaFiles = bytes.map((data, index) => ({ name: 'queue_' + String(index).repeat(32) + '.jpg', mediaType: 'image', hash: crypto.createHash('sha256').update(data).digest('hex') }));
const queueFile = files + '/telegram-content-queue.json';
const initial = () => ({ version: 1, posts: [{ id: '456:110', chatId: 456, messageId: 110, caption: 'runtime caption', dueAt: new Date(Date.now() + 3600000).toISOString(), status: 'partial', mediaFiles, targets: [
  { channelId: 'facebook', service: 'facebook', postId: 'sent-id', status: 'sent' },
  { channelId: 'tiktok', service: 'tiktok', postId: 'failed-id', status: 'error' },
  { channelId: 'threads', service: 'threads', status: 'rejected' },
] }], commands: {}, notices: [], lowNotified: { 456: true } });

if (process.argv.includes('--prepare')) {
  fs.mkdirSync(files, { recursive: true });
  const workflow = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const config = { allowedUserIds: [456], allowedChatIds: [456], services: ['facebook', 'tiktok', 'threads'], publicBaseUrl: 'http://127.0.0.1:5681', mediaWebhookId: 'media', queue: { enabled: true, hours: [9, 14, 20], lowWatermark: 3, maxPendingPerChannel: 9 } };
  workflow.id = 'retryRuntime'; workflow.versionId = crypto.randomUUID(); workflow.name = 'Retry isolated runtime';
  for (const node of workflow.nodes) {
    assert.equal(node.credentials, undefined);
    if (node.parameters.jsCode?.startsWith('const publisherConfig = ')) node.parameters.jsCode = node.parameters.jsCode.replace(/^const publisherConfig = .*;\r?\n/, () => 'const publisherConfig = ' + JSON.stringify(config) + ';\n');
    if (node.parameters.jsCode) node.parameters.jsCode = node.parameters.jsCode.replaceAll('/files/', files + '/').replaceAll("readdirSync('/files')", "readdirSync('" + files + "')");
    if (node.name === 'Telegram Trigger') {
      node.type = 'n8n-nodes-base.webhook'; node.typeVersion = 2;
      node.parameters = { httpMethod: 'POST', path: 'retry-check', responseMode: 'onReceived', options: {} }; node.webhookId = 'retry-check';
    }
    if (node.name === 'Telegram Intake') node.parameters.jsCode = node.parameters.jsCode.replace('$input.first().json;', '$input.first().json.body;');
    if (['Queue Schedule', 'Video Download'].includes(node.name)) node.disabled = true;
    if (node.type === 'n8n-nodes-base.telegram') {
      node.type = 'n8n-nodes-base.code'; node.typeVersion = 2;
      node.parameters = { jsCode: "const fs=require('fs'); fs.appendFileSync('" + files + "/replies.jsonl',JSON.stringify($input.first().json)+'\\n'); return $input.all();" };
    }
    if (node.type === 'n8n-nodes-base.httpRequest' && node.name !== 'Download Retry Media') {
      node.parameters.authentication = 'none'; delete node.parameters.genericAuthType; node.parameters.url = 'http://127.0.0.1:5681/graphql';
    }
  }
  fs.writeFileSync(directory + '/workflow.json', JSON.stringify(workflow));
  fs.writeFileSync(queueFile, JSON.stringify(initial()));
  mediaFiles.forEach((medium, index) => fs.writeFileSync(files + '/' + medium.name, bytes[index]));
  console.log('Prepared isolated retry workflow and media.');
} else if (process.argv.includes('--mock')) {
  const calls = [];
  let corrupt = false;
  http.createServer(async (req, res) => {
    try {
      if (req.url === '/stats') { res.end(JSON.stringify(calls)); return; }
      if (req.url === '/corrupt') { corrupt = true; res.end('ok'); return; }
      if (req.url.includes('/buffer-media/')) {
        const index = mediaFiles.findIndex(medium => req.url.endsWith(medium.name));
        res.setHeader('content-type', 'image/jpeg'); res.end(corrupt ? 'invalid-media' : bytes[index]); return;
      }
      let raw = ''; for await (const chunk of req) raw += chunk;
      const request = JSON.parse(raw); const input = request.variables.input;
      let data;
      if (request.query.includes('mutation')) {
        calls.push(input);
        const key = request.query.includes('editPost') ? 'editPost' : 'createPost';
        data = { [key]: { __typename: 'PostActionSuccess', post: { id: input.id ?? 'new-threads', status: input.mode === 'customScheduled' ? 'scheduled' : 'sent', dueAt: input.dueAt } } };
      } else data = { post: { id: input.id, channelId: 'tiktok', text: 'runtime caption', status: 'error' } };
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data }));
    } catch { res.statusCode = 500; res.end('{}'); }
  }).listen(5681, '127.0.0.1');
} else {
  (async () => {
    const wait = async predicate => {
      for (let attempt = 0; attempt < 150; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 200)); }
      throw new Error('Runtime check timed out');
    };
    const state = () => JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    const stats = async () => (await fetch('http://127.0.0.1:5681/stats')).json();
    const send = async (id, user = 456) => {
      const response = await fetch('http://127.0.0.1:5680/webhook/retry-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ callback_query: { id, from: { id: user }, data: 'queue_retry:110', message: { message_id: 999, chat: { id: 456, type: 'private' } } } }) });
      assert.equal(response.status, 200);
    };
    await send('first');
    await wait(() => state().posts[0].targets.every(target => ['sent', 'scheduled'].includes(target.status)));
    const calls = await stats(); assert.equal(calls.length, 2);
    assert.equal(calls[0].id, 'failed-id'); assert.equal(calls[1].channelId, 'threads');
    assert.ok(calls.every(input => input.mode === 'customScheduled' && input.dueAt === state().posts[0].dueAt && input.assets.length === 2), 'Retries preserve the original future schedule');
    await Promise.all([send('first'), send('second'), send('unauthorized', 123)]);
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.equal((await stats()).length, 2);
    await wait(() => state().notices.every(notice => notice.status === 'sent'));
    fs.writeFileSync(queueFile, JSON.stringify(initial()));
    await fetch('http://127.0.0.1:5681/corrupt'); await send('bad-media');
    await wait(() => state().notices.some(notice => notice.text.includes('tunnel') && notice.status === 'sent'));
    assert.equal((await stats()).length, 2, 'Corrupt public media cannot publish');
    console.log('PASS real n8n retry: callback routing/ack, existing-post edit, rejected-post create, binary hash verification, notices, double click/stale/unauthorized callbacks and corrupt-media guard. No real posts.');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
