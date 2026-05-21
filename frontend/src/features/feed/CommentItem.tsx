import { useState } from 'react';
import { resolveUserIdentity } from '../../lib/identity-resolver';
import { User } from '../../stores/auth-store';
import { FeedComment, useFeedStore } from '../../stores/feed-store';
import { CommentInput } from './CommentInput';
import { MentionText } from './mention-text';

export function CommentItem({ postId, comment, currentUser }: { postId: string; comment: FeedComment; currentUser: User | null }) {
  const replies = comment.children ?? [];
  const [hasMoreReplies, setHasMoreReplies] = useState(replies.length >= 3);
  const [loadingReplies, setLoadingReplies] = useState(false);

  const [replyFormOpen, setReplyFormOpen] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const author = resolveUserIdentity(comment.user, currentUser?.id === comment.user.id ? currentUser : undefined);

  async function submitReply(body: string) {
    if (!currentUser) return;
    await useFeedStore.getState().createComment(postId, body, currentUser, comment.id);
    setReplyFormOpen(false);
    setRepliesOpen(true); // optional: auto buka replies setelah kirim
  }

  async function reportComment(commentId: string) {
    const reason = window.prompt('Alasan report comment ini?');
    if (!reason?.trim()) return;
    await useFeedStore.getState().reportTarget('comment', commentId, reason.trim());
    window.alert('Report terkirim.');
  }

  async function loadMoreReplies() {
    if (!hasMoreReplies || loadingReplies) return;

    setLoadingReplies(true);
    try {
      const cursor = replies[replies.length - 1]?.id;
      const res = await useFeedStore.getState().fetchReplies(
        postId,
        comment.id,
        cursor
      );

      setHasMoreReplies(Boolean(res.meta?.hasNextPage));
    } finally {
      setLoadingReplies(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-gray-950 px-3 py-3 ring-1 ring-gray-800">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/20 text-xs font-semibold text-purple-200">
            {author.avatarUrl ? <img src={author.avatarUrl} alt="" className="h-full w-full object-cover rounded-full" /> : author.initial}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-200">@{author.username}</p>
            <p className="text-[11px] text-gray-500">{formatTime(comment.createdAt)}</p>
          </div>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-200">
          <MentionText text={comment.body} />
        </p>
        <div className="mt-2 flex gap-3">
          <button 
          className="text-xs font-semibold text-purple-300 transition duration-150 hover:text-purple-200 active:scale-95" 
          onClick={() => setReplyFormOpen((open) => !open)}
          type="button">
            Reply
          </button>
          {comment.children.length > 0 && (
            <button
              className="text-xs font-semibold text-gray-400 transition duration-150 hover:text-gray-200 active:scale-95"
              onClick={() => setRepliesOpen((prev) => !prev)}
              type="button"
            >
              {repliesOpen ? 'Hide replies' : `View replies (${comment.children.length}+)`}
            </button>
          )}
          <button className="text-xs font-semibold text-gray-500 transition duration-150 hover:text-red-200 active:scale-95" onClick={() => void reportComment(comment.id)} type="button">
            Report
          </button>
        </div>
      </div>

      {replyFormOpen ? (
        <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
          <p className="mb-2 truncate text-xs text-gray-400">
            Replying to <span className="font-semibold text-purple-300">@{author.username}</span>
          </p>
          <CommentInput
            placeholder={`Reply @${author.username}`}
            submitLabel="Reply"
            onSubmit={submitReply}
          />
        </div>
      ) : null}
      {repliesOpen && (
        <div className="ml-8 space-y-2 border-l border-gray-800 pl-3">
          {replies.map((child) => {
            const childAuthor = resolveUserIdentity(child.user, currentUser?.id === child.user.id ? currentUser : undefined);
            return (
            <div key={child.id} className="rounded-xl bg-gray-900 px-3 py-2 shadow-sm ring-1 ring-gray-800">
              <p className="text-xs font-semibold text-gray-300">@{childAuthor.username}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-200">
                <MentionText text={child.body} />
              </p>
              <button
                className="mt-2 text-xs font-semibold text-gray-500 transition duration-150 hover:text-red-200 active:scale-95"
                onClick={() => void reportComment(child.id)}
                type="button"
              >
                Report
              </button>
            </div>
          );
          })}

          {hasMoreReplies && (
            <button
              className="text-xs font-semibold text-purple-300 transition duration-150 hover:text-purple-200 active:scale-95 disabled:opacity-60"
              onClick={loadMoreReplies}
              disabled={loadingReplies}
            >
              {loadingReplies ? 'Loading...' : 'Load more replies'}
            </button>
          )}
        </div>
      )}
    </div>
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
