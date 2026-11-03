// Run inside n8n. Validate Telegram's actual parameter and inline keyboard handling.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = '/usr/local/lib/node_modules/n8n/node_modules/';
const { Workflow } = require(base + 'n8n-workflow');
const { Telegram } = require(base + 'n8n-nodes-base/dist/nodes/Telegram/Telegram.node.js');
const { HttpRequest } = require(base + 'n8n-nodes-base/dist/nodes/HttpRequest/HttpRequest.node.js');
const { addReplyMarkup } = require(base + 'n8n-nodes-base/dist/nodes/Telegram/GenericFunctions.js');
const exported = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const spec = Array.isArray(exported) ? exported[0] : exported;
const workflow = new Workflow({ id: 'retry-native-check', nodes: spec.nodes, connections: spec.connections, active: false,
  nodeTypes: { getByNameAndVersion: (name, version) => name === 'n8n-nodes-base.telegram' ? new Telegram() : name === 'n8n-nodes-base.httpRequest' ? new HttpRequest().getNodeType(version) : { description: { name, properties: [], version: 1, inputs: ['main'], outputs: ['main'] } } },
});
for (const name of ['Queue Notification', 'Telegram Reply']) for (const retryMessageId of [110, undefined]) {
  const node = workflow.getNode(name);
  const input = [{ json: { retryMessageId, chatId: 456, messageId: 123, text: 'Kết quả' } }];
  const getNodeParameter = key => workflow.expression.getParameterValue(node.parameters[key], { resultData: { runData: {} } }, 0, 0, name, input, 'manual', {});
  const body = node.type === 'n8n-nodes-base.httpRequest' ? getNodeParameter('jsonBody') : {};
  if (node.type !== 'n8n-nodes-base.httpRequest') addReplyMarkup.call({ getNodeParameter }, body, 0);
  if (retryMessageId) assert.equal(body.reply_markup.inline_keyboard[0][0].callback_data, 'queue_retry:110');
  else if (node.type === 'n8n-nodes-base.httpRequest') assert.equal(body.reply_markup.inline_keyboard.length, 0);
  else assert.equal(body.reply_markup, undefined);
}
console.log('PASS native Telegram: retry button normalization and callback_data; no button on success.');
