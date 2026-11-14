import { describe, expect, it } from 'vitest';
import {
  buildPdvSaleCashPath,
  parsePdvSaleCashContext,
  resolvePdvSaleCashContext,
} from './pdvSaleContext';

const terminals = [
  { id: 'terminal-1', stockId: 'stock-1' },
  { id: 'terminal-2', stockId: 'stock-2' },
];
const sessions = [
  { id: 'session-1', terminalId: 'terminal-1' },
  { id: 'session-2', terminalId: 'terminal-2' },
];

describe('contexto explícito da venda por caixa', () => {
  it('leva caixa, terminal e estoque na navegação', () => {
    expect(buildPdvSaleCashPath('/pdv/venda', {
      sessionId: 'session-2', terminalId: 'terminal-2', stockId: 'stock-2',
    })).toBe('/pdv/venda?caixa=session-2&terminal=terminal-2&estoque=stock-2');
  });

  it('preserva exatamente o segundo caixa quando existem dois abertos', () => {
    const requested = parsePdvSaleCashContext(
      '?caixa=session-2&terminal=terminal-2&estoque=stock-2',
    );
    expect(resolvePdvSaleCashContext({ requested, terminals, sessions })).toEqual({
      status: 'resolved',
      context: { sessionId: 'session-2', terminalId: 'terminal-2', stockId: 'stock-2' },
    });
  });

  it('falha fechado quando o contexto foi adulterado ou veio incompleto', () => {
    const adulterated = parsePdvSaleCashContext(
      '?caixa=session-2&terminal=terminal-1&estoque=stock-1',
    );
    expect(resolvePdvSaleCashContext({ requested: adulterated, terminals, sessions }).status)
      .toBe('invalid');
    expect(parsePdvSaleCashContext('?caixa=session-1').kind).toBe('invalid');
  });

  it('não escolhe silenciosamente a primeira sessão quando a URL está ausente', () => {
    const requested = parsePdvSaleCashContext('');
    expect(resolvePdvSaleCashContext({ requested, terminals, sessions }).status)
      .toBe('ambiguous');
    expect(resolvePdvSaleCashContext({
      requested,
      terminals,
      sessions: [sessions[1]],
    })).toEqual({
      status: 'resolved',
      context: { sessionId: 'session-2', terminalId: 'terminal-2', stockId: 'stock-2' },
    });
  });
});
