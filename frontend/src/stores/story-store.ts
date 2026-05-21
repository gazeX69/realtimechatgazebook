import { create } from "zustand";
import { apiClient, apiData } from "../lib/api-client";
import {
  CreateStoryInput,
  Story,
  StoryGroup,
  StoryMediaAsset,
} from "../features/stories/types";

type StoryState = {
  storyGroups: StoryGroup[];
  activeStoryId: string | null;
  isLoadingFeed: boolean;
  isCreating: boolean;
  error: string | null;
  loadStoryFeed: () => Promise<void>;
  loadStory: (id: string) => Promise<Story>;
  uploadStoryMedia: (file: File) => Promise<StoryMediaAsset>;
  createStory: (input: CreateStoryInput) => Promise<StoryGroup>;
  markStorySeen: (id: string) => Promise<void>;
  reactToStory: (id: string, emoji: string) => Promise<void>;
  deleteStory: (id: string) => Promise<void>;
  setActiveStoryId: (id: string | null) => void;
  clearError: () => void;
};

let storyFeedRequest: Promise<void> | null = null;

export const useStoryStore = create<StoryState>((set, get) => ({
  storyGroups: [],
  activeStoryId: null,
  isLoadingFeed: false,
  isCreating: false,
  error: null,

  loadStoryFeed: async () => {
    if (storyFeedRequest) return storyFeedRequest;

    storyFeedRequest = (async () => {
      set({ isLoadingFeed: true, error: null });
      try {
        const storyGroups = await apiData<StoryGroup[]>(
          apiClient.get("/stories/feed"),
        );
        set({ storyGroups: normalizeStoryGroups(storyGroups) });
      } catch (error) {
        set({ error: toErrorMessage(error, "Unable to load stories") });
        throw error;
      } finally {
        set({ isLoadingFeed: false });
        storyFeedRequest = null;
      }
    })();

    return storyFeedRequest;
  },

  loadStory: async (id) => {
    set({ error: null });
    try {
      const story = normalizeStory(
        await apiData<Story>(apiClient.get(`/stories/${id}`)),
      );
      set((state) => ({
        activeStoryId: story.id,
        storyGroups: upsertStoryInGroups(state.storyGroups, story),
      }));
      return story;
    } catch (error) {
      set({ error: toErrorMessage(error, "Unable to load story") });
      throw error;
    }
  },

  uploadStoryMedia: async (file) => {
    if (!isStoryFile(file)) {
      const message = "Stories support image and video only";
      set({ error: message });
      throw new Error(message);
    }

    set({ error: null });
    try {
      const formData = new FormData();
      formData.append("file", file);
      return await apiData<StoryMediaAsset>(
        apiClient.post("/media/upload", formData),
      );
    } catch (error) {
      set({ error: toErrorMessage(error, "Unable to upload story media") });
      throw error;
    }
  },

  createStory: async ({
    mediaAssetId,
    caption,
    items,
    visibility = "FOLLOWERS",
  }) => {
    const storyItems = items?.length
      ? items
      : mediaAssetId
        ? [{ mediaAssetId, caption, orderIndex: 0 }]
        : [];

    if (storyItems.length === 0) {
      const message = "Story media is required";
      set({ error: message });
      throw new Error(message);
    }

    set({ isCreating: true, error: null });
    try {
      const group = normalizeStoryGroup(
        await apiData<StoryGroup>(
          apiClient.post("/stories", {
            visibility,
            items: storyItems.map((item, orderIndex) => ({
              mediaAssetId: item.mediaAssetId,
              caption: item.caption?.trim() || undefined,
              orderIndex: item.orderIndex ?? orderIndex,
            })),
          }),
        ),
      );

      set((state) => ({
        storyGroups: upsertStoryGroup(state.storyGroups, group),
      }));
      return group;
    } catch (error) {
      set({ error: toErrorMessage(error, "Unable to create story") });
      throw error;
    } finally {
      set({ isCreating: false });
    }
  },

  markStorySeen: async (id) => {
    const result = await apiData<{ storyId: string; seenAt: string }>(
      apiClient.post(`/stories/${id}/seen`),
    );
    set((state) => ({
      storyGroups: state.storyGroups.map((group) => {
        const stories = group.stories.map((story) =>
          story.id === id
            ? { ...story, seenByMe: true, seenAt: result.seenAt }
            : story,
        );
        return normalizeStoryGroup({ ...group, stories });
      }),
    }));
  },

  reactToStory: async (id, emoji) => {
    await apiData<{ storyId: string; emoji: string }>(
      apiClient.post(`/stories/${id}/reactions`, { emoji }),
    );
  },

  deleteStory: async (id) => {
    await apiData<{ id: string }>(apiClient.delete(`/stories/${id}`));
    set((state) => ({
      activeStoryId: state.activeStoryId === id ? null : state.activeStoryId,
      storyGroups: state.storyGroups
        .map((group) =>
          normalizeStoryGroup({
            ...group,
            stories: group.stories.filter((story) => story.id !== id),
          }),
        )
        .filter((group) => group.stories.length > 0),
    }));
  },

  setActiveStoryId: (id) => set({ activeStoryId: id }),
  clearError: () => set({ error: null }),
}));

