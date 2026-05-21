import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resolveUserIdentity } from '../../lib/identity-resolver';
import { useAuthStore } from '../../stores/auth-store';
import { useChatStore } from '../../stores/chat-store';
import { useFriendStore } from '../../stores/friend-store';

export function ChatListPage() {
  const currentUser = useAuthStore((state) => state.user);
  const conversations = useChatStore((state) => state.conversations);
  const isLoadingConversations = useChatStore((state) => state.isLoadingConversations);
  const conversationsError = useChatStore((state) => state.conversationsError);
  const onlineUserIds = useChatStore((state) => state.onlineUserIds);
  const friends = useFriendStore((state) => state.friends);
  const navigate = useNavigate();
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [groupStatus, setGroupStatus] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const memberCandidates = useMemo(
    () => friends.filter((friend) => friend.canChat).sort((left, right) => left.username.localeCompare(right.username)),
    [friends],
  );

  useEffect(() => {
    if (!currentUser?.id) return;

    const refresh = () => {
      void useChatStore.getState().loadConversations();
    };

    refresh();
    void useChatStore.getState().loadUsers();
    void useFriendStore.getState().fetchFriends();
    const intervalId = window.setInterval(refresh, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentUser?.id]);

  function closeGroupDialog() {
    setShowGroupDialog(false);
    setGroupName('');
    setSelectedMemberIds([]);
    setGroupStatus(null);
    setCreatingGroup(false);
  }

  function toggleMember(userId: string) {
    setSelectedMemberIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) {
      setGroupStatus('Group title is required.');
      return;
    }
    if (selectedMemberIds.length === 0) {
      setGroupStatus('Select at least one member.');
      return;
    }

    setCreatingGroup(true);
    setGroupStatus(null);
    try {
      const conversation = await useChatStore.getState().createGroupConversation(name, selectedMemberIds);
      closeGroupDialog();
      navigate(`/chat/${conversation.id}`);
    } catch {
      setGroupStatus('Failed to create group.');
    } finally {
      setCreatingGroup(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-neon">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 p-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-100">Conversations</h1>
            <p className="mt-1 text-sm text-gray-500">Unread chats stay pinned in your attention.</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Link
              to="/friends"
              className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 px-4 text-sm font-medium text-white shadow-lg shadow-purple-500/10 transition-all duration-150 hover:from-purple-600 hover:to-purple-700 active:scale-95 sm:flex-none"
            >
              Start Chat
            </Link>
            <button
              className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-gray-800 px-4 text-sm font-medium text-gray-100 transition hover:bg-gray-700 sm:flex-none"
              onClick={() => setShowGroupDialog(true)}
              type="button"
            >
              Create Group
            </button>
          </div>
        </div>
        <div className="divide-y divide-gray-800">
          {conversationsError && conversations.length === 0 ? (
            <div className="p-6 text-center">
              <p className="font-semibold text-red-200">Failed to load conversations.</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">Check your connection and try again.</p>
              <button
                className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-gray-800 px-4 text-sm font-medium text-gray-100 transition hover:bg-gray-700"
                onClick={() => void useChatStore.getState().loadConversations()}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : isLoadingConversations && conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">Loading conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10 text-xl">💬</div>
              <p className="mt-3 font-semibold text-gray-100">Start a conversation</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">Find people to follow or message from Explore when you are ready to chat.</p>
              <Link
                to="/explore"
                className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 px-4 text-sm font-medium text-white shadow-lg shadow-purple-500/10 transition-all duration-150 hover:from-purple-600 hover:to-purple-700 active:scale-95"
              >
                Explore people
              </Link>
            </div>
          ) : (
            conversations.map((conversation) => {
              const other = conversation.participants.find((item) => item.user.id !== currentUser?.id)?.user;
              const otherIdentity = resolveUserIdentity(other);
              const title = conversation.type === 'GROUP' ? (conversation.name ?? 'Group chat') : (other ? otherIdentity.displayName : 'Direct chat');
              const avatarLabel = conversation.type === 'GROUP' ? title.slice(0, 1).toUpperCase() : otherIdentity.initial;
              const lastMessage = conversation.lastMessage ?? conversation.messages[0];
              const unread = conversation.unreadCount > 0;
              return (
                <Link
                  key={conversation.id}
                  to={`/chat/${conversation.id}`}
                  className={`flex items-center gap-3 p-4 transition duration-150 hover:bg-purple-500/10 ${
                    unread ? 'bg-purple-500/20' : ''
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-sm font-semibold text-purple-200 ring-1 ring-purple-500/30">
                    {otherIdentity.avatarUrl && conversation.type === 'DIRECT' ? (
                      <img src={otherIdentity.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      avatarLabel
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className={`truncate text-gray-100 ${unread ? 'font-bold' : 'font-medium'}`}>
                        {title}
                      </p>
                      <span className="shrink-0 text-xs text-gray-500">{lastMessage ? formatChatTime(lastMessage.createdAt) : ''}</span>
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2">
                      {conversation.type === 'GROUP' ? (
                        <span className="shrink-0 rounded-full bg-gray-800 px-2 py-0.5 text-[11px] font-semibold uppercase text-purple-200">
                          Group
                        </span>
                      ) : null}
                      <p className={`truncate text-sm ${unread ? 'font-semibold text-gray-100' : 'text-gray-500'}`}>
                        {conversation.canInteract === false
                          ? 'Interaksi dibatasi'
                          : (lastMessage?.body || (lastMessage?.attachments?.length ? 'Attachment' : 'No messages yet'))}
                      </p>
                    </div>
                    {conversation.type === 'DIRECT' && other ? (
                      <p className="mt-0.5 text-xs text-gray-600">{onlineUserIds.includes(other.id) ? 'Online' : 'Offline'}</p>
                    ) : null}
                    {conversation.type === 'GROUP' ? (
                      <p className="mt-0.5 text-xs text-gray-600">{conversation.participants.length} members</p>
                    ) : null}
                  </div>
                  {unread ? (
                    <span className="rounded-full bg-purple-500 px-2 py-0.5 text-xs font-bold text-white shadow-lg shadow-purple-500/20">
                      {conversation.unreadCount}
                    </span>
                  ) : null}
                </Link>
              );
            })
          )}
        </div>
      </section>
      {showGroupDialog ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/70 p-3 sm:items-center sm:justify-center">
          <form className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-950 p-4 shadow-2xl" onSubmit={(event) => void handleCreateGroup(event)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-100">Create group</h2>
                <p className="mt-1 text-sm text-gray-500">Name the group and choose members.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-100" onClick={closeGroupDialog} type="button">
                Close
              </button>
            </div>
            <label className="mt-4 block text-sm font-medium text-gray-300" htmlFor="group-name">
              Group title
            </label>
            <input
              id="group-name"
              className="mt-2 h-10 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 text-sm text-gray-100 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Example: Weekend plan"
            />
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-300">Members</p>
              <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-gray-800 bg-gray-900 p-2">
                {memberCandidates.length === 0 ? (
                  <p className="p-2 text-sm text-gray-500">No users available.</p>
                ) : (
                  memberCandidates.map((user) => (
                    <label key={user.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-800">
                      <input
                        checked={selectedMemberIds.includes(user.id)}
                        className="h-4 w-4 accent-purple-500"
                        onChange={() => toggleMember(user.id)}
                        type="checkbox"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-100">{user.displayName}</span>
                        <span className="block truncate text-xs text-gray-500">@{user.username}</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
            {groupStatus ? <p className="mt-3 text-sm text-red-300">{groupStatus}</p> : null}
            <div className="mt-4 flex gap-2">
              <button className="h-10 flex-1 rounded-lg bg-gray-800 px-4 text-sm font-medium text-gray-100 hover:bg-gray-700" onClick={closeGroupDialog} type="button">
                Cancel
              </button>
              <button className="h-10 flex-1 rounded-lg bg-purple-600 px-4 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60" disabled={creatingGroup} type="submit">
                {creatingGroup ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function formatChatTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
