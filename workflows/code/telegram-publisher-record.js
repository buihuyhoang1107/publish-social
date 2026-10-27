const fs = require('fs');
const item = $input.first();
const saved = JSON.parse(fs.readFileSync(item.json.journalFile, 'utf8'));
const receipt = { ...saved, postId: item.json.postId ?? saved.postId, status: item.json.status, text: item.json.text, updatedAt: new Date().toISOString() };
const tempFile = item.json.journalFile + '.' + require('crypto').randomBytes(8).toString('hex') + '.tmp';
fs.writeFileSync(tempFile, JSON.stringify(receipt), { mode: 0o600 });
fs.renameSync(tempFile, item.json.journalFile);
return [item];
