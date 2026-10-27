const fs = require('fs');
const context = $input.first().json;
const parts = fs.readdirSync('/files')
  .filter((name) => name.startsWith(context.albumPrefix + '-') && name.endsWith('.part.json'))
  .map((name) => JSON.parse(fs.readFileSync('/files/' + name, 'utf8')))
  .sort((a, b) => a.messageId - b.messageId);
if (parts.some((part) => Date.now() - part.receivedAt < publisherConfig.albumQuietMs)) return [{ json: { ...context, albumReady: false } }];
try { fs.writeFileSync(`/files/${context.albumPrefix}.sealed`, '', { flag: 'wx', mode: 0o600 }); }
catch (error) { if (error.code === 'EEXIST') return []; throw error; }
const caption = parts.find((part) => part.caption)?.caption;
const error = parts.find((part) => part.error)?.error ??
  (parts.some((part) => part.mediaType !== 'image') ? 'Album trộn video hoặc nhiều video chưa được hỗ trợ.' : undefined) ??
  (parts.length > 10 ? 'Album vượt giới hạn 10 ảnh.' : undefined) ??
  (!caption ? 'Album chưa có caption.' : undefined);
const json = { ...context, albumReady: true, isAlbum: false, shouldPublish: !error, media: parts, caption, isAiGenerated: false };
if (error) {
  json.text = error + ' Toàn bộ album chưa được đăng; không đăng tách từng ảnh.';
  const saved = JSON.parse(fs.readFileSync(context.journalFile, 'utf8'));
  fs.writeFileSync(context.journalFile, JSON.stringify({ ...saved, status: 'rejected', text: json.text }));
}
return [{ json }];
