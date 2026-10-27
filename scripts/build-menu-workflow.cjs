const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const menuOptions = JSON.parse(fs.readFileSync(path.join(root, 'workflows/code/telegram-menu.constant.json'), 'utf8'));
const routerCode = 'const menuOptions = ' + JSON.stringify(menuOptions) + ';\n' + fs.readFileSync(path.join(root, 'workflows/code/telegram-menu.js'), 'utf8');
const tableId = { __rl: true, mode: 'id', value: "={{ $('Ensure Sessions Table').first().json.id }}" };
const sessionKey = "={{ (() => { const u = $('Telegram Trigger').first().json; const c = u.callback_query; const m = c ? c.message : u.message; return m?.chat && (c?.from ?? m.from) ? m.chat.id + ':' + (c ? c.from.id : m.from.id) : 'unsupported'; })() }}";
const filter = (value) => ({ conditions: [{ keyName: 'sessionKey', condition: 'eq', keyValue: value }] });
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  id: name.toLowerCase().replaceAll(' ', '-'), name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters, ...extra,
});
const nodes = [
  node('Telegram Trigger', 'telegramTrigger', 1.5, [0, 0], {
    updates: ['message', 'callback_query'], additionalFields: { download: false },
  }, { webhookId: 'b9b17288-112f-48bf-912e-37113d0af7ac', notes: 'V2 dùng Telegram file_id, không tải binary chỉ để hiển thị menu. Chỉ hỗ trợ chat riêng.' }),
  node('Ensure Sessions Table', 'dataTable', 1.1, [240, 0], {
    resource: 'table', operation: 'create', tableName: 'social_publisher_sessions',
    columns: { column: [{ name: 'sessionKey', type: 'string' }, { name: 'sessionJson', type: 'string' }] },
    options: { createIfNotExists: true },
  }),
  node('Load Session', 'dataTable', 1.1, [480, 0], {
    resource: 'row', operation: 'get', dataTableId: tableId, matchType: 'allConditions',
    filters: filter(sessionKey), returnAll: false, limit: 1,
  }, { alwaysOutputData: true }),
  node('Telegram Menu Router', 'code', 2, [720, 0], { mode: 'runOnceForAllItems', jsCode: routerCode }),
  node('Save Session', 'dataTable', 1.1, [960, 0], {
    resource: 'row', operation: 'upsert', dataTableId: tableId, matchType: 'allConditions',
    filters: filter("={{ $('Telegram Menu Router').first().json.sessionKey }}"),
    columns: {
      mappingMode: 'defineBelow',
      value: { sessionKey: "={{ $('Telegram Menu Router').first().json.sessionKey }}", sessionJson: "={{ $('Telegram Menu Router').first().json.sessionJson }}" },
      schema: ['sessionKey', 'sessionJson'].map((id) => ({ id, displayName: id, required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true })),
    }, options: {},
  }),
  node('Is Callback', 'if', 2.2, [1200, 0], {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: 'callback', leftValue: "={{ $('Telegram Menu Router').first().json.hasCallback }}", rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
  }),
  node('Answer Callback', 'telegram', 1.2, [1440, -140], {
    resource: 'callback', operation: 'answerQuery', queryId: "={{ $('Telegram Trigger').first().json.callback_query.id }}", additionalFields: {},
  }, { onError: 'continueRegularOutput', notes: 'Callback hết hạn không được chặn việc phản hồi menu. Không tự retry.' }),
  node('Telegram Menu Reply', 'telegram', 1.2, [1680, 0], {
    resource: 'message', operation: 'sendMessage',
    chatId: "={{ $('Telegram Menu Router').first().json.chatId }}",
    text: "={{ $('Telegram Menu Router').first().json.textHtml }}",
    replyMarkup: 'none',
    additionalFields: { appendAttribution: false, parse_mode: 'HTML' },
  }),
];
const menuCondition = (kind) => ({
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: kind, leftValue: "={{ $('Telegram Menu Router').first().json.menuKind }}", rightValue: kind, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, options: {},
});
const menuReply = (options, kind) => ({
  ...nodes[7].parameters,
  replyMarkup: 'inlineKeyboard',
  inlineKeyboard: { rows: Object.entries(options).map(([value, label]) => ({ row: { buttons: [{
    text: label,
    additionalFields: { callback_data: `={{ 'sp:' + $('Telegram Menu Router').first().json.menuSessionId + ':${kind}:${value}' }}` },
  }] } })) },
});
nodes.push(
  node('Is Service Menu', 'if', 2.2, [1680, 0], menuCondition('service')),
  node('Service Options', 'telegram', 1.2, [1920, -180], menuReply(menuOptions.services, 'service')),
  node('Is Content Type Menu', 'if', 2.2, [1920, 120], menuCondition('type')),
  node('Content Type Options', 'telegram', 1.2, [2160, 20], menuReply(menuOptions.contentTypes, 'type')),
  node('Is Preview', 'if', 2.2, [2160, 220], menuCondition('action')),
  node('Preview Actions', 'telegram', 1.2, [2400, 120], menuReply(menuOptions.previewActions, 'action')),
  node('Should Store Approval', 'if', 2.2, [960, -360], {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: 'approved', leftValue: '={{ $json.archiveApprovedPost }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
  }),
  node('Ensure Posts Table', 'dataTable', 1.1, [1200, -460], {
    resource: 'table', operation: 'create', tableName: 'social_publisher_posts',
    columns: { column: ['postId', 'status', 'postJson'].map((name) => ({ name, type: 'string' })).concat([{ name: 'chatId', type: 'number' }]) },
    options: { createIfNotExists: true },
  }),
  node('Store Approved Post', 'dataTable', 1.1, [1440, -460], {
    resource: 'row', operation: 'upsert',
    dataTableId: { __rl: true, mode: 'id', value: "={{ $('Ensure Posts Table').first().json.id }}" },
    matchType: 'allConditions', filters: { conditions: [{ keyName: 'postId', condition: 'eq', keyValue: "={{ $('Telegram Menu Router').first().json.masterPost.postId }}" }] },
    columns: {
      mappingMode: 'defineBelow', value: {
        postId: "={{ $('Telegram Menu Router').first().json.masterPost.postId }}",
        status: "={{ $('Telegram Menu Router').first().json.masterPost.status }}",
        postJson: "={{ JSON.stringify($('Telegram Menu Router').first().json.masterPost) }}",
        chatId: "={{ $('Telegram Menu Router').first().json.chatId }}",
      },
      schema: ['postId', 'status', 'postJson', 'chatId'].map((id) => ({ id, displayName: id, required: false, defaultMatch: false, display: true, type: id === 'chatId' ? 'number' : 'string', canBeUsedToMatch: true })),
    }, options: {},
  }),
);
nodes[7].position = [2400, 320];
const connections = {};
const link = (from, to, output = 0) => {
  connections[from] ??= { main: [] };
  connections[from].main[output] = [{ node: to, type: 'main', index: 0 }];
};
for (let i = 0; i < 3; i++) link(nodes[i].name, nodes[i + 1].name);
link('Telegram Menu Router', 'Should Store Approval');
link('Should Store Approval', 'Ensure Posts Table');
link('Should Store Approval', 'Save Session', 1);
link('Ensure Posts Table', 'Store Approved Post');
link('Store Approved Post', 'Save Session');
link('Save Session', 'Is Callback');
link('Is Callback', 'Answer Callback');
link('Is Callback', 'Is Service Menu', 1);
link('Answer Callback', 'Is Service Menu');
link('Is Service Menu', 'Service Options');
link('Is Service Menu', 'Is Content Type Menu', 1);
link('Is Content Type Menu', 'Content Type Options');
link('Is Content Type Menu', 'Is Preview', 1);
link('Is Preview', 'Preview Actions');
link('Is Preview', 'Telegram Menu Reply', 1);
const workflow = { name: 'Social Publisher - Telegram Menu', nodes, connections,
  settings: { executionOrder: 'v1', timezone: 'Asia/Ho_Chi_Minh' }, active: false, pinData: {}, tags: [] };
fs.writeFileSync(path.join(root, 'workflows/telegram-menu.json'), JSON.stringify(workflow, null, 2) + '\n');
console.log('Built workflows/telegram-menu.json (no credentials).');
