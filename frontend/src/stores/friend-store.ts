import { create } from 'zustand';
import { apiClient, apiData } from '../lib/api-client';
import { User } from './auth-store';
import { useFollowStore } from './follow-store';

export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export type FriendRequest = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
  requester: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'bio'>;
  addressee: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'bio'>;
  friend?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'bio'>;
};

export type FriendListItem = {
  id: string;
  username: string;
  name: string;
  displayName: string;
  avatar?: string | null;
  avatarUrl?: string | null;
  friendshipId: string;
  canChat: boolean;
  lastMessage?: { id: string; body: string; createdAt: string; senderId: string } | null;
};

type FriendRequestsResponse = {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
};

type FriendState = {
  friends: FriendListItem[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  loading: boolean;
  fetchFriends: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  requestFriend: (userId: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;
  removeFriend: (userId: string) => Promise<void>;
  applyFriendEvent: (payload: { requesterId?: string; addresseeId?: string; friendshipId?: string; status?: FriendshipStatus }, currentUserId: string) => void;
};

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  loading: false,
  fetchFriends: async () => {
    const friends = await apiData<FriendListItem[]>(apiClient.get('/friends'));
    set({ friends });
  },
  fetchRequests: async () => {
    set({ loading: true });
    try {
      const response = await apiData<FriendRequestsResponse>(apiClient.get('/friend-requests'));
      set({ incoming: response.incoming, outgoing: response.outgoing });
    } finally {
      set({ loading: false });
    }
  },
  requestFriend: async (userId) => {
    const request = await apiData<FriendRequest>(apiClient.post(`/friends/${userId}/request`));
    set((state) => ({ outgoing: [request, ...state.outgoing.filter((item) => item.id !== request.id)] }));
    patchProfile(userId, {
      friendshipStatus: 'pending',
      friendRequestId: request.id,
      incomingFriendRequestId: null,
      outgoingFriendRequestId: request.id,
      isFriend: false,
      outgoingFriendRequest: true,
      incomingFriendRequest: false,
      canChat: false,
    });
  },
  acceptRequest: async (requestId) => {
    const request = await apiData<FriendRequest>(apiClient.post(`/friend-requests/${requestId}/accept`));
    set((state) => ({
      incoming: state.incoming.filter((item) => item.id !== requestId),
      friends: state.friends,
    }));
    patchProfile(request.requesterId, {
      friendshipStatus: 'accepted',
      friendRequestId: request.id,
      incomingFriendRequestId: null,
      outgoingFriendRequestId: null,
      isFriend: true,
      outgoingFriendRequest: false,
      incomingFriendRequest: false,
      canChat: true,
    });
  },
  rejectRequest: async (requestId) => {
    const request = await apiData<FriendRequest>(apiClient.post(`/friend-requests/${requestId}/reject`));
    set((state) => ({ incoming: state.incoming.filter((item) => item.id !== requestId) }));
    patchProfile(request.requesterId, {
      friendshipStatus: 'rejected',
      friendRequestId: request.id,
      incomingFriendRequestId: null,
      outgoingFriendRequestId: null,
      isFriend: false,
      outgoingFriendRequest: false,
      incomingFriendRequest: false,
      canChat: false,
    });
  },
  cancelRequest: async (requestId) => {
    const request = await apiData<FriendRequest>(apiClient.post(`/friend-requests/${requestId}/cancel`));
    set((state) => ({ outgoing: state.outgoing.filter((item) => item.id !== requestId) }));
    patchProfile(request.addresseeId, {
      friendshipStatus: 'cancelled',
      friendRequestId: request.id,
      incomingFriendRequestId: null,
      outgoingFriendRequestId: null,
      isFriend: false,
      outgoingFriendRequest: false,
      incomingFriendRequest: false,
      canChat: false,
    });
  },
  removeFriend: async (userId) => {
    await apiClient.delete(`/friends/${userId}`);
    set((state) => ({ friends: state.friends.filter((item) => item.id !== userId) }));
    patchProfile(userId, {
      friendshipStatus: 'cancelled',
      friendRequestId: null,
      incomingFriendRequestId: null,
      outgoingFriendRequestId: null,
      isFriend: false,
      outgoingFriendRequest: false,
      incomingFriendRequest: false,
      canChat: false,
    });
  },
  applyFriendEvent: (payload, currentUserId) => {
    if (!payload.requesterId || !payload.addresseeId || !payload.friendshipId || !payload.status) return;
    const related = payload.requesterId === currentUserId || payload.addresseeId === currentUserId;
    if (!related) return;

    const otherUserId = payload.requesterId === currentUserId ? payload.addresseeId : payload.requesterId;
    if (payload.status === 'PENDING') {
      void get().fetchRequests();
      patchProfile(otherUserId, {
        friendshipStatus: 'pending',
        friendRequestId: payload.friendshipId,
        incomingFriendRequestId: payload.addresseeId === currentUserId ? payload.friendshipId : null,
        outgoingFriendRequestId: payload.requesterId === currentUserId ? payload.friendshipId : null,
        isFriend: false,
        outgoingFriendRequest: payload.requesterId === currentUserId,
        incomingFriendRequest: payload.addresseeId === currentUserId,
        canChat: false,
      });
      return;
    }

    set((state) => ({
      incoming: state.incoming.filter((item) => item.id !== payload.friendshipId),
      outgoing: state.outgoing.filter((item) => item.id !== payload.friendshipId),
    }));
    void get().fetchRequests();

    if (payload.status === 'ACCEPTED') {
      void get().fetchFriends();
      patchProfile(otherUserId, {
        friendshipStatus: 'accepted',
        friendRequestId: payload.friendshipId,
        incomingFriendRequestId: null,
        outgoingFriendRequestId: null,
        isFriend: true,
        outgoingFriendRequest: false,
        incomingFriendRequest: false,
        canChat: true,
      });
      return;
    }

    if (payload.status === 'REJECTED') {
      patchProfile(otherUserId, {
        friendshipStatus: 'rejected',
        friendRequestId: payload.friendshipId,
        incomingFriendRequestId: null,
        outgoingFriendRequestId: null,
        isFriend: false,
        outgoingFriendRequest: false,
        incomingFriendRequest: false,
        canChat: false,
      });
    }
  },
}));

function patchProfile(userId: string, patch: Record<string, unknown>) {
  const profile = useFollowStore.getState().profiles[userId];
  if (!profile) return;
  useFollowStore.setState((state) => ({
    profiles: {
      ...state.profiles,
      [userId]: { ...profile, ...patch },
    },
  }));
}
