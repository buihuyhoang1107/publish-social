return $input.all().map((item, index) => {
  const context = $(resultSource).itemMatching(index).json;
  const response = item.json;
  const created = response.data?.createPost;
  const post = created ? created.post : response.data?.post;
  const error = response.error ? 'Không xác nhận được kết quả từ API. Không tự gửi lại.' : response.errors?.map((entry) => entry.message).join('\n') ??
    (created && created.__typename !== 'PostActionSuccess' ? created.message ?? created.__typename : post?.error?.message);
  return { json: { ...context, postId: post?.id ?? context.postId, status: response.error || response.errors?.length ? 'unknown' : created && created.__typename !== 'PostActionSuccess' ? 'rejected' : post?.status ?? 'unknown', externalLink: post?.externalLink, error }, pairedItem: { item: index } };
});
