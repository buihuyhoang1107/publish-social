// Run inside the n8n image. Exercises n8n's parameter normalization and Telegram markup builder.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const base = '/usr/local/lib/node_modules/n8n/node_modules/';
const { Workflow } = require(base + 'n8n-workflow');
const { Telegram } = require(base + 'n8n-nodes-base/dist/nodes/Telegram/Telegram.node.js');
const { addReplyMarkup } = require(base + 'n8n-nodes-base/dist/nodes/Telegram/GenericFunctions.js');
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const code = spec.nodes.find((n) => n.name === 'Telegram Menu Router').parameters.jsCode;
const run = (update, previous) => JSON.parse(JSON.stringify(vm.runInNewContext(`(() => { ${code}\n })()`, {
  $: () => ({ first: () => ({ json: update }) }),
  $input: { first: () => ({ json: { sessionJson: previous?.sessionJson } }) },
})[0].json));
const service = run({ update_id: 100, message: { chat: { id: 1, type: 'private' }, from: { id: 1 }, text: '/new' } });
const type = run({ update_id: 101, callback_query: { from: { id: 1 }, data: 'sp:2s:service:WEDDING', message: { chat: { id: 1, type: 'private' } } } }, service);
const content = run({ update_id: 102, callback_query: { from: { id: 1 }, data: 'sp:2s:type:FEATURE', message: { chat: { id: 1, type: 'private' } } } }, type);
const preview = run({ update_id: 103, message: { message_id: 4, chat: { id: 1, type: 'private' }, from: { id: 1 }, text: 'Native approval test' } }, content);
const workflow = new Workflow({ id: 'native-menu-test', nodes: spec.nodes, connections: spec.connections, active: false,
  nodeTypes: { getByNameAndVersion: (name) => name === 'n8n-nodes-base.telegram' ? new Telegram() : {
    description: { name, properties: [], version: 1, inputs: ['main'], outputs: ['main'] },
  } },
});
for (const [name, reply, expectedRows] of [['Service Options', service, 7], ['Content Type Options', type, 9], ['Preview Actions', preview, 3]]) {
  const node = workflow.getNode(name);
  assert.equal(typeof node.parameters.inlineKeyboard, 'object');
  assert.equal(node.parameters.inlineKeyboard.rows.length, expectedRows, 'Keyboard must survive n8n normalization');
  const runData = { resultData: { runData: { 'Telegram Menu Router': [{
    startTime: Date.now(), executionTime: 0, source: [], data: { main: [[{ json: reply }]] },
  }] } } };
  const getNodeParameter = (key) => workflow.expression.getParameterValue(
    node.parameters[key], runData, 0, 0, node.name, [{ json: {} }], 'manual', {},
  );
  const body = {};
  addReplyMarkup.call({ getNodeParameter }, body, 0);
  assert.equal(body.reply_markup.inline_keyboard.length, expectedRows);
  for (let i = 0; i < expectedRows; i++) {
    const actual = body.reply_markup.inline_keyboard[i][0];
    const expected = reply.keyboard.rows[i].row.buttons[0];
    assert.equal(actual.text, expected.text);
    assert.equal(actual.callback_data, expected.additionalFields.callback_data);
  }
}
console.log('PASS native n8n normalization, expressions, Telegram reply_markup: 7 services, 9 content types, 3 preview actions. No Telegram API called.');
