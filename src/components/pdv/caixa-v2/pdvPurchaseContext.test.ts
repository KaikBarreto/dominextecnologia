import { describe, expect, it } from 'vitest';
import {
  buildPdvPurchaseCashPath,
  parsePdvPurchaseCashContext,
  pdvPurchaseCashDraftStorageSuffix,
} from './pdvPurchaseContext';

describe('contexto explícito da compra por caixa', () => {
  it('leva abertura, caixa e estoque na rota sem escolher fallback', () => {
    expect(buildPdvPurchaseCashPath('/pdv/compra', {
      sessionId: 'session-b', terminalId: 'terminal-b', stockId: 'stock-shared',
    })).toBe('/pdv/compra?caixa=session-b&terminal=terminal-b&estoque=stock-shared');
    expect(parsePdvPurchaseCashContext('').kind).toBe('absent');
  });

  it('falha fechado para URL parcial ou adulterada pelo formato', () => {
    expect(parsePdvPurchaseCashContext('?caixa=session-a').kind).toBe('invalid');
    expect(parsePdvPurchaseCashContext('?caixa=session-a&terminal=terminal-a').kind).toBe('invalid');
  });

  it('isola rascunhos dos caixas A e B mesmo quando usam o mesmo estoque', () => {
    const a = { sessionId: 'session-a', terminalId: 'terminal-a', stockId: 'stock-shared' };
    const b = { sessionId: 'session-b', terminalId: 'terminal-b', stockId: 'stock-shared' };
    expect(pdvPurchaseCashDraftStorageSuffix(a)).not.toBe(pdvPurchaseCashDraftStorageSuffix(b));
  });
});
