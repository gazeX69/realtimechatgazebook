const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api$/i, '');

export function resolveMedia(url?: string | null) {
  if (!url) return '';
  const normalizedUrl = url.replace(/\\/g, '/');
  if (/^https?:\/\//i.test(normalizedUrl)) return normalizedUrl;
  if (normalizedUrl.startsWith('/uploads/')) return `${BACKEND_ORIGIN}${normalizedUrl}`;
  return normalizedUrl;
}
