// Runs against an isolated n8n instance. Telegram is mocked; image-tools is real.
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const directory = '/tmp/telegram-crop-hq-runtime';
const files = directory + '/files';
if (process.argv.includes('--prepare')) {
  fs.mkdirSync(files, { recursive: true });
  for (const name of ['result.jpg', 'result.png', 'parts.zip', 'deliveries.jsonl', 'replies.jsonl', 'telegram-crop-456-2.json', 'telegram-crop-456-4.json', 'telegram-crop-456-6.json']) if (fs.existsSync(files + '/' + name)) fs.unlinkSync(files + '/' + name);
  const workflow = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  workflow.id = 'cropRuntime'; workflow.versionId = crypto.randomUUID(); workflow.name = 'Crop isolated runtime';
  const config = { allowedUserIds: [456], allowedChatIds: [456], services: ['facebook'], publicBaseUrl: 'http://127.0.0.1:5680', mediaWebhookId: workflow.nodes.find(node => node.name === 'Media Download').webhookId, queue: { enabled: true, hours: [9, 14, 20], lowWatermark: 3, maxPendingPerChannel: 9 } };
  for (const node of workflow.nodes) {
    assert.equal(node.credentials, undefined);
    if (node.parameters.jsCode?.startsWith('const publisherConfig = ')) node.parameters.jsCode = node.parameters.jsCode.replace(/^const publisherConfig = .*;\r?\n/, () => 'const publisherConfig = ' + JSON.stringify(config) + ';\n');
    if (node.parameters.jsCode) node.parameters.jsCode = node.parameters.jsCode.replaceAll('/files/', files + '/').replaceAll("readdirSync('/files')", "readdirSync('" + files + "')");
    if (node.name === 'Telegram Trigger') {
      node.type = 'n8n-nodes-base.webhook'; node.typeVersion = 2; node.webhookId = 'crop-check';
      node.parameters = { httpMethod: 'POST', path: 'crop-check', responseMode: 'onReceived', options: {} };
    }
    if (node.name === 'Telegram Intake') node.parameters.jsCode = node.parameters.jsCode.replace('$input.first().json;', '$input.first().json.body;');
    if (node.name === 'Queue Schedule') node.disabled = true;
    if (node.type === 'n8n-nodes-base.telegram' || node.name === 'Telegram Reply') {
      node.type = 'n8n-nodes-base.code'; node.typeVersion = 2;
      if (node.name === 'Download Crop Image') node.parameters = { jsCode: "const fs=require('fs'); return [{json:{},binary:{data:await this.helpers.prepareBinaryData(fs.readFileSync('" + files + "/source.jpg'),'source.jpg','image/jpeg')}}];" };
      else if (node.name === 'Send Crop Image') node.parameters = { jsCode: "const fs=require('fs');const item=$input.first();const bytes=await this.helpers.getBinaryDataBuffer(0,'data');const file=item.json.cropOutput==='parts'?'parts.zip':item.json.cropOutput==='png'?'result.png':'result.jpg';fs.writeFileSync('" + files + "/'+file,bytes);fs.appendFileSync('" + files + "/deliveries.jsonl',JSON.stringify({file,url:item.json.cropDownloadUrl,name:item.binary.data.fileName})+'\\n');return [{json:{ok:true,result:{message_id:999,document:{file_id:'test-crop'}}}}];" };
      else if (node.name === 'Crop Accepted') node.parameters = { jsCode: "return [{json:{ok:true,result:{message_id:998}}}];" };
      else if (node.name === 'Telegram Reply') node.parameters = { jsCode: "require('fs').appendFileSync('" + files + "/replies.jsonl',JSON.stringify($input.first().json)+'\\n');return $input.all();" };
      else node.parameters = { jsCode: "throw new Error('Crop reached unexpected publishing/Telegram node');" };
    }
    if (node.type === 'n8n-nodes-base.httpRequest' && node.name !== 'Crop Long Image') {
      node.type = 'n8n-nodes-base.code'; node.typeVersion = 2; node.parameters = { jsCode: "throw new Error('Crop must never call Buffer');" };
    }
    if (node.name === 'Crop Long Image' && process.env.CROP_TEST_SERVICE_URL) node.parameters.url = node.parameters.url.replace('http://image-tools:3000', process.env.CROP_TEST_SERVICE_URL);
  }
  fs.writeFileSync(directory + '/workflow.json', JSON.stringify(workflow));
  fs.writeFileSync(files + '/telegram-content-queue.json', JSON.stringify({ version: 1, posts: [], commands: {}, notices: [], lowNotified: {} }));
  console.log('Prepared crop fixture with no credentials, disabled scheduler and publishing traps.');
} else {
  (async () => {
    const wait = async predicate => { for (let attempt = 0; attempt < 200; attempt++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 150)); } throw new Error('Crop runtime timed out'); };
    const replies = () => fs.existsSync(files + '/replies.jsonl') ? fs.readFileSync(files + '/replies.jsonl', 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
    const send = async message => {
      const response = await fetch('http://127.0.0.1:5680/webhook/crop-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: { chat: { id: 456, type: 'private' }, from: { id: 456 }, ...message } }) });
      assert.equal(response.status, 200);
    };
    await send({ message_id: 1, text: '/crop' }); await wait(() => replies().some(reply => reply.messageId === 1));
    const image = { message_id: 2, document: { file_id: 'test-image', file_size: fs.statSync(files + '/source.jpg').size, mime_type: 'image/jpeg', file_name: 'long.jpg' } };
    await send(image); await wait(() => fs.existsSync(files + '/result.jpg'));
    await wait(() => JSON.parse(fs.readFileSync(files + '/telegram-crop-456-2.json', 'utf8')).status === 'sent');
    assert.equal(fs.readFileSync(files + '/result.jpg').readUInt16BE(0), 0xffd8);
    const modified = fs.statSync(files + '/result.jpg').mtimeMs;
    await send(image); await new Promise(resolve => setTimeout(resolve, 700)); assert.equal(fs.statSync(files + '/result.jpg').mtimeMs, modified);
    await send({ message_id: 3, text: '/crop parts' }); await wait(() => replies().some(reply => reply.messageId === 3));
    await send({ ...image, message_id: 4 }); await wait(() => fs.existsSync(files + '/parts.zip'));
    await wait(() => JSON.parse(fs.readFileSync(files + '/telegram-crop-456-4.json', 'utf8')).status === 'sent');
    assert.equal(fs.readFileSync(files + '/parts.zip').readUInt32LE(0), 0x04034b50);
    assert.deepEqual(JSON.parse(fs.readFileSync(files + '/telegram-content-queue.json', 'utf8')).posts, []);
    await send({ message_id: 5, text: '/crop png' }); await wait(() => replies().some(reply => reply.messageId === 5));
    await send({ ...image, message_id: 6 }); await wait(() => fs.existsSync(files + '/result.png'));
    await wait(() => JSON.parse(fs.readFileSync(files + '/telegram-crop-456-6.json', 'utf8')).status === 'sent');
    const result = fs.readFileSync(files + '/result.png'); assert.equal(result.subarray(1, 4).toString(), 'PNG');
    assert.equal(result.readUInt32BE(16), 3240); assert.equal(result.readUInt32BE(20), 5760);
    const deliveries = fs.readFileSync(files + '/deliveries.jsonl', 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert.equal(deliveries.length, 3);
    for (const delivery of deliveries) {
      assert.ok(delivery.name.startsWith('long-'));
      const response = await fetch(delivery.url); assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(files + '/' + delivery.file));
    }
    await send({ message_id: 7, text: '/done' }); await wait(() => replies().some(reply => reply.messageId === 7));
    assert.equal(JSON.parse(fs.readFileSync(files + '/telegram-content-queue.json', 'utf8')).cropSessions['456:456'], undefined);
    console.log('PASS real n8n crop: JPG/PNG/ZIP, unique source names, byte-exact direct downloads, delivery confirmation, dedup, /done and no Buffer/queue writes.');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
