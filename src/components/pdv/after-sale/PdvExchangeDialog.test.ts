import { describe, expect, it } from 'vitest';
import { normalizePdvExchangeDifference } from './exchangeDifference';

const cashOptions = [{
  sessionId: 'session-1',
  terminalId: 'terminal-1',
  terminalName: 'Caixa 1',
  accountId: 'account-1',
  label: 'Caixa 1',
}];

describe('diferença da troca', () => {
  it('ignora forma e conta residuais quando a diferença passa a zero', () => {
    expect(normalizePdvExchangeDifference({
      differenceCents: 0,
      differenceMethod: 'dinheiro',
      optionId: 'session-1',
      cashOptions,
      canApproveCredit: false,
    })).toEqual({
      differenceMethod: null,
      differenceAccountId: null,
      cashSessionId: null,
      needsOption: false,
      valid: true,
    });
  });

  it('mantém conta e sessão quando ainda existe diferença em dinheiro', () => {
    expect(normalizePdvExchangeDifference({
      differenceCents: 1500,
      differenceMethod: 'dinheiro',
      optionId: 'session-1',
      cashOptions,
      canApproveCredit: false,
    })).toMatchObject({
      differenceMethod: 'dinheiro',
      differenceAccountId: 'account-1',
      cashSessionId: 'session-1',
      needsOption: true,
      valid: true,
    });
  });
});
