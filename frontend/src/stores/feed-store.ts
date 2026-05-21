import { create } from 'zustand';
import { apiClient, apiData, apiEnvelope, ApiEnvelope } from '../lib/api-client';
import { User } from './auth-store';
import { resolveMedia } from '../lib/media-resolver';
import { MediaAsset } from './chat-store';
import { normalizePost } from '../lib/api-normalizer';

const MAX_PENDING = 200; // hard cap buffer (proteksi)
const BATCH_SIZE = 30; // jumlah yang ditampilkan per klik
const COMMENT_BATCH_SIZE = 5;

export type FeedPost = {
  id: string;
  body: string;
  linkPreview?: { url: string } | null;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  user: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  media: PostMedia[];
};

export type PostMedia = {
  id?: string;
  mediaAssetId?: string | null;
  fileUrl: string;
  publicUrl?: string;
  mimeType: string;
  size: number;
  orderIndex: number;
  mediaAsset?: MediaAsset | null;
};

type UploadedPostMedia = PostMedia & {
  url?: string;
};

type CreatePostMediaPayload = {
  mediaAssetId?: string | null;
  fileUrl?: string;
  mimeType?: string;
  size?: number;
  orderIndex?: number;
};

export type FeedComment = {
  id: string;
  body: string;
  parentId?: string | null;
  createdAt: string;
  user: Pick<User, 'id' | 'username'>;
  children: FeedComment[];
};

type FeedState = {
  pendingPosts: FeedPost[];
  posts: FeedPost[];
  commentsByPost: Record<string, FeedComment[]>;
  commentsCursorByPost: Record<string, string | null>;
  commentsHasMoreByPost: Record<string, boolean>;
  commentsLoadingByPost: Record<string, boolean>;
  reactingPostIds: Record<string, boolean>;
  loading: boolean;
  loadingMore: boolean;
  feedCursor: string | null;
  feedHasNextPage: boolean;
  currentScope: 'global' | 'following';
  flushPendingPosts: () => void;
  fetchFeed: (scope?: 'global' | 'following') => Promise<void>;
  loadMoreFeed: (scope?: 'global' | 'following') => Promise<void>;
  fetchExplore: (sort: 'newest' | 'popular') => Promise<void>;
  uploadPostMedia: (files: File[]) => Promise<PostMedia[]>;
  applyUserIdentity: (user: Pick<User, 'id' | 'username' | 'avatarUrl'>) => void;
  createPost: (
    body: string,
    user: Pick<User, 'id' | 'username' | 'avatarUrl'>,
    media?: PostMedia[],
  ) => Promise<FeedPost>;
  toggleLike: (postId: string, fallbackPost?: FeedPost) => Promise<void>;
  fetchComments: (postId: string) => Promise<void>;
  fetchInitialComments: (postId: string) => Promise<void>;
  fetchReplies: (postId: string, parentId: string, cursor?: string) => Promise<ApiEnvelope<FeedComment[]>>;
  loadMoreComments: (postId: string) => Promise<void>;
  createComment: (
    postId: string,
    body: string,
    user: Pick<User, 'id' | 'username'>,
    parentId?: string | null,
  ) => Promise<FeedComment>;
  applyRealtimePost: (post: FeedPost) => void;
  applyRealtimeReaction: (
    payload: {
      postId: string;
      likeCount: number;
      userId: string;
      likedByMe: boolean;
    },
    currentUserId?: string,
  ) => void;
  applyRealtimeComment: (
    postId: string,
    comment: FeedComment,
    commentCount?: number,
  ) => void;
  reportTarget: (
    targetType: 'user' | 'post' | 'comment' | 'message',
    targetId: string,
    reason: string,
    description?: string,
  ) => Promise<void>;
};

