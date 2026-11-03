// Isolated n8n runtime. Telegram and Buffer nodes are mocked; no production credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const videoMode = process.argv.includes('--video');
const directory = path.join(root, videoMode ? 'temp/list-import-video-runtime' : 'temp/list-import-runtime');
const repliesFile = path.join(directory, 'replies.jsonl');
const callsFile = path.join(directory, 'buffer-calls.jsonl');
const queueFile = path.join(directory, 'telegram-content-queue.json');
if (process.argv.includes('--prepare')) {
  fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(queueFile)) throw new Error('Use a fresh isolated runtime directory');
  const workflow = JSON.parse(fs.readFileSync(path.join(root, 'workflows/telegram-publisher.json'), 'utf8'));
  workflow.id = 'listImportRuntime'; workflow.name = 'List import isolated runtime'; workflow.versionId = crypto.randomUUID();
  const config = { allowedUserIds: [456], allowedChatIds: [456], services: ['facebook', 'threads', 'tiktok'], publicBaseUrl: 'http://localhost:5678', mediaWebhookId: 'import-media-check', queue: { enabled: true, hours: [9, 14, 20], lowWatermark: 3, maxPendingPerChannel: 9 } };
  for (const node of workflow.nodes) {
    assert.equal(node.credentials, undefined);
    if (node.parameters.jsCode?.startsWith('const publisherConfig = ')) node.parameters.jsCode = node.parameters.jsCode.replace(/^const publisherConfig = .*;\r?\n/, () => 'const publisherConfig = ' + JSON.stringify(config) + ';\n');
    if (node.name === 'Telegram Trigger') {
      node.type = 'n8n-nodes-base.webhook'; node.typeVersion = 2; node.webhookId = 'list-import-check';
      node.parameters = { httpMethod: 'POST', path: 'list-import-check', responseMode: 'onReceived', options: {} };
    }
    if (node.name === 'Telegram Intake') node.parameters.jsCode = node.parameters.jsCode.replace('$input.first().json;', '$input.first().json.body;');
    if (node.name === 'Queue Schedule') node.disabled = true;
    if (node.name === 'Media Download') node.webhookId = config.mediaWebhookId;
    if (node.type === 'n8n-nodes-base.telegram' || ['Telegram Reply', 'Queue Notification'].includes(node.name)) {
      node.type = 'n8n-nodes-base.code'; node.typeVersion = 2;
      if (node.name === 'Download Import File') node.parameters = { jsCode: "const c=$('Telegram Intake').first().json;const files=JSON.parse(require('fs').readFileSync('/files/mock-files.json','utf8'));if(c.fileId==='bad-download')return[{json:{error:'Telegram download timeout'}}];const b=Buffer.from(files[c.fileId],'base64');return[{json:{},binary:{data:await this.helpers.prepareBinaryData(b,c.importFileName,c.importKind==='text'?'text/plain':c.importKind==='video'?'video/mp4':'image/png')}}];" };
      else if (['Telegram Reply', 'Queue Notification'].includes(node.name)) node.parameters = { jsCode: "const c=$input.first().json;require('fs').appendFileSync('/files/replies.jsonl',JSON.stringify(c)+'\\n');return[{json:" + (node.name === 'Queue Notification' ? '{ok:true}' : 'c') + '}];' };
      else if (node.name === 'Answer Queue Callback') node.parameters = { jsCode: 'return [{json:{ok:true}}];' };
      else node.parameters = { jsCode: "throw new Error('Unexpected Telegram/publishing route: " + node.name + "');" };
    }
    if (node.type === 'n8n-nodes-base.httpRequest') {
      node.type = 'n8n-nodes-base.code'; node.typeVersion = 2;
      if (node.name === 'Queue Account') node.parameters = { jsCode: "return [{json:{data:{account:{organizations:[{id:'test-org'}]}}}}];" };
      else if (node.name === 'Queue Channels') node.parameters = { jsCode: "return [{json:{data:{channels:['facebook','threads','tiktok'].map(service=>({id:service,service,name:service}))}}}];" };
      else if (node.name === 'Queue Pending Posts') node.parameters = { jsCode: 'return [{json:{data:{posts:{edges:[],pageInfo:{hasNextPage:false}}}}}];' };
      else if (node.name === 'Schedule Queue Post') node.parameters = { jsCode: "const work=$('Next Queue Work').itemMatching(0).json;require('fs').appendFileSync('/files/buffer-calls.jsonl',JSON.stringify(work)+'\\n');return[{json:{data:{createPost:{__typename:'PostActionSuccess',post:{id:'test-'+work.queuePostId+'-'+work.channelId,status:'scheduled'}}}}}];" };
      else node.parameters = { jsCode: "throw new Error('Unexpected external API route: " + node.name + "');" };
    }
  }
  workflow.settings.executionTimeout = 120;
  fs.writeFileSync(path.join(directory, 'workflow.json'), JSON.stringify(workflow));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=', 'base64');
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(12)]);
  fs.writeFileSync(path.join(directory, 'mock-files.json'), JSON.stringify({ text: Buffer.from('[POST01]\n💌 Caption một có dấu tiếng Việt.\n\n[POST03]\n' + (videoMode ? '/ai ' : '') + '✨ Caption ba.').toString('base64'), one: png.toString('base64'), two: Buffer.concat([png, Buffer.from('two')]).toString('base64'), three: videoMode ? mp4.toString('base64') : Buffer.concat([png, Buffer.from('three')]).toString('base64'), aliasVideo: Buffer.concat([mp4, Buffer.from('alias')]).toString('base64') }));
  console.log('Prepared credential-free import runtime fixture.');
} else {
  const lines = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  const state = () => fs.existsSync(queueFile) ? JSON.parse(fs.readFileSync(queueFile, 'utf8')) : { posts: [] };
  const batch = () => { const value = state(); return value.batches[value.batchSessions['456:456']]; };
  const wait = async (predicate, label) => { const end = Date.now() + 45000; while (Date.now() < end) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 150)); } throw new Error('Timed out: ' + label); };
  let id = 1;
  const send = async payload => { const response = await fetch('http://127.0.0.1:5680/webhook/list-import-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); assert.equal(response.status, 200); };
  const message = async extra => { const messageId = id++; await send({ message: { message_id: messageId, from: { id: 456 }, chat: { id: 456, type: 'private' }, ...extra } }); return messageId; };
  const text = async value => { const messageId = await message({ text: value }); await wait(() => lines(repliesFile).some(reply => reply.messageId === messageId), value); return lines(repliesFile).find(reply => reply.messageId === messageId); };
  const file = (fileName, fileId, group) => message({ document: { file_id: fileId, file_name: fileName, file_size: 500, mime_type: fileName.endsWith('.txt') ? 'text/plain' : 'image/png' }, ...(group ? { media_group_id: group } : {}) });
  const callback = (callbackId, token, batchId) => send({ callback_query: { id: callbackId, from: { id: 456 }, data: 'batch:confirm:' + batchId + ':' + token, message: { message_id: 900, chat: { id: 456, type: 'private' } } } });
  (async () => {
    const tomorrow = new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
    await text('/import start ' + tomorrow);
    await text('[POST02]\n📸 Caption hai, gửi trước nhưng ảnh gửi sau.');
    if (videoMode) await text('| Mã bài | Tên file | Content đăng bài |\n|---|---|---|\n| POST04 | IMG_2479.MP4 | Caption video có tên gốc |');
    const txt = await file('content.txt', 'text');
    await wait(() => lines(repliesFile).some(reply => reply.messageId === txt), 'TXT manifest parsed');
    if (videoMode) await message({ video: { file_id: 'three', file_name: 'POST03.mp4', file_size: 1000, mime_type: 'video/mp4' }, media_group_id: 'grouped-documents' });
    else await file('POST03.png', 'three', 'grouped-documents');
    await file('POST01.png', 'one', 'grouped-documents');
    await wait(() => Object.keys(batch().importFiles).length === 2, 'Two grouped documents stored separately');
    assert.match((await text('/import preview')).text, /POST02: thiếu/);
    assert.equal(lines(callsFile).length, 0);
    await file('POST02.png', 'two');
    if (videoMode) await file('IMG_2479.MP4', 'aliasVideo');
    const postCount = videoMode ? 4 : 3;
    await wait(() => Object.keys(batch().importFiles).length === postCount, 'All media files stored');
    const preview = await text('/import preview');
    assert.match(preview.text, /POST02 · POST02.png/);
    assert.ok(preview.text.indexOf('POST02 ·') < preview.text.indexOf('POST01 ·'));
    assert.equal(state().posts.filter(post => post.status === 'batch').length, postCount);
    assert.equal(lines(callsFile).length, 0, 'No scheduling before confirmation');
    const oldToken = batch().preview.token;
    const bad = await file('bad.txt', 'bad-download');
    await wait(() => lines(repliesFile).some(reply => reply.messageId === bad), 'Failed download is reported');
    assert.match(lines(repliesFile).find(reply => reply.messageId === bad).text, /Không tải được/);
    const batchId = batch().id;
    await callback('stale-confirm', oldToken, batchId);
    await wait(() => lines(repliesFile).some(reply => reply.callbackQueryId === 'stale-confirm'), 'Stale callback handled');
    assert.equal(lines(callsFile).length, 0);
    const assignments = batch().preview.assignments;
    const freshToken = batch().preview.token;
    await callback('confirm-once', freshToken, batchId);
    await wait(() => state().posts.filter(post => post.status === 'scheduled').length === postCount, 'All posts scheduled');
    await wait(() => lines(callsFile).length === postCount * 3, 'All posts across three mock channels');
    for (const assignment of assignments) {
      const post = state().posts.find(value => value.id === assignment.postId);
      assert.equal(post.dueAt, assignment.dueAt);
      assert.equal(post.targets.every(target => target.status === 'scheduled'), true);
      for (const call of lines(callsFile).filter(call => call.queuePostId === post.id)) {
        assert.equal(call.input.dueAt, assignment.dueAt);
        assert.equal(call.input.text, post.caption);
        assert.equal(call.input.assets.length, 1);
        const mediaType = post.mediaFiles[0].mediaType;
        assert.ok(call.input.assets[0][mediaType]?.url);
        assert.equal(!!call.input.assets[0][mediaType === 'video' ? 'image' : 'video'], false);
        if (mediaType === 'video' && call.channelId === 'tiktok') assert.equal(call.input.metadata.tiktok.isAiGenerated, post.isAiGenerated);
      }
    }
    await callback('confirm-once', freshToken, batchId);
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.equal(lines(callsFile).length, postCount * 3, 'Redelivery cannot reschedule posts');
    console.log('PASS real n8n import: text and TXT, grouped media, missing pairs, failed download, stale confirmation, exact caption/media/locked-time payloads, ' + postCount * 3 + ' mock schedules and no duplicate submissions.');
    if (videoMode) console.log('PASS native/document video import: original filename alias, correct video assets, TikTok AI metadata and 12 verified mock channel schedules.');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
