const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const endpoint = 'http://127.0.0.1:5680/webhook/social-menu-check';
// Only call the isolated local test instance; this script never calls Telegram.
if (process.argv.includes('--prepare')) {
  const w = JSON.parse(fs.readFileSync(path.join(root, 'workflows/telegram-menu.json'), 'utf8'));
  w.id = 'socialMenuWebhookCheck';
  w.name = 'Social Menu Runtime Test';
  const trigger = w.nodes[0];
  trigger.type = 'n8n-nodes-base.set';
  trigger.typeVersion = 3.4;
  trigger.parameters = { mode: 'raw', jsonOutput: '={{ $json.body }}', options: {} };
  w.nodes.unshift({ id: 'runtime-webhook', name: 'Runtime Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2,
    position: [-240, 0], webhookId: 'social-menu-check', parameters: { httpMethod: 'POST', path: 'social-menu-check', responseMode: 'lastNode', options: {} } });
  w.connections['Runtime Webhook'] = { main: [[{ node: 'Telegram Trigger', type: 'main', index: 0 }]] };
  for (const n of w.nodes) {
    if (n.name === 'Ensure Sessions Table') n.parameters.tableName = 'social_publisher_menu_test';
    if (n.name === 'Answer Callback') {
      n.type = 'n8n-nodes-base.noOp'; n.typeVersion = 1; n.parameters = {};
    }
    if (['Telegram Menu Reply', 'Service Options', 'Content Type Options'].includes(n.name)) {
      n.type = 'n8n-nodes-base.set'; n.typeVersion = 3.4;
      n.parameters = { assignments: { assignments: [
        { id: 'reply', name: 'reply', type: 'string', value: "={{ $('Telegram Menu Router').first().json.textHtml }}" },
        { id: 'post', name: 'post', type: 'object', value: "={{ $('Telegram Menu Router').first().json.masterPost }}" },
        { id: 'keyboard', name: 'keyboard', type: 'object', value: "={{ $('Telegram Menu Router').first().json.keyboard }}" },
      ] }, options: {} };
    }
  }
  fs.mkdirSync(path.join(root, 'temp'), { recursive: true });
  fs.writeFileSync(path.join(root, 'temp/menu-webhook-check.json'), JSON.stringify(w, null, 2));
  console.log('Prepared isolated runtime fixture temp/menu-webhook-check.json');
} else {
  (async () => {
    let seq = Date.now();
    const send = async (update) => {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ update_id: seq++, ...update }), signal: AbortSignal.timeout(20000) });
      assert.equal(r.status, 200);
      return r.json();
    };
    const message = (text, user = 456) => ({ message: { message_id: seq, from: { id: user }, chat: { id: user, type: 'private' }, text } });
    const click = (data, user = 456) => ({ callback_query: { id: `test-${seq}`, from: { id: user }, data, message: { message_id: seq, chat: { id: user, type: 'private' } } } });
    const pick = (reply, suffix) => reply.keyboard.rows.flatMap((r) => r.row.buttons).find((b) => b.additionalFields.callback_data.endsWith(suffix)).additionalFields.callback_data;
    let reply = await send(message('/new'));
    assert.equal(reply.keyboard.rows.length, 7);
    const oldButton = pick(reply, ':service:WEDDING');
    reply = await send(click(pick(reply, ':service:BIRTHDAY')));
    assert.equal(reply.keyboard.rows.length, 9);
    reply = await send(click(pick(reply, ':type:FEATURE')));
    assert.ok(reply.reply.includes('Sinh nhật'));
    reply = await send(message('Thiệp <online> & RSVP *test* 💌'));
    assert.equal(reply.post.service, 'BIRTHDAY');
    assert.equal(reply.post.contentType, 'FEATURE');
    assert.equal(reply.post.status, 'DRAFT');
    assert.ok(reply.reply.includes('&lt;online&gt; &amp;'));
    await send(message('/new'));
    reply = await send(click(oldButton));
    assert.ok(reply.reply.includes('phiên cũ'));
    reply = await send(message('/new', 789));
    reply = await send(click(pick(reply, ':service:WEDDING'), 789));
    await send(message('/cancel'));
    reply = await send(click(pick(reply, ':type:DEMO'), 789));
    assert.ok(reply.reply.includes('Thiệp cưới'));
    reply = await send({ message: { ...message(undefined, 789).message, photo: [{ file_id: 'runtime-photo' }], caption: 'Demo ảnh' } });
    assert.equal(reply.post.telegramFileId, 'runtime-photo');
    assert.equal(reply.post.mediaType, 'IMAGE');
    console.log('PASS real n8n HTTP executions: Data Table create/reuse, get/upsert, Code runner, both If branches, persistent selections, preview, stale callbacks, cancel, separate users, photo metadata.');
  })().catch((error) => { console.error(error); process.exitCode = 1; });
}
