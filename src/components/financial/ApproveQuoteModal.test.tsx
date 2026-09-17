// Varredura do bug de cartão-em-recebimento (mesma causa do ReceivePaymentModal):
// os dois modos deste modal ('recebido' e 'a_receber') geram RECEITA — cartão
// de crédito nunca é um destino válido. Antes desta correção, o modal montava
// as opções com `accounts.filter(a => a.is_active)` cru, sem passar por
// `filterAccountsForReceivable`.
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

vi.mock('@/hooks/useCostCenters', () => ({
  useCostCenters: () => ({ costCenters: [], activeCostCenters: [], createCostCenter: noopMutation }),
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

import { ApproveQuoteModal } from './ApproveQuoteModal';
import { MESSAGES } from '@/lib/i18n/messages';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const t = MESSAGES['pt-br'].app.finance.approveQuote;

function mount(defaultMode: 'recebido' | 'a_receber') {
  act(() => {
    root.render(
      <ApproveQuoteModal
        open
        onOpenChange={() => {}}
        quoteNumber={42}
        amount={1000}
        defaultMode={defaultMode}
        onConfirm={async () => {}}
      />,
    );
  });
}

function optionLabelsByPlaceholder(placeholder: string): string[] {
  const selects = Array.from(document.querySelectorAll('[data-testid="searchable-select"]')) as HTMLSelectElement[];
  const found = selects.find((s) => s.getAttribute('data-placeholder') === placeholder);
  if (!found) throw new Error(`Select com placeholder "${placeholder}" não encontrado`);
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

describe('ApproveQuoteModal — aprovação de orçamento nunca lista cartão como destino de receita', () => {
  it('modo "recebido": conta de recebimento não lista cartão', () => {
    mount('recebido');
    const labels = optionLabelsByPlaceholder(t.accountPlaceholder);
    expect(labels).toContain('Conta PF Matheus');
    expect(labels).not.toContain('Cartão Black Elite');
  });

  it('modo "a_receber": conta prevista não lista cartão', () => {
    mount('a_receber');
    const labels = optionLabelsByPlaceholder(t.expectedAccountPlaceholder);
    expect(labels).toContain('Conta PF Matheus');
    expect(labels).not.toContain('Cartão Black Elite');
  });
});
