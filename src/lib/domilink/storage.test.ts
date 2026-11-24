import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDomiLinkSession, clearDomiLinkSessionOutsideScope, DOMILINK_STORAGE_KEYS,
  getDomiLinkSessionRevision, readDomiLinkEnabled, readDomiLinkSession, writeDomiLinkEnabled, writeDomiLinkSession,
} from './storage';
const scope = { userId: 'user-a', companyId: 'company-a' };

describe('preferências locais do DomiLink', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it('começa desligado e remove a chave ao desligar', () => {
    expect(readDomiLinkEnabled()).toBe(false);
    writeDomiLinkEnabled(true);
    expect(readDomiLinkEnabled()).toBe(true);
    writeDomiLinkEnabled(false);
    expect(localStorage.getItem(DOMILINK_STORAGE_KEYS.enabled)).toBeNull();
  });
  it('mantém a sessão apenas no sessionStorage e no escopo autenticado', () => {
    writeDomiLinkSession('token-local', scope);
    expect(readDomiLinkSession(scope)).toBe('token-local');
    expect(localStorage.getItem(DOMILINK_STORAGE_KEYS.session)).toBeNull();
  });
  it.each([{ userId: 'user-b', companyId: 'company-a' }, { userId: 'user-a', companyId: 'company-b' }])('descarta sessão de outro usuário/empresa: %o', (otherScope) => {
    writeDomiLinkSession('token-local', scope);
    expect(readDomiLinkSession(otherScope)).toBeNull();
    expect(sessionStorage.getItem(DOMILINK_STORAGE_KEYS.session)).toBeNull();
  });
  it('rejeita e remove token legado sem escopo', () => {
    sessionStorage.setItem(DOMILINK_STORAGE_KEYS.session, 'token-legado');
    expect(readDomiLinkSession(scope)).toBeNull();
    expect(sessionStorage.getItem(DOMILINK_STORAGE_KEYS.session)).toBeNull();
  });
  it('logout descarta sessão e invalida operações em voo preservando preferência', () => {
    writeDomiLinkEnabled(true);
    writeDomiLinkSession('token-local', scope);
    const revision = getDomiLinkSessionRevision();
    expect(clearDomiLinkSession()).toBe('token-local');
    expect(getDomiLinkSessionRevision()).toBeGreaterThan(revision);
    expect(readDomiLinkSession(scope)).toBeNull();
    expect(readDomiLinkEnabled()).toBe(true);
  });
  it('hidratação do mesmo usuário preserva sessão; troca de usuário/empresa devolve token para revogar', () => {
    writeDomiLinkSession('token-local', scope);
    expect(clearDomiLinkSessionOutsideScope({ userId: scope.userId })).toBeNull();
    expect(readDomiLinkSession(scope)).toBe('token-local');
    expect(clearDomiLinkSessionOutsideScope({ ...scope, companyId: 'company-b' })).toBe('token-local');
    writeDomiLinkSession('outro-token', scope);
    expect(clearDomiLinkSessionOutsideScope({ userId: 'user-b' })).toBe('outro-token');
  });
});
