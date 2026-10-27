const fs = require('fs');
const crypto = require('crypto');
const context = $('Assemble Media').first().json;
const response = $input.first().json;
if (response.errors?.length || !Array.isArray(response.data?.channels)) return [{ json: { ...context, shouldCreate: false, preparationError: 'Chưa đọc được các kênh đã kết nối. Bài chưa được gửi đăng.' } }];
const targets = [];
for (const service of publisherConfig.services) {
  const channels = response.data.channels.filter((channel) => channel.service === service);
  for (const channel of channels.length ? channels : [{ id: 'missing-' + service, name: '', service, missing: true }]) {
    const targetFile = `/files/telegram-target-${crypto.createHash('sha256').update(context.journalFile + ':' + channel.id).digest('hex')}.json`;
    const blocked = channel.missing || channel.isDisconnected || channel.isLocked;
    const captionLength = Array.from(context.caption).length;
    const exceedsThreadsLimit = service === 'threads' && captionLength > 499;
    const target = { ...context, channelId: channel.id, channelName: channel.name, service, targetFile, metadata: service === 'facebook' ? { facebook: { type: 'post' } } : service === 'tiktok' ? context.metadata : {}, shouldCreate: !blocked && !exceedsThreadsLimit, status: blocked ? 'unavailable' : exceedsThreadsLimit ? 'skipped' : 'submitting', error: channel.missing ? 'Chưa kết nối trong Buffer.' : blocked ? 'Kênh bị ngắt kết nối hoặc bị khóa.' : exceedsThreadsLimit ? `Caption có ${captionLength} ký tự, vượt mức tối đa 499 ký tự đã cấu hình. Chưa gửi đăng Threads; hãy rút gọn caption.` : undefined };
    try { fs.writeFileSync(targetFile, JSON.stringify(target), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; target.shouldCreate = false; }
    targets.push(target);
  }
}
const saved = JSON.parse(fs.readFileSync(context.journalFile, 'utf8'));
fs.writeFileSync(context.journalFile, JSON.stringify({ ...saved, caption: context.caption, mediaCount: context.assets.length, targets: targets.map((target) => target.targetFile), status: 'processing' }));
const requests = targets.filter((target) => target.shouldCreate);
return requests.length ? requests.map((json) => ({ json, pairedItem: { item: 0 } })) : [{ json: { ...context, shouldCreate: false } }];
