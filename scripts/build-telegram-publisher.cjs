const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'temp/telegram-publisher-config.json'), 'utf8'));
if (!config.allowedUserIds?.length || !config.allowedChatIds?.length || !config.services?.length) throw new Error('Cần allowlist Telegram và danh sách nền tảng.');
const buffer = JSON.parse(fs.readFileSync(path.join(root, 'workflows/buffer-publisher.json'), 'utf8'));
config.mediaWebhookId = buffer.nodes.find((item) => item.name === 'Media Download').webhookId;
config.albumQuietMs ??= 3000;
config.queue ??= { enabled: true, hours: [9, 14, 20], lowWatermark: 3, maxPendingPerChannel: 9 };
if (config.queue.enabled && JSON.stringify(config.queue.hours) !== '[9,14,20]') throw new Error('Khung giờ được duyệt: 09:00, 14:00, 20:00 giờ Việt Nam.');
const code = (name) => fs.readFileSync(path.join(root, `workflows/code/${name}.js`), 'utf8');
const inject = (name) => 'const publisherConfig = ' + JSON.stringify(config) + ';\n' + (name.startsWith('telegram-queue-') || name === 'telegram-album-intake' ? code('telegram-queue-store') + '\n' : '') + (name === 'telegram-album-intake' ? code('telegram-image-crop-intake') + '\n' : '') + (name === 'telegram-queue-command' ? code('telegram-calendar') + '\n' + code('telegram-bulk-plan') + '\n' : '') + code(name);
const node = (name, type, version, parameters, extra = {}) => ({ id: name.toLowerCase().replaceAll(' ', '-'), name, type: `n8n-nodes-base.${type}`, typeVersion: version, position: [0, 0], parameters, ...extra });
const condition = (key) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: key, leftValue: `={{ $json.${key} }}`, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} });
const http = buffer.nodes.find((item) => item.name === 'Read Buffer Account').parameters;
const oldPublish = buffer.nodes.find((item) => item.name === 'Publish TikTok');
const mutation = oldPublish.parameters.jsonBody.match(/query: ("(?:[^"\\]|\\.)*")/)[1];
const replyFields = { appendAttribution: false, parse_mode: 'HTML', reply_to_message_id: '={{ $json.messageId }}' };
const retryReplyMarkup = { replyMarkup: '={{ $json.calendarKeyboard || $json.retryMessageId ? "inlineKeyboard" : "none" }}', inlineKeyboard: '={{ $json.calendarKeyboard ?? { rows: [{ row: { buttons: [{ text: "🔄 Đăng lại kênh lỗi", additionalFields: { callback_data: "queue_retry:" + $json.retryMessageId } }] } }] } }}' };
const nodes = [
  node('Telegram Trigger', 'telegramTrigger', 1.5, { updates: ['message', 'callback_query'], additionalFields: { download: false, userIds: config.allowedUserIds.join(','), chatIds: config.allowedChatIds.join(',') } }, { webhookId: 'b9b17288-112f-48bf-912e-37113d0af7ac' }),
  node('Telegram Intake', 'code', 2, { jsCode: inject('telegram-album-intake') }),
  node('Is Crop Request', 'if', 2.2, condition('isCropRequest')),
  node('Download Crop Image', 'telegram', 1.2, { resource: 'file', operation: 'get', fileId: '={{ $json.fileId }}', download: true, additionalFields: {} }, { onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 }),
  node('Crop Long Image', 'httpRequest', 4.2, { method: 'POST', url: "={{ 'http://image-tools:3000/crop?output=' + (['parts', 'png'].includes($('Telegram Intake').first().json.cropOutput) ? $('Telegram Intake').first().json.cropOutput : 'collage') }}", sendBody: true, contentType: 'binaryData', inputDataFieldName: 'data', options: { timeout: 60000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } } }, { onError: 'continueRegularOutput', retryOnFail: false }),
  node('Prepare Crop Result', 'code', 2, { jsCode: inject('telegram-image-crop-result') }),
  node('Has Crop Result', 'if', 2.2, condition('hasCropResult')),
  node('Send Crop Image', 'telegram', 1.2, { resource: 'message', operation: 'sendDocument', chatId: '={{ $json.chatId }}', binaryData: true, binaryPropertyName: 'data', additionalFields: { caption: "={{ ($json.cropOutput === 'parts' ? '✂️ ZIP chứa 3 phần PNG gốc, không thu nhỏ.' : '✂️ Ảnh ghép ' + ($json.cropOutput === 'png' ? 'PNG' : 'JPG chất lượng cao') + '. Độ nét phụ thuộc file gốc.') + ($json.cropDownloadUrl ? '\\nTải trực tiếp (24 giờ): ' + $json.cropDownloadUrl : '') + '\\n/crop png — PNG; /crop parts — 3 phần gốc; /done — thoát.' }}", reply_to_message_id: '={{ $json.messageId }}', appendAttribution: false } }, { onError: 'continueRegularOutput', retryOnFail: false }),
  node('Record Crop Delivery', 'code', 2, { jsCode: code('telegram-image-crop-record') }),
  node('Is Album', 'if', 2.2, condition('isAlbum')),
  node('Wait For Album', 'wait', 1.1, { resume: 'timeInterval', amount: 5, unit: 'seconds' }, { webhookId: '259ba641-73be-4487-a968-684d0dd25de5' }),
  node('Collect Album', 'code', 2, { jsCode: inject('telegram-album-collect') }),
  node('Album Ready', 'if', 2.2, condition('albumReady')),
  node('Should Publish', 'if', 2.2, condition('shouldPublish')),
  node('Resolve Post', 'noOp', 1, {}),
  node('Is Batch Upload', 'if', 2.2, condition('batchUpload')),
  node('Telegram Accepted', 'telegram', 1.2, { resource: 'message', operation: 'sendMessage', chatId: '={{ $json.chatId }}', text: "={{ " + JSON.stringify(config.queue.enabled ? 'Đã nhận bài, đang tải ảnh/video để lưu nháp. Bài chỉ được xếp lịch sau khi bạn duyệt.' : 'Đã nhận bài, đang gửi đăng lên các nền tảng đã kết nối. Bot sẽ báo kết quả từng kênh tại đây.') + " + (" + JSON.stringify(config.services.includes('threads')) + " && Array.from($json.caption).length > 499 ? '\\nLưu ý: caption có ' + Array.from($json.caption).length + ' ký tự, vượt mức tối đa 499 ký tự đã cấu hình. Bot sẽ bỏ qua Threads, không gửi đăng lên Threads. Các nền tảng khác vẫn tiếp tục.' : '') }}", replyMarkup: 'none', additionalFields: replyFields }, { onError: 'continueRegularOutput' }),
  node('Expand Media', 'code', 2, { jsCode: "const context = $('Resolve Post').first().json; return context.media.map((medium) => ({ json: { ...context, ...medium }, pairedItem: { item: 0 } }));" }),
  node('Download Each Media', 'splitInBatches', 3, { batchSize: 1, options: {} }),
  node('Download Media', 'telegram', 1.2, { resource: 'file', operation: 'get', fileId: '={{ $json.fileId }}', download: true, additionalFields: {} }, { onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 }),
  node('Prepare Media', 'code', 2, { jsCode: inject('telegram-multi-prepare') }, { onError: 'continueErrorOutput' }),
  node('Store Media', 'readWriteFile', 1.1, { operation: 'write', fileName: '={{ $json.localFile }}', dataPropertyName: 'media', options: {} }, { onError: 'continueRegularOutput' }),
  node('Assemble Media', 'code', 2, { jsCode: "const context = $('Resolve Post').first().json; const items = $input.all(); if (items.length !== context.media.length || items.some((item) => item.json.error || !item.json.asset)) throw new Error('Chưa lưu đủ ảnh/video. Không đăng album thiếu ảnh.'); return [{ json: { ...context, assets: items.map((item) => item.json.asset), metadata: context.media[0].mediaType === 'video' ? { tiktok: { isAiGenerated: context.isAiGenerated } } : {} } }];" }, { onError: 'continueErrorOutput' }),
  ...['Read Buffer Account', 'Read Buffer Channels'].map((name) => ({ ...buffer.nodes.find((item) => item.name === name), credentials: undefined, onError: 'continueRegularOutput' })),
  node('Build Targets', 'code', 2, { jsCode: inject('telegram-multi-targets') }),
  node('Should Create Targets', 'if', 2.2, condition('shouldCreate')),
  node('Publish Channels', 'httpRequest', 4.2, { ...http, jsonBody: `={{ { query: ${mutation}, variables: { input: { channelId: $json.channelId, text: $json.caption, assets: $json.assets, mode: 'shareNow', schedulingType: 'automatic', needsApproval: false, saveToDraft: false, metadata: $json.metadata } } } }}` }, { onError: 'continueRegularOutput', retryOnFail: false }),
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
  node('Telegram Reply', 'telegram', 1.2, { resource: 'message', operation: 'sendMessage', chatId: '={{ $json.chatId }}', text: "={{ $json.text.slice(0, 3500).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }}", ...retryReplyMarkup, additionalFields: replyFields }),
  node('Save Content Draft', 'code', 2, { jsCode: inject('telegram-queue-save') }, { onError: 'continueErrorOutput' }),
  node('Is Queue Command', 'if', 2.2, condition('queueCommand')),
  node('Handle Queue Command', 'code', 2, { jsCode: inject('telegram-queue-command') }),
  node('Has Queue Callback', 'if', 2.2, { ...condition('callbackQueryId'), conditions: { ...condition('callbackQueryId').conditions, conditions: [{ ...condition('callbackQueryId').conditions.conditions[0], leftValue: '={{ Boolean($json.callbackQueryId) }}' }] } }),
  node('Answer Queue Callback', 'telegram', 1.2, { resource: 'callback', operation: 'answerQuery', queryId: '={{ $json.callbackQueryId }}', additionalFields: {} }, { onError: 'continueRegularOutput' }),
  node('Restore Queue Command', 'code', 2, { jsCode: "return $('Telegram Intake').all();" }),
  node('Run Queue After Reply', 'if', 2.2, { ...condition('runQueue'), conditions: { ...condition('runQueue').conditions, conditions: [{ ...condition('runQueue').conditions.conditions[0], leftValue: "={{ ($('Save Content Draft').isExecuted && $('Save Content Draft').first().json.runQueue === true) || ($('Handle Queue Command').isExecuted && $('Handle Queue Command').first().json.runQueue === true) }}" }] } }),
  node('Queue Schedule', 'scheduleTrigger', 1.2, { rule: { interval: [{ field: 'cronExpression', expression: '0 */5 * * * *' }] } }, { disabled: !config.queue.enabled }),
  node('Start Queue Worker', 'code', 2, { jsCode: inject('telegram-queue-start') }),
  node('Queue Needs Channels', 'if', 2.2, condition('needsChannels')),
  node('Queue Account', 'httpRequest', 4.2, { ...http }, { onError: 'continueRegularOutput', retryOnFail: false }),
  node('Queue Channels', 'httpRequest', 4.2, { ...http, jsonBody: "={{ { query: 'query GetChannels($input: ChannelsInput!) { channels(input: $input) { id name service isDisconnected isLocked } }', variables: { input: { organizationId: $json.data?.account?.organizations?.[0]?.id ?? '' } } } }}" }, { onError: 'continueRegularOutput', retryOnFail: false }),
  node('Queue Pending Posts', 'httpRequest', 4.2, { ...http, jsonBody: "={{ { query: 'query PendingQueuePosts($input: PostsInput!) { posts(first: 100, input: $input) { edges { node { id channelId dueAt } } pageInfo { hasNextPage } } }', variables: { input: { organizationId: $('Queue Account').first().json.data?.account?.organizations?.[0]?.id ?? '', filter: { status: ['scheduled', 'sending'], channelIds: $json.data?.channels?.filter(channel => " + JSON.stringify(config.services) + ".includes(channel.service)).map(channel => channel.id) ?? [] } } } } }}" }, { onError: 'continueRegularOutput', retryOnFail: false }),
  node('Next Queue Work', 'code', 2, { jsCode: inject('telegram-queue-work') }),
  node('Has Queue Work', 'if', 2.2, condition('hasWork')),
  node('Is Queue Notification', 'if', 2.2, { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: 'notify', leftValue: '={{ $json.action }}', rightValue: 'notify', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, options: {} }),
  node('Is Queue Create', 'if', 2.2, { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: 'create', leftValue: '={{ $json.action }}', rightValue: 'create', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, options: {} }),
  node('Schedule Queue Post', 'httpRequest', 4.2, { ...http, jsonBody: `={{ { query: ${mutation}, variables: { input: $json.input } } }}` }, { onError: 'continueRegularOutput', retryOnFail: false }),
  node('Read Queue Post Status', 'httpRequest', 4.2, { ...http, jsonBody: "={{ { query: 'query PostStatus($input: PostInput!) { post(input: $input) { id status externalLink error { message } } }', variables: { input: { id: $json.postId } } } }}" }, { onError: 'continueRegularOutput', retryOnFail: false }),
  node('Record Queue Result', 'code', 2, { jsCode: inject('telegram-queue-result') }),
  node('Queue Notification', 'telegram', 1.2, { resource: 'message', operation: 'sendMessage', chatId: '={{ $json.chatId }}', text: "={{ $json.text.slice(0, 3500).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }}", ...retryReplyMarkup, additionalFields: { appendAttribution: false, parse_mode: 'HTML' } }, { onError: 'continueRegularOutput', retryOnFail: false }),
  node('Record Queue Notification', 'code', 2, { jsCode: inject('telegram-queue-notified') }),
  node('Is Queue Retry', 'if', 2.2, { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: 'retry', leftValue: '={{ $json.action }}', rightValue: 'retry', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, options: {} }),
  node('Has Retry Post', 'if', 2.2, condition('hasPostId')),
  node('Read Retry Post', 'httpRequest', 4.2, { ...http, jsonBody: "={{ { query: 'query RetryPostStatus($input: PostInput!) { post(input: $input) { id status channelId text externalLink error { message } } }', variables: { input: { id: $json.postId } } } }}" }, { onError: 'continueRegularOutput', retryOnFail: false }),
  node('Prepare Queue Retry', 'code', 2, { jsCode: inject('telegram-queue-prepare-retry') }),
  node('Has Prepared Retry', 'if', 2.2, condition('hasRetry')),
  node('Expand Retry Media', 'code', 2, { jsCode: "const context = $input.first().json; return context.mediaFiles.map((medium, index) => ({ json: { url: context.input.assets[index][medium.mediaType].url }, pairedItem: { item: 0 } }));" }),
  node('Download Retry Media', 'httpRequest', 4.2, { method: 'GET', url: '={{ $json.url }}', options: { timeout: 30000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } } }, { onError: 'continueRegularOutput', retryOnFail: false }),
  node('Verify Retry Media', 'code', 2, { jsCode: inject('telegram-queue-verify-retry') }),
  node('Has Verified Retry', 'if', 2.2, condition('hasVerifiedRetry')),
  node('Publish Queue Retry', 'httpRequest', 4.2, { ...http, jsonBody: `={{ { query: $json.retryKind === 'edit' ? 'mutation RetryPost($input: EditPostInput!) { editPost(input: $input) { __typename ... on PostActionSuccess { post { id status externalLink error { message } } } ... on MutationError { message } } }' : ${mutation}, variables: { input: $json.input } } }}` }, { onError: 'continueRegularOutput', retryOnFail: false }),
];
for (const name of ['Media Download', 'Check Media Link', 'Read Media File', 'Serve Media File']) nodes.push(structuredClone(buffer.nodes.find((item) => item.name === name)));
nodes.find((item) => item.name === 'Check Media Link').parameters.jsCode = code('telegram-publisher-media-request');
Object.assign(nodes.find((item) => item.name === 'Media Download').parameters, { multipleMethods: true, httpMethod: ['GET', 'HEAD'] });
const connections = {};
const link = (from, to, output = 0) => { connections[from] ??= { main: [] }; connections[from].main[output] = [{ node: to, type: 'main', index: 0 }]; };
for (const sequence of [
  ['Telegram Trigger', 'Telegram Intake', 'Is Album', 'Wait For Album', 'Collect Album', 'Album Ready', 'Should Publish', 'Resolve Post', 'Telegram Accepted', 'Expand Media', 'Download Each Media', 'Prepare Media', 'Store Media', 'Assemble Media', 'Read Buffer Account', 'Read Buffer Channels', 'Build Targets', 'Should Create Targets', 'Publish Channels', 'Parse Publish Result', 'Record Targets', 'Summarize Results', 'Still Processing', 'Wait For Buffer', 'Build Status Requests', 'Has Status Requests', 'Read Post Status', 'Parse Status Result', 'Record Targets'],
  ['Report Preparation Failure', 'Summarize Results'],
  ['Media Download', 'Check Media Link', 'Read Media File', 'Serve Media File'],
]) for (let i = 0; i < sequence.length - 1; i++) link(sequence[i], sequence[i + 1]);
link('Telegram Intake', 'Is Crop Request'); link('Is Crop Request', 'Download Crop Image'); link('Is Crop Request', 'Is Album', 1);
link('Resolve Post', 'Is Batch Upload'); link('Is Batch Upload', 'Expand Media'); link('Is Batch Upload', 'Telegram Accepted', 1);
for (const sequence of [['Download Crop Image', 'Crop Long Image', 'Prepare Crop Result', 'Has Crop Result', 'Send Crop Image', 'Record Crop Delivery', 'Telegram Reply']]) for (let i = 0; i < sequence.length - 1; i++) link(sequence[i], sequence[i + 1]);
link('Has Crop Result', 'Telegram Reply', 1);
link('Is Album', 'Should Publish', 1); link('Album Ready', 'Wait For Album', 1);
link('Download Each Media', 'Download Media', 1); link('Download Media', 'Download Each Media');
link('Should Publish', 'Is Queue Command', 1); link('Is Queue Command', 'Has Queue Callback'); link('Is Queue Command', 'Is Status Request', 1);
link('Has Queue Callback', 'Answer Queue Callback'); link('Has Queue Callback', 'Handle Queue Command', 1); link('Answer Queue Callback', 'Restore Queue Command'); link('Restore Queue Command', 'Handle Queue Command');
link('Handle Queue Command', 'Telegram Reply'); link('Is Status Request', 'Build Status Requests'); link('Is Status Request', 'Telegram Reply', 1);
link('Should Create Targets', 'Summarize Results', 1); link('Has Status Requests', 'Summarize Results', 1);
link('Still Processing', 'Telegram Reply', 1); link('Media Download', 'Check Media Link', 1);
for (const name of ['Prepare Media', 'Assemble Media']) link(name, 'Report Preparation Failure', 1);
if (config.queue.enabled) link('Assemble Media', 'Save Content Draft');
link('Save Content Draft', 'Telegram Reply'); link('Save Content Draft', 'Report Preparation Failure', 1);
link('Telegram Reply', 'Run Queue After Reply'); link('Run Queue After Reply', 'Start Queue Worker');
for (const sequence of [
  ['Queue Schedule', 'Start Queue Worker', 'Queue Needs Channels', 'Queue Account', 'Queue Channels', 'Queue Pending Posts', 'Next Queue Work', 'Has Queue Work', 'Is Queue Notification', 'Queue Notification', 'Record Queue Notification', 'Next Queue Work'],
  ['Schedule Queue Post', 'Record Queue Result', 'Next Queue Work'],
  ['Read Queue Post Status', 'Record Queue Result'],
]) for (let i = 0; i < sequence.length - 1; i++) link(sequence[i], sequence[i + 1]);
link('Is Queue Notification', 'Is Queue Retry', 1); link('Is Queue Retry', 'Has Retry Post'); link('Is Queue Retry', 'Is Queue Create', 1);
link('Has Retry Post', 'Read Retry Post'); link('Has Retry Post', 'Prepare Queue Retry', 1); link('Read Retry Post', 'Prepare Queue Retry');
for (const sequence of [['Prepare Queue Retry', 'Has Prepared Retry', 'Expand Retry Media', 'Download Retry Media', 'Verify Retry Media', 'Has Verified Retry', 'Publish Queue Retry', 'Record Queue Result']]) for (let i = 0; i < sequence.length - 1; i++) link(sequence[i], sequence[i + 1]);
link('Has Prepared Retry', 'Next Queue Work', 1); link('Has Verified Retry', 'Next Queue Work', 1);
link('Is Queue Create', 'Schedule Queue Post'); link('Is Queue Create', 'Read Queue Post Status', 1);
link('Queue Needs Channels', 'Next Queue Work', 1);
// Keep the main route left to right; the two loops and public media route sit below it.
for (let i = 0; i < nodes.length; i++) nodes[i].position = [(i % 8) * 240, Math.floor(i / 8) * 240];
const workflow = { name: 'Social Publisher - Telegram Multi Platform', nodes, connections, settings: { executionOrder: 'v1', timezone: 'Asia/Ho_Chi_Minh', executionTimeout: 600 }, active: false, pinData: {}, tags: [] };
fs.writeFileSync(path.join(root, 'workflows/telegram-publisher.json'), JSON.stringify(workflow, null, 2) + '\n');
console.log('Built Telegram album + multi-platform publisher without credentials.');
