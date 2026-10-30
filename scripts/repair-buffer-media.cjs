// Runs inside the n8n container. Startup copies this file there before invoking it.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const postQuery = 'query RepairMedia($input: PostInput!) { post(input: $input) { id status dueAt text channelId externalLink assets { source mimeType type } } }';
const editQuery = 'mutation RepairMedia($input: EditPostInput!) { editPost(input: $input) { __typename ... on PostActionSuccess { post { id status dueAt externalLink error { message } } } ... on MutationError { message } } }';

async function repairScheduledMedia({ queue, baseUrl, mediaWebhookId, call, verify, backup, retryMessageId, recordRetry }) {
  let repaired = 0;
  let retried = 0;
  for (const post of queue.posts) {
    const retry = post.messageId === retryMessageId;
    if (!retry && Date.parse(post.dueAt) <= Date.now() + 300000) continue;
    let verified = false;
    const assets = post.mediaFiles.map(medium => ({ [medium.mediaType]: {
      url: baseUrl + '/webhook/' + mediaWebhookId + '/buffer-media/' + medium.name,
    } }));
    for (const target of post.targets ?? []) {
      if (!target.postId || (!retry && target.status !== 'scheduled')) continue;
      const remote = (await call(postQuery, { input: { id: target.postId } })).post;
      if (!remote || remote.channelId !== target.channelId) throw new Error('Post/channel mismatch: #' + post.messageId);
      if (retry ? remote.status !== 'error' : remote.status !== 'scheduled' || Date.parse(remote.dueAt) <= Date.now() + 300000) continue;
      if (remote.text !== post.caption || remote.assets.length !== assets.length || remote.assets.some((asset, index) =>
        asset.type !== post.mediaFiles[index].mediaType || new URL(asset.source).pathname !== new URL(assets[index][post.mediaFiles[index].mediaType].url).pathname
      )) throw new Error('Media/content changed outside this queue: #' + post.messageId);
      if (!retry && remote.assets.every((asset, index) => asset.source === assets[index][post.mediaFiles[index].mediaType].url)) continue;
      if (!verified) { await verify(post, assets); verified = true; }
      backup({ messageId: post.messageId, before: remote, assets, retry });
      // No automatic retry: a timeout may happen after Buffer commits the edit.
      const metadata = target.service === 'facebook' ? { facebook: { type: 'post' } } :
        target.service === 'tiktok' && post.mediaFiles[0].mediaType === 'video' ? { tiktok: { isAiGenerated: post.isAiGenerated } } : undefined;
      const retrySchedule = Date.parse(post.dueAt) > Date.now() ? { mode: 'customScheduled', dueAt: post.dueAt } : { mode: 'shareNow' };
      const result = (await call(editQuery, { input: { id: remote.id, assets, ...(metadata ? { metadata } : {}), ...(retry ? retrySchedule : {}) } })).editPost;
      if (result?.__typename !== 'PostActionSuccess' || result.post?.id !== remote.id) {
        throw new Error('Buffer edit failed for #' + post.messageId + ': ' + (result?.message ?? 'unknown result; check Buffer before retrying'));
      }
      if (retry) {
        recordRetry(post, target, result.post);
        retried++;
      } else {
        const checked = (await call(postQuery, { input: { id: remote.id } })).post;
        if (checked.status !== remote.status || checked.dueAt !== remote.dueAt || checked.text !== remote.text || checked.channelId !== remote.channelId ||
          checked.assets.some((asset, index) => asset.source !== assets[index]?.[post.mediaFiles[index]?.mediaType]?.url) || checked.assets.length !== assets.length) {
          throw new Error('Unable to verify repaired media/schedule: #' + post.messageId);
        }
        repaired++;
      }
      console.log((retry ? 'Retry accepted' : 'Media repaired') + ': #' + post.messageId + ' / ' + target.service);
    }
  }
  return { repaired, retried };
}

async function main() {
  const [workflow] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const http = workflow.nodes.find(node => node.name === 'Queue Account');
  const config = JSON.parse(workflow.nodes.find(node => node.name === 'Start Queue Worker').parameters.jsCode.match(/^const publisherConfig = (.+);\r?\n/)[1]);
  const mediaWebhookId = workflow.nodes.find(node => node.name === 'Media Download').webhookId;
  const credentialFile = '/tmp/buffer-media-credential-' + process.pid + '.json';
  let credential;
  try {
    execFileSync('n8n', ['export:credentials', '--id=' + http.credentials.httpBearerAuth.id, '--decrypted', '--output=' + credentialFile], { stdio: 'pipe' });
    [credential] = JSON.parse(fs.readFileSync(credentialFile, 'utf8'));
  } finally { if (fs.existsSync(credentialFile)) fs.unlinkSync(credentialFile); }
  const call = async (query, variables) => {
    let response;
    try {
      response = await fetch(http.parameters.url, { method: 'POST', headers: { authorization: 'Bearer ' + credential.data.token, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(45000) });
    } catch { throw new Error('Buffer request interrupted. Check Buffer before retrying.'); }
    const data = await response.json();
    if (!response.ok || data.errors?.length || !data.data) throw new Error('Buffer API: ' + (data.errors?.map(error => error.message).join('; ') ?? response.status));
    return data.data;
  };
  const verify = async (post, assets) => {
    for (let index = 0; index < assets.length; index++) {
      const medium = post.mediaFiles[index];
      const response = await fetch(assets[index][medium.mediaType].url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith(medium.mediaType + '/')) throw new Error('Media URL unavailable for #' + post.messageId);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== medium.hash) throw new Error('Media content mismatch for #' + post.messageId);
    }
  };
  const backupDirectory = '/home/node/.n8n/storage/media-repair';
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backup = record => fs.writeFileSync(backupDirectory + '/' + Date.now() + '-' + record.before.id + '.json', JSON.stringify(record), { mode: 0o600 });
  const retryArgument = process.argv.find(value => value.startsWith('--retry-message='));
  const retryMessageId = retryArgument ? Number(retryArgument.split('=')[1]) : undefined;
  const recordRetry = (post, target, result) => {
    const vm = require('node:vm');
    const helper = fs.readFileSync('/tmp/telegram-media-repair-store.js', 'utf8');
    const store = vm.runInNewContext(helper + '\nqueueStore;', { require, publisherConfig: config });
    const recorded = store.transact(state => {
      const saved = state.posts.find(item => item.id === post.id);
      const savedTarget = saved?.targets.find(item => item.channelId === target.channelId);
      if (!savedTarget) throw new Error('Queue target missing after retry.');
      savedTarget.status = result.status;
      savedTarget.externalLink = result.externalLink;
      savedTarget.error = result.status === 'error' ? result.error?.message : undefined;
      savedTarget.updatedAt = new Date().toISOString();
      savedTarget.retriedAt = savedTarget.updatedAt;
      savedTarget.polledAt = 0;
      store.refresh(state, saved);
      return { recorded: true };
    });
    if (recorded.busy) throw new Error('Retry accepted but queue busy; check Buffer before retrying.');
  };
  const queueFile = '/files/telegram-content-queue.json';
  const queue = fs.existsSync(queueFile) ? JSON.parse(fs.readFileSync(queueFile, 'utf8')) : { posts: [] };
  console.log(JSON.stringify(await repairScheduledMedia({ queue, baseUrl: config.publicBaseUrl, mediaWebhookId, call, verify, backup, retryMessageId, recordRetry })));
}

module.exports = { repairScheduledMedia };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
