import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth-store';
import { useFeedStore } from '../../stores/feed-store';
import { trendingHashtags } from '../../lib/social-insights';
import { ProfileMediaGrid } from '../users/ProfileMediaGrid';
import { SuggestedUsers, UserSearchBox } from '../users/UserDiscovery';
import { PostCard } from './PostCard';

export function ExplorePage() {
  const user = useAuthStore((state) => state.user);
  const posts = useFeedStore((state) => state.posts);
  const loading = useFeedStore((state) => state.loading);
  const [sort, setSort] = useState<'newest' | 'popular'>('newest');
  const [mode, setMode] = useState<'forYou' | 'media' | 'text'>('forYou');
  const [floatingSearch, setFloatingSearch] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTag = searchParams.get('tag')?.toLowerCase() ?? '';

  useEffect(() => {
    void useFeedStore.getState().fetchExplore(sort);
  }, [sort]);

  useEffect(() => {
    function handleScroll() {
      setFloatingSearch(window.scrollY > 150);
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const visiblePosts = activeTag ? posts.filter((post) => post.body.toLowerCase().includes(`#${activeTag}`)) : posts;
  const mediaPosts = visiblePosts.filter((post) => post.media?.length > 0);
  const textPosts = posts.filter(
    (post) => !post.media || post.media.length === 0,
  );
  const visibleTextPosts = visiblePosts.filter((post) => !post.media || post.media.length === 0);
  const tagSuggestions = trendingHashtags(posts);

  return (
    <div className="mx-auto max-w-2xl scroll-smooth space-y-3">
      <div
        className={
          floatingSearch
            ? 'fixed left-0 right-0 top-0 z-40 mx-auto max-w-2xl px-4 py-2 backdrop-blur md:px-0'
            : ''
        }
      >
        <div
          className={
            floatingSearch
              ? 'border-b border-gray-800 bg-gray-950/85 pb-2 shadow-lg shadow-purple-500/10'
              : ''
          }
        >
          <UserSearchBox />
        </div>
      </div>
      {floatingSearch ? <div className="h-24" /> : null}

      {activeTag ? (
        <section className="rounded-xl border border-purple-500/20 bg-purple-500/10 px-4 py-3 shadow-neon">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-purple-100">#{activeTag}</p>
              <p className="text-xs text-gray-400">{visiblePosts.length} posts found</p>
            </div>
            <button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-800" onClick={() => setSearchParams({})} type="button">
              Clear
            </button>
          </div>
        </section>
      ) : tagSuggestions.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tagSuggestions.slice(0, 4).map((item) => (
            <Link key={item.tag} className="shrink-0 rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:border-sky-500/50 hover:bg-sky-500/10" to={`/explore?tag=${item.tag}`}>
              #{item.tag}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex w-full max-w-full rounded-xl border border-gray-800 bg-gray-900 p-1 shadow-neon">
        {(['forYou', 'media', 'text'] as const).map((item) => (
          <button
            key={item}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition duration-150 active:scale-[0.98] ${
              mode === item
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                : 'text-gray-400 hover:bg-purple-500/10 hover:text-gray-100'
            }`}
            onClick={() => setMode(item)}
            type="button"
          >
            {item === 'forYou'
              ? 'For You'
              : item === 'media'
                ? 'Media'
                : 'Text'}
          </button>
        ))}
      </div>

      {/* <SuggestedUsers /> */}

      <div className="sticky top-5 z-10 rounded-xl border border-gray-800 bg-gray-900 p-2 shadow-neon">
        <div className="flex gap-2">
          {(['newest', 'popular'] as const).map((item) => (
            <button
              key={item}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition duration-150 active:scale-95 ${
                sort === item
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                  : 'text-gray-400 hover:bg-purple-500/10 hover:text-gray-100'
              }`}
              onClick={() => setSort(item)}
              type="button"
            >
              {item === 'newest' ? 'Newest' : 'Popular'}
            </button>
          ))}
        </div>
      </div>

      {loading && visiblePosts.length === 0 ? <ExploreSkeleton /> : null}
      {!loading && posts.length === 0 ? (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center shadow-neon">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10 text-xl">⌕</div>
          <p className="mt-3 font-semibold text-gray-100">Nothing to explore yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
            Public posts and people will appear here. Refresh to check for new activity.
          </p>
          <button
            className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 px-4 text-sm font-medium text-white shadow-lg shadow-purple-500/10 transition-all duration-150 hover:from-purple-600 hover:to-purple-700 active:scale-95"
            onClick={() => void useFeedStore.getState().fetchExplore(sort)}
            type="button"
          >
            Refresh explore
          </button>
        </section>
      ) : null}
      {!loading && posts.length > 0 && visiblePosts.length === 0 ? (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center shadow-neon">
          <p className="font-semibold text-gray-100">No posts for #{activeTag}</p>
          <p className="mt-1 text-sm text-gray-500">Try another hashtag from the sidebar.</p>
        </section>
      ) : null}

      {mode === 'text' ? (
        <section className="space-y-3">
          <SectionTitle title="Discussions" subtitle="Text-first posts and conversations." />
          {visibleTextPosts.map((post) => (
            <PostCard key={post.id} post={post} currentUser={user} />
          ))}
        </section>
      ) : null}

      {mode === 'media' ? (
        <section className="space-y-3 rounded-2xl border border-gray-800 bg-gray-900/40 p-3 shadow-neon">
          <SectionTitle title="Media Gallery" subtitle="Visual posts from the community." />
          <MediaGrid posts={mediaPosts} currentUser={user} />
        </section>
      ) : null}

      {mode === 'forYou' ? (
        <div className="space-y-5">
          {mediaPosts.length > 0 ? (
            <section className="space-y-3 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-3 shadow-neon">
              <SectionTitle title="Media Picks" subtitle="Fresh visual posts worth checking." />
              <MediaGrid posts={mediaPosts.slice(0, 6)} currentUser={user} />
            </section>
          ) : null}

          {visibleTextPosts.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle title="Discussions" subtitle="Recent text posts and conversations." />
              {visibleTextPosts.slice(0, 10).map((post) => (
                <PostCard key={post.id} post={post} currentUser={user} />
              ))}
            </section>
          ) : null}

          <section className="space-y-3">
            <SectionTitle title="Suggested Users" subtitle="People you may want to follow." />
            <SuggestedUsers />
          </section>
        </div>
      ) : null}
    </div>
  );
}

type ExplorePost = ReturnType<typeof useFeedStore.getState>['posts'][number];
type CurrentUser = ReturnType<typeof useAuthStore.getState>['user'];

function MediaGrid({ posts, currentUser }: { posts: ExplorePost[]; currentUser: CurrentUser }) {
  if (posts.length === 0) return null;
  return <ProfileMediaGrid posts={posts} currentUser={currentUser} />;
}

function ExploreSkeleton() {
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-32 animate-pulse rounded-xl border border-gray-800 bg-gray-900 shadow-neon"
        >
          <div className="m-4 h-3 w-1/3 rounded bg-gray-800" />
          <div className="mx-4 mt-6 h-3 rounded bg-gray-800" />
          <div className="mx-4 mt-3 h-3 w-2/3 rounded bg-gray-800" />
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-1 pt-2">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">
        {title}
      </p>
      {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
    </div>
  );
}
