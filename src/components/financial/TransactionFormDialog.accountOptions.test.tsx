// Regressão do bug reportado pelo sócio (madrugada de 17/09/2026): a lista de
// contas do formulário de transação escondia o cartão de crédito em DESPESA
// depois de alternar o tipo dentro do MESMO modal aberto (Receita → Despesa).
//
// Causa raiz: `accountOptions` (linha ~1207 de TransactionFormDialog.tsx) é um
// `useMemo` cujo array de dependências esquecia `isEntrada`. Como a tela
// "Visão Geral" mantém UMA ÚNICA instância do dialog (só troca `defaultType` e
// `open`, sem desmontar — ver src/pages/Finance.tsx), e o próprio formulário
// deixa o usuário alternar Receita/Despesa com um botão sem fechar o modal, o
// memo nunca recomputava: a lista de contas ficava travada no filtro da
// primeira renderização da sessão.
//
// Este teste reproduz exatamente esse caminho: abre o modal já em Receita,
// confirma que o cartão não aparece, alterna pro botão "Despesa" SEM remontar
// o componente, e confirma que o cartão passa a aparecer.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    isLoading: false,
    setUserLanguage: async () => {},
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const ACCOUNTS = [
  { id: 'acc-banco', name: 'Banco Principal', type: 'banco', is_active: true, color: '#333', institution_code: null, institution_name: null, bank_name: null },
  { id: 'acc-cartao', name: 'Cartão Black Elite', type: 'cartao', is_active: true, color: '#111', institution_code: null, institution_name: null, bank_name: null, closing_day: 5, due_day: 12 },
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

vi.mock('@/hooks/useFinancialCategories', () => ({
  useFinancialCategories: () => ({
    categories: [],
    createCategory: noopMutation,
  }),
}));

vi.mock('@/hooks/useCostCenters', () => ({
  useCostCenters: () => ({ costCenters: [], activeCostCenters: [] }),
}));

vi.mock('@/hooks/useCustomers', () => ({
  useCustomers: () => ({ customers: [] }),
}));

vi.mock('@/hooks/useSuppliers', () => ({
  useSuppliers: () => ({ suppliers: [] }),
}));

vi.mock('@/hooks/useCanManageFinanceSettings', () => ({
  useCanManageFinanceSettings: () => false,
}));

vi.mock('@/hooks/useTenantCardFees', () => ({
  useTenantFees: () => ({
    card: { debit: 0, credit: {} },
    pix: 0,
    bankSlip: 0,
    anticipation: 0,
    settlementDays: { pix: 0, bankSlip: 1, card: 30 },
    source: 'reference',
    extrasSource: 'reference',
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useTransactionAttachments', () => ({
  useTransactionAttachments: () => ({ data: [], isLoading: false }),
  useUploadTransactionAttachment: () => noopMutation,
  useUploadTransactionAttachmentShared: () => noopMutation,
  useRemoveTransactionAttachment: () => noopMutation,
  createAttachmentSignedUrl: vi.fn(),
  formatAttachmentSize: (n: number) => `${n}b`,
}));

vi.mock('@/hooks/useFormDraft', () => ({
  useFormDraft: () => ({
    hasDraft: false,
    draftData: null,
    saveDraft: vi.fn(),
    flush: vi.fn(),
    clearDraft: vi.fn(),
    acceptDraft: vi.fn(),
    discardDraft: vi.fn(),
    showResumePrompt: false,
  }),
}));

vi.mock('@/components/customers/CustomerSelectField', () => ({
  CustomerSelectField: () => null,
}));

vi.mock('@/components/financial/SupplierSelectField', () => ({
  SupplierSelectField: () => null,
}));

// Stub do combobox de conta: renderiza as `options` recebidas como <option>
// reais, num <select> identificável pelo placeholder. É exatamente o que
// TransactionFormDialog calcula em `accountOptions` — testar isso já prova (ou
// derruba) o bug, sem depender do Popover/cmdk real do Radix.
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

import { TransactionFormDialog } from './TransactionFormDialog';
import { MESSAGES } from '@/lib/i18n/messages';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const tf = MESSAGES['pt-br'].app.finance.transactionForm;

function mount(defaultType: 'entrada' | 'saida') {
  act(() => {
    root.render(
      <TransactionFormDialog
        open
        onOpenChange={() => {}}
        defaultType={defaultType}
        onSubmit={async () => {}}
      />,
    );
  });
}

function accountSelect(): HTMLSelectElement {
  const selects = Array.from(document.querySelectorAll('[data-testid="searchable-select"]')) as HTMLSelectElement[];
  const found = selects.find((s) => s.getAttribute('data-placeholder') === tf.accountPlaceholder);
  if (!found) throw new Error('Select de conta não encontrado');
  return found;
}

function accountOptionLabels(): string[] {
  return Array.from(accountSelect().options).map((o) => o.textContent || '').filter(Boolean);
}

function buttonByText(label: string) {
  return Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
}

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('TransactionFormDialog — filtro de cartão nas opções de conta', () => {
  it('em Receita, o cartão de crédito NUNCA aparece nas opções de conta', () => {
    mount('entrada');
    const labels = accountOptionLabels();
    expect(labels).toContain('Banco Principal');
    expect(labels).not.toContain('Cartão Black Elite');
  });

  it('em Despesa, o cartão de crédito aparece nas opções de conta', () => {
    mount('saida');
    const labels = accountOptionLabels();
    expect(labels).toContain('Banco Principal');
    expect(labels).toContain('Cartão Black Elite');
  });

  it('alternar de Receita pra Despesa dentro do MESMO modal aberto atualiza a lista (regressão da memoização travada)', () => {
    mount('entrada');
    expect(accountOptionLabels()).not.toContain('Cartão Black Elite');

    // Mesma instância — clique no toggle interno, sem remontar o componente.
    // É exatamente o caminho que expôs o bug: `accountOptions` não tinha
    // `isEntrada` nas deps do useMemo e continuava com a lista antiga.
    act(() => {
      buttonByText(tf.typeExpense)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(accountOptionLabels()).toContain('Cartão Black Elite');
  });

  it('alternar de Despesa pra Receita dentro do MESMO modal aberto tira o cartão da lista', () => {
    mount('saida');
    expect(accountOptionLabels()).toContain('Cartão Black Elite');

    act(() => {
      buttonByText(tf.typeRevenue)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(accountOptionLabels()).not.toContain('Cartão Black Elite');
  });
});
