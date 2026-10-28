const crypto = require('crypto');
return $input.all().map((item, index) => {
  const context = $('Expand Media').itemMatching(index).json;
  if (!item.binary?.data) throw new Error('Telegram chưa trả file ảnh/video.');
  const name = publisherConfig.queue?.enabled ? `queue_${crypto.randomBytes(16).toString('hex')}.${context.extension}` : `${crypto.randomBytes(16).toString('hex')}_${Date.now() + 86400000}.${context.extension}`;
  const url = `${publisherConfig.publicBaseUrl}/webhook/${publisherConfig.mediaWebhookId}/buffer-media/${name}`;
  return { json: { ...context, localFile: `/files/${name}`, asset: { [context.mediaType]: { url } } }, binary: { media: item.binary.data }, pairedItem: { item: index } };
});
