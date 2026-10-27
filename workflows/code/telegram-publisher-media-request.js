const name = $input.first().json.params?.fileName;
const match = typeof name === 'string' && /^([a-f0-9]{32})_(\d{13})\.(mp4|mov|webm|jpg|jpeg|png|webp)$/.exec(name);
if (!match || Number(match[2]) <= Date.now()) throw new Error('File không tồn tại hoặc link đã hết hạn.');
const mimeTypes = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
return [{ json: { localFile: `/files/${name}`, mimeType: mimeTypes[match[3]] } }];
