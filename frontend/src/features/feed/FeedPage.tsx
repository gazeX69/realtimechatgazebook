import { useEffect, useRef, useState } from "react";
import { CheckCircle, Plus, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/auth-store";
import { useFeedStore } from "../../stores/feed-store";
import { useStoryStore } from "../../stores/story-store";
import { CreateStoryDialog } from "../stories/CreateStoryDialog";
import { StoryTray } from "../stories/StoryTray";
import { StoryViewer } from "../stories/StoryViewer";
import { PostComposer } from "./PostComposer";
import { PostCard } from "./PostCard";

export function FeedPage() {
  const location = useLocation();
  const pendingPosts = useFeedStore((state) => state.pendingPosts);
  const flushPendingPosts = useFeedStore((state) => state.flushPendingPosts);

  const user = useAuthStore((state) => state.user);
  const posts = useFeedStore((state) => state.posts);
  const loading = useFeedStore((state) => state.loading);
  const loadingMore = useFeedStore((state) => state.loadingMore);
  const feedHasNextPage = useFeedStore((state) => state.feedHasNextPage);
  const [scope, setScope] = useState<"following" | "global">("global");
  const [showComposerModal, setShowComposerModal] = useState(false);
  const [showCreateStoryDialog, setShowCreateStoryDialog] = useState(false);
  const [composerInViewport, setComposerInViewport] = useState(true);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const composerVisibilityRef = useRef(true);
  const postRefs = useRef(new Map<string, HTMLDivElement>());
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [successPostId, setSuccessPostId] = useState<string | null>(null);

  useEffect(() => {
    void useFeedStore.getState().fetchFeed(scope);
  }, [scope]);

  useEffect(() => {
    if (scope !== "following") return;
    void useStoryStore.getState().loadStoryFeed();
  }, [scope]);

  useEffect(() => {
    if (scope === "following") return;
    setShowCreateStoryDialog(false);
    useStoryStore.getState().setActiveStoryId(null);
  }, [scope]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting)
          void useFeedStore.getState().loadMoreFeed(scope);
      },
      { rootMargin: "240px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [scope]);

  useEffect(() => {
    function handleScroll() {
      const y = window.scrollY;

      setShowScrollTop(y > 400); // threshold scroll top
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const target = composerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const nextVisible = Boolean(entries[0]?.isIntersecting);
        if (composerVisibilityRef.current === nextVisible) return;

        composerVisibilityRef.current = nextVisible;
        setComposerInViewport(nextVisible);
      },
      { threshold: 0.01 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!successPostId) return;
    const timeout = window.setTimeout(() => setSuccessPostId(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [successPostId]);

  function handlePostSuccess(postId: string) {
    setShowComposerModal(false);
    setSuccessPostId(postId);
  }

  function viewPost(postId: string) {
    postRefs.current
      .get(postId)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setSuccessPostId(null);
  }

  const visibleCount = Math.min(pendingPosts.length, 30);
  const shouldShowComposerFab =
    location.pathname === "/feed" && !composerInViewport;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 overflow-x-hidden">
      <div ref={composerRef}>
        <PostComposer
          user={user}
          onSuccess={(post) => handlePostSuccess(post.id)}
        />
      </div>

      {pendingPosts.length > 0 && (
        <div
          onClick={flushPendingPosts}
          className="sticky top-0 z-30 cursor-pointer rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-center text-sm font-semibold text-blue-400 backdrop-blur transition hover:bg-blue-500/20"
        >
          {visibleCount} konten baru • Tampilkan
        </div>
      )}

      <div className="flex w-full max-w-full rounded-xl border border-gray-800 bg-gray-900 p-1 shadow-neon">
        {(["global", "following"] as const).map((item) => (
          <button
            key={item}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition duration-150 active:scale-[0.98] ${
              scope === item
                ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20"
                : "text-gray-400 hover:bg-purple-500/10 hover:text-gray-100"
            }`}
            onClick={() => setScope(item)}
            type="button"
          >
            {item === "global" ? "Global" : "Following"}
          </button>
        ))}
      </div>

      {scope === "following" ? (
        <>
          <StoryTray onCreateStory={() => setShowCreateStoryDialog(true)} />
          <StoryViewer />
          <CreateStoryDialog
            open={showCreateStoryDialog}
            onClose={() => setShowCreateStoryDialog(false)}
            onCreated={() => {
              void useStoryStore.getState().loadStoryFeed();
            }}
          />
        </>
      ) : null}

      {loading && posts.length === 0 ? <FeedSkeleton /> : null}
      {posts.length === 0 && !loading ? (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center shadow-neon">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10 text-xl">
            ＋
          </div>
          <p className="mt-3 font-semibold text-gray-100">No posts yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
            {scope === "following"
              ? "Follow people in Explore to bring their posts into this feed."
              : "Share the first post and start the conversation."}
          </p>
          <button
            className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 px-4 text-sm font-medium text-white shadow-lg shadow-purple-500/10 transition-all duration-150 hover:from-purple-600 hover:to-purple-700 active:scale-95"
            onClick={() => setShowComposerModal(true)}
            type="button"
          >
            Create post
          </button>
        </section>
      ) : null}
      {posts.map((post) => (
        <div
          key={post.id}
          ref={(node) => {
            if (node) postRefs.current.set(post.id, node);
            else postRefs.current.delete(post.id);
          }}
        >
          <PostCard post={post} currentUser={user} />
        </div>
      ))}
      <div ref={loadMoreRef} />
      {loadingMore ? <FeedSkeleton count={1} /> : null}
      {!feedHasNextPage && posts.length > 0 ? (
        <p className="py-2 text-center text-sm text-gray-500">No more posts.</p>
      ) : null}

      <button
        className={`
            fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40
            flex h-14 w-14 items-center justify-center
            rounded-full
            bg-gradient-to-r from-purple-500 to-purple-600
            text-white
            shadow-lg shadow-purple-500/30
            transition duration-200
            hover:scale-105 hover:from-purple-600 hover:to-purple-700
            active:scale-95
            md:bottom-6 md:right-8
            ${shouldShowComposerFab ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}
          `}
        onClick={() => setShowComposerModal(true)}
        type="button"
        aria-label="Create post"
        aria-hidden={!shouldShowComposerFab}
        tabIndex={shouldShowComposerFab ? 0 : -1}
      >
        <Plus size={24} />
      </button>
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="
            fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] right-4 z-40
            flex h-14 w-14 items-center justify-center
            rounded-full
            bg-gray-900/90 backdrop-blur
            border border-gray-700
            text-gray-300
            shadow-lg shadow-purple-500/30
            transition duration-150
            hover:bg-purple-500/20 hover:text-white
            active:scale-95
            md:bottom-[5.5rem] md:right-8
          "
          aria-label="Scroll to top"
        >
          <span className="text-lg">↑</span>
        </button>
      )}

      {successPostId ? (
        <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-emerald-500/30 bg-gray-950/95 p-3 text-sm text-gray-100 shadow-2xl shadow-emerald-500/10 backdrop-blur">
          <CheckCircle className="shrink-0 text-emerald-300" size={20} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Post published</p>
            <p className="truncate text-xs text-gray-400">
              Your post is live in the feed.
            </p>
          </div>
          <button
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-purple-200 transition duration-150 hover:bg-purple-500/10 active:scale-[0.98]"
            onClick={() => viewPost(successPostId)}
            type="button"
          >
            View Post
          </button>
          <button
            className="shrink-0 rounded-full p-1 text-gray-400 transition duration-150 hover:bg-white/10 hover:text-gray-100"
            onClick={() => setSuccessPostId(null)}
            type="button"
            aria-label="Dismiss post success"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      {showComposerModal ? (
        <div
          className="fixed inset-0 z-50 flex max-w-full items-start justify-center overflow-x-hidden bg-black/70 px-4 py-16 backdrop-blur-sm md:items-center md:py-6"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget)
              setShowComposerModal(false);
          }}
        >
          <div className="w-full max-w-2xl">
            <div className="mb-3 flex justify-end">
              <button
                className="rounded-full bg-gray-950/90 p-2 text-gray-100 transition hover:bg-purple-600 active:scale-95"
                onClick={() => setShowComposerModal(false)}
                type="button"
                aria-label="Close composer"
              >
                <X size={20} />
              </button>
            </div>
            <PostComposer
              user={user}
              onSuccess={(post) => handlePostSuccess(post.id)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, item) => (
        <div
          key={item}
          className="animate-pulse rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-neon"
        >
          <div className="flex gap-3">
            <div className="h-11 w-11 rounded-full bg-gray-800" />
            <div className="flex-1 space-y-3">
              <div className="h-3 w-32 rounded bg-gray-800" />
              <div className="h-3 w-full rounded bg-gray-800" />
              <div className="h-3 w-2/3 rounded bg-gray-800" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
