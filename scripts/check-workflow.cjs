const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const workflow = read('workflows/telegram-intake.json');
const sample = read('samples/telegram-text.json');
const expected = read('samples/master-post.json');
const [trigger, master, preview] = workflow.nodes;
const evaluate = (value, $json) => {
  if (typeof value !== 'string' || !value.startsWith('={{')) return value;
  // Offline JavaScript check only; n8n import/runtime is verified separately.
  const result = vm.runInNewContext(`(${value.slice(3, -2)})`, { $json }, { timeout: 1000 });
  return JSON.parse(JSON.stringify(result));
};
const build = (input) => Object.fromEntries(master.parameters.assignments.assignments.map(
  (field) => [field.name, evaluate(field.value, input)],
));
const render = (post) => evaluate(preview.parameters.text, post);

assert.equal(workflow.active, false);
assert.equal(workflow.nodes.length, 3);
assert.equal(trigger.type, 'n8n-nodes-base.telegramTrigger');
assert.deepEqual(trigger.parameters.updates, ['message']);
assert.equal(trigger.parameters.additionalFields.download, true);
assert.equal(master.type, 'n8n-nodes-base.set');
assert.equal(preview.type, 'n8n-nodes-base.telegram');
assert.equal(preview.parameters.operation, 'sendMessage');
assert.equal(preview.parameters.additionalFields.parse_mode, undefined);
assert.equal(preview.parameters.additionalFields.appendAttribution, false);
for (const node of workflow.nodes) assert.equal(node.credentials, undefined);
assert.deepEqual(workflow.connections[trigger.name].main[0], [{ node: master.name, type: 'main', index: 0 }]);
assert.deepEqual(workflow.connections[master.name].main[0], [{ node: preview.name, type: 'main', index: 0 }]);

const post = build(sample);
assert.deepEqual(post, expected);
assert.equal(evaluate(preview.parameters.chatId, post), sample.message.chat.id);
assert.ok(render(post).startsWith('PREVIEW BAI DANG'));
assert.ok(render(post).includes(sample.message.text));
assert.ok(render(post).includes('Trang thai: DRAFT'));
for (const platform of post.platforms) assert.ok(render(post).includes(`${platform} YES`));

const literal = 'Thiệp cưới <online> & RSVP *test* _demo_ [mẫu] 💌';
assert.ok(render(build({ message: { chat: { id: -100123 }, text: literal } })).includes(literal));
const long = build({ message: { chat: { id: 1 }, text: '💌'.repeat(2048) } });
assert.equal(long.content.length, 4096);
assert.ok(render(long).length <= 4096);
assert.ok(render(long).includes('Preview rut gon'));
const media = build({ message: { chat: { id: 1 }, photo: [{ file_id: 'sample' }] } });
assert.equal(media.content, '');
assert.ok(render(media).includes('V1 chi nhan text'));
console.log('PASS: workflow structure, Master Post, routing, plain text, long preview, non-text guidance.');
console.log('NOT_RUN: n8n expression engine and live Telegram webhook/credentials.');
