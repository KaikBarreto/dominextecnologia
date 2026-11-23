import {
  AUTH_SESSION_PERSISTENCE_KEY,
  authStorage,
  clearStoredAuthSession,
  setAuthSessionPersistence,
  shouldPersistAuthSession,
} from './authStorage';

const AUTH_KEY = 'sb-test-auth-token';

describe('authStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('preserva o comportamento persistente histórico sem escolha explícita', () => {
    expect(shouldPersistAuthSession()).toBe(true);
    authStorage.setItem(AUTH_KEY, 'persistente');
    expect(localStorage.getItem(AUTH_KEY)).toBe('persistente');
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
  });

  it('mantém a sessão somente no sessionStorage quando lembrar-me está desativado', () => {
    setAuthSessionPersistence(false);
    authStorage.setItem(AUTH_KEY, 'temporaria');

    expect(localStorage.getItem(AUTH_SESSION_PERSISTENCE_KEY)).toBe('0');
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_KEY)).toBe('temporaria');
  });

  it('migra a sessão atual ao alternar lembrar-me', () => {
    setAuthSessionPersistence(false);
    authStorage.setItem(AUTH_KEY, 'sessao');

    setAuthSessionPersistence(true);
    expect(localStorage.getItem(AUTH_KEY)).toBe('sessao');
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();

    setAuthSessionPersistence(false);
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_KEY)).toBe('sessao');
  });

  it('remove tokens dos dois storages', () => {
    localStorage.setItem(AUTH_KEY, 'local');
    sessionStorage.setItem(AUTH_KEY, 'session');
    authStorage.removeItem(AUTH_KEY);
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
  });

  it('força a limpeza local dos tokens sem apagar preferências do aplicativo', () => {
    localStorage.setItem(AUTH_KEY, 'local');
    sessionStorage.setItem(AUTH_KEY, 'session');
    localStorage.setItem('theme', 'dark');
    sessionStorage.setItem('draft', 'preservar');

    clearStoredAuthSession();

    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(sessionStorage.getItem('draft')).toBe('preservar');
  });
});