export function selectActiveStory(state: StoryState) {
  if (!state.activeStoryId) return null;
  return (
    state.storyGroups
      .flatMap((group) => group.stories)
      .find((story) => story.id === state.activeStoryId) ?? null
  );
}

export function isStoryUnseen(story: Pick<Story, "seenAt" | "seenByMe">) {
  return !story.seenAt && story.seenByMe !== true;
}

function isStoryFile(file: File) {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

function normalizeStoryGroups(groups: StoryGroup[]) {
  return groups.map(normalizeStoryGroup).sort(byBucketPriority);
}

function normalizeStoryGroup(group: StoryGroup): StoryGroup {
  const stories = group.stories.map(normalizeStory).sort(byCreatedAsc);
  const latestStoryAt =
    stories[stories.length - 1]?.createdAt ?? group.latestStoryAt;
  return {
    ...group,
    groupId: group.groupId ?? stories[0]?.groupId ?? group.user.id,
    latestStoryAt,
    stories,
    hasUnseen: hasUnseenStory(stories),
  };
}

function normalizeStory(story: Story): Story {
  const seenAt = story.seenAt ?? null;
  return {
    ...story,
    caption: story.caption ?? null,
    seenAt,
    seenByMe: Boolean(story.seenByMe || seenAt),
    mediaAsset: {
      ...story.mediaAsset,
      thumbnailUrl: story.mediaAsset.thumbnailUrl ?? null,
      thumbnailStatus: story.mediaAsset.thumbnailStatus ?? null,
      publicUrl: story.mediaAsset.publicUrl ?? null,
    },
  };
}

function upsertStoryInGroups(groups: StoryGroup[], story: Story) {
  const normalizedStory = normalizeStory(story);
  const nextGroups = groups.map((group) => {
    if (group.user.id !== normalizedStory.user.id) return group;
    const existingStories = group.stories.filter(
      (item) => item.id !== normalizedStory.id,
    );
    const stories = [normalizedStory, ...existingStories].sort(byCreatedAsc);
    return normalizeStoryGroup({
      ...group,
      user: normalizedStory.user,
      latestStoryAt:
        stories[stories.length - 1]?.createdAt ?? normalizedStory.createdAt,
      stories,
    });
  });

  if (nextGroups.some((group) => group.user.id === normalizedStory.user.id)) {
    return nextGroups.sort(byBucketPriority);
  }

  return upsertStoryGroup(groups, {
    groupId: normalizedStory.groupId ?? normalizedStory.id,
    user: normalizedStory.user,
    latestStoryAt: normalizedStory.createdAt,
    hasUnseen: isStoryUnseen(normalizedStory),
    stories: [normalizedStory],
  });
}

function hasUnseenStory(stories: Story[]) {
  return stories.some(isStoryUnseen);
}

function upsertStoryGroup(groups: StoryGroup[], group: StoryGroup) {
  const normalizedGroup = normalizeStoryGroup(group);
  const nextGroups = groups.filter(
    (item) => item.user.id !== normalizedGroup.user.id,
  );
  return [normalizedGroup, ...nextGroups].sort(byBucketPriority);
}

function byCreatedAsc(a: Story, b: Story) {
  const createdDelta =
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (createdDelta !== 0) return createdDelta;
  return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
}

function byBucketPriority(a: StoryGroup, b: StoryGroup) {
  if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
  return (
    new Date(b.latestStoryAt).getTime() - new Date(a.latestStoryAt).getTime()
  );
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
