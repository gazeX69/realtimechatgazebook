import { resolveMedia } from './media-resolver';

export function normalizePost(post: any) {
  return {
    ...post,
    media: (post.media ?? []).map((item: any) => {
      const raw = item.publicUrl ?? item.fileUrl;

      return {
        ...item,
        fileUrl: resolveMedia(raw),
        publicUrl: resolveMedia(raw),
      };
    }),
  };
}