import { Heart, MessageCircle, Send, ChevronLeft, ChevronRight, Maximize2, Play, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AttachmentRenderer } from '../../components/media/AttachmentRenderer';
import { resolveUserIdentity } from '../../lib/identity-resolver';
import { resolveMedia } from '../../lib/media-resolver';
import { mediaPreviewInfo, useVideoPoster } from '../../lib/media-preview';
import { User } from '../../stores/auth-store';
import { FeedPost, PostMedia } from '../../stores/feed-store';
import { useFeedStore } from '../../stores/feed-store';
import { CommentInput } from '../feed/CommentInput';
import { CommentItem } from '../feed/CommentItem';
import { MentionText } from '../feed/mention-text';

type ProfileMediaItem = {
  id: string;
  post: FeedPost;
  media: PostMedia[];
};

export function ProfileMediaGrid({ posts, currentUser }: { posts: FeedPost[]; currentUser: User | null }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [viewerPost, setViewerPost] = useState<FeedPost | null>(null);
  const [viewerShell, setViewerShell] = useState<HTMLDivElement | null>(null);
  const commentsByPost = useFeedStore((state) => state.commentsByPost);
  const storePosts = useFeedStore((state) => state.posts);
  const reactingPostIds = useFeedStore((state) => state.reactingPostIds);
  const items = useMemo(
    () =>
      posts
        .filter((post) => post.media.length > 0)
        .map((post) => ({
          id: post.id,
          post,
          media: post.media,
        })),
    [posts],
  );
  const activeItem = activeIndex === null ? null : items[activeIndex];
  const activeMedia = activeItem?.media[activeMediaIndex] ?? activeItem?.media[0] ?? null;
  const activePostId = viewerPost?.id ?? activeItem?.post.id;
  const activePost = storePosts.find((post) => post.id === activePostId) ?? viewerPost ?? activeItem?.post ?? null;
  const activeComments = activePost ? (commentsByPost[activePost.id] ?? []) : [];
  const activeAuthor = resolveUserIdentity(activePost?.user, currentUser?.id === activePost?.user.id ? currentUser : undefined);

  if (items.length === 0) return null;

  function open(index: number) {
    setActiveIndex(index);
    setActiveMediaIndex(0);
    setViewerPost(items[index]?.post ?? null);
  }

  function close() {
    setActiveIndex(null);
    setViewerPost(null);
  }

  function showPrevious() {
    setActiveIndex((current) => {
      if (current === null) return current;
      const nextIndex = (current - 1 + items.length) % items.length;
      setActiveMediaIndex(0);
      setViewerPost(items[nextIndex]?.post ?? null);
      return nextIndex;
    });
  }

  function showNext() {
    setActiveIndex((current) => {
      if (current === null) return current;
      const nextIndex = (current + 1) % items.length;
      setActiveMediaIndex(0);
      setViewerPost(items[nextIndex]?.post ?? null);
      return nextIndex;
    });
  }

  function showPreviousMedia() {
    if (!activeItem) return;
    setActiveMediaIndex((current) => (current - 1 + activeItem.media.length) % activeItem.media.length);
  }

  function showNextMedia() {
    if (!activeItem) return;
    setActiveMediaIndex((current) => (current + 1) % activeItem.media.length);
  }

  async function requestViewerFullscreen() {
    if (!viewerShell || document.fullscreenElement) return;
    await viewerShell.requestFullscreen().catch(() => undefined);
  }

  async function submitComment(body: string) {
    if (!currentUser || !activePost) return;
    await useFeedStore.getState().createComment(activePost.id, body, currentUser);
    setViewerPost((current) => {
      if (!current || current.id !== activePost.id) return current;
      return useFeedStore.getState().posts.find((post) => post.id === activePost.id) ?? {
        ...current,
        commentCount: current.commentCount + 1,
      };
    });
  }

  async function toggleViewerLike() {
    if (!activePost || reactingPostIds[activePost.id]) return;
    const previousPost = activePost;
    const nextLiked = !activePost.likedByMe;
    const nextPost = {
      ...activePost,
      likedByMe: nextLiked,
      likeCount: Math.max(0, activePost.likeCount + (nextLiked ? 1 : -1)),
    };

    setViewerPost(nextPost);
    try {
      await useFeedStore.getState().toggleLike(activePost.id, activePost);
      const syncedPost = useFeedStore.getState().posts.find((post) => post.id === activePost.id) ?? nextPost;
      setViewerPost(syncedPost);
    } catch (error) {
      setViewerPost(previousPost);
      console.error(error);
    }
  }

  useEffect(() => {
    if (activeIndex === null) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') showPrevious();
      if (event.key === 'ArrowRight') showNext();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, items.length]);

  useEffect(() => {
    if (!activePost || commentsByPost[activePost.id]) return;
    void useFeedStore.getState().fetchComments(activePost.id);
  }, [activePost?.id, commentsByPost]);

  return (
    <>
      <div className="grid w-full max-w-full grid-cols-2 gap-1 sm:grid-cols-3">
        {items.map((item, index) => (
          <button
            key={item.id}
            className="group relative aspect-square min-w-0 overflow-hidden bg-gray-900 transition duration-150 active:scale-[0.99]"
            onClick={() => open(index)}
            type="button"
          >
            <ProfilePostCollage media={item.media} />
            <div className="absolute inset-0 bg-black/0 transition duration-150 group-hover:bg-black/30" />
          </button>
        ))}
      </div>

      {activeItem && activePost && activeMedia ? (
        <div
          className="fixed inset-0 z-50 flex max-w-full items-stretch justify-center overflow-hidden bg-black/80 p-2 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="absolute right-4 top-4 z-20 flex gap-2">
            <button
              className="rounded-full bg-gray-950/80 p-2 text-gray-100 transition duration-150 hover:bg-purple-600 active:scale-95"
              onClick={requestViewerFullscreen}
              type="button"
              aria-label="Fullscreen"
            >
              <Maximize2 size={19} />
            </button>
            <button
              className="rounded-full bg-gray-950/80 p-2 text-gray-100 transition duration-150 hover:bg-purple-600 active:scale-95"
              onClick={close}
              type="button"
              aria-label="Close media viewer"
            >
              <X size={20} />
            </button>
          </div>
          <button
            className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-gray-950/80 p-2 text-gray-100 transition duration-150 hover:bg-purple-600 active:scale-95 sm:block"
            onClick={showPrevious}
            type="button"
            aria-label="Previous media"
          >
            <ChevronLeft size={24} />
          </button>
          <div ref={setViewerShell} className="flex max-h-[calc(100dvh-1rem)] w-full max-w-full min-w-0 flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-2xl shadow-purple-500/10 md:max-h-[92vh] md:max-w-6xl md:flex-row">
            <div className="flex h-[38dvh] min-h-0 min-w-0 shrink-0 bg-black md:h-auto md:min-h-[80vh] md:flex-[7] md:shrink">
              <div className="relative flex w-full items-center justify-center">
                <ProfileMediaViewer media={activeMedia} />
                {activeItem.media.length > 1 ? (
                  <>
                    <button className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-gray-950/80 p-2 text-gray-100 transition duration-150 hover:bg-purple-600 active:scale-95" onClick={showPreviousMedia} type="button" aria-label="Previous media in post">
                      <ChevronLeft size={22} />
                    </button>
                    <button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-gray-950/80 p-2 text-gray-100 transition duration-150 hover:bg-purple-600 active:scale-95" onClick={showNextMedia} type="button" aria-label="Next media in post">
                      <ChevronRight size={22} />
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <aside className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-gray-800 md:max-h-[90vh] md:flex-[3] md:border-l md:border-t-0">
              <header className="flex min-w-0 shrink-0 items-center gap-3 border-b border-gray-800 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-sm font-semibold text-purple-200 ring-1 ring-purple-500/30">
                  {activeAuthor.avatarUrl ? (
                    <img src={activeAuthor.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    activeAuthor.initial
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-100">@{activeAuthor.username}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{formatTime(activePost.createdAt)}</p>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {activePost.body ? (
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-xs font-semibold text-purple-200">
                      {activeAuthor.avatarUrl ? (
                        <img src={activeAuthor.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        activeAuthor.initial
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-200">
                      <span className="mr-1 font-semibold text-gray-100">@{activeAuthor.username}</span>
                      <MentionText text={activePost.body} />
                    </p>
                  </div>
                ) : null}

                <div className="mt-6 space-y-3">
                  {activeComments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-800 p-4 text-center text-sm text-gray-500">
                      Belum ada komentar
                    </div>
                  ) : (
                    activeComments.map((comment) => (
                      <CommentItem key={comment.id} postId={activePost.id} comment={comment} currentUser={currentUser} />
                    ))
                  )}
                </div>
              </div>

              <footer className="shrink-0 border-t border-gray-800 p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <button
                    className={`rounded-full p-2 transition duration-150 hover:bg-purple-500/10 active:scale-90 disabled:opacity-60 ${
                      activePost.likedByMe ? 'text-red-400' : 'text-gray-200 hover:text-purple-300'
                    }`}
                    disabled={Boolean(reactingPostIds[activePost.id])}
                    onClick={() => void toggleViewerLike()}
                    type="button"
                    aria-label="Like"
                  >
                    <Heart size={21} fill={activePost.likedByMe ? 'currentColor' : 'none'} />
                  </button>
                  <button className="rounded-full p-2 text-gray-200 transition duration-150 hover:bg-purple-500/10 hover:text-purple-300 active:scale-90" type="button" aria-label="Comment">
                    <MessageCircle size={21} />
                  </button>
                  <button className="rounded-full p-2 text-gray-200 transition duration-150 hover:bg-purple-500/10 hover:text-purple-300 active:scale-90" type="button" aria-label="Share">
                    <Send size={21} />
                  </button>
                </div>
                <div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="min-w-0 truncate">{activePost.likeCount} likes - {activePost.commentCount} comments</span>
                  <span>{activeMediaIndex + 1}/{activeItem.media.length} media - {activePosition(items, activeItem)}/{items.length} posts</span>
                </div>
                <div className="mt-3">
                  <CommentInput placeholder="Tulis komentar" submitLabel="Post" onSubmit={submitComment} />
                </div>
              </footer>
            </aside>
          </div>
          <button
            className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-gray-950/80 p-2 text-gray-100 transition duration-150 hover:bg-purple-600 active:scale-95 sm:block"
            onClick={showNext}
            type="button"
            aria-label="Next media"
          >
            <ChevronRight size={24} />
          </button>
          <div className="absolute bottom-4 flex gap-3 sm:hidden">
            <button className="rounded-full bg-gray-950/80 p-2 text-gray-100 transition duration-150 active:scale-95" onClick={showPrevious} type="button" aria-label="Previous media">
              <ChevronLeft size={22} />
            </button>
            <button className="rounded-full bg-gray-950/80 p-2 text-gray-100 transition duration-150 active:scale-95" onClick={showNext} type="button" aria-label="Next media">
              <ChevronRight size={22} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function activePosition(items: ProfileMediaItem[], activeItem: ProfileMediaItem) {
  return Math.max(0, items.findIndex((item) => item.id === activeItem.id)) + 1;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function ProfilePostCollage({ media }: { media: PostMedia[] }) {
  const visibleMedia = media.slice(0, 4);
  const extraCount = Math.max(0, media.length - 4);

  return (
    <div className={`grid h-full w-full ${profileCollageClass(media.length)}`}>
      {visibleMedia.map((item, index) => (
        <div key={`${item.id ?? item.fileUrl}-${index}`} className={`relative min-w-0 overflow-hidden ${profileCollageTileClass(media.length, index)}`}>
          <ProfileMediaPreview media={item} />
          {index === 3 && extraCount > 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-2xl font-semibold text-white">
              +{extraCount}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ProfileMediaPreview({ media }: { media: PostMedia }) {
  const asset = media.mediaAsset;
  const info = mediaPreviewInfo(asset?.mimeType ?? media.mimeType);
  const src = resolveMedia(media.publicUrl ?? media.fileUrl);
  const poster = useVideoPoster(src, Boolean(src && info.kind === 'video' && !asset));
  if (asset && info.kind !== 'image') {
    return (
      <div className="h-full w-full">
        <AttachmentRenderer attachments={[{ id: media.id ?? asset.id, orderIndex: media.orderIndex, mediaAsset: asset }]} variant="grid" />
      </div>
    );
  }

  if (info.kind === 'video') {
    return (
      <div className="relative h-full w-full bg-black">
        <video
          src={src}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          muted
          playsInline
          preload="metadata"
          controls={false}
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          onDoubleClick={(event) => event.preventDefault()}
        />
        {poster ? <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : null}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white ring-1 ring-white/20">
            <Play size={19} fill="currentColor" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={resolveMedia(media.publicUrl ?? media.fileUrl)}
      alt=""
      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
      loading="lazy"
      onDoubleClick={(event) => event.preventDefault()}
    />
  );
}

function ProfileMediaViewer({ media }: { media: PostMedia }) {
  const asset = media.mediaAsset;
  const info = mediaPreviewInfo(asset?.mimeType ?? media.mimeType);
  if (asset && info.kind !== 'image') {
    return (
      <div className="w-full max-w-xl p-4">
        <AttachmentRenderer attachments={[{ id: media.id ?? asset.id, orderIndex: media.orderIndex, mediaAsset: asset }]} variant="viewer" />
      </div>
    );
  }

  if (info.kind === 'video') {
    return (
      <video
        src={resolveMedia(media.publicUrl ?? media.fileUrl)}
        controls
        className="max-h-full w-full rounded-xl bg-black md:max-h-[90vh]"
        playsInline
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        onDoubleClick={(event) => event.preventDefault()}
      />
    );
  }

  return (
    <img
      src={resolveMedia(media.publicUrl ?? media.fileUrl)}
      alt=""
      className="max-h-full max-w-full object-contain md:max-h-[90vh]"
      onDoubleClick={(event) => event.preventDefault()}
    />
  );
}

function profileCollageClass(count: number) {
  if (count === 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-2 gap-1';
  return 'grid-cols-2 grid-rows-2 gap-1';
}

function profileCollageTileClass(count: number, index: number) {
  if (count === 3 && index === 0) return 'row-span-2';
  return '';
}