export const useFeedStore = create<FeedState>((set, get) => ({
  pendingPosts: [],
  posts: [],
  commentsByPost: {},
  commentsCursorByPost: {},
  commentsHasMoreByPost: {},
  commentsLoadingByPost: {},
  reactingPostIds: {},
  loading: false,
  loadingMore: false,
  feedCursor: null,
  feedHasNextPage: true,
  currentScope: 'global',
  fetchFeed: async (scope = 'global') => {
    set({ loading: true, currentScope: scope });
    try {
      const response = await apiEnvelope<FeedPost[]>(
        apiClient.get('/feed', { params: { scope } }),
      );
      set({
        posts: response.data.map(normalizePostMedia),
        pendingPosts: [],
        feedCursor:
          typeof response.meta?.nextCursor === 'string'
            ? response.meta.nextCursor
            : null,
        feedHasNextPage: Boolean(response.meta?.hasNextPage),
      });
    } finally {
      set({ loading: false });
    }
  },
  fetchReplies: async (postId: string, parentId: string, cursor?: string) => {
    const response = await apiEnvelope<FeedComment[]>(
      apiClient.get(`/posts/${postId}/comments`, {
        params: {
          parentId,
          cursor,
          limit: 3,
        },
      })
    );
    set((state) => ({
      commentsByPost: {
        ...state.commentsByPost,
        [postId]: addCommentsToTree(
          state.commentsByPost[postId] ?? [],
          response.data,
        ),
      },
    }));
    return response;
  },
  loadMoreFeed: async (scope = 'global') => {
    const { feedCursor, feedHasNextPage, loading, loadingMore } = get();
    if (!feedCursor || !feedHasNextPage || loading || loadingMore) return;

    set({ loadingMore: true });
    try {
      const response = await apiEnvelope<FeedPost[]>(
        apiClient.get('/feed', { params: { scope, cursor: feedCursor } }),
      );
      set((state) => {
        const existingIds = new Set(state.posts.map((post) => post.id));
        return {
          posts: [
            ...state.posts,
            ...response.data
              .map(normalizePostMedia)
              .filter((post) => !existingIds.has(post.id)),
          ],
          feedCursor:
            typeof response.meta?.nextCursor === 'string'
              ? response.meta.nextCursor
              : null,
          feedHasNextPage: Boolean(response.meta?.hasNextPage),
        };
      });
    } finally {
      set({ loadingMore: false });
    }
  },
  fetchExplore: async (sort) => {
    set({ loading: true });
    try {
      const posts = await apiData<FeedPost[]>(
        apiClient.get('/explore', { params: { sort } }),
      );
      set({
        posts: posts.map(normalizePost),
      });
    } finally {
      set({ loading: false });
    }
  },
  uploadPostMedia: async (files) => {
    const uploaded: UploadedPostMedia[] = [];
    for (const [index, file] of files.entries()) {
      const formData = new FormData();
      formData.append('file', file);
      const asset = await apiData<MediaAsset>(apiClient.post('/media/upload', formData));
      uploaded.push({
        id: asset.id,
        mediaAssetId: asset.id,
        fileUrl: asset.publicUrl ?? '',
        publicUrl: asset.publicUrl ?? '',
        mimeType: asset.mimeType,
        size: asset.size,
        orderIndex: index,
        mediaAsset: asset,
      });
    }
    return uploaded.map(toCreatePostMedia);
  },
  applyUserIdentity: (user) => {
    set((state) => ({
      pendingPosts: state.pendingPosts.map((post) => patchPostUser(post, user)),
      posts: state.posts.map((post) => patchPostUser(post, user)),
      commentsByPost: Object.fromEntries(
        Object.entries(state.commentsByPost).map(([postId, comments]) => [
          postId,
          patchCommentUsers(comments, user),
        ]),
      ),
    }));
  },
  createPost: async (body, user, media = []) => {
    const postMedia = media.map(toCreatePostMedia);
    const requestMedia = postMedia.map(toCreatePostMediaPayload);
    const payload = { body, media: requestMedia };
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimisticPost: FeedPost = {
      id: tempId,
      body,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      user,
      media: postMedia,
    };

    set((state) => ({ posts: [optimisticPost, ...state.posts] }));
    try {
      const post = await apiData<FeedPost>(apiClient.post('/posts', payload));
      const normalizedPost = normalizePostMedia(post);

      set((state) => ({
        posts: [
          normalizedPost,
          ...state.posts.filter(
            (item) => item.id !== tempId && item.id !== post.id,
          ),
        ],
      }));
      return normalizedPost;
    } catch (error) {
      set((state) => ({
        posts: state.posts.filter((item) => item.id !== tempId),
      }));
      throw error;
    }
  },
  toggleLike: async (postId, fallbackPost) => {
    const post = get().posts.find((item) => item.id === postId) ?? fallbackPost;
    if (!post || get().reactingPostIds[postId]) return;

    const nextLiked = !post.likedByMe;
    set((state) => ({
      reactingPostIds: { ...state.reactingPostIds, [postId]: true },
      posts: state.posts.map((item) =>
        item.id === postId
          ? {
              ...item,
              likedByMe: nextLiked,
              likeCount: Math.max(0, item.likeCount + (nextLiked ? 1 : -1)),
            }
          : item,
      ),
    }));
    try {
      if (nextLiked) await apiClient.post(`/posts/${postId}/react`);
      else await apiClient.delete(`/posts/${postId}/react`);
    } catch (error) {
      set((state) => ({
        posts: state.posts.map((item) =>
          item.id === postId
            ? { ...item, likedByMe: post.likedByMe, likeCount: post.likeCount }
            : item,
        ),
      }));
      throw error;
    } finally {
      set((state) => {
        const { [postId]: _, ...rest } = state.reactingPostIds;
        return { reactingPostIds: rest };
      });
    }
  },
  fetchComments: async (postId) => {
    await get().fetchInitialComments(postId);
  },
  fetchInitialComments: async (postId) => {
    if (get().commentsLoadingByPost[postId]) return;

    set((state) => ({
      commentsLoadingByPost: { ...state.commentsLoadingByPost, [postId]: true },
    }));
    try {
      const response = await apiEnvelope<FeedComment[]>(
        apiClient.get(`/posts/${postId}/comments`, {
          params: { limit: COMMENT_BATCH_SIZE },
        }),
      );
      set((state) => ({
        commentsByPost: {
          ...state.commentsByPost,
          [postId]: mergeCommentList(
            response.data,
            state.commentsByPost[postId] ?? [],
          ),
        },
        commentsCursorByPost: {
          ...state.commentsCursorByPost,
          [postId]:
            typeof response.meta?.nextCursor === 'string'
              ? response.meta.nextCursor
              : null,
        },
        commentsHasMoreByPost: {
          ...state.commentsHasMoreByPost,
          [postId]: Boolean(response.meta?.hasNextPage),
        },
      }));
    } finally {
      set((state) => ({
        commentsLoadingByPost: {
          ...state.commentsLoadingByPost,
          [postId]: false,
        },
      }));
    }
  },
  loadMoreComments: async (postId) => {
    const {
      commentsCursorByPost,
      commentsHasMoreByPost,
      commentsLoadingByPost,
    } = get();
    const cursor = commentsCursorByPost[postId];
    if (
      !cursor ||
      !commentsHasMoreByPost[postId] ||
      commentsLoadingByPost[postId]
    )
      return;

    set((state) => ({
      commentsLoadingByPost: { ...state.commentsLoadingByPost, [postId]: true },
    }));
    try {
      const response = await apiEnvelope<FeedComment[]>(
        apiClient.get(`/posts/${postId}/comments`, {
          params: { limit: COMMENT_BATCH_SIZE, cursor },
        }),
      );
      set((state) => {
        const current = state.commentsByPost[postId] ?? [];
        const nextComments = response.data.filter(
          (comment) => !treeHasComment(current, comment.id),
        );

        return {
          commentsByPost: {
            ...state.commentsByPost,
            [postId]: [...current, ...nextComments],
          },
          commentsCursorByPost: {
            ...state.commentsCursorByPost,
            [postId]:
              typeof response.meta?.nextCursor === 'string'
                ? response.meta.nextCursor
                : null,
          },
          commentsHasMoreByPost: {
            ...state.commentsHasMoreByPost,
            [postId]: Boolean(response.meta?.hasNextPage),
          },
        };
      });
    } finally {
      set((state) => ({
        commentsLoadingByPost: {
          ...state.commentsLoadingByPost,
          [postId]: false,
        },
      }));
    }
  },
  createComment: async (postId, body, user, parentId = null) => {
    try {
      const comment = await apiData<FeedComment>(
        apiClient.post(`/posts/${postId}/comments`, { body, parentId }),
      );
      set((state) => {
        const commentsLoaded = Object.prototype.hasOwnProperty.call(
          state.commentsByPost,
          postId,
        );
        const current = commentsLoaded ? state.commentsByPost[postId] : [];
        const alreadyExists = treeHasComment(current, comment.id);

        return {
          commentsByPost: commentsLoaded
            ? {
                ...state.commentsByPost,
                [postId]: alreadyExists
                  ? current
                  : addCommentToTree(current, comment),
              }
            : state.commentsByPost,
          posts: state.posts.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  commentCount: alreadyExists
                    ? post.commentCount
                    : post.commentCount + 1,
                }
              : post,
          ),
        };
      });
      return comment;
    } catch (error) {
      throw error;
    }
  },
  applyRealtimePost: (post) => {
    set((state) => {
      if (
        state.posts.some((item) => item.id === post.id) ||
        state.pendingPosts.some((item) => item.id === post.id)
      ) {
        return state;
      }

      const next = [normalizePostMedia(post), ...state.pendingPosts];

      return {
        pendingPosts: next.slice(0, MAX_PENDING), // cap
      };
    });
  },
  flushPendingPosts: () => {
    set((state) => {
      const toShow = state.pendingPosts.slice(0, BATCH_SIZE);
      const remaining = state.pendingPosts.slice(BATCH_SIZE);

      const existingIds = new Set(state.posts.map((p) => p.id));
      const deduped = toShow.filter((p) => !existingIds.has(p.id));

      return {
        posts: [...deduped, ...state.posts],
        pendingPosts: remaining,
      };
    });
  },
  applyRealtimeReaction: (payload, currentUserId) => {
    set((state) => ({
      posts: state.posts.map((post) =>
        post.id === payload.postId
          ? {
              ...post,
              likeCount: payload.likeCount,
              likedByMe:
                payload.userId === currentUserId
                  ? payload.likedByMe
                  : post.likedByMe,
            }
          : post,
      ),
    }));
  },
  applyRealtimeComment: (postId, comment, commentCount) => {
    set((state) => {
      const commentsLoaded = Object.prototype.hasOwnProperty.call(
        state.commentsByPost,
        postId,
      );
      const current = commentsLoaded ? state.commentsByPost[postId] : [];
      const alreadyExists = treeHasComment(current, comment.id);
      const nextComments = alreadyExists
        ? current
        : addCommentToTree(current, comment);
      return {
        commentsByPost: commentsLoaded
          ? {
              ...state.commentsByPost,
              [postId]: nextComments,
            }
          : state.commentsByPost,
        posts: state.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                commentCount:
                  typeof commentCount === 'number'
                    ? Math.max(post.commentCount, commentCount)
                    : alreadyExists
                      ? post.commentCount
                      : post.commentCount + 1,
              }
            : post,
        ),
      };
    });
  },
  reportTarget: async (targetType, targetId, reason, description) => {
    await apiClient.post('/reports', {
      targetType,
      targetId,
      reason,
      description,
    });
  },
}));

function normalizePostMedia(post: FeedPost): FeedPost {
  return {
    ...post,
    media: post.media.map((item) => {
      const raw = item.publicUrl ?? item.fileUrl;

      return {
        ...item,
        fileUrl: resolveMedia(raw),
        publicUrl: resolveMedia(raw),
        mediaAsset: item.mediaAsset
          ? {
              ...item.mediaAsset,
              publicUrl: resolveMedia(item.mediaAsset.publicUrl ?? raw),
            }
          : item.mediaAsset,
      };
    }),
  };
}

function patchPostUser(post: FeedPost, user: Pick<User, 'id' | 'username' | 'avatarUrl'>): FeedPost {
  if (post.user.id !== user.id) return post;
  return { ...post, user: { ...post.user, username: user.username, avatarUrl: user.avatarUrl } };
}

function patchCommentUsers(comments: FeedComment[], user: Pick<User, 'id' | 'username'>): FeedComment[] {
  return comments.map((comment) => ({
    ...comment,
    user: comment.user.id === user.id ? { ...comment.user, username: user.username } : comment.user,
    children: patchCommentUsers(comment.children, user),
  }));
}

function addCommentToTree(
  comments: FeedComment[],
  comment: FeedComment,
): FeedComment[] {
  if (!comment.parentId) {
    const existingIndex = comments.findIndex((item) => item.id === comment.id);
    if (existingIndex === -1) return sortComments([...comments, comment]);

    return sortComments(
      comments.map((item, index) =>
        index === existingIndex ? mergeComment(item, comment) : item,
      ),
    );
  }

  return comments.map((item) =>
    item.id === comment.parentId
      ? {
          ...item,
          children: upsertComment(item.children, comment),
        }
      : {
          ...item,
          children: item.children.map((child) =>
            child.id === comment.id ? mergeComment(child, comment) : child,
          ),
        },
  );
}

