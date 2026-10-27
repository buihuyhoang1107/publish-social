const crypto = require('crypto');
const item = $input.first();
const video = item.binary?.video;
if (!video?.fileName) throw new Error('Hãy chọn một file video để đăng.');
const extension = video.fileName.split('.').pop().toLowerCase();
if (!['mp4', 'mov', 'webm'].includes(extension)) throw new Error('Chọn video MP4, MOV hoặc WEBM.');
const token = crypto.randomBytes(16).toString('hex');
const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
const mediaName = `${token}_${expiresAt}.${extension}`;
return [{ json: {
  caption: item.json.caption ?? '',
  isAiGenerated: item.json.aiGenerated === 'Có',
  channelId: bufferConfig.channelId,
  mediaName,
  localFile: `/files/${mediaName}`,
  mediaUrl: `${bufferConfig.publicBaseUrl}/webhook/buffer-media/${mediaName}`,
}, binary: { video } }];
