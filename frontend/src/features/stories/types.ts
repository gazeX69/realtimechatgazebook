export type StoryUser = {
  id: string;
  username: string;
  name?: string | null;
  avatarUrl?: string | null;
};

export type StoryMediaAsset = {
  id: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  thumbnailUrl?: string | null;
  thumbnailStatus?: string | null;
  createdAt: string;
  publicUrl?: string | null;
};

export type Story = {
  id: string;
  groupId?: string | null;
  mediaAssetId?: string;
  caption?: string | null;
  orderIndex?: number;
  visibility?: "PUBLIC" | "FOLLOWERS" | "FRIENDS" | "PRIVATE";
  createdAt: string;
  expiresAt: string;
  user: StoryUser;
  mediaAsset: StoryMediaAsset;
  seenByMe: boolean;
  seenAt?: string | null;
};

export type StoryGroup = {
  groupId?: string;
  user: StoryUser;
  latestStoryAt: string;
  hasUnseen: boolean;
  stories: Story[];
};

export type CreateStoryInput = {
  mediaAssetId?: string;
  caption?: string;
  items?: {
    mediaAssetId: string;
    caption?: string;
    orderIndex?: number;
  }[];
  visibility?: "FOLLOWERS" | "FRIENDS" | "PRIVATE";
};
