import { describe, expect, it } from 'vitest';
import { DOMILINK_STORAGE_KEYS, readDomiLinkEnabled, readDomiLinkSession, writeDomiLinkEnabled, writeDomiLinkSession } from './storage';

describe('preferências locais do DomiLink', () => {
  it('começa desligado e remove a chave ao desligar', () => {
    localStorage.clear();
    expect(readDomiLinkEnabled()).toBe(false);
    writeDomiLinkEnabled(true);
    expect(readDomiLinkEnabled()).toBe(true);
    writeDomiLinkEnabled(false);
    expect(localStorage.getItem(DOMILINK_STORAGE_KEYS.enabled)).toBeNull();
  });

  it('mantém a sessão apenas no sessionStorage', () => {
    localStorage.clear();
    sessionStorage.clear();
    writeDomiLinkSession('token-local');
    expect(readDomiLinkSession()).toBe('token-local');
    expect(localStorage.getItem(DOMILINK_STORAGE_KEYS.session)).toBeNull();
  });
});
