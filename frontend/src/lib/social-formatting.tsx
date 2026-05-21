import { Fragment, ReactNode } from 'react';

type SocialToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'mention'; value: string }
  | { type: 'hashtag'; value: string }
  | { type: 'url'; value: string };

const SOCIAL_TOKEN_REGEX = /(https?:\/\/[^\s<]+|\*\*[^*\n]+\*\*|\*[^*\n]+\*|@[a-zA-Z0-9_]{3,32}|#[a-zA-Z0-9_]{1,64})/g;

export function parseSocialText(text: string): SocialToken[] {
  const tokens: SocialToken[] = [];
  let cursor = 0;

  for (const match of text.matchAll(SOCIAL_TOKEN_REGEX)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ type: 'text', value: text.slice(cursor, index) });
    tokens.push(tokenFor(value));
    cursor = index + value.length;
  }

  if (cursor < text.length) tokens.push({ type: 'text', value: text.slice(cursor) });
  return tokens;
}

export function renderSocialText(text: string): ReactNode {
  return parseSocialText(text).map((token, index) => {
    const key = `${token.type}-${index}-${token.value}`;
    if (token.type === 'bold') return <strong key={key}>{token.value}</strong>;
    if (token.type === 'italic') return <em key={key}>{token.value}</em>;
    if (token.type === 'mention') {
      return (
        <span key={key} className="font-semibold text-purple-300">
          {token.value}
        </span>
      );
    }
    if (token.type === 'hashtag') {
      return (
        <span key={key} className="font-semibold text-sky-300">
          {token.value}
        </span>
      );
    }
    if (token.type === 'url') {
      return (
        <a
          key={key}
          className="break-all font-medium text-purple-300 underline decoration-purple-400/50 underline-offset-4 transition hover:text-purple-200"
          href={token.value}
          rel="noreferrer"
          target="_blank"
        >
          {token.value}
        </a>
      );
    }
    return <Fragment key={key}>{token.value}</Fragment>;
  });
}

function tokenFor(raw: string): SocialToken {
  if (/^https?:\/\//i.test(raw)) return { type: 'url', value: raw };
  if (raw.startsWith('**') && raw.endsWith('**')) return { type: 'bold', value: raw.slice(2, -2) };
  if (raw.startsWith('*') && raw.endsWith('*')) return { type: 'italic', value: raw.slice(1, -1) };
  if (raw.startsWith('@')) return { type: 'mention', value: raw };
  if (raw.startsWith('#')) return { type: 'hashtag', value: raw };
  return { type: 'text', value: raw };
}
