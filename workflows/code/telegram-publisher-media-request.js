const name = $input.first().json.params?.fileName;
const queueMedia = typeof name === 'string' && /^queue_[a-f0-9]{32}\.(mp4|mov|webm|jpg|jpeg|png|webp)$/.exec(name);
const match = typeof name === 'string' && /^([a-f0-9]{32})_(\d{13})\.(mp4|mov|webm|jpg|jpeg|png|webp|zip)$/.exec(name);
if (!queueMedia && (!match || Number(match[2]) <= Date.now())) throw new Error('File không tồn tại hoặc link đã hết hạn.');
const mimeTypes = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', zip: 'application/zip' };
return [{ json: { localFile: `/files/${name}`, mimeType: mimeTypes[queueMedia ? queueMedia[1] : match[3]] } }];
