// Isolated real n8n tests. No Telegram credentials or real social publishing.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const services = ['tiktok', 'facebook', 'instagram', 'threads'];
if (process.argv.includes('--prepare')) {
  const w = JSON.parse(fs.readFileSync(path.join(root, 'workflows/telegram-publisher.json'), 'utf8'));
  const accepted = w.nodes.find(n => n.name === 'Telegram Accepted').parameters.text;
  const vm = require('node:vm');
  for (const length of [498, 499, 500, 501]) {
    const text = vm.runInNewContext('(' + accepted.slice(3, -2) + ')', { $json: { caption: '💌'.repeat(length) } });
    assert.equal(text.includes('Bot sẽ bỏ qua Threads'), length > 499, 'Warn at receipt time before the publish route');
  }
  const config = { allowedUserIds: [456], allowedChatIds: [456], services, albumQuietMs: 3000, publicBaseUrl: 'http://127.0.0.1:5678', mediaWebhookId: w.nodes.find(n => n.name === 'Video Download').webhookId };
  w.id = 'telegramPublisherTest'; w.versionId = require('node:crypto').randomUUID(); w.name = 'Telegram Multi Publisher Isolated Test';
  w.nodes.find(n => n.name === 'Queue Schedule').disabled = true;
  w.connections['Assemble Media'] = { main: [[{ node: 'Read Buffer Account', type: 'main', index: 0 }], w.connections['Assemble Media'].main[1]] };
  delete w.connections['Telegram Reply'];
  const trigger = w.nodes.find(n => n.name === 'Telegram Trigger');
  trigger.type = 'n8n-nodes-base.webhook'; trigger.typeVersion = 2;
  trigger.parameters = { httpMethod: 'POST', path: 'telegram-publisher-check', responseMode: 'lastNode', options: {} };
  for (const [name, source] of [['Telegram Intake', 'telegram-album-intake'], ['Collect Album', 'telegram-album-collect'], ['Prepare Media', 'telegram-multi-prepare'], ['Build Targets', 'telegram-multi-targets']]) {
    let code = fs.readFileSync(path.join(root, 'workflows/code/' + source + '.js'), 'utf8');
    if (name === 'Telegram Intake') code = code.replace('$input.first().json.message', '$input.first().json.body.message');
    w.nodes.find(n => n.name === name).parameters.jsCode = 'const publisherConfig = ' + JSON.stringify(config) + ';\n' + code;
  }
  for (const n of w.nodes) {
    assert.equal(n.credentials, undefined);
    if (['Telegram Accepted', 'Telegram Reply'].includes(n.name)) { n.type = 'n8n-nodes-base.noOp'; n.typeVersion = 1; n.parameters = {}; }
    if (n.name === 'Download Media') {
      n.type = 'n8n-nodes-base.code'; n.typeVersion = 2;
      n.parameters = { jsCode: "const fs = require('fs'); return await Promise.all($input.all().map(async (item, index) => { const file = '/files/download-attempt-' + item.json.messageId + '.json'; let attempts = 0; try { attempts = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; } fs.writeFileSync(file, JSON.stringify(++attempts)); if (item.json.fileId === 'broken' || (item.json.fileId === 'flaky' && attempts < 3)) return { json: { error: 'test download failure' }, pairedItem: { item: index } }; return { json: {}, binary: { data: await this.helpers.prepareBinaryData(Buffer.from('test-media:' + item.json.fileId), 'file.' + item.json.extension, item.json.mediaType === 'image' ? 'image/jpeg' : 'video/mp4') }, pairedItem: { item: index } }; }));" };
    }
    if (n.type === 'n8n-nodes-base.httpRequest') { n.parameters.authentication = 'none'; delete n.parameters.genericAuthType; n.parameters.url = 'http://127.0.0.1:5681/graphql'; }
    if (n.name === 'Wait For Buffer') n.parameters.amount = 1;
  }
  fs.mkdirSync(path.join(root, 'temp/telegram-publisher-test'), { recursive: true });
  fs.mkdirSync(path.join(root, 'temp/telegram-publisher-test-media'), { recursive: true });
  fs.writeFileSync(path.join(root, 'temp/telegram-publisher-test/workflow.json'), JSON.stringify(w, null, 2));
  console.log('Prepared album + multi-platform fixture.');
} else if (process.argv.includes('--mock')) {
  const http = require('node:http');
  const posts = new Map(); const calls = []; let missing = []; let active = 0; let maxActive = 0;
  http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') { res.end(JSON.stringify({ calls, maxActive })); return; }
    let publishing = false;
    try {
      let raw = ''; for await (const part of req) raw += part;
      const body = JSON.parse(raw);
      if (req.url === '/settings') { missing = body.missing ?? []; res.end('{}'); return; }
      if (body.query.includes('GetOrganizations')) { res.end(JSON.stringify({ data: { account: { organizations: [{ id: 'test-org' }] } } })); return; }
      if (body.query.includes('GetChannels')) { res.end(JSON.stringify({ data: { channels: services.filter(s => !missing.includes(s)).map(service => ({ id: 'test-' + service, service, name: 'Test ' + service, isDisconnected: false, isLocked: false })) } })); return; }
      if (body.query.includes('PendingQueuePosts')) { res.end(JSON.stringify({ data: { posts: { edges: [...posts.values()].filter(post => ['scheduled', 'sending'].includes(post.status)).map(node => ({ node })), pageInfo: { hasNextPage: false } } } })); return; }
      const input = body.variables.input;
      if (body.query.startsWith('mutation')) {
        publishing = true; active++; maxActive = Math.max(maxActive, active);
        const call = { ...input, contents: [] }; calls.push(call);
        assert.ok(services.some(s => 'test-' + s === input.channelId));
        assert.ok(['shareNow', 'customScheduled'].includes(input.mode));
        if (input.mode === 'customScheduled') assert.ok(Date.parse(input.dueAt) > Date.now());
        assert.equal(input.schedulingType, 'automatic'); assert.equal(input.needsApproval, false); assert.equal(input.saveToDraft, false);
        if (input.channelId === 'test-facebook') assert.deepEqual(input.metadata, { facebook: { type: 'post' } });
        else if (input.channelId !== 'test-tiktok' || input.assets[0].image) assert.deepEqual(input.metadata, {}, 'Platform/video-specific metadata must not leak to other post types');
        if (input.channelId === 'test-threads') assert.ok(Array.from(input.text).length <= 499, 'Overlong captions must never reach the Threads API');
        for (const asset of input.assets) {
          const url = (asset.image ?? asset.video).url;
          const head = await fetch(url, { method: 'HEAD' }); assert.equal(head.status, 200);
          const file = await fetch(url); assert.equal(file.status, 200);
          if (asset.image) assert.match(file.headers.get('content-type'), /image\/jpeg/);
          const content = await file.text(); assert.match(content, /^test-media:/); call.contents.push(content);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        if (input.text === 'partial-error' && input.channelId === 'test-facebook') { res.end(JSON.stringify({ errors: [{ message: 'Facebook test rejection' }] })); return; }
        if (input.text === 'network-error' && input.channelId === 'test-instagram') { res.writeHead(503); res.end('{}'); return; }
        const id = 'test-post-' + calls.indexOf(call);
        posts.set(id, { id, channelId: input.channelId, dueAt: input.dueAt, status: input.mode === 'customScheduled' ? 'scheduled' : 'sent', externalLink: 'https://example.com/' + id, error: null });
        res.end(JSON.stringify({ data: { createPost: { __typename: 'PostActionSuccess', post: { id, status: input.mode === 'customScheduled' ? 'scheduled' : 'sending', error: null } } } }));
      } else {
        assert.ok(posts.has(input.id)); res.end(JSON.stringify({ data: { post: posts.get(input.id) } }));
      }
    } catch (error) { res.writeHead(500); res.end(JSON.stringify({ mockError: error.message })); }
    finally { if (publishing) active--; }
  }).listen(5681, '0.0.0.0', () => console.log('Local multi-channel mock ready.'));
} else {
  (async () => {
    const send = async (message, mayDrop = false) => {
      const r = await fetch('http://127.0.0.1:5680/webhook/telegram-publisher-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ update_id: message.message_id, message }), signal: AbortSignal.timeout(90000) });
      const text = await r.text(); if (mayDrop && r.status === 500 && text.includes('No item to return')) return {};
      assert.equal(r.status, 200, text); return text ? JSON.parse(text) : {};
    };
    const base = Date.now();
    const msg = (id, extra) => ({ message_id: base + id, from: { id: 456 }, chat: { id: 456, type: 'private' }, ...extra });
    const photo = (id, caption, group, fileId = 'image-' + id) => msg(id, { photo: [{ file_id: fileId, file_size: 100 }], caption, ...(group ? { media_group_id: group } : {}) });
    const stats = async () => (await fetch('http://127.0.0.1:5681/stats')).json();
    const count = async () => (await stats()).calls.length;
    const settings = async (missing) => fetch('http://127.0.0.1:5681/settings', { method: 'POST', body: JSON.stringify({ missing }) });
    const before = await count();
    if (process.argv.includes('--ten')) {
      const group = 'ten-' + base;
      const replies = await Promise.all(Array.from({ length: 10 }, (_, index) => send(photo(200 + index, index === 0 ? 'Ten photos' : '', group), true)));
      assert.equal(replies.find(r => r.status)?.status, 'sent');
      const calls = (await stats()).calls.filter(c => c.text === 'Ten photos');
      assert.equal(calls.length, 4);
      for (const c of calls) { assert.equal(c.assets.length, 10); assert.deepEqual(c.contents, Array.from({ length: 10 }, (_, i) => 'test-media:image-' + (200 + i))); }
      assert.equal(await count(), before + 4);
      console.log('PASS ten-photo Telegram album creates one ordered carousel on each of four channels.');
      return;
    }
    assert.match((await send(msg(1, { text: '/start' }))).text, /album tối đa 10 ảnh/);
    await send({ ...photo(2, 'unauthorized'), from: { id: 999 } }, true);
    assert.match((await send(photo(3, ''))).text, /chưa có caption/);
    assert.equal(await count(), before);
    const single = await send(photo(10, 'single'));
    assert.equal(single.status, 'sent', JSON.stringify(single));
    assert.equal(await count(), before + 4);
    for (const label of ['TikTok', 'Facebook Page', 'Instagram', 'Threads']) assert.ok(single.text.includes(label));
    await send(photo(10, 'single'), true); assert.equal(await count(), before + 4);
    const video = await send(msg(20, { video: { file_id: 'video', file_name: 'test.mp4', mime_type: 'video/mp4', file_size: 20 }, caption: '/ai AI video' }));
    assert.equal(video.status, 'sent');
    assert.equal((await stats()).calls.find(c => c.text === 'AI video' && c.channelId === 'test-tiktok').metadata.tiktok.isAiGenerated, true);
    const album = 'album-' + base;
    const albumReplies = await Promise.all([send(photo(32, '', album), true), send(photo(30, 'Album caption', album), true), send(photo(31, '', album), true)]);
    const albumResult = albumReplies.find(r => r.status);
    assert.equal(albumResult.status, 'sent', JSON.stringify(albumReplies));
    const albumCalls = (await stats()).calls.filter(c => c.text === 'Album caption');
    assert.equal(albumCalls.length, 4, 'One album per channel, never a post per photo');
    for (const c of albumCalls) { assert.equal(c.assets.length, 3); assert.deepEqual(c.contents, ['test-media:image-30', 'test-media:image-31', 'test-media:image-32']); }
    const afterAlbum = await count();
    await Promise.all([send(photo(31, '', album), true), send(photo(30, 'Album caption', album), true)]); assert.equal(await count(), afterAlbum);
    const status = await send(msg(40, { text: '/status', reply_to_message: { message_id: base + 31 } })); assert.equal(status.status, 'sent'); assert.equal(await count(), afterAlbum);
    const latest = await send(msg(41, { text: '/status' })); assert.equal(latest.status, 'sent'); assert.equal(await count(), afterAlbum);
    const brokenGroup = 'broken-' + base;
    const broken = await Promise.all([send(photo(50, 'Broken album', brokenGroup), true), send(photo(51, '', brokenGroup, 'broken'), true)]);
    assert.ok(broken.some(r => r.text?.includes('Toàn bộ bài chưa được gửi đăng'))); assert.equal(await count(), afterAlbum, 'Download failure must not publish a partial album');
    const emptyCaption = await Promise.all([send(photo(60, '', 'empty-' + base), true), send(photo(61, '', 'empty-' + base), true)]);
    assert.ok(emptyCaption.some(r => r.text?.includes('Album chưa có caption'))); assert.equal(await count(), afterAlbum);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'temp/telegram-publisher-test-media/download-attempt-' + (base + 51) + '.json'), 'utf8')), 3, 'Permanent download failure retries three times');
    const flakyAlbum = await Promise.all([send(photo(340, 'Transient download', 'flaky-' + base), true), send(photo(341, '', 'flaky-' + base, 'flaky'), true), send(photo(342, '', 'flaky-' + base), true)]);
    assert.equal(flakyAlbum.find(r => r.status)?.status, 'sent', JSON.stringify(flakyAlbum));
    const flakyCalls = (await stats()).calls.filter(c => c.text === 'Transient download');
    assert.equal(flakyCalls.length, 4);
    for (const c of flakyCalls) assert.deepEqual(c.contents, ['test-media:image-340', 'test-media:flaky', 'test-media:image-342']);
    for (const [id, attempts] of [[340, 1], [341, 3], [342, 1]]) assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'temp/telegram-publisher-test-media/download-attempt-' + (base + id) + '.json'), 'utf8')), attempts);
    const partial = await send(photo(70, 'partial-error')); assert.equal(partial.status, 'partial'); assert.match(partial.text, /Facebook test rejection/); assert.match(partial.text, /Instagram.*Đã đăng/);
    const network = await send(photo(80, 'network-error')); assert.equal(network.status, 'partial'); assert.match(network.text, /Không xác nhận/); assert.equal(await count(), afterAlbum + 12, 'Failed mutation must not retry');
    await settings(['facebook', 'instagram', 'threads']);
    const missing = await send(photo(90, 'missing channels')); assert.equal(missing.status, 'partial'); assert.match(missing.text, /Chưa kết nối trong Buffer/); assert.equal(await count(), afterAlbum + 13);
    await settings([]);
    for (const [index, length] of [498, 499, 500, 501].entries()) {
      const caption = '💌'.repeat(length);
      const beforeLimit = await count();
      const result = await send(photo(300 + index, caption));
      assert.equal(result.status, length <= 499 ? 'sent' : 'partial');
      const created = (await stats()).calls.slice(beforeLimit);
      assert.equal(created.length, length <= 499 ? 4 : 3);
      assert.equal(created.some(c => c.channelId === 'test-threads'), length <= 499);
      assert.ok(created.some(c => c.channelId === 'test-facebook'));
      if (length > 499) assert.match(result.text, /Threads.*Bỏ qua, chưa gửi đăng.*499/);
      const statusResult = await send(msg(310 + index, { text: '/status', reply_to_message: { message_id: base + 300 + index } }));
      assert.equal(statusResult.status, result.status); assert.equal(await count(), beforeLimit + created.length);
    }
    const longAlbumCaption = 'ế'.repeat(501);
    const beforeLongAlbum = await count();
    const longAlbum = await Promise.all([send(photo(330, longAlbumCaption, 'long-' + base), true), send(photo(331, '', 'long-' + base), true)]);
    assert.equal(longAlbum.find(r => r.status)?.status, 'partial');
    const longAlbumCalls = (await stats()).calls.slice(beforeLongAlbum);
    assert.equal(longAlbumCalls.length, 3);
    assert.ok(longAlbumCalls.every(c => c.channelId !== 'test-threads' && c.assets.length === 2 && c.text === longAlbumCaption));
    const lateAlbum = 'quiet-' + base;
    const first = send(photo(100, 'Quiet period', lateAlbum), true);
    await new Promise(resolve => setTimeout(resolve, 4500));
    await send(photo(101, '', lateAlbum), true);
    const quiet = await first; assert.equal(quiet.status, 'sent');
    for (const c of (await stats()).calls.filter(c => c.text === 'Quiet period')) assert.equal(c.assets.length, 2);
    assert.ok((await stats()).maxActive > 1, 'Channel publishing requests must overlap');
    console.log('PASS real n8n: per-file download retries (middle image recovers on attempt 3, permanent failure blocks album), Facebook post metadata, Threads 498/499 allowed and 500/501 skipped (Unicode), long album skips only Threads, status without repost, album ordering/dedup, concurrent channels, partial errors, missing connections, photo/video + AI.');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
