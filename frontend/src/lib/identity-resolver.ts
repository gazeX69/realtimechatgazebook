import { resolveMedia } from './media-resolver';

export type UserIdentityLike = {
  id?: string | null;
  username?: string | null;
  displayName?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
};

export type ResolvedUserIdentity = {
  id: string | null;
  avatarUrl: string | null;
  displayName: string;
  username: string;
  initial: string;
};

export function resolveUserIdentity(payload?: UserIdentityLike | null, cached?: UserIdentityLike | null): ResolvedUserIdentity {
  const id = firstString(cached?.id, payload?.id);
  const username = firstString(cached?.username, payload?.username);
  const displayName = firstString(cached?.displayName, cached?.name, payload?.displayName, payload?.name, username, 'Someone') ?? 'Someone';
  const avatar = firstString(cached?.avatarUrl, payload?.avatarUrl);
  const initialSource = firstString(displayName, username, 'Someone') ?? 'Someone';

  return {
    id,
    avatarUrl: avatar ? resolveMedia(avatar) : null,
    displayName,
    username: username ?? '',
    initial: initialSource.replace(/^@/, '').slice(0, 1).toUpperCase() || '?',
  };
}

export function resolveActorIdentity(data: Record<string, unknown>, cached?: UserIdentityLike | null) {
  const actor = objectValue(data.actor);
  return resolveUserIdentity(
    {
      id: stringValue(data.actorId),
      displayName: stringValue(data.actorDisplayName ?? actor?.displayName),
      username: stringValue(data.actorUsername ?? data.username ?? actor?.username),
      avatarUrl: stringValue(data.actorAvatarUrl ?? data.avatarUrl ?? actor?.avatarUrl),
    },
    cached,
  );
}

function firstString(...values: Array<unknown>) {
  for (const value of values) {
    const parsed = stringValue(value);
    if (parsed) return parsed;
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
