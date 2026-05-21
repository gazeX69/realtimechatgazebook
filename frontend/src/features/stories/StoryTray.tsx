import { Plus } from "lucide-react";
import { WheelEvent, useRef } from "react";
import { resolveMedia } from "../../lib/media-resolver";
import { useAuthStore } from "../../stores/auth-store";
import { isStoryUnseen, useStoryStore } from "../../stores/story-store";
import { StoryGroup } from "./types";

type Props = {
  showCreateButton?: boolean;
  onCreateStory?: () => void;
};

export function StoryTray({ showCreateButton = true, onCreateStory }: Props) {
  const currentUser = useAuthStore((state) => state.user);
  const storyGroups = useStoryStore((state) => state.storyGroups);
  const isLoadingFeed = useStoryStore((state) => state.isLoadingFeed);
  const setActiveStoryId = useStoryStore((state) => state.setActiveStoryId);
  const railRef = useRef<HTMLDivElement | null>(null);
  const currentUserBucket = storyGroups.find(
    (group) => group.user.id === currentUser?.id,
  );
  const otherBuckets = storyGroups.filter(
    (group) => group.user.id !== currentUser?.id,
  );

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!railRef.current || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      return;
    }
    event.preventDefault();
    railRef.current.scrollBy({ left: event.deltaY, behavior: "smooth" });
  }

  return (
    <section className="w-full max-w-full overflow-x-hidden rounded-xl border border-gray-800 bg-gray-950/80 px-3 py-2.5 shadow-neon sm:px-4">
      <div
        ref={railRef}
        className="flex max-w-full touch-pan-x gap-2.5 overflow-x-auto scroll-smooth py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={handleWheel}
      >
        {showCreateButton ? (
          <div className="flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 text-xs font-medium text-gray-300">
            <div className="relative">
              <button
                className="group block rounded-full transition duration-150 hover:scale-105 active:scale-95"
                onClick={() => {
                  const story = firstUnseenOrFirst(currentUserBucket);
                  if (story) setActiveStoryId(story.id);
                  else onCreateStory?.();
                }}
                type="button"
                aria-label={
                  currentUserBucket ? "View your story" : "Create your story"
                }
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br p-[2px] shadow-lg transition duration-150 ${
                    !currentUserBucket
                      ? "from-purple-500/80 via-gray-700 to-sky-500/80 shadow-purple-500/15"
                      : currentUserBucket.hasUnseen
                        ? "from-fuchsia-400 via-purple-500 to-sky-400 shadow-purple-500/40"
                        : "from-gray-600 via-gray-800 to-gray-700 shadow-black/25"
                  } group-hover:shadow-purple-500/40`}
                >
                  <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gray-900 text-lg font-semibold uppercase text-purple-100 ring-2 ring-gray-950">
                    {currentUser?.avatarUrl ? (
                      <img
                        src={resolveMedia(currentUser.avatarUrl)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (currentUser?.username.slice(0, 1) ?? "Y")
                    )}
                  </span>
                </span>
              </button>
              <button
                className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-950 bg-purple-600 text-white shadow-lg shadow-purple-500/30 transition duration-150 hover:bg-purple-500 active:scale-95"
                onClick={onCreateStory}
                type="button"
                aria-label="Add story"
              >
                <Plus size={14} strokeWidth={3} />
              </button>
            </div>
            <span className="max-w-full truncate">Your story</span>
          </div>
        ) : null}

        {otherBuckets.map((group) => {
          const firstStory = firstUnseenOrFirst(group);
          const thumbnailUrl = firstStory?.mediaAsset.thumbnailUrl
            ? resolveMedia(firstStory.mediaAsset.thumbnailUrl)
            : null;
          return (
            <button
              className="flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 text-xs font-medium text-gray-300 transition duration-150 hover:text-white"
              key={group.user.id}
              onClick={() => {
                if (firstStory) setActiveStoryId(firstStory.id);
              }}
              type="button"
              disabled={!firstStory}
            >
              <span
                className={`flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br p-[2px] shadow-lg transition ${
                  group.hasUnseen
                    ? "from-fuchsia-400 via-purple-500 to-sky-400 shadow-purple-500/40"
                    : "from-gray-700 via-gray-800 to-gray-700 shadow-black/25"
                }`}
              >
                <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gray-900 text-sm font-semibold uppercase text-gray-200 ring-2 ring-gray-950">
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : group.user.avatarUrl ? (
                    <img
                      src={resolveMedia(group.user.avatarUrl)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    group.user.username.slice(0, 1)
                  )}
                </span>
              </span>
              <span className="max-w-full truncate">{group.user.username}</span>
            </button>
          );
        })}

        {isLoadingFeed && storyGroups.length === 0 ? (
          <div className="flex h-20 items-center px-2 text-sm text-gray-500">
            Loading stories...
          </div>
        ) : null}
      </div>
    </section>
  );
}

function firstUnseenOrFirst(group?: StoryGroup) {
  return group?.stories.find(isStoryUnseen) ?? group?.stories[0] ?? null;
}
