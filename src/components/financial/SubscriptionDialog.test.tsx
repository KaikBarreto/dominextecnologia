// Testes de COMPORTAMENTO do modal "Nova assinatura".
//
// Driver mínimo com createRoot + act, mesmo padrão de ChargeDialog.test.tsx (o
// repo não usa @testing-library/react). O Dialog do Radix renderiza via Portal
// em document.body, então as buscas são feitas lá e não no container local.
//
// Cobrem as três armadilhas da leva:
// 1) categoria e centro de custo existem em TODA forma de pagamento (inclusive
//    Pix e Pix Automático) e o que foi digitado CHEGA no envio — antes os
//    campos sumiam no Pix Automático e o valor era descartado em silêncio;
// 2) número de ciclos acima do teto é recusado no cliente, com mensagem em
//    PT-BR e sem chamar a edge (o espelho no servidor está travado por
//    src/lib/subscriptionSummary.test.ts, que lê o arquivo da edge);
// 3) o resumo é POR COBRANÇA e diz isso na tela, com o total só quando a
//    assinatura tem fim.
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

const { createMutateAsync, authorizePixAutoMutateAsync } = vi.hoisted(() => ({
  createMutateAsync: vi.fn(),
  authorizePixAutoMutateAsync: vi.fn(),
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    isLoading: false,
    setUserLanguage: async () => {},
  }),
}));

const CUSTOMER = { id: 'cust-1', name: 'Cliente Um', document: '11144477735', email: '', phone: '', celular: '' };

vi.mock('@/hooks/useCustomers', () => ({
  useCustomers: () => ({ customers: [CUSTOMER] }),
}));

vi.mock('@/hooks/useCostCenters', () => ({
  useCostCenters: () => ({
    activeCostCenters: [{ id: 'cc-1', name: 'Manutenção' }],
    costCenters: [{ id: 'cc-1', name: 'Manutenção' }],
  }),
}));

vi.mock('@/hooks/useTenantSubscriptions', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useTenantSubscriptions')>(
    '@/hooks/useTenantSubscriptions',
  );
  return {
    ...actual,
    useTenantSubscriptions: () => ({
      createSubscription: { mutateAsync: createMutateAsync, isPending: false },
      authorizePixAuto: { mutateAsync: authorizePixAutoMutateAsync, isPending: false },
    }),
  };
});

vi.mock('@/hooks/useTenantPaymentAccount', () => ({
  useTenantPaymentAccount: () => ({
    allowPix: true,
    allowBoleto: true,
    allowCard: true,
    defaultFinePercent: 2,
    defaultInterestPercent: 1,
    // Features dormentes LIGADAS aqui de propósito: o bug do CEO aparece justo
    // na forma "Pix Automático", que só existe no select com este flag.
    cardRecurringEnabled: false,
    pixAutoEnabled: true,
  }),
}));

vi.mock('@/hooks/useTenantCardFees', async () => {
  const real = await vi.importActual<typeof import('@/lib/asaasFeeSimulator')>('@/lib/asaasFeeSimulator');
  return {
    useTenantFees: () => ({
      card: real.REFERENCE_CARD_FEES,
      pix: real.REFERENCE_PIX_FEE,
      bankSlip: real.REFERENCE_BANK_SLIP_FEE,
      anticipation: real.REFERENCE_ANTICIPATION,
      settlementDays: { pix: 0, bankSlip: 1, card: 30 },
      source: 'account',
      extrasSource: 'account',
      feePayerDefault: 'company',
      isLoading: false,
    }),
  };
});

vi.mock('@/components/customers/CustomerSelectField', () => ({
  CustomerSelectField: (props: any) => (
    <select
      data-testid="customer-select"
      value={props.value}
      onChange={(e: any) => props.onValueChange(e.target.value)}
    >
      <option value="">{props.placeholder}</option>
      {props.customers.map((c: any) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  ),
}));

vi.mock('@/components/financial/CategorySelectField', () => ({
  CategorySelectField: (props: any) => (
    <input data-testid="category-select" value={props.value} onChange={(e: any) => props.onValueChange(e.target.value)} />
  ),
}));

vi.mock('@/components/financial/CostCenterSelect', () => ({
  CostCenterSelect: (props: any) => (
    <input
      data-testid="cost-center-select"
      value={props.value ?? ''}
      onChange={(e: any) => props.onValueChange(e.target.value || null)}
    />
  ),
}));

// O Select do Radix não é dirigível em jsdom (abre em portal, depende de
// pointer events). Trocamos por um <select> nativo equivalente: o que os
// testes precisam é TROCAR A FORMA DE PAGAMENTO, não exercitar o Radix.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select
      data-testid="native-select"
      value={value}
      onChange={(e: any) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

import { SubscriptionDialog } from './SubscriptionDialog';
import { MAX_REPETITION_COUNT } from '@/lib/finance-installments';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<SubscriptionDialog open onOpenChange={() => {}} />);
  });
}

