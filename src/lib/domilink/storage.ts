const ENABLED_KEY = 'dominex:domilink:enabled:v1';
const SESSION_KEY = 'dominex:domilink:session:v1';

export interface DomiLinkSessionScope {
  userId: string;
  companyId: string;
}

interface StoredSession extends DomiLinkSessionScope { token: string }
let sessionRevision = 0;

function sessionStorageOrUndefined() {
  return typeof window !== 'undefined' ? window.sessionStorage : undefined;
}

function storedSession(storage: Storage | undefined): StoredSession | null {
  const raw = storage?.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredSession> | null;
    if (value && typeof value.userId === 'string' && value.userId && typeof value.companyId === 'string' && value.companyId && typeof value.token === 'string' && value.token) {
      return value as StoredSession;
    }
  } catch { /* Tokens legados sem escopo não dão acesso. */ }
  return null;
}

export function readDomiLinkEnabled(storage = typeof window !== 'undefined' ? window.localStorage : undefined) {
  return !!storage && storage.getItem(ENABLED_KEY) === 'true';
}

export function writeDomiLinkEnabled(enabled: boolean, storage = typeof window !== 'undefined' ? window.localStorage : undefined) {
  if (!storage) return;
  if (enabled) storage.setItem(ENABLED_KEY, 'true');
  else storage.removeItem(ENABLED_KEY);
}

/** Invalida também operações em voo, mesmo antes de o React renderizar o logout. */
export function clearDomiLinkSession(storage = sessionStorageOrUndefined()) {
  const token = storedSession(storage)?.token ?? null;
  storage?.removeItem(SESSION_KEY);
  sessionRevision += 1;
  return token;
}

export function getDomiLinkSessionRevision() { return sessionRevision; }

/** Síncrono e independente de auth/rede: pode ser usado dentro de onAuthStateChange. */
export function clearDomiLinkSessionOutsideScope(scope: Partial<DomiLinkSessionScope> | null, storage = sessionStorageOrUndefined()) {
  const stored = storedSession(storage);
  if (!stored || !scope?.userId || stored.userId !== scope.userId || (scope.companyId !== undefined && stored.companyId !== scope.companyId)) {
    return clearDomiLinkSession(storage);
  }
  return null;
}

export function readDomiLinkSession(scope: DomiLinkSessionScope, storage = sessionStorageOrUndefined()) {
  const stored = storedSession(storage);
  if (stored?.userId === scope.userId && stored.companyId === scope.companyId) return stored.token;
  if (storage?.getItem(SESSION_KEY)) clearDomiLinkSession(storage);
  return null;
}

export function writeDomiLinkSession(token: string, scope: DomiLinkSessionScope, storage = sessionStorageOrUndefined()) {
  if (!scope.userId || !scope.companyId) return;
  storage?.setItem(SESSION_KEY, JSON.stringify({ ...scope, token }));
}

export const DOMILINK_STORAGE_KEYS = { enabled: ENABLED_KEY, session: SESSION_KEY } as const;
