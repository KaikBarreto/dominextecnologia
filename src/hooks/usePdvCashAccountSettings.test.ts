import { describe, expect, it } from 'vitest';
import { projectPdvCashAccountSettings } from './usePdvCashAccountSettings';

describe('projectPdvCashAccountSettings', () => {
  it('projeta a conta escolhida, as opções e os caixas abertos', () => {
    expect(projectPdvCashAccountSettings({
      selected_account: { id: 'cash-1', name: 'Caixa Geral' },
      accounts: [
        { id: 'cash-1', name: 'Caixa Geral' },
        { id: 'cash-2', name: 'Dinheiro da Loja' },
      ],
      open_sessions: 2,
    })).toEqual({
      selectedAccount: { id: 'cash-1', name: 'Caixa Geral' },
      accounts: [
        { id: 'cash-1', name: 'Caixa Geral' },
        { id: 'cash-2', name: 'Dinheiro da Loja' },
      ],
      openSessions: 2,
    });
  });

  it('aceita empresa ainda sem conta escolhida', () => {
    expect(projectPdvCashAccountSettings({
      selected_account: null,
      accounts: [],
      open_sessions: '0',
    })).toEqual({ selectedAccount: null, accounts: [], openSessions: 0 });
  });

  it('falha fechado quando o servidor não confirma as opções ou as sessões', () => {
    expect(() => projectPdvCashAccountSettings({ accounts: null, open_sessions: 0 })).toThrow('Não foi possível carregar');
    expect(() => projectPdvCashAccountSettings({ accounts: [], open_sessions: -1 })).toThrow('Não foi possível confirmar');
  });
});
