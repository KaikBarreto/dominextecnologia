// Prova de DOM real (não só a função pura) dos 3 campos de dinheiro
// RESIDUAIS do ContractDetail: "Novo recebimento", "Editar recebimento" e
// "Editar N parcelas" (edição em massa). Os três já usavam a máscara de
// centavos (bug de mil vezes do `<input type="number">` já corrigido antes
// desta leva) mas ficaram SEM `onPaste` — colar um valor pronto (ex. "4.550")
// ainda caía na regra de dígitos comum (2 últimos = centavos) e dava
// R$ 45,50, 100x menor. Esta suíte prova que os três campos, no DOM real,
// dão R$ 4.550,00 ao colar "4.550".
//
// Driver mínimo com createRoot + act, mesmo padrão de
// `ContaFormDialog.test.tsx` (o repo não usa @testing-library/react).
// Componentes-filho irrelevantes pro campo de dinheiro (formulário de editar
// contrato, dialog de assinatura, abas de PMOC etc.) são mockados como `null`
// — igual a prática já usada em `ContaFormDialog.test.tsx` pros combobox.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ id: 'contract-1' }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('@/hooks/use-mobile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-mobile')>();
  return { ...actual, useIsMobile: () => false };
});

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    isLoading: false,
    setUserLanguage: async () => {},
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasRole: () => true,
    hasPermission: () => true,
    isAdminOrGestor: () => true,
    hasPermissionRecord: true,
    profile: { id: 'user-1', full_name: 'Teste' },
  }),
}));

vi.mock('@/hooks/usePmocPortal', () => ({
  useContractPublicToken: () => ({ data: null }),
  useRegeneratePmocToken: () => ({ mutateAsync: vi.fn() }),
  useResolveContractId: () => ({ id: 'contract-1', isResolving: false }),
}));

vi.mock('@/hooks/useBrandedQrConfig', () => ({
  useBrandedQrConfig: () => ({ logoUrl: null, dotStyle: 'square', cornerStyle: 'square', color: '#000000' }),
}));

const baseContract = {
  id: 'contract-1',
  name: 'Contrato Teste',
  status: 'active',
  customer_id: 'cust-1',
  customers: { name: 'Cliente Teste' },
  frequency_type: 'mensal',
  frequency_value: 1,
  horizon_months: 12,
  start_date: '2026-01-01',
  notes: null,
  contract_items: [],
  service_orders: [],
  is_pmoc: false,
  portal_documents_released: false,
  public_short_code: null,
  portal_is_public: true,
};

const oneTransaction = {
  id: 'tx-1',
  description: 'Parcela 1/12',
  amount: 100,
  is_paid: false,
  due_date: '2026-12-01',
  transaction_date: '2026-12-01',
};

vi.mock('@/hooks/useContractDetail', () => ({
  useContractDetail: () => ({
    contract: baseContract,
    isLoading: false,
    cancelOccurrenceOs: { mutateAsync: vi.fn() },
    stats: { totalOccurrences: 0, completedOccurrences: 0, progressPercent: 0, nextOccurrence: null },
    linkedTransactions: [oneTransaction],
    isLoadingTransactions: false,
  }),
  isActiveContractOS: () => false,
}));

vi.mock('@/hooks/useContracts', () => ({
  useContracts: () => ({
    deleteContract: { mutateAsync: vi.fn() },
    applyFinancialLinksToContractParcels: { mutateAsync: vi.fn() },
    renewContract: { mutateAsync: vi.fn() },
    contracts: [],
  }),
  getFrequencyLabel: () => 'Mensal',
}));

vi.mock('@/hooks/useServiceOrderActivities', () => ({
  useServiceOrderActivities: () => ({ activitiesByOrderId: {} }),
  freqCodeShortLabel: () => '',
}));

vi.mock('@/hooks/useFinancial', () => ({
  useFinancial: () => ({
    createTransactionsBatch: { mutateAsync: vi.fn() },
    markAsPaid: { mutateAsync: vi.fn() },
    deleteTransaction: { mutateAsync: vi.fn() },
    updateTransaction: { mutateAsync: vi.fn() },
    updateTransactionsBatch: { mutateAsync: vi.fn() },
    deleteTransactionsBatch: { mutateAsync: vi.fn() },
  }),
}));

vi.mock('@/hooks/useFinancialAccounts', () => ({
  useFinancialAccounts: () => ({ accounts: [] }),
}));

vi.mock('@/hooks/useCompanySettings', () => ({
  useCompanySettings: () => ({ settings: {} }),
}));

vi.mock('@/hooks/useCompanyModules', () => ({
  useCompanyModules: () => ({ hasModule: () => false }),
}));

vi.mock('@/hooks/useTenantPaymentAccount', () => ({
  useTenantPaymentAccount: () => ({ isActive: false }),
}));

