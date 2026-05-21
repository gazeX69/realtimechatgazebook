import { Check, MessageSquare, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { resolveUserIdentity } from '../../lib/identity-resolver';
import { useChatStore } from '../../stores/chat-store';
import { FriendListItem, FriendRequest, useFriendStore } from '../../stores/friend-store';

export function FriendRequestsPage() {
  const navigate = useNavigate();
  const friends = useFriendStore((state) => state.friends);
  const incoming = useFriendStore((state) => state.incoming);
  const outgoing = useFriendStore((state) => state.outgoing);
  const loading = useFriendStore((state) => state.loading);

  useEffect(() => {
    void useFriendStore.getState().fetchFriends();
    void useFriendStore.getState().fetchRequests();
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-neon">
        <h1 className="text-lg font-semibold text-gray-100">Friends</h1>
        <p className="mt-1 text-sm text-gray-500">Open a direct chat from people you have accepted.</p>
        {loading ? <p className="mt-2 text-sm text-gray-500">Loading requests...</p> : null}
      </section>

      <RequestSection title="Friends" emptyText="No friends yet.">
        {friends.map((friend) => (
          <FriendRow key={friend.id} friend={friend} onMessage={() => void openChat(friend)} />
        ))}
      </RequestSection>

      <RequestSection title="Incoming" emptyText="No incoming requests.">
        {incoming.map((request) => (
          <RequestRow key={request.id} request={request} user={request.requester}>
            <Button className="h-9 px-3 text-xs" onClick={() => void useFriendStore.getState().acceptRequest(request.id)}>
              <Check size={15} />
              Accept
            </Button>
            <Button className="h-9 bg-gray-800 px-3 text-xs shadow-none hover:from-purple-600 hover:to-purple-700" onClick={() => void useFriendStore.getState().rejectRequest(request.id)}>
              <X size={15} />
              Reject
            </Button>
          </RequestRow>
        ))}
      </RequestSection>

      <RequestSection title="Outgoing" emptyText="No outgoing requests.">
        {outgoing.map((request) => (
          <RequestRow key={request.id} request={request} user={request.addressee}>
            <Button className="h-9 bg-gray-800 px-3 text-xs shadow-none hover:from-purple-600 hover:to-purple-700" onClick={() => void useFriendStore.getState().cancelRequest(request.id)}>
              Cancel
            </Button>
          </RequestRow>
        ))}
      </RequestSection>
    </div>
  );

  async function openChat(friend: FriendListItem) {
    if (!friend.canChat) return;
    const conversation = await useChatStore.getState().openDirectConversation(friend.id);
    navigate(`/chat/${conversation.id}`);
  }
}

function RequestSection({ title, emptyText, children }: { title: string; emptyText: string; children: ReactNode }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-neon">
      <div className="border-b border-gray-800 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      </div>
      <div className="divide-y divide-gray-800">
        {hasItems ? children : <p className="p-4 text-sm text-gray-500">{emptyText}</p>}
      </div>
    </section>
  );
}

function FriendRow({ friend, onMessage }: { friend: FriendListItem; onMessage: () => void }) {
  const identity = resolveUserIdentity(friend);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <Link to={`/users/${friend.id}`} className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-sm font-semibold text-purple-200 ring-1 ring-purple-500/30">
          {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" /> : identity.initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-100">{identity.displayName}</p>
          <p className="truncate text-xs text-gray-500">
            {friend.lastMessage?.body ?? `@${identity.username}`}
          </p>
        </div>
      </Link>
      <Button className="h-9 px-3 text-xs" disabled={!friend.canChat} onClick={onMessage}>
        <MessageSquare size={15} />
        Message
      </Button>
    </div>
  );
}

function RequestRow({
  request,
  user,
  children,
}: {
  request: FriendRequest;
  user: FriendRequest['requester'];
  children: ReactNode;
}) {
  const identity = resolveUserIdentity(user);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <Link to={`/users/${user.id}`} className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-sm font-semibold text-purple-200 ring-1 ring-purple-500/30">
          {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" /> : identity.initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-100">{identity.displayName}</p>
          <p className="truncate text-xs text-gray-500">@{identity.username}</p>
        </div>
      </Link>
      <div className="flex gap-2">{children}</div>
      <span className="sr-only">{request.status}</span>
    </div>
  );
}
