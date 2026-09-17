// Regressão do print do sócio (madrugada de 17/09/2026): "Como foi recebido?"
// (este modal) listava cartão de crédito como destino de recebimento. Dinheiro
// de cliente nunca cai num cartão de crédito — é conta de SAÍDA (fatura que a
// empresa paga). `filterAccountsForReceivable` já existia em
// `src/lib/financial-account-filter.ts` mas este modal montava as opções com
// `accounts.filter(a => a.is_active)` cru, sem chamar a função.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    isLoading: false,
    setUserLanguage: async () => {},
  }),
}));

const ACCOUNTS = [
  { id: 'acc-banco', name: 'Conta PF Matheus', type: 'banco', is_active: true, color: '#333' },
  { id: 'acc-cartao', name: 'Cartão Black Elite', type: 'cartao', is_active: true, color: '#111' },
  { id: 'acc-cartao-2', name: 'Cartão PF Matheus', type: 'cartao', is_active: true, color: '#222' },
];

const noopMutation = { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false };

vi.mock('@/hooks/useFinancialAccounts', () => ({
  useFinancialAccounts: () => ({
    accounts: ACCOUNTS,
    balances: {},
    cardBillTotals: {},
    isLoading: false,
    createAccount: noopMutation,
    updateAccount: noopMutation,
    deleteAccount: noopMutation,
  }),
}));

vi.mock('@/hooks/useCanManageFinanceSettings', () => ({
  useCanManageFinanceSettings: () => false,
}));

vi.mock('@/components/ui/SearchableSelect', () => ({
  SearchableSelect: (props: any) => (
    <select
      data-testid="searchable-select"
      data-placeholder={props.placeholder}
      value={props.value}
      onChange={(e: any) => props.onValueChange(e.target.value)}
    >
      <option value="">{props.placeholder}</option>
      {(props.options ?? []).map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
}));

import { ReceivePaymentModal } from './ReceivePaymentModal';
import { MESSAGES } from '@/lib/i18n/messages';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const t = MESSAGES['pt-br'].app.finance.receivePayment;

function mount() {
  act(() => {
    root.render(
      <ReceivePaymentModal
        open
        onOpenChange={() => {}}
        amount={1000}
        onConfirm={async () => {}}
      />,
    );
  });
}

function accountOptionLabels(): string[] {
  const selects = Array.from(document.querySelectorAll('[data-testid="searchable-select"]')) as HTMLSelectElement[];
  const found = selects.find((s) => s.getAttribute('data-placeholder') === t.accountPlaceholder);
  if (!found) throw new Error('Select de conta não encontrado');
  return Array.from(found.options).map((o) => o.textContent || '').filter(Boolean);
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('ReceivePaymentModal — "Como foi recebido?" nunca lista cartão de crédito', () => {
  it('mostra as contas bancárias/caixa', () => {
    mount();
    expect(accountOptionLabels()).toContain('Conta PF Matheus');
  });

  it('NÃO mostra nenhum cartão de crédito como destino de recebimento', () => {
    mount();
    const labels = accountOptionLabels();
    expect(labels).not.toContain('Cartão Black Elite');
    expect(labels).not.toContain('Cartão PF Matheus');
  });
});
