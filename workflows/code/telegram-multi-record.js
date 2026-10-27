const fs = require('fs');
const crypto = require('crypto');
for (const item of $input.all()) {
  const saved = JSON.parse(fs.readFileSync(item.json.targetFile, 'utf8'));
  const result = { ...item.json, updatedAt: new Date().toISOString() };
  // A concurrent, older status response must not downgrade an already sent post.
  if (saved.status === 'sent' && result.status !== 'sent') continue;
  const temp = item.json.targetFile + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(result), { mode: 0o600 });
  fs.renameSync(temp, item.json.targetFile);
}
return $input.all();
