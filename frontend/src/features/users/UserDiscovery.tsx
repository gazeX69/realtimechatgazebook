import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { apiClient, apiData } from '../../lib/api-client';
import { resolveUserIdentity } from '../../lib/identity-resolver';

export type DiscoveryUser = {
  id: string;
  username: string;
  name: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  isFollowing: boolean;
  isBlockedByMe: boolean;
  hasBlockedMe: boolean;
  canInteract: boolean;
  friendshipStatus: 'none' | 'pending' | 'accepted' | 'rejected' | 'cancelled';
  friendRequestId: string | null;
  incomingFriendRequestId: string | null;
  outgoingFriendRequestId: string | null;
  isFriend: boolean;
  outgoingFriendRequest: boolean;
  incomingFriendRequest: boolean;
  canChat: boolean;
};

export function UserSearchBox() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<DiscoveryUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeoutId = window.setTimeout(() => {
      apiData<DiscoveryUser[]>(apiClient.get('/users/search', { params: { q: trimmed } }))
        .then(setUsers)
        .finally(() => setLoading(false));
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  return (
    <section className="relative rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-neon">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={17} />
        <Input className="pl-9" placeholder="Search users" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {query.trim() ? (
        <div className="absolute left-4 right-4 top-[4.25rem] z-20 overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-lg shadow-purple-500/10">
          {loading ? <p className="p-4 text-sm text-gray-500">Searching...</p> : null}
          {!loading && users.length === 0 ? <p className="p-4 text-sm text-gray-500">No users found</p> : null}
          {!loading ? users.map((user) => <DiscoveryUserItem key={user.id} user={user} />) : null}
        </div>
      ) : null}
    </section>
  );
}

export function SuggestedUsers() {
  const [users, setUsers] = useState<DiscoveryUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiData<DiscoveryUser[]>(apiClient.get('/users/suggested'))
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-neon">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Suggested users</h2>
      {loading ? <p className="mt-3 text-sm text-gray-500">Loading users...</p> : null}
      {!loading && users.length === 0 ? <p className="mt-3 text-sm text-gray-500">No suggestions yet.</p> : null}
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {users.map((user) => {
          const identity = resolveUserIdentity(user);
          return (
          <div key={user.id} className="min-w-44 rounded-xl border border-gray-800 bg-gray-950 p-3">
            <Link to={`/users/${user.id}`} className="flex items-center gap-2">
              <UserAvatar user={user} size="h-10 w-10" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-100">{identity.displayName}</p>
                <p className="truncate text-xs text-gray-500">@{identity.username}</p>
              </div>
            </Link>
            <FollowButton user={user} className="mt-3 h-8 w-full text-xs" />
            {!user.canInteract ? <p className="mt-2 text-xs text-red-300">Restricted</p> : null}
          </div>
        );
        })}
      </div>
    </section>
  );
}

function DiscoveryUserItem({ user }: { user: DiscoveryUser }) {
  const identity = resolveUserIdentity(user);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-800 p-3 last:border-b-0">
      <Link to={`/users/${user.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <UserAvatar user={user} size="h-10 w-10" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-100">{identity.displayName}</p>
          <p className="truncate text-xs text-gray-500">@{identity.username}</p>
        </div>
      </Link>
      <FollowButton user={user} />
    </div>
  );
}

function FollowButton({ user, className }: { user: DiscoveryUser; className?: string }) {
  const [isFollowing, setIsFollowing] = useState(user.isFollowing);
  const [loading, setLoading] = useState(false);

  async function toggleFollow() {
    if (loading || !user.canInteract) return;
    setLoading(true);
    const next = !isFollowing;
    setIsFollowing(next);
    try {
      if (next) await apiClient.post(`/users/${user.id}/follow`);
      else await apiClient.delete(`/users/${user.id}/follow`);
    } catch {
      setIsFollowing(!next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button className={className ?? 'h-8 px-3 text-xs'} disabled={loading || !user.canInteract} onClick={() => void toggleFollow()}>
      {loading ? '...' : user.isBlockedByMe ? 'Blocked' : isFollowing ? 'Following' : 'Follow'}
    </Button>
  );
}

function UserAvatar({ user, size }: { user: DiscoveryUser; size: string }) {
  const identity = resolveUserIdentity(user);
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-sm font-semibold text-purple-200 ring-1 ring-purple-500/30 ${size}`}>
      {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" /> : identity.initial}
    </div>
  );
}
