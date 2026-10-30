const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'workflows/buffer-publisher.json');
const w = JSON.parse(fs.readFileSync(file, 'utf8'));
const channels = JSON.parse(fs.readFileSync(path.join(root, 'temp/buffer-channels-verified.json'), 'utf8')).channels;
const channel = channels.find((item) => item.service === 'tiktok' && item.name === 'thieponline.org');
if (!channel || channel.isDisconnected || channel.isLocked) throw new Error('Kênh TikTok chưa sẵn sàng.');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const publicBaseUrl = env.match(/^N8N_WEBHOOK_URL=(https:\/\/[^\r\n]+)$/m)?.[1].replace(/\/$/, '');
if (!publicBaseUrl) throw new Error('Cần N8N_WEBHOOK_URL HTTPS đang hoạt động.');
const code = (name) => fs.readFileSync(path.join(root, `workflows/code/${name}.js`), 'utf8');
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  id: name.toLowerCase().replaceAll(' ', '-'), name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters, ...extra,
});
const connectionNames = ['Start', 'Read Buffer Account', 'Read Buffer Channels'];
w.nodes = w.nodes.filter((item) => connectionNames.includes(item.name));
w.connections = {
  Start: { main: [[{ node: 'Read Buffer Account', type: 'main', index: 0 }]] },
  'Read Buffer Account': { main: [[{ node: 'Read Buffer Channels', type: 'main', index: 0 }]] },
};
const http = w.nodes[1].parameters;
const postFields = 'id status externalLink error { message }';
const mutation = `mutation PublishTikTok($input: CreatePostInput!) { createPost(input: $input) { __typename ... on PostActionSuccess { post { ${postFields} } } ... on InvalidInputError { message } ... on UnauthorizedError { message } ... on NotFoundError { message } ... on UnexpectedError { message } ... on LimitReachedError { message } } }`;
w.nodes.push(
  node('Upload Video', 'formTrigger', 2.6, [0, 300], {
    authentication: 'n8nUserAuth', requireExecuteAccess: true,
    formTitle: 'Đăng video TikTok',
    formDescription: 'Tài khoản: thieponline.org. Chọn video tối đa 100 MB và nhập caption. Bấm Đăng TikTok để gửi đăng ngay.',
    formFields: { values: [
      { fieldLabel: 'Video', fieldName: 'video', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.mp4,.mov,.webm', requiredField: true },
      { fieldLabel: 'Caption', fieldName: 'caption', fieldType: 'textarea', requiredField: true },
      { fieldLabel: 'Video được tạo bằng AI?', fieldName: 'aiGenerated', fieldType: 'dropdown', fieldOptions: { values: [{ option: 'Không' }, { option: 'Có' }] }, defaultValue: 'Không', requiredField: true },
    ] },
    responseMode: 'lastNode',
    options: { path: 'publish-tiktok', buttonLabel: 'Đăng TikTok', appendAttribution: false, includeUserInOutput: false },
  }, { webhookId: '2a155725-bb27-4411-bcb5-9846dbb9f770' }),
  node('Prepare Video', 'code', 2, [240, 300], { jsCode: 'const bufferConfig = ' + JSON.stringify({ channelId: channel.id, publicBaseUrl }) + ';\n' + code('buffer-prepare-video') }),
  node('Store Video', 'readWriteFile', 1.1, [480, 300], { operation: 'write', fileName: '={{ $json.localFile }}', dataPropertyName: 'video', options: {} }),
  node('Publish TikTok', 'httpRequest', 4.2, [720, 300], {
    ...http,
    jsonBody: `={{ { query: ${JSON.stringify(mutation)}, variables: { input: { channelId: $('Prepare Video').first().json.channelId, text: $('Prepare Video').first().json.caption, assets: [{ video: { url: $('Prepare Video').first().json.mediaUrl } }], mode: 'shareNow', schedulingType: 'automatic', needsApproval: false, saveToDraft: false, metadata: { tiktok: { isAiGenerated: $('Prepare Video').first().json.isAiGenerated } } } } } }}`,
  }, { retryOnFail: false, notes: 'Đăng công khai khi user gửi form. Không tự retry mutation khi có lỗi mạng.' }),
  node('Publish Result', 'code', 2, [960, 300], { jsCode: code('buffer-post-result') }),
  node('Still Processing', 'if', 2.2, [1200, 300], {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: 'pending', leftValue: '={{ $json.shouldPoll }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
  }),
  node('Wait For Buffer', 'wait', 1.1, [1200, 100], { resume: 'timeInterval', amount: 5, unit: 'seconds' }, { webhookId: 'b5e9090e-d70a-4cb1-be41-14898f420d1c' }),
  node('Read Post Status', 'httpRequest', 4.2, [960, 100], {
    ...http,
    jsonBody: `={{ { query: ${JSON.stringify(`query PostStatus($input: PostInput!) { post(input: $input) { ${postFields} } }`)}, variables: { input: { id: $json.postId } } } }}`,
  }),
  node('Show Result', 'form', 2.5, [1440, 400], { operation: 'completion', respondWith: 'text', completionTitle: 'Kết quả đăng TikTok', completionMessage: '={{ $json.formMessage }}', options: {} }),
  node('Media Download', 'webhook', 2, [0, 700], { httpMethod: 'GET', path: 'buffer-media/:fileName', responseMode: 'responseNode', options: {} }, { id: 'video-download', webhookId: '72b6fa94-2772-4442-bd42-5b4d07e37206' }),
  node('Check Media Link', 'code', 2, [240, 700], { jsCode: code('buffer-media-request') }),
  node('Read Media File', 'readWriteFile', 1.1, [480, 700], { operation: 'read', fileSelector: '={{ $json.localFile }}', options: { dataPropertyName: 'data', mimeType: '={{ $json.mimeType }}' } }, { id: 'read-video' }),
  node('Serve Media File', 'respondToWebhook', 1.4, [720, 700], {
    respondWith: 'binary', responseDataSource: 'set', inputFieldName: 'data',
    options: { responseHeaders: { entries: [{ name: 'Cache-Control', value: 'private, no-store' }, { name: 'Content-Disposition', value: 'inline; filename="video"' }] } },
  }, { id: 'send-video' }),
);
const link = (from, to, output = 0) => {
  w.connections[from] ??= { main: [] };
  w.connections[from].main[output] = [{ node: to, type: 'main', index: 0 }];
};
for (const sequence of [
  ['Upload Video', 'Prepare Video', 'Store Video', 'Publish TikTok', 'Publish Result', 'Still Processing'],
  ['Media Download', 'Check Media Link', 'Read Media File', 'Serve Media File'],
  ['Wait For Buffer', 'Read Post Status', 'Publish Result'],
]) for (let i = 0; i < sequence.length - 1; i++) link(sequence[i], sequence[i + 1]);
link('Still Processing', 'Wait For Buffer'); link('Still Processing', 'Show Result', 1);
w.active = false;
w.settings = { ...w.settings, executionTimeout: 180 };
fs.writeFileSync(file, JSON.stringify(w, null, 2) + '\n');
console.log('Built Buffer file-upload publisher, native form and temporary media route; no credentials in source.');
