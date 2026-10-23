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
import type { FinancialTransaction } from '@/types/database';

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

const CATEGORIES = [
  { id: 'cat-receitas', name: 'Receitas operacionais', type: 'entrada', color: '#2563eb', icon: null, is_active: true, parent_id: null },
  { id: 'cat-instalacao', name: 'Instalação', type: 'entrada', color: '#16a34a', icon: null, is_active: true, parent_id: 'cat-receitas' },
  { id: 'cat-despesas', name: 'Despesas operacionais', type: 'saida', color: '#dc2626', icon: null, is_active: true, parent_id: null },
];

const COST_CENTERS = [
  { id: 'cc-obra', name: 'Obra Centro', color: '#7c3aed', is_active: true },
];
let costCentersEnabled = true;

const noopMutation = { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false };
const createOnlineChargeMock = vi.fn();
let canManagePayments = false;
let hasChargeModule = false;
let paymentAccountActive = false;

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
    categories: CATEGORIES,
    createCategory: noopMutation,
  }),
}));

vi.mock('@/hooks/useCostCenters', () => ({
  useCostCenters: () => ({
    costCenters: costCentersEnabled ? COST_CENTERS : [],
    activeCostCenters: costCentersEnabled ? COST_CENTERS : [],
    createCostCenter: noopMutation,
  }),
}));

vi.mock('@/hooks/useCustomers', () => ({
  useCustomers: () => ({
    customers: [
      { id: 'customer-kgie', name: 'KGIE Tecnologia', document: '52998224725', is_deleted: false },
    ],
  }),
}));

vi.mock('@/hooks/useSuppliers', () => ({
  useSuppliers: () => ({ suppliers: [] }),
}));

vi.mock('@/hooks/useCanManageFinanceSettings', () => ({
  useCanManageFinanceSettings: () => canManagePayments,
}));

vi.mock('@/hooks/useCompanyModules', () => ({
  useCompanyModules: () => ({ hasModule: (code: string) => code === 'cobrancas' && hasChargeModule }),
}));

vi.mock('@/hooks/useTenantPaymentAccount', () => ({
  useTenantPaymentAccount: () => ({
    isActive: paymentAccountActive,
    allowPix: true,
    allowBoleto: true,
  }),
}));

