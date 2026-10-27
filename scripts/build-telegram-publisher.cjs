const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'temp/telegram-publisher-config.json'), 'utf8'));
if (!config.allowedUserIds?.length || !config.allowedChatIds?.length || !config.services?.length) throw new Error('Cần allowlist Telegram và danh sách nền tảng.');
const buffer = JSON.parse(fs.readFileSync(path.join(root, 'workflows/buffer-publisher.json'), 'utf8'));
config.mediaWebhookId = buffer.nodes.find((item) => item.name === 'Video Download').webhookId;
config.albumQuietMs ??= 3000;
const code = (name) => fs.readFileSync(path.join(root, `workflows/code/${name}.js`), 'utf8');
const inject = (name) => 'const publisherConfig = ' + JSON.stringify(config) + ';\n' + code(name);
const node = (name, type, version, parameters, extra = {}) => ({ id: name.toLowerCase().replaceAll(' ', '-'), name, type: `n8n-nodes-base.${type}`, typeVersion: version, position: [0, 0], parameters, ...extra });
const condition = (key) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: key, leftValue: `={{ $json.${key} }}`, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} });
const http = buffer.nodes.find((item) => item.name === 'Read Buffer Account').parameters;
const oldPublish = buffer.nodes.find((item) => item.name === 'Publish TikTok');
const mutation = oldPublish.parameters.jsonBody.match(/query: ("(?:[^"\\]|\\.)*")/)[1];
const replyFields = { appendAttribution: false, parse_mode: 'HTML', reply_to_message_id: '={{ $json.messageId }}' };
const nodes = [
  node('Telegram Trigger', 'telegramTrigger', 1.5, { updates: ['message'], additionalFields: { download: false, userIds: config.allowedUserIds.join(','), chatIds: config.allowedChatIds.join(',') } }, { webhookId: 'b9b17288-112f-48bf-912e-37113d0af7ac' }),
  node('Telegram Intake', 'code', 2, { jsCode: inject('telegram-album-intake') }),
  node('Is Album', 'if', 2.2, condition('isAlbum')),
  node('Wait For Album', 'wait', 1.1, { resume: 'timeInterval', amount: 5, unit: 'seconds' }, { webhookId: '259ba641-73be-4487-a968-684d0dd25de5' }),
  node('Collect Album', 'code', 2, { jsCode: inject('telegram-album-collect') }),
  node('Album Ready', 'if', 2.2, condition('albumReady')),
  node('Should Publish', 'if', 2.2, condition('shouldPublish')),
  node('Resolve Post', 'noOp', 1, {}),
  node('Telegram Accepted', 'telegram', 1.2, { resource: 'message', operation: 'sendMessage', chatId: '={{ $json.chatId }}', text: 'Đã nhận bài, đang gửi đăng lên các nền tảng đã kết nối. Bot sẽ báo kết quả từng kênh tại đây.', replyMarkup: 'none', additionalFields: replyFields }, { onError: 'continueRegularOutput' }),
  node('Expand Media', 'code', 2, { jsCode: "const context = $('Resolve Post').first().json; return context.media.map((medium) => ({ json: { ...context, ...medium }, pairedItem: { item: 0 } }));" }),
  node('Download Media', 'telegram', 1.2, { resource: 'file', operation: 'get', fileId: '={{ $json.fileId }}', download: true, additionalFields: {} }, { onError: 'continueRegularOutput' }),
  node('Prepare Media', 'code', 2, { jsCode: inject('telegram-multi-prepare') }, { onError: 'continueErrorOutput' }),
  node('Store Media', 'readWriteFile', 1.1, { operation: 'write', fileName: '={{ $json.localFile }}', dataPropertyName: 'media', options: {} }, { onError: 'continueRegularOutput' }),
  node('Assemble Media', 'code', 2, { jsCode: "const context = $('Resolve Post').first().json; const items = $input.all(); if (items.length !== context.media.length || items.some((item) => item.json.error || !item.json.asset)) throw new Error('Chưa lưu đủ ảnh/video. Không đăng album thiếu ảnh.'); return [{ json: { ...context, assets: items.map((item) => item.json.asset), metadata: context.media[0].mediaType === 'video' ? { tiktok: { isAiGenerated: context.isAiGenerated } } : {} } }];" }, { onError: 'continueErrorOutput' }),
  ...['Read Buffer Account', 'Read Buffer Channels'].map((name) => ({ ...buffer.nodes.find((item) => item.name === name), credentials: undefined, onError: 'continueRegularOutput' })),
  node('Build Targets', 'code', 2, { jsCode: inject('telegram-multi-targets') }),
  node('Should Create Targets', 'if', 2.2, condition('shouldCreate')),
  node('Publish Channels', 'httpRequest', 4.2, { ...http, jsonBody: `={{ { query: ${mutation}, variables: { input: { channelId: $json.channelId, text: $json.caption, assets: $json.assets, mode: 'shareNow', schedulingType: 'automatic', needsApproval: false, saveToDraft: false, metadata: $json.service === 'tiktok' ? $json.metadata : {} } } } }}` }, { onError: 'continueRegularOutput', retryOnFail: false }),
  node('Parse Publish Result', 'code', 2, { jsCode: "const resultSource = 'Build Targets';\n" + code('telegram-multi-result') }),
  node('Record Targets', 'code', 2, { jsCode: code('telegram-multi-record') }),
  node('Summarize Results', 'code', 2, { jsCode: code('telegram-multi-summary') }),
  node('Still Processing', 'if', 2.2, condition('shouldPoll')),
  node('Wait For Buffer', 'wait', 1.1, { resume: 'timeInterval', amount: 5, unit: 'seconds' }, { webhookId: 'd051d9c2-d735-4440-95e9-2f60870cb498' }),
  node('Build Status Requests', 'code', 2, { jsCode: code('telegram-multi-status') }),
  node('Has Status Requests', 'if', 2.2, condition('hasStatusRequests')),
  { ...buffer.nodes.find((item) => item.name === 'Read Post Status'), credentials: undefined, onError: 'continueRegularOutput', retryOnFail: false },
  node('Parse Status Result', 'code', 2, { jsCode: "const resultSource = 'Build Status Requests';\n" + code('telegram-multi-result') }),
  node('Is Status Request', 'if', 2.2, condition('queryStatus')),
  node('Report Preparation Failure', 'code', 2, { jsCode: "const context = $('Resolve Post').first().json; return [{ json: { ...context, failureMessage: 'Không tải/lưu đủ ảnh hoặc video. Toàn bộ bài chưa được gửi đăng.' } }];" }),
  node('Telegram Reply', 'telegram', 1.2, { resource: 'message', operation: 'sendMessage', chatId: '={{ $json.chatId }}', text: "={{ $json.text.slice(0, 3500).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }}", replyMarkup: 'none', additionalFields: replyFields }),
];
for (const name of ['Video Download', 'Check Media Link', 'Read Video', 'Send Video']) nodes.push(structuredClone(buffer.nodes.find((item) => item.name === name)));
nodes.find((item) => item.name === 'Check Media Link').parameters.jsCode = code('telegram-publisher-media-request');
Object.assign(nodes.find((item) => item.name === 'Video Download').parameters, { multipleMethods: true, httpMethod: ['GET', 'HEAD'] });
const connections = {};
const link = (from, to, output = 0) => { connections[from] ??= { main: [] }; connections[from].main[output] = [{ node: to, type: 'main', index: 0 }]; };
for (const sequence of [
  ['Telegram Trigger', 'Telegram Intake', 'Is Album', 'Wait For Album', 'Collect Album', 'Album Ready', 'Should Publish', 'Resolve Post', 'Telegram Accepted', 'Expand Media', 'Download Media', 'Prepare Media', 'Store Media', 'Assemble Media', 'Read Buffer Account', 'Read Buffer Channels', 'Build Targets', 'Should Create Targets', 'Publish Channels', 'Parse Publish Result', 'Record Targets', 'Summarize Results', 'Still Processing', 'Wait For Buffer', 'Build Status Requests', 'Has Status Requests', 'Read Post Status', 'Parse Status Result', 'Record Targets'],
  ['Report Preparation Failure', 'Summarize Results'],
  ['Video Download', 'Check Media Link', 'Read Video', 'Send Video'],
]) for (let i = 0; i < sequence.length - 1; i++) link(sequence[i], sequence[i + 1]);
link('Is Album', 'Should Publish', 1); link('Album Ready', 'Wait For Album', 1);
link('Should Publish', 'Is Status Request', 1); link('Is Status Request', 'Build Status Requests'); link('Is Status Request', 'Telegram Reply', 1);
link('Should Create Targets', 'Summarize Results', 1); link('Has Status Requests', 'Summarize Results', 1);
link('Still Processing', 'Telegram Reply', 1); link('Video Download', 'Check Media Link', 1);
for (const name of ['Prepare Media', 'Assemble Media']) link(name, 'Report Preparation Failure', 1);
// Keep the main route left to right; the two loops and public media route sit below it.
for (let i = 0; i < nodes.length; i++) nodes[i].position = [(i % 8) * 240, Math.floor(i / 8) * 240];
const workflow = { name: 'Social Publisher - Telegram Multi Platform', nodes, connections, settings: { executionOrder: 'v1', timezone: 'Asia/Ho_Chi_Minh', executionTimeout: 600 }, active: false, pinData: {}, tags: [] };
fs.writeFileSync(path.join(root, 'workflows/telegram-publisher.json'), JSON.stringify(workflow, null, 2) + '\n');
console.log('Built Telegram album + multi-platform publisher without credentials.');