// `formatMoney` em pt-BR separa "R$" do número com espaço NÃO-quebrável
// (U+00A0). Normalizamos pra o teste poder escrever "R$ 50,00" como gente.
const text = () => (document.body.textContent || '').replace(/\u00a0/g, ' ');
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const click = (el: Element | null | undefined) => {
  act(() => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
function buttonByText(label: string) {
  return Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
}
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function selectValue(select: HTMLSelectElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
/** O select cujas opções contêm o rótulo dado (frequência x forma de pagamento). */
function selectWithOption(optionLabel: string) {
  return Array.from(document.querySelectorAll('select[data-testid="native-select"]')).find((s) =>
    Array.from(s.querySelectorAll('option')).some((o) => o.textContent?.trim() === optionLabel),
  ) as HTMLSelectElement | undefined;
}
function setBillingType(value: string) {
  const select = selectWithOption('Pix Automático');
  selectValue(select as HTMLSelectElement, value);
}
/** Preenche o mínimo pra assinatura ser válida (cliente + valor). */
function fillMinimum() {
  selectValue(q('[data-testid="customer-select"]') as HTMLSelectElement, CUSTOMER.id);
  setInputValue(q('#sub-amount') as HTMLInputElement, '30000'); // R$ 300,00
}
function expandNetSummary() {
  const header = Array.from(document.querySelectorAll('button')).find(
    (b) => b.hasAttribute('aria-expanded') && b.textContent?.includes('Resumo por cobrança'),
  );
  click(header);
}

beforeEach(() => {
  vi.clearAllMocks();
  createMutateAsync.mockResolvedValue(undefined);
  authorizePixAutoMutateAsync.mockResolvedValue({
    id: 'aut_1',
    qr_code: 'abc',
    copy_paste: '000201',
    status: 'PENDING',
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

describe('SubscriptionDialog — categoria e centro de custo em toda forma de pagamento', () => {
  it.each([
    ['UNDEFINED', 'Cliente escolhe'],
    ['PIX', 'Pix'],
    ['BOLETO', 'Boleto'],
    ['PIX_AUTO', 'Pix Automático'],
  ])('a forma %s mantém os campos de categoria e centro de custo na tela', (value) => {
    mount();
    setBillingType(value);
    expect(q('[data-testid="category-select"]'), `categoria sumiu em ${value}`).toBeTruthy();
    expect(q('[data-testid="cost-center-select"]'), `centro de custo sumiu em ${value}`).toBeTruthy();
    expect(text()).toContain('Categoria');
  });

  it('Pix Automático ENVIA a categoria e o centro de custo digitados (antes eram descartados em silêncio)', async () => {
    mount();
    fillMinimum();
    // O usuário preenche o destino contábil ANTES de escolher o Pix Automático:
    // é exatamente a ordem em que o dado se perdia.
    setInputValue(q('[data-testid="category-select"]') as HTMLInputElement, 'Contratos');
    setInputValue(q('[data-testid="cost-center-select"]') as HTMLInputElement, 'cc-1');
    setBillingType('PIX_AUTO');

    // Os campos continuam na tela com o que foi digitado.
    expect((q('[data-testid="category-select"]') as HTMLInputElement).value).toBe('Contratos');

    await act(async () => {
      click(buttonByText('Criar assinatura'));
    });

    expect(authorizePixAutoMutateAsync).toHaveBeenCalledTimes(1);
    const payload = authorizePixAutoMutateAsync.mock.calls[0][0];
    expect(payload.category).toBe('Contratos');
    expect(payload.cost_center_id).toBe('cc-1');
  });

  it('Pix comum envia categoria e centro de custo no create', async () => {
    mount();
    fillMinimum();
    setBillingType('PIX');
    setInputValue(q('[data-testid="category-select"]') as HTMLInputElement, 'Mensalidade');
    setInputValue(q('[data-testid="cost-center-select"]') as HTMLInputElement, 'cc-1');

    await act(async () => {
      click(buttonByText('Criar assinatura'));
    });

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    const payload = createMutateAsync.mock.calls[0][0];
    expect(payload.category).toBe('Mensalidade');
    expect(payload.cost_center_id).toBe('cc-1');
  });
});

describe('SubscriptionDialog — teto de ciclos', () => {
  function switchToLimitedDuration() {
    // LabeledSwitch: o botão com o rótulo "Número de ciclos".
    click(buttonByText('Número de ciclos'));
  }

  it(`aceita ${MAX_REPETITION_COUNT} ciclos e envia max_payments`, async () => {
    mount();
    fillMinimum();
    switchToLimitedDuration();
    setInputValue(q('#sub-max-cycles') as HTMLInputElement, String(MAX_REPETITION_COUNT));

    await act(async () => {
      click(buttonByText('Criar assinatura'));
    });

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(createMutateAsync.mock.calls[0][0].max_payments).toBe(MAX_REPETITION_COUNT);
  });

  it('recusa acima do teto: mensagem em PT-BR, botão travado e nenhuma chamada à edge', async () => {
    mount();
    fillMinimum();
    switchToLimitedDuration();
    setInputValue(q('#sub-max-cycles') as HTMLInputElement, String(MAX_REPETITION_COUNT + 1));

    expect(text()).toContain(`O máximo é ${MAX_REPETITION_COUNT} cobranças`);
    const submit = buttonByText('Criar assinatura') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await act(async () => {
      click(submit);
    });
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it('duração limitada sem número não vira assinatura contínua por acidente', async () => {
    mount();
    fillMinimum();
    switchToLimitedDuration();
    // Campo vazio: a assinatura NÃO pode sair sem max_payments (seria contínua).
    const submit = buttonByText('Criar assinatura') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await act(async () => {
      click(submit);
    });
    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});

describe('SubscriptionDialog — resumo por cobrança', () => {
  it('mostra o líquido de UMA cobrança e diz que não é o total da assinatura', () => {
    mount();
    fillMinimum();
    setBillingType('PIX');
    expect(text()).toContain('Resumo por cobrança');

    expandNetSummary();
    // Pix de referência: R$ 300,00 menos a taxa fixa do Pix.
    expect(text()).toContain('Você recebe');
    expect(text()).toContain('Valores de UMA cobrança');
    expect(text()).toContain('Mensal');
    // Sem duração limitada não existe total fechado, e a tela diz isso.
    expect(text()).toContain('não tem fim definido');
  });

  it('com duração limitada, o total é o líquido por cobrança vezes os ciclos', () => {
    mount();
    fillMinimum();
    setBillingType('PIX');
    click(buttonByText('Número de ciclos'));
    setInputValue(q('#sub-max-cycles') as HTMLInputElement, '12');
    expandNetSummary();

    // O número por cobrança continua sendo o destaque; o total vem escrito
    // como total, com a quantidade de cobranças junto.
    expect(text()).toContain('Nas 12 cobranças');
    expect(text()).not.toContain('não tem fim definido');
  });

  it('o resumo do atraso usa a multa em R$ quando a unidade é reais', () => {
    mount();
    fillMinimum();
    setBillingType('PIX');
    click(buttonByText('Opções avançadas'));
    // Seletor de unidade da multa (radiogroup do SegmentedControl).
    const reais = Array.from(document.querySelectorAll('button[role="radio"]')).find(
      (b) => b.textContent?.trim() === 'R$',
    );
    click(reais);
    setInputValue(q('#sub-fine') as HTMLInputElement, '5000'); // R$ 50,00
    expandNetSummary();

    expect(text()).toContain('Multa de R$ 50,00');
  });

  it('a multa em R$ viaja em campo próprio, nunca dentro de fine_percent', async () => {
    mount();
    fillMinimum();
    setBillingType('PIX');
    click(buttonByText('Opções avançadas'));
    const reais = Array.from(document.querySelectorAll('button[role="radio"]')).find(
      (b) => b.textContent?.trim() === 'R$',
    );
    click(reais);
    setInputValue(q('#sub-fine') as HTMLInputElement, '5000');

    await act(async () => {
      click(buttonByText('Criar assinatura'));
    });

    const payload = createMutateAsync.mock.calls[0][0];
    expect(payload.fine_type).toBe('FIXED');
    expect(payload.fine_value).toBe(50);
    // Crítico: uma edge antiga leria fine_percent=50 como 50% ao mês.
    expect(payload.fine_percent).toBeUndefined();
  });
});
