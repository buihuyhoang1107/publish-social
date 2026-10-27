const fs = require('fs');
const context = $input.first().json;
const saved = JSON.parse(fs.readFileSync(context.journalFile, 'utf8'));
// Existing single-channel receipts remain readable; status never creates another post.
if (!saved.targets?.length && saved.postId) {
  const targetFile = context.journalFile.replace('telegram-post-', 'telegram-target-legacy-');
  fs.writeFileSync(targetFile, JSON.stringify({ chatId: context.chatId, messageId: saved.messageId, journalFile: context.journalFile, targetFile, postId: saved.postId, status: saved.status, service: 'tiktok', channelName: 'thieponline.org' }));
  saved.targets = [targetFile];
  fs.writeFileSync(context.journalFile, JSON.stringify(saved));
}
const requests = (saved.targets ?? []).map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
  .filter((target) => target.postId && (context.queryStatus || ['sending', 'scheduled', 'submitting'].includes(target.status)));
return requests.length ? requests.map((target) => ({ json: { ...target, queryStatus: context.queryStatus, hasStatusRequests: true }, pairedItem: { item: 0 } })) : [{ json: { ...context, hasStatusRequests: false } }];
