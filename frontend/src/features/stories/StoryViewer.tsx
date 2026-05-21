import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/api-client";
import { resolveMedia } from "../../lib/media-resolver";
import { mediaPreviewInfo } from "../../lib/media-preview";
import { useAuthStore } from "../../stores/auth-store";
import { useChatStore } from "../../stores/chat-store";
import {
  isStoryUnseen,
  selectActiveStory,
  useStoryStore,
} from "../../stores/story-store";
import { Story, StoryGroup } from "./types";

const IMAGE_DURATION_MS = 5_000;
const QUICK_REACTIONS = ["❤️", "😂", "😮", "🔥", "😢"];

type Props = {
  allowDelete?: boolean;
};

export function StoryViewer({ allowDelete = false }: Props) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const activeStory = useStoryStore(selectActiveStory);
  const activeStoryId = useStoryStore((state) => state.activeStoryId);
  const storyGroups = useStoryStore((state) => state.storyGroups);
  const loadStory = useStoryStore((state) => state.loadStory);
  const markStorySeen = useStoryStore((state) => state.markStorySeen);
  const reactToStory = useStoryStore((state) => state.reactToStory);
  const deleteStory = useStoryStore((state) => state.deleteStory);
  const setActiveStoryId = useStoryStore((state) => state.setActiveStoryId);
  const openDirectConversation = useChatStore(
    (state) => state.openDirectConversation,
  );
  const sendMessage = useChatStore((state) => state.sendMessage);
  const [isDeleting, setIsDeleting] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageTimerRef = useRef<{ startedAt: number; elapsed: number } | null>(
    null,
  );
  const currentBucket = findStoryBucket(storyGroups, activeStoryId);
  const currentStoryIndex = currentBucket?.stories.findIndex(
    (story) => story.id === activeStoryId,
  );
  const activeStoryInfo = mediaPreviewInfo(activeStory?.mediaAsset.mimeType);
  const isVideoStory = activeStoryInfo.kind === "video";
  const canReply = Boolean(
    activeStory && currentUser && activeStory.user.id !== currentUser.id,
  );
  const previousStoryId = getAdjacentStoryId(storyGroups, activeStoryId, -1);
  const nextStoryId = getAdjacentStoryId(storyGroups, activeStoryId, 1);

  useEffect(() => {
    if (!activeStoryId || activeStory) return;
    let cancelled = false;
    void loadStory(activeStoryId).catch(() => {
      if (!cancelled) setActiveStoryId(null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeStory, activeStoryId, loadStory, setActiveStoryId]);

  useEffect(() => {
    if (!activeStory || !isStoryUnseen(activeStory)) return;
    void markStorySeen(activeStory.id).catch(() => undefined);
  }, [activeStory, markStorySeen]);

  useEffect(() => {
    if (!activeStoryId) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeStoryId]);

  useEffect(() => {
    setReplyText("");
  }, [activeStoryId]);

  useEffect(() => {
    setMediaUrl(null);
    setMediaFailed(false);
    if (!activeStory) return undefined;

    const publicUrl = activeStory.mediaAsset.publicUrl;
    if (publicUrl) {
      setMediaUrl(resolveMedia(publicUrl));
      return undefined;
    }

    let revoked = false;
    let objectUrl: string | null = null;
    setIsLoadingMedia(true);
    void apiClient
      .get(`/media/${activeStory.mediaAsset.id}`, { responseType: "blob" })
      .then((response) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(response.data);
        setMediaUrl(objectUrl);
      })
      .catch(() => setMediaFailed(true))
      .finally(() => {
        if (!revoked) setIsLoadingMedia(false);
      });

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    activeStory?.id,
    activeStory?.mediaAsset.id,
    activeStory?.mediaAsset.publicUrl,
  ]);

  useEffect(() => {
    if (!activeStoryId || !activeStory || isVideoStory || !mediaUrl) return;
    let animationFrame = 0;
    imageTimerRef.current = { startedAt: performance.now(), elapsed: 0 };

    function tick(now: number) {
      const timer = imageTimerRef.current;
      if (!timer) return;
      const elapsed = timer.elapsed + now - timer.startedAt;
      const progress = Math.min(1, elapsed / IMAGE_DURATION_MS);
      setImageProgress(progress);
      if (progress >= 1) {
        goNext();
        return;
      }
      animationFrame = requestAnimationFrame(tick);
    }

    animationFrame = requestAnimationFrame(tick);

    function handleVisibilityChange() {
      const timer = imageTimerRef.current;
      if (!timer) return;
      if (document.hidden) {
        timer.elapsed += performance.now() - timer.startedAt;
        cancelAnimationFrame(animationFrame);
      } else {
        timer.startedAt = performance.now();
        animationFrame = requestAnimationFrame(tick);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      imageTimerRef.current = null;
      setImageProgress(0);
    };
  }, [activeStory?.id, activeStoryId, isVideoStory, mediaUrl]);

  useEffect(() => {
    if (!activeStoryId) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveStoryId(null);
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrevious();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeStoryId, previousStoryId, nextStoryId]);

  useEffect(() => {
    function handleVisibilityChange() {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) void video.pause();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const targets = [
      nextStoryId,
      firstStoryIdOfNextBucket(storyGroups, activeStoryId),
    ]
      .map((id) =>
        storyGroups
          .flatMap((group) => group.stories)
          .find((story) => story.id === id),
      )
      .filter(Boolean) as Story[];
    const links: HTMLLinkElement[] = [];
    targets.forEach((story) => {
      const href = story.mediaAsset.publicUrl
        ? resolveMedia(story.mediaAsset.publicUrl)
        : resolveMedia(`/api/media/${story.mediaAsset.id}`);
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = story.mediaAsset.mimeType.startsWith("video/")
        ? "video"
        : "image";
      link.href = href;
      document.head.appendChild(link);
      links.push(link);
    });
    return () => links.forEach((link) => link.remove());
  }, [activeStoryId, nextStoryId, storyGroups]);

  const progressValues = useMemo(() => {
    if (!currentBucket || currentStoryIndex == null || currentStoryIndex < 0)
      return [];
    return currentBucket.stories.map((story, index) => {
      if (index < currentStoryIndex) return 1;
      if (index > currentStoryIndex) return 0;
      if (isVideoStory) {
        const video = videoRef.current;
        if (!video?.duration || !Number.isFinite(video.duration)) return 0;
        return Math.min(1, video.currentTime / video.duration);
      }
      return imageProgress;
    });
  }, [currentBucket, currentStoryIndex, imageProgress, isVideoStory]);

  if (!activeStoryId) return null;

  function goNext() {
    if (nextStoryId) setActiveStoryId(nextStoryId);
    else setActiveStoryId(null);
  }

  function goPrevious() {
    if (previousStoryId) setActiveStoryId(previousStoryId);
  }

  async function handleDelete() {
    if (!activeStory || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteStory(activeStory.id);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleReply(event: FormEvent) {
    event.preventDefault();
    const body = replyText.trim();
    if (!body || !activeStory || !currentUser || !canReply || isReplying)
      return;
    setIsReplying(true);
    try {
      const conversation = await openDirectConversation(activeStory.user.id);
      await sendMessage(conversation.id, body, currentUser, [], {
        storyReference: { storyId: activeStory.id },
      });
      setReplyText("");
      setActiveStoryId(null);
      navigate(`/chat/${conversation.id}`);
    } finally {
      setIsReplying(false);
    }
  }

  async function handleReaction(emoji: string) {
    if (!activeStory) return;
    await reactToStory(activeStory.id, emoji).catch(() => undefined);
  }

  const title = activeStory
    ? `${activeStory.user.username} • ${formatStoryTime(activeStory.createdAt)}`
    : "Story";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black px-3 py-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex h-full max-h-[96dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-black text-white shadow-2xl shadow-black/60 sm:max-h-[92dvh]">
        <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-3">
          <div className="mb-3 flex gap-1">
            {progressValues.map((progress, index) => (
              <div
                key={index}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
              >
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-100"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold">{title}</p>
            <div className="flex shrink-0 gap-2">
              {allowDelete && activeStory ? (
                <button
                  className="rounded-full bg-gray-950/80 p-2 text-gray-100 transition duration-150 hover:bg-red-600 active:scale-95 disabled:opacity-50"
                  onClick={handleDelete}
                  type="button"
                  aria-label="Delete story"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Trash2 size={18} />
                  )}
                </button>
              ) : null}
              <button
                className="rounded-full bg-gray-950/80 p-2 text-gray-100 transition duration-150 hover:bg-purple-600 active:scale-95"
                onClick={() => setActiveStoryId(null)}
                type="button"
                aria-label="Close story viewer"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
          {isLoadingMedia || !activeStory ? (
            <Loader2 size={30} className="animate-spin text-gray-400" />
          ) : mediaFailed || !mediaUrl ? (
            <div className="flex flex-col items-center gap-2 text-sm text-gray-400">
              <activeStoryInfo.Icon size={28} />
              <span>Story unavailable</span>
            </div>
          ) : isVideoStory ? (
            <video
              ref={videoRef}
              src={mediaUrl}
              controls
              autoPlay
              playsInline
              preload="auto"
              className="h-auto max-h-full w-auto max-w-full bg-black"
              onEnded={goNext}
              onTimeUpdate={() => setImageProgress((value) => value + 0.0001)}
            />
          ) : (
            <img
              src={mediaUrl}
              alt=""
              className="h-auto max-h-full w-auto max-w-full object-contain"
            />
          )}

          <button
            type="button"
            aria-label="Previous story"
            className="absolute bottom-28 left-0 top-20 w-1/3 bg-transparent"
            onClick={goPrevious}
          />
          <button
            type="button"
            aria-label="Next story"
            className="absolute bottom-28 right-0 top-20 w-1/3 bg-transparent"
            onClick={goNext}
          />
        </div>

        {activeStory?.caption ? (
          <p className="px-4 py-2 text-center text-sm text-gray-100">
            {activeStory.caption}
          </p>
        ) : null}

        <div className="space-y-3 border-t border-white/10 bg-black/95 px-3 py-3">
          {canReply ? (
            <div className="flex justify-center gap-2">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg transition hover:bg-white/20 active:scale-95"
                  onClick={() => void handleReaction(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
          {canReply ? (
            <form className="flex items-center gap-2" onSubmit={handleReply}>
              <input
                className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white outline-none placeholder:text-gray-400 focus:border-purple-400"
                placeholder="Reply to story..."
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                disabled={isReplying}
              />
              <button
                type="submit"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white transition hover:bg-purple-500 active:scale-95 disabled:opacity-50"
                disabled={!replyText.trim() || isReplying}
                aria-label="Send story reply"
              >
                {isReplying ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={17} />
                )}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function findStoryBucket(groups: StoryGroup[], storyId: string | null) {
  if (!storyId) return null;
  return (
    groups.find((group) =>
      group.stories.some((story) => story.id === storyId),
    ) ?? null
  );
}

function getAdjacentStoryId(
  groups: StoryGroup[],
  storyId: string | null,
  direction: -1 | 1,
) {
  if (!storyId) return null;
  const stories = groups.flatMap((group) => group.stories);
  const index = stories.findIndex((story) => story.id === storyId);
  if (index < 0) return null;
  return stories[index + direction]?.id ?? null;
}

function firstStoryIdOfNextBucket(
  groups: StoryGroup[],
  storyId: string | null,
) {
  if (!storyId) return null;
  const bucketIndex = groups.findIndex((group) =>
    group.stories.some((story) => story.id === storyId),
  );
  if (bucketIndex < 0) return null;
  return groups[bucketIndex + 1]?.stories[0]?.id ?? null;
}

function formatStoryTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
