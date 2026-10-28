const work = $('Next Queue Work').itemMatching(0).json;
const response = $input.first().json;
queueStore.transact(state => {
  const notice = state.notices.find(item => item.id === work.noticeId);
  if (notice) { notice.status = response.error ? 'unknown' : 'sent'; notice.completedAt = new Date().toISOString(); }
  return {};
});
return [{ json: { notified: true } }];
