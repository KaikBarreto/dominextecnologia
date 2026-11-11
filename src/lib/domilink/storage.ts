const ENABLED_KEY = 'dominex:domilink:enabled:v1';
const SESSION_KEY = 'dominex:domilink:session:v1';

function canUseStorage(storage: Storage | undefined): storage is Storage {
  return typeof storage !== 'undefined';
}

export function readDomiLinkEnabled(storage = typeof window !== 'undefined' ? window.localStorage : undefined) {
  return canUseStorage(storage) && storage.getItem(ENABLED_KEY) === 'true';
}

export function writeDomiLinkEnabled(enabled: boolean, storage = typeof window !== 'undefined' ? window.localStorage : undefined) {
  if (!canUseStorage(storage)) return;
  if (enabled) storage.setItem(ENABLED_KEY, 'true');
  else storage.removeItem(ENABLED_KEY);
}

export function readDomiLinkSession(storage = typeof window !== 'undefined' ? window.sessionStorage : undefined) {
  return canUseStorage(storage) ? storage.getItem(SESSION_KEY) : null;
}

export function writeDomiLinkSession(token: string | null, storage = typeof window !== 'undefined' ? window.sessionStorage : undefined) {
  if (!canUseStorage(storage)) return;
  if (token) storage.setItem(SESSION_KEY, token);
  else storage.removeItem(SESSION_KEY);
}

export const DOMILINK_STORAGE_KEYS = { enabled: ENABLED_KEY, session: SESSION_KEY } as const;
