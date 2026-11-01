// Handles X : 1 à 15 caractères alphanumériques ou `_`, insensibles à la casse.
const HANDLE_RE = /^[a-z0-9_]{1,15}$/;

const X_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.x.com', 'mobile.twitter.com']);

// Premiers segments d'URL qui ne sont pas des profils.
const RESERVED_PATHS = new Set([
  'account',
  'bookmarks',
  'communities',
  'compose',
  'download',
  'explore',
  'grok',
  'hashtag',
  'home',
  'i',
  'intent',
  'jobs',
  'lists',
  'login',
  'logout',
  'messages',
  'notifications',
  'premium',
  'privacy',
  'search',
  'settings',
  'share',
  'signup',
  'tos',
]);

/** Handle d'une URL de profil X (ou d'une sous-page : /handle/status/…), sinon `null`. */
export function handleFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!X_HOSTS.has(parsed.hostname.replace(/^www\./, ''))) return null;
  const handle = parsed.pathname.split('/')[1]?.toLowerCase();
  return handle && HANDLE_RE.test(handle) && !RESERVED_PATHS.has(handle) ? handle : null;
}

/** Normalise une saisie utilisateur : `@Handle`, `handle`, `https://x.com/handle`… */
export function normalizeXHandle(input: string): string | null {
  const value = input.trim();
  if (/^(https?:\/\/)?(www\.|mobile\.)?(x|twitter)\.com\//i.test(value)) {
    return handleFromUrl(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  }
  const handle = value.replace(/^@/, '').toLowerCase();
  return HANDLE_RE.test(handle) ? handle : null;
}