vi.mock('@/hooks/useTenantSubscriptions', () => ({
  useTenantSubscriptions: () => ({
    subscriptions: [],
    isLoading: false,
    manageSubscription: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

// Componentes-filho irrelevantes pro campo de dinheiro sob teste — mesma
// prática de mock usada em ContaFormDialog.test.tsx.
vi.mock('@/components/contracts/ContractFormDialog', () => ({ ContractFormDialog: () => null }));
vi.mock('@/components/financial/SubscriptionDialog', () => ({ SubscriptionDialog: () => null }));
vi.mock('@/components/financial/CategorySelectField', () => ({ CategorySelectField: () => null }));
vi.mock('@/components/contracts/ContractEnvironmentsTab', () => ({ ContractEnvironmentsTab: () => null }));
vi.mock('@/components/contracts/ContractMaintenancePlanDocument', () => ({ ContractMaintenancePlanDocument: () => null }));
vi.mock('@/components/contracts/ContractVisitsReport', () => ({ ContractVisitsReport: () => null }));
vi.mock('@/components/contracts/ContractAttachmentsSection', () => ({ ContractAttachmentsSection: () => null }));
vi.mock('@/components/pmoc/PmocContractDocsTab', () => ({ PmocContractDocsTab: () => null }));
vi.mock('@/components/pmoc/PmocContractCronogramaTab', () => ({ PmocContractCronogramaTab: () => null }));
vi.mock('@/components/pmoc/PmocExecutionHistoryTab', () => ({ PmocExecutionHistoryTab: () => null }));

// Sidebar real tem grupos, ícones e o comportamento mobile/desktop do
// componente de verdade — irrelevante pro campo de dinheiro. Substituído por
// um seletor de aba mínimo que ainda assim exercita `onTabChange` de verdade.
vi.mock('@/components/SettingsSidebarLayout', () => ({
  SettingsSidebarLayout: ({ tabs, activeTab, onTabChange, children }: any) => (
    <div>
      <div data-testid="tab-switcher">
        {tabs.map((t: any) => (
          <button key={t.value} type="button" onClick={() => onTabChange(t.value)} data-active={activeTab === t.value}>
            {t.label}
          </button>
        ))}
      </div>
      <div>{children}</div>
    </div>
  ),
}));

import ContractDetail from './ContractDetail';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function mount() {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ContractDetail />
      </QueryClientProvider>,
    );
  });
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const qAll = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

function paste(input: HTMLInputElement, text: string) {
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent & { clipboardData: any };
  pasteEvent.clipboardData = { getData: () => text };
  act(() => {
    input.dispatchEvent(pasteEvent);
  });
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

function goToFinanceiro() {
  mount();
  // Aba "Financeiro" é a última das 3 abas comuns (Visão Geral, Ocorrências,
  // Financeiro) — localizamos pelo texto pra não depender de posição.
  const buttons = qAll('[data-testid="tab-switcher"] button');
  const financeiroBtn = buttons.find((b) => /financeiro/i.test(b.textContent || ''));
  expect(financeiroBtn).toBeTruthy();
  click(financeiroBtn!);
}

describe('ContractDetail — "Novo recebimento" (prova real de DOM)', () => {
  it('colar "4.550" dá R$ 4.550,00 (não R$ 45,50, o bug residual do onPaste faltando)', () => {
    goToFinanceiro();
    const newRevenueBtn = qAll('button').find((b) => /nova receita|novo recebimento/i.test(b.textContent || ''));
    expect(newRevenueBtn).toBeTruthy();
    click(newRevenueBtn!);

    const input = q('input[inputmode="numeric"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    paste(input, '4.550');
    expect(input.value).toBe('4.550,00');
  });
});

describe('ContractDetail — "Editar recebimento" (prova real de DOM)', () => {
  it('colar "4.550" dá R$ 4.550,00', () => {
    goToFinanceiro();
    // Abre o modal de edição via botão "editar" da própria parcela renderizada.
    const editButtons = qAll('button[title]').filter((b) => /editar/i.test(b.getAttribute('title') || ''));
    expect(editButtons.length).toBeGreaterThan(0);
    click(editButtons[0]);

    const inputs = qAll('input[inputmode="numeric"]') as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    const input = inputs[0];
    paste(input, '4.550');
    expect(input.value).toBe('4.550,00');
  });
});

describe('ContractDetail — "Editar N parcelas" em massa (prova real de DOM)', () => {
  it('colar "4.550" dá R$ 4.550,00', () => {
    goToFinanceiro();
    // Seleciona a parcela renderizada (checkbox) pra habilitar a barra de ações
    // em massa, depois abre "Editar (1)".
    const checkbox = q('#rec-select-all') as HTMLElement;
    expect(checkbox).toBeTruthy();
    click(checkbox);

    const editBulkBtn = qAll('button').find((b) => /editar \(1\)/i.test(b.textContent || ''));
    expect(editBulkBtn).toBeTruthy();
    click(editBulkBtn!);

    const inputs = qAll('input[inputmode="numeric"]') as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    const input = inputs[0];
    paste(input, '4.550');
    expect(input.value).toBe('4.550,00');
  });
});
