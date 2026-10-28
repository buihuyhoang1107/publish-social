const assert = require('node:assert/strict');
const { repairScheduledMedia } = require('./repair-buffer-media.cjs');

async function fixture({ retry = false, mismatch = false, unavailable = false } = {}) {
  const route = '/webhook/media/buffer-media/queue_' + 'a'.repeat(32) + '.jpg';
  const oldUrl = 'https://old.example.com' + route;
  const newUrl = 'https://new.example.com' + route;
  const remote = { id: 'remote', channelId: 'channel', text: 'caption', status: retry ? 'error' : 'scheduled', dueAt: new Date(Date.now() + 3600000).toISOString(), assets: [{ type: 'image', source: oldUrl }] };
  const post = { id: 'post', messageId: 110, caption: mismatch ? 'different' : 'caption', dueAt: remote.dueAt, mediaFiles: [{ name: 'queue_' + 'a'.repeat(32) + '.jpg', mediaType: 'image' }], targets: [{ postId: 'remote', channelId: 'channel', service: 'facebook', status: remote.status }] };
  const writes = [], backups = [], records = [];
  let verified = 0;
  const args = {
    queue: { posts: [post] }, baseUrl: 'https://new.example.com', mediaWebhookId: 'media',
    call: async (query, variables) => {
      if (query.startsWith('query')) return { post: structuredClone(remote) };
      writes.push(variables.input);
      remote.assets[0].source = variables.input.assets[0].image.url;
      if (variables.input.mode === 'shareNow') remote.status = 'sending';
      if (variables.input.mode === 'customScheduled') remote.status = 'scheduled';
      return { editPost: { __typename: 'PostActionSuccess', post: structuredClone(remote) } };
    },
    verify: async () => { verified++; if (unavailable) throw new Error('unavailable'); },
    backup: record => backups.push(record), recordRetry: (...record) => records.push(record),
    retryMessageId: retry ? 110 : undefined,
  };
  return { args, remote, writes, backups, records, newUrl, verified: () => verified };
}

(async () => {
  const scheduled = await fixture();
  const dueAt = scheduled.remote.dueAt;
  assert.deepEqual(await repairScheduledMedia(scheduled.args), { repaired: 1, retried: 0 });
  assert.deepEqual(Object.keys(scheduled.writes[0]).sort(), ['assets', 'id', 'metadata']);
  assert.deepEqual(scheduled.writes[0].metadata, { facebook: { type: 'post' } });
  assert.equal(scheduled.remote.dueAt, dueAt);
  assert.equal(scheduled.remote.text, 'caption');
  assert.equal(scheduled.remote.assets[0].source, scheduled.newUrl);
  assert.equal(scheduled.backups.length, 1);
  assert.equal(scheduled.verified(), 1);
  assert.deepEqual(await repairScheduledMedia(scheduled.args), { repaired: 0, retried: 0 });
  assert.equal(scheduled.writes.length, 1, 'Repeated startup does not edit again');
  const failed = await fixture(); failed.remote.status = 'error';
  await repairScheduledMedia(failed.args); assert.equal(failed.writes.length, 0, 'Startup never retries failed posts');
  const near = await fixture(); near.remote.dueAt = new Date(Date.now() + 60000).toISOString();
  await repairScheduledMedia(near.args); assert.equal(near.writes.length, 0, 'Do not edit near publication');
  const changed = await fixture({ mismatch: true });
  await assert.rejects(repairScheduledMedia(changed.args), /changed outside/); assert.equal(changed.writes.length, 0);
  const missing = await fixture({ unavailable: true });
  await assert.rejects(repairScheduledMedia(missing.args), /unavailable/); assert.equal(missing.writes.length, 0);
  const retry = await fixture({ retry: true });
  assert.deepEqual(await repairScheduledMedia(retry.args), { repaired: 0, retried: 1 });
  assert.equal(retry.writes[0].mode, 'customScheduled'); assert.equal(retry.writes[0].dueAt, retry.remote.dueAt); assert.equal(retry.records.length, 1);
  await repairScheduledMedia(retry.args); assert.equal(retry.writes.length, 1, 'Already sending post cannot be retried');
  const overdue = await fixture({ retry: true });
  overdue.args.queue.posts[0].dueAt = new Date(Date.now() - 3600000).toISOString();
  await repairScheduledMedia(overdue.args); assert.equal(overdue.writes[0].mode, 'shareNow');
  console.log('PASS media repair: preserve content/slot, verify media, backup, dedup, skip failed/near-due posts, manual-change guard, explicit retry only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
