const state = queueStore.read();
const pending = state.posts.flatMap(post => post.targets ?? []).filter(target => ['planned', 'submitting', 'scheduled', 'sending', 'unknown'].includes(target.status));
const counts = {};
for (const target of pending) counts[target.channelId] = (counts[target.channelId] ?? 0) + 1;
const full = Object.values(counts).some(count => count >= publisherConfig.queue.maxPendingPerChannel);
const due = state.posts.some(post => post.dueAt && Date.parse(post.dueAt) <= Date.now() && post.targets?.some(target => ['scheduled', 'sending'].includes(target.status)));
const needsChannels = state.posts.some(post => post.status === 'approved' || post.targets?.some(target => target.status === 'planned')) && (!full || due);
return [{ json: { needsChannels } }];