function upsertComment(
  comments: FeedComment[],
  comment: FeedComment,
): FeedComment[] {
  const existingIndex = comments.findIndex((item) => item.id === comment.id);
  if (existingIndex === -1) return sortComments([...comments, comment]);

  return sortComments(
    comments.map((item, index) =>
      index === existingIndex ? mergeComment(item, comment) : item,
    ),
  );
}

function mergeComment(
  current: FeedComment,
  incoming: FeedComment,
): FeedComment {
  return {
    ...incoming,
    children: mergeCommentList(incoming.children ?? [], current.children ?? []),
  };
}

function sortComments(comments: FeedComment[]): FeedComment[] {
  return [...comments].sort((a, b) => {
    const timeDelta =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDelta !== 0) return timeDelta;
    return a.id.localeCompare(b.id);
  });
}

function addCommentsToTree(
  comments: FeedComment[],
  incoming: FeedComment[],
): FeedComment[] {
  return incoming.reduce(
    (next, comment) => addCommentToTree(next, comment),
    comments,
  );
}

function mergeCommentList(
  snapshot: FeedComment[],
  current: FeedComment[],
): FeedComment[] {
  return current.reduce(
    (next, comment) => addCommentToTree(next, comment),
    snapshot,
  );
}

function treeHasComment(comments: FeedComment[], commentId: string): boolean {
  return comments.some(
    (comment) =>
      comment.id === commentId ||
      comment.children.some((child) => child.id === commentId),
  );
}

function toCreatePostMedia(media: UploadedPostMedia): PostMedia {
  const raw = media.publicUrl ?? media.fileUrl;

  return {
    id: media.id,
    mediaAssetId: media.mediaAssetId ?? media.mediaAsset?.id ?? null,
    fileUrl: resolveMedia(raw),
    publicUrl: resolveMedia(raw),
    mimeType: media.mimeType,
    size: media.size,
    orderIndex: media.orderIndex,
    mediaAsset: media.mediaAsset
      ? {
          ...media.mediaAsset,
          publicUrl: resolveMedia(media.mediaAsset.publicUrl ?? raw),
        }
      : media.mediaAssetId
        ? {
            id: media.mediaAssetId,
            mimeType: media.mimeType,
            size: media.size,
            publicUrl: resolveMedia(raw),
          }
        : null,
  };
}

function toCreatePostMediaPayload(media: PostMedia): CreatePostMediaPayload {
  return {
    mediaAssetId: media.mediaAssetId ?? media.mediaAsset?.id ?? null,
    fileUrl: media.fileUrl,
    mimeType: media.mimeType,
    size: media.size,
    orderIndex: media.orderIndex,
  };
}
