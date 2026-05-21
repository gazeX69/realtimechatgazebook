import { Flag, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { resolveUserIdentity } from '../../lib/identity-resolver';
import { User } from '../../stores/auth-store';
import { FeedComment, FeedPost, useFeedStore } from '../../stores/feed-store';
import { CommentInput } from './CommentInput';
import { CommentItem } from './CommentItem';
import { MentionText } from './mention-text';
import { MediaGrid } from './MediaGrid';
import { ReactionButton } from './ReactionButton';

const EMPTY_COMMENTS: FeedComment[] = [];

export function PostCard({
  post,
  currentUser,
}: {
  post: FeedPost;
  currentUser: User | null;
}) {
  const comments = useFeedStore(
    (state) => state.commentsByPost[post.id] ?? EMPTY_COMMENTS,
  );
  const commentsLoaded = useFeedStore((state) =>
    Object.prototype.hasOwnProperty.call(state.commentsByPost, post.id),
  );
  const commentsLoading = useFeedStore((state) =>
    Boolean(state.commentsLoadingByPost[post.id]),
  );
  const commentsHasMore = useFeedStore((state) =>
    Boolean(state.commentsHasMoreByPost[post.id]),
  );
  const reacting = useFeedStore((state) =>
    Boolean(state.reactingPostIds[post.id]),
  );
  const [commentsOpen, setCommentsOpen] = useState(false);
  const author = resolveUserIdentity(post.user, currentUser?.id === post.user.id ? currentUser : undefined);

  async function handleToggleComments() {
    const nextOpen = !commentsOpen;
    setCommentsOpen(nextOpen);
    if (nextOpen && !commentsLoaded)
      await useFeedStore.getState().fetchInitialComments(post.id);
  }

  async function loadMoreComments() {
    await useFeedStore.getState().loadMoreComments(post.id);
  }

  async function submitComment(body: string) {
    if (!currentUser) return;
    await useFeedStore.getState().createComment(post.id, body, currentUser);
  }

  async function reportPost() {
    const reason = window.prompt('Alasan report post ini?');
    if (!reason?.trim()) return;
    await useFeedStore.getState().reportTarget('post', post.id, reason.trim());
    window.alert('Report terkirim.');
  }

  return (
    <article className="w-full max-w-full overflow-hidden rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-neon transition duration-150 hover:border-purple-500/40 hover:bg-gray-900/90">
      <div className="flex min-w-0 gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-sm font-semibold text-purple-200 ring-1 ring-purple-500/30">
          {author.avatarUrl ? (
            <img
              src={author.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            author.initial
          )}
        </div>
        <div className="min-w-0 flex-1 max-w-full">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to={`/users/${post.user.id}`}
              className="font-semibold text-gray-100 transition duration-150 hover:text-purple-300 active:text-purple-200"
            >
              @{author.username}
            </Link>
            <span className="text-xs text-gray-500">
              {formatTime(post.createdAt)}
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-100">
            <MentionText text={post.body} />
          </p>
          <MediaGrid media={post.media} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-800 pt-3">
        <ReactionButton
          liked={post.likedByMe}
          count={post.likeCount}
          disabled={reacting}
          onClick={() => void useFeedStore.getState().toggleLike(post.id)}
        />
        <button
          className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-gray-400 transition duration-150 hover:bg-purple-500/10 hover:text-gray-100 active:scale-[0.98]"
          onClick={() => void handleToggleComments()}
          type="button"
        >
          <MessageCircle size={17} />
          <span>{post.commentCount} Comments</span>
        </button>
        <button
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-gray-400 transition duration-150 hover:bg-red-500/10 hover:text-red-200 active:scale-[0.98]"
          onClick={() => void reportPost()}
          type="button"
        >
          <Flag size={16} />
          <span>Report</span>
        </button>
      </div>

      {commentsOpen ? (
        <div className="mt-4 space-y-3 border-t border-gray-800 pt-4">
          <CommentInput onSubmit={submitComment} />
          {commentsLoading && comments.length === 0 ? (
            <p className="text-sm text-gray-500">Memuat komentar...</p>
          ) : null}
          {!commentsLoading && comments.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada komentar.</p>
          ) : null}
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              postId={post.id}
              comment={comment}
              currentUser={currentUser}
            />
          ))}
          {commentsHasMore ? (
            <button
              className="w-full rounded-lg border border-gray-800 px-3 py-2 text-sm font-semibold text-gray-400 transition duration-150 hover:bg-purple-500/10 hover:text-gray-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={commentsLoading}
              onClick={() => void loadMoreComments()}
              type="button"
            >
              {commentsLoading ? 'Memuat...' : 'Load more comments'}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
