import { FeedPost } from '../stores/feed-store';

export type SidebarUser = {
  id: string;
  username: string;
  displayName?: string;
  name?: string;
  avatarUrl?: string | null;
};

export function trendingHashtags(posts: Pick<FeedPost, 'body'>[], limit = 5) {
  const counts = new Map<string, number>();
  posts.forEach((post) => {
    for (const match of post.body.matchAll(/#([a-zA-Z0-9_]{1,64})/g)) {
      const tag = match[1].toLowerCase();
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  });

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    .slice(0, limit);
}

export function recentPostAuthors(posts: Pick<FeedPost, 'user'>[], limit = 5): SidebarUser[] {
  const seen = new Set<string>();
  const users: SidebarUser[] = [];

  posts.forEach((post) => {
    if (seen.has(post.user.id)) return;
    seen.add(post.user.id);
    users.push(post.user);
  });

  return users.slice(0, limit);
}
