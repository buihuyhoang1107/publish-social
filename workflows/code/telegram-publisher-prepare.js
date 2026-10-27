const crypto = require('crypto');
const context = $('Telegram Intake').first().json;
const video = $input.first().binary?.data;
if (!video) throw new Error('Telegram chưa trả file ảnh/video.');
const mediaName = `${crypto.randomBytes(16).toString('hex')}_${Date.now() + 86400000}.${context.extension}`;
const mediaUrl = `${publisherConfig.publicBaseUrl}/webhook/${publisherConfig.mediaWebhookId}/buffer-media/${mediaName}`;
return [{ json: {
  ...context,
  channelId: publisherConfig.channelId,
  localFile: `/files/${mediaName}`,
  mediaUrl,
  assets: [{ [context.mediaType]: { url: mediaUrl } }],
  metadata: context.mediaType === 'video' ? { tiktok: { isAiGenerated: context.isAiGenerated } } : {},
}, binary: { video } }];
