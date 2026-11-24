import type { SupportedStorage } from '@supabase/supabase-js';

const AUTH_PERSISTENCE_KEY = '__dominex_remember_session';

function canUseStorage(storage: Storage | undefined): storage is Storage {
  return typeof storage !== 'undefined';
}

function getLocalStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

function getSessionStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.sessionStorage;
}

/**
 * Sem preferência explícita preservamos o comportamento histórico do Dominex:
 * a sessão é persistente. O checkbox passa a gravar a escolha real no primeiro
 * login feito por esta tela.
 */
export function shouldPersistAuthSession(): boolean {
  const local = getLocalStorage();
  if (!local) return false;
  return local.getItem(AUTH_PERSISTENCE_KEY) !== '0';
}

function isSupabaseAuthKey(key: string): boolean {
  return key.startsWith('sb-') && key.includes('-auth-token');
}

function removeAuthItems(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => !!key && isSupabaseAuthKey(key));

  for (const key of keys) storage.removeItem(key);
}

function moveAuthItems(source: Storage, target: Storage): void {
  const keys = Array.from({ length: source.length }, (_, index) => source.key(index))
    .filter((key): key is string => !!key && isSupabaseAuthKey(key));

  for (const key of keys) {
    const value = source.getItem(key);
    if (value !== null) target.setItem(key, value);
    source.removeItem(key);
  }
}

/**
 * Define onde o GoTrue deve persistir tokens e migra uma sessão já escrita.
 * `remember=true` sobrevive ao fechamento do navegador; `false` fica restrito
 * à aba/sessão atual do browser.
 */
export function setAuthSessionPersistence(remember: boolean): void {
  const local = getLocalStorage();
  const session = getSessionStorage();
  if (!local || !session) return;

  local.setItem(AUTH_PERSISTENCE_KEY, remember ? '1' : '0');
  if (remember) {
    moveAuthItems(session, local);
  } else {
    moveAuthItems(local, session);
  }
}

/**
 * Remove somente a sessão Supabase deste navegador, sem depender do endpoint
 * remoto de logout. É a saída de emergência para indisponibilidade do Auth:
 * `signOut({ scope: 'local' })` tenta chamar `/logout` antes de limpar o
 * storage e, em 502/503/504, pode manter o usuário preso na sessão quebrada.
 */
export function clearStoredAuthSession(): void {
  const local = getLocalStorage();
  const session = getSessionStorage();
  if (local) removeAuthItems(local);
  if (session) removeAuthItems(session);
}

/**
 * Adapter dinâmico: o cliente Supabase continua único, mas cada operação usa
 * o storage escolhido pelo usuário. A leitura secundária é somente uma ponte
 * de migração para sessões criadas antes desta correção.
 */
export const authStorage: SupportedStorage = {
  getItem(key) {
    const local = getLocalStorage();
    const session = getSessionStorage();
    if (!canUseStorage(local) || !canUseStorage(session)) return null;

    const primary = shouldPersistAuthSession() ? local : session;
    const secondary = primary === local ? session : local;
    return primary.getItem(key) ?? secondary.getItem(key);
  },
  setItem(key, value) {
    const local = getLocalStorage();
    const session = getSessionStorage();
    if (!canUseStorage(local) || !canUseStorage(session)) return;

    const primary = shouldPersistAuthSession() ? local : session;
    const secondary = primary === local ? session : local;
    primary.setItem(key, value);
    secondary.removeItem(key);
  },
  removeItem(key) {
    getLocalStorage()?.removeItem(key);
    getSessionStorage()?.removeItem(key);
  },
};

export const AUTH_SESSION_PERSISTENCE_KEY = AUTH_PERSISTENCE_KEY;
