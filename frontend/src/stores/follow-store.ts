import { create } from 'zustand';
import { apiClient, apiData } from '../lib/api-client';
import { User } from './auth-store';

export type PublicProfile = User & {
  followerCount: number;
  followingCount: number;
  postCount: number;
  followedByMe: boolean;
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

type FollowState = {
  profiles: Record<string, PublicProfile>;
  fetchProfile: (userId: string) => Promise<void>;
  toggleFollow: (userId: string) => Promise<void>;
  applyFollowEvent: (payload: { followerId?: string; targetUserId?: string }, currentUserId: string, followed: boolean) => void;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
};

export const useFollowStore = create<FollowState>((set, get) => ({
  profiles: {},
  fetchProfile: async (userId) => {
    const profile = await apiData<PublicProfile>(apiClient.get(`/users/${userId}/profile`));
    set((state) => ({ profiles: { ...state.profiles, [userId]: profile } }));
  },
  toggleFollow: async (userId) => {
    const profile = get().profiles[userId];
    if (!profile || !profile.canInteract) return;
    const nextFollowed = !profile.followedByMe;
    set((state) => ({
      profiles: {
        ...state.profiles,
        [userId]: {
          ...profile,
          followedByMe: nextFollowed,
          followerCount: Math.max(0, profile.followerCount + (nextFollowed ? 1 : -1)),
        },
      },
    }));
    if (nextFollowed) await apiClient.post(`/users/${userId}/follow`);
    else await apiClient.delete(`/users/${userId}/follow`);
  },
  applyFollowEvent: (payload, currentUserId, followed) => {
    if (!payload.followerId || !payload.targetUserId) return;
    set((state) => {
      const profiles = { ...state.profiles };
      let changed = false;
      const targetProfile = profiles[payload.targetUserId!];

      if (targetProfile) {
        const isFollower = payload.followerId === currentUserId;
        const shouldChangeCount = isFollower ? targetProfile.followedByMe !== followed : payload.targetUserId === currentUserId;
        profiles[payload.targetUserId!] = {
          ...targetProfile,
          followedByMe: isFollower ? followed : targetProfile.followedByMe,
          followerCount: shouldChangeCount
            ? Math.max(0, targetProfile.followerCount + (followed ? 1 : -1))
            : targetProfile.followerCount,
        };
        changed = true;
      }

      const followerProfile = profiles[payload.followerId!];
      if (followerProfile && payload.followerId === currentUserId) {
        profiles[payload.followerId!] = {
          ...followerProfile,
          followingCount: Math.max(0, followerProfile.followingCount + (followed ? 1 : -1)),
        };
        changed = true;
      }

      return changed ? { profiles } : state;
    });
  },
  blockUser: async (userId) => {
    await apiClient.post(`/users/${userId}/block`);
    set((state) => {
      const profile = state.profiles[userId];
      if (!profile) return state;
      return {
        profiles: {
          ...state.profiles,
          [userId]: {
            ...profile,
            followedByMe: false,
            followerCount: profile.followedByMe ? Math.max(0, profile.followerCount - 1) : profile.followerCount,
            isBlockedByMe: true,
            hasBlockedMe: false,
            canInteract: false,
            friendshipStatus: 'cancelled',
            friendRequestId: null,
            incomingFriendRequestId: null,
            outgoingFriendRequestId: null,
            isFriend: false,
            outgoingFriendRequest: false,
            incomingFriendRequest: false,
            canChat: false,
          },
        },
      };
    });
  },
  unblockUser: async (userId) => {
    await apiClient.delete(`/users/${userId}/block`);
    set((state) => {
      const profile = state.profiles[userId];
      if (!profile) return state;
      return {
        profiles: {
          ...state.profiles,
          [userId]: {
            ...profile,
            isBlockedByMe: false,
            canInteract: !profile.hasBlockedMe,
          },
        },
      };
    });
  },
}));