vi.mock('@/hooks/useTenantCharges', () => ({
  useTenantCharges: () => ({
    create: { mutateAsync: createOnlineChargeMock, isPending: false },
  }),
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
  CustomerSelectField: ({ value, onValueChange }: { value?: string; onValueChange: (value: string) => void }) => (
    <input
      aria-label="customer-field"
      value={value ?? ''}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
}));

vi.mock('@/components/financial/SupplierSelectField', () => ({
  SupplierSelectField: ({ value, onValueChange }: { value?: string; onValueChange: (value: string) => void }) => (
    <input
      aria-label="supplier-field"
      value={value ?? ''}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
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

// Seletor de OS (vínculo opcional da cobrança, 1.36.2): stub pelo MESMO motivo
// do `useCostCenters` acima — o hook real passa por `useUserCompany`, que exige
// AuthProvider, e estes testes montam o dialog sem contexto de auth. Lista
// vazia: nenhum teste daqui exercita o vínculo com OS.
vi.mock('@/hooks/useServiceOrderOptions', () => ({
  useServiceOrderOptions: () => ({ serviceOrders: [], isLoading: false }),
}));


import { TransactionFormDialog } from './TransactionFormDialog';
import { MESSAGES } from '@/lib/i18n/messages';
import { todayInTz } from '@/lib/timezone';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const tf = MESSAGES['pt-br'].app.finance.transactionForm;

function mount(
  defaultType: 'entrada' | 'saida',
  requireDueDateWhenUnpaid = false,
  onSubmit: (payload: any) => Promise<any> = async () => {},
  transaction?: FinancialTransaction,
  prefill?: React.ComponentProps<typeof TransactionFormDialog>['prefill'],
) {
  act(() => {
    root.render(
      <TransactionFormDialog
        open
        onOpenChange={() => {}}
        defaultType={defaultType}
        onSubmit={onSubmit}
        requireDueDateWhenUnpaid={requireDueDateWhenUnpaid}
        transaction={transaction}
        prefill={prefill}
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

function searchableSelect(placeholder: string): HTMLSelectElement {
  const selects = Array.from(document.querySelectorAll('[data-testid="searchable-select"]')) as HTMLSelectElement[];
  const found = selects.find((s) => s.getAttribute('data-placeholder') === placeholder);
  if (!found) throw new Error(`Select não encontrado: ${placeholder}`);
  return found;
}

function accountOptionLabels(): string[] {
  return Array.from(accountSelect().options).map((o) => o.textContent || '').filter(Boolean);
}

function buttonByText(label: string) {
  return Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
}

function sectionByTitle(title: string): HTMLElement {
  const section = Array.from(document.querySelectorAll('section'))
    .find((item) => Array.from(item.querySelectorAll('h3, button span'))
      .some((heading) => heading.textContent?.trim() === title)) as HTMLElement | undefined;
  if (!section) throw new Error(`Seção não encontrada: ${title}`);
  return section;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  costCentersEnabled = true;
  canManagePayments = false;
  hasChargeModule = false;
  paymentAccountActive = false;
  createOnlineChargeMock.mockResolvedValue({
    orphan: false,
    charge: { financeWarning: null },
  });
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

describe('TransactionFormDialog — classificação', () => {
  it('mantém Categoria e Centro de custo no grid responsivo sem caixa intermediária', () => {
    mount('entrada');

    const legend = Array.from(document.querySelectorAll('legend'))
      .find((item) => item.textContent?.trim() === 'Classificação');
    expect(legend).toBeTruthy();

    const fieldset = legend!.closest('fieldset');
    const grid = Array.from(fieldset?.children ?? []).find((item) => item.tagName === 'DIV');
    expect(fieldset?.className).not.toContain('border');
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('lg:grid-cols-2');
    expect(searchableSelect(tf.categoryPlaceholder)).toBeTruthy();
    expect(document.body.textContent).toContain(MESSAGES['pt-br'].app.finance.costCenters.fieldLabel);
  });

  it('mantém Centro de custo condicional quando a empresa não usa o recurso', () => {
    costCentersEnabled = false;
    mount('entrada');

    expect(document.body.textContent).not.toContain(MESSAGES['pt-br'].app.finance.costCenters.fieldLabel);
    expect(searchableSelect(tf.categoryPlaceholder).closest('.lg\\:col-span-2')).toBeTruthy();
  });

  it('mostra e persiste a hierarquia Categoria › Subcategoria sem alterar o contrato do payload', async () => {
    localStorage.setItem('fin_last_account_id', 'acc-banco');
    const onSubmit = vi.fn().mockResolvedValue({ ids: ['txn-1'] });
    mount('entrada', false, onSubmit);

    act(() => {
      const category = searchableSelect(tf.categoryPlaceholder);
      category.value = 'Receitas operacionais';
      category.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const subcategory = searchableSelect(tf.subcategoryPlaceholder);
    expect(Array.from(subcategory.options).map((option) => option.textContent))
      .toContain('Receitas operacionais › Instalação');

    act(() => {
      subcategory.value = 'Instalação';
      subcategory.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(subcategory.selectedOptions[0]?.textContent).toBe('Receitas operacionais › Instalação');

    const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const proto = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const description = document.querySelector(`textarea[placeholder="${tf.descriptionPlaceholder}"]`) as HTMLTextAreaElement;
    const amount = document.querySelector(`input[placeholder="${tf.amountPlaceholder}"]`) as HTMLInputElement;

    act(() => {
      setNativeValue(description, 'Instalação de equipamento');
      setNativeValue(amount, '10000');
    });

    const save = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === tf.saveLabel);
    await act(async () => {
      save!.click();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      category: 'Instalação',
      cost_center_id: null,
    }));
  });
});

describe('TransactionFormDialog — prioridade de Cliente e Fornecedor', () => {
  it('mostra Cliente no bloco principal da Receita e Fornecedor em Mais detalhes', () => {
    mount('entrada');
    const main = sectionByTitle(tf.sections.whatIsIt);
    const details = sectionByTitle(tf.sections.moreDetails);

    expect(main.querySelector('[aria-label="customer-field"]')).toBeTruthy();
    expect(main.querySelector('[aria-label="supplier-field"]')).toBeNull();
    expect(details.querySelector('[aria-label="supplier-field"]')).toBeTruthy();
  });

  it('mostra Fornecedor no bloco principal da Despesa e Cliente em Mais detalhes', () => {
    mount('saida');
    const main = sectionByTitle(tf.sections.whatIsIt);
    const details = sectionByTitle(tf.sections.moreDetails);

    expect(main.querySelector('[aria-label="supplier-field"]')).toBeTruthy();
    expect(main.querySelector('[aria-label="customer-field"]')).toBeNull();
    expect(details.querySelector('[aria-label="customer-field"]')).toBeTruthy();
  });

  it('não perde o cliente ao trocar Receita por Despesa e revela Mais detalhes', () => {
    mount('entrada');
    const customer = document.querySelector('[aria-label="customer-field"]') as HTMLInputElement;
    setInputValue(customer, 'customer-1');

    act(() => {
      buttonByText(tf.typeExpense)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const details = sectionByTitle(tf.sections.moreDetails);
    const movedCustomer = details.querySelector('[aria-label="customer-field"]') as HTMLInputElement;
    expect(movedCustomer.value).toBe('customer-1');
    expect(details.lastElementChild?.className).not.toContain('hidden');
  });

  it('em edição preserva os dois vínculos e abre Mais detalhes', () => {
    mount('saida', false, async () => {}, {
      id: 'txn-1',
      transaction_type: 'saida',
      description: 'Compra de material',
      amount: 100,
      transaction_date: '2026-09-27',
      due_date: '2026-09-27',
      is_paid: false,
      account_id: 'acc-banco',
      customer_id: 'customer-1',
      supplier_id: 'supplier-1',
    } as FinancialTransaction);

    const main = sectionByTitle(tf.sections.whatIsIt);
    const details = sectionByTitle(tf.sections.moreDetails);
    expect((main.querySelector('[aria-label="supplier-field"]') as HTMLInputElement).value).toBe('supplier-1');
    expect((details.querySelector('[aria-label="customer-field"]') as HTMLInputElement).value).toBe('customer-1');
    expect(details.lastElementChild?.className).not.toContain('hidden');
  });

  it('empilha o rodapé no mobile sem tirar ações da área fixa', () => {
    mount('entrada');
    const footer = buttonByText(tf.cancelLabel)?.parentElement;
    expect(footer?.className).toContain('flex-col-reverse');
    expect(footer?.className).toContain('sm:flex-row');
  });
});

describe('TransactionFormDialog — vencimento da conta futura do CRM', () => {
  it('mostra o vencimento quando a receita ainda não foi recebida', () => {
    mount('entrada', true);
    expect(document.body.textContent).not.toContain(`${MESSAGES['pt-br'].app.finance.accounts.table.dueDate} *`);

    const paidSwitch = document.querySelector('[role="switch"]');
    expect(paidSwitch).toBeTruthy();

    act(() => {
      paidSwitch!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain(`${MESSAGES['pt-br'].app.finance.accounts.table.dueDate} *`);
  });

  // Antes, o vencimento só existia no fluxo do CRM: lançar uma conta a pagar
  // pelo Financeiro com "Já foi pago" desligado não tinha onde informar a data,
  // e ela só reaparecia no Editar da lista de Contas (que é outro formulário).
  it('oferece o vencimento, opcional, em qualquer lançamento ainda não pago', () => {
    const dueDateLabel = MESSAGES['pt-br'].app.finance.accounts.table.dueDate;
    mount('saida');

    // Com "Já foi pago" LIGADO (padrão) o campo não faz sentido e some.
    expect(document.body.textContent).not.toContain(
      MESSAGES['pt-br'].app.finance.transactionForm.dueDateHint,
    );

    const paidSwitch = document.querySelector('[role="switch"]');
    expect(paidSwitch).toBeTruthy();

    act(() => {
      paidSwitch!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain(dueDateLabel);
    // Sem asterisco: aqui o vencimento é opcional (o `*` é só do fluxo do CRM).
    expect(document.body.textContent).not.toContain(`${dueDateLabel} *`);
    expect(document.body.textContent).toContain(
      MESSAGES['pt-br'].app.finance.transactionForm.dueDateHint,
    );
  });

  it('deixa salvar a conta em aberto sem vencimento, mandando null', async () => {
    localStorage.setItem('fin_last_account_id', 'acc-banco');
    const onSubmit = vi.fn().mockResolvedValue({ ids: ['txn-1'] });
    mount('saida', false, onSubmit);

    const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const proto = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const description = document.querySelector(`textarea[placeholder="${tf.descriptionPlaceholder}"]`) as HTMLTextAreaElement;
    const amount = document.querySelector(`input[placeholder="${tf.amountPlaceholder}"]`) as HTMLInputElement;

    act(() => {
      setNativeValue(description, 'Conta a pagar sem data definida');
      setNativeValue(amount, '25000');
      document.querySelector<HTMLElement>('[role="switch"]')!.click();
    });

    const save = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === tf.saveLabel);

    await act(async () => {
      save!.click();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      is_paid: false,
      due_date: null,
    }));
  });

  it('não manda vencimento quando o lançamento já está pago', async () => {
    localStorage.setItem('fin_last_account_id', 'acc-banco');
    const onSubmit = vi.fn().mockResolvedValue({ ids: ['txn-1'] });
    mount('saida', false, onSubmit);

    const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const proto = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const description = document.querySelector(`textarea[placeholder="${tf.descriptionPlaceholder}"]`) as HTMLTextAreaElement;
    const amount = document.querySelector(`input[placeholder="${tf.amountPlaceholder}"]`) as HTMLInputElement;

    act(() => {
      setNativeValue(description, 'Despesa já quitada');
      setNativeValue(amount, '5000');
    });

    const save = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === tf.saveLabel);

    await act(async () => {
      save!.click();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ is_paid: true }));
    expect(onSubmit.mock.calls[0][0].due_date).toBeUndefined();
  });

  it('envia o vencimento escolhido no payload da conta ainda não recebida', async () => {
    localStorage.setItem('fin_last_account_id', 'acc-banco');
    const onSubmit = vi.fn().mockResolvedValue({ ids: ['txn-1'] });
    mount('entrada', true, onSubmit);

    const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const proto = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const description = document.querySelector(`textarea[placeholder="${tf.descriptionPlaceholder}"]`) as HTMLTextAreaElement;
    const amount = document.querySelector(`input[placeholder="${tf.amountPlaceholder}"]`) as HTMLInputElement;
    expect(description).toBeTruthy();
    expect(amount).toBeTruthy();

    act(() => {
      setNativeValue(description, 'Venda fechada no CRM');
      setNativeValue(amount, '10000');
      document.querySelector<HTMLElement>('[role="switch"]')!.click();
    });

    const save = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === tf.saveLabel);
    expect(save).toBeTruthy();

    await act(async () => {
      save!.click();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      is_paid: false,
      due_date: todayInTz('America/Sao_Paulo'),
    }));
  });
});

describe('TransactionFormDialog — cobranças das parcelas', () => {
  it('cria uma cobrança vinculada para cada conta a receber salva', async () => {
    canManagePayments = true;
    hasChargeModule = true;
    paymentAccountActive = true;

    const onSubmit = vi.fn().mockResolvedValue({
      ids: ['receivable-1', 'receivable-2', 'receivable-3', 'receivable-4'],
    });
    mount('entrada', false, onSubmit, undefined, {
      transaction_type: 'entrada',
      description: 'HIT SKY CLUB',
      amount: 1000,
      transaction_date: '2026-10-23',
      due_date: '2026-11-02',
      is_paid: false,
      payment_method: 'boleto',
      installment_count: 4,
      account_id: 'acc-banco',
      customer_id: 'customer-kgie',
    });

    const generateSwitch = document.querySelector(
      `[role="switch"][aria-label="${tf.onlineCharges.label}"]`,
    ) as HTMLElement | null;
    expect(generateSwitch).toBeTruthy();

    act(() => generateSwitch!.click());

    await act(async () => {
      buttonByText(tf.saveLabel)!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1000,
      installment_count: 4,
      is_paid: false,
      customer_id: 'customer-kgie',
    }));
    expect(createOnlineChargeMock).toHaveBeenCalledTimes(4);
    expect(createOnlineChargeMock.mock.calls.map(([request]) => ({
      source_id: request.source_id,
      value: request.value,
      due_date: request.due_date,
      billing_type: request.billing_type,
    }))).toEqual([
      { source_id: 'receivable-1', value: 250, due_date: '2026-11-02', billing_type: 'BOLETO' },
      { source_id: 'receivable-2', value: 250, due_date: '2026-12-02', billing_type: 'BOLETO' },
      { source_id: 'receivable-3', value: 250, due_date: '2027-01-02', billing_type: 'BOLETO' },
      { source_id: 'receivable-4', value: 250, due_date: '2027-02-02', billing_type: 'BOLETO' },
    ]);
  });
});
