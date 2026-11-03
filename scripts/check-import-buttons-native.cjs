// Run inside n8n against an exported publisher workflow.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = '/usr/local/lib/node_modules/n8n/node_modules/';
const { Workflow } = require(base + 'n8n-workflow');
const { HttpRequest } = require(base + 'n8n-nodes-base/dist/nodes/HttpRequest/HttpRequest.node.js');
const exported = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const spec = Array.isArray(exported) ? exported[0] : exported;
const source = spec.nodes.find(node => node.name === 'Handle Queue Command').parameters.jsCode;
const toolsSource = source.slice(0, source.indexOf('const context = $input.first().json;'));
const tools = new Function('require', toolsSource + ';return listImportTools;')(require);
const keyboard = tools.keyboard({ id: 'abcdef123456' });
const workflow = new Workflow({ id: 'import-buttons-check', nodes: spec.nodes, connections: spec.connections, active: false,
  nodeTypes: { getByNameAndVersion: (name, version) => name === 'n8n-nodes-base.httpRequest' ? new HttpRequest().getNodeType(version) : { description: { name, properties: [], version: 1, inputs: ['main'], outputs: ['main'] } } },
});
const node = workflow.getNode('Telegram Reply');
const input = [{ json: { calendarKeyboard: keyboard, chatId: 456, messageId: 123, text: 'Kiểm tra <nút>' } }];
const getNodeParameter = key => workflow.expression.getParameterValue(node.parameters[key], { resultData: { runData: {} } }, 0, 0, node.name, input, 'manual', {});
const body = getNodeParameter('jsonBody');
assert.equal(body.reply_markup.inline_keyboard.length, 3);
for (const row of body.reply_markup.inline_keyboard) for (const button of row) {
  assert.ok(button.text);
  assert.ok(Buffer.byteLength(button.callback_data) <= 64);
}
assert.equal(body.reply_markup.inline_keyboard[0][0].callback_data, 'import:preview:abcdef123456');
console.log('PASS native Telegram: import keyboard survives n8n normalization and produces valid callback_data.');
assert.equal(body.text, 'Kiểm tra &lt;nút&gt;');
assert.equal(body.chat_id, 456);
assert.equal(body.reply_to_message_id, 123);
