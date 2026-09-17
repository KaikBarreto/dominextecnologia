// Testes de COMPORTAMENTO da reorganização do modal "Nova cobrança" em abas
// (1141 linhas em rolagem única → Cobrança/Pagamento/Encargos/Financeiro).
// Driver mínimo com createRoot + act, mesmo padrão de PermissionsEditor.test.tsx
// (o repo não usa @testing-library/react nos testes existentes). O Dialog do
// Radix renderiza via Portal em document.body, então as buscas são feitas ali
// e não no container local.
//
// Cobrem exatamente as armadilhas de formulário-com-abas do briefing:
// 1) erro de validação numa aba escondida leva o usuário até ela e destaca o
//    campo (em vez de travar num erro invisível);
// 2) o resumo do recebimento nunca some ao trocar de aba (fica fora delas,
//    fixo no rodapé do modal);
// 3) com só 1 meio de pagamento habilitado, a aba Pagamento não fica vazia.
//
// Nenhuma regra de cobrança/cálculo é tocada aqui — só a reorganização visual.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// jsdom (v20, sem ResizeObserver nativo) — MobilePillTabs usa ResizeObserver
// pra recalcular o fade das pills roláveis.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

const { toastSpy, createMutateAsync, updateCustomerMutateAsync } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  createMutateAsync: vi.fn(),
  updateCustomerMutateAsync: vi.fn(),
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

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

const CUSTOMER_OK = { id: 'cust-ok', name: 'Cliente Ok', document: '11144477735', email: '', phone: '', celular: '' };
const CUSTOMER_NODOC = { id: 'cust-nodoc', name: 'Cliente Sem Doc', document: '', email: '', phone: '', celular: '' };

vi.mock('@/hooks/useCustomers', () => ({
  useCustomers: () => ({
    customers: [CUSTOMER_OK, CUSTOMER_NODOC],
    updateCustomer: { mutateAsync: updateCustomerMutateAsync, isPending: false },
  }),
}));

vi.mock('@/hooks/useTenantCharges', () => ({
  useTenantCharges: () => ({ create: { mutateAsync: createMutateAsync, isPending: false } }),
  buildCheckoutUrl: (code: string) => `https://dominex.app/pagar/${code}`,
}));

// Mutável entre testes: simula os flags allow_* da conta (única fonte de
// verdade dos meios de pagamento habilitados no modal).
const accountState = vi.hoisted(() => ({
  allowPix: true,
  allowBoleto: true,
  allowCard: true,
}));

vi.mock('@/hooks/useTenantPaymentAccount', () => ({
  useTenantPaymentAccount: () => ({
    allowPix: accountState.allowPix,
    allowBoleto: accountState.allowBoleto,
    allowCard: accountState.allowCard,
    defaultFinePercent: 2,
    defaultInterestPercent: 1,
    defaultDiscountPercent: null,
    defaultDiscountDays: null,
    defaultDescription: null,
    defaultMaxInstallments: 12,
    autoPostToFinance: true,
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

vi.mock('@/hooks/useBrandedQrConfig', () => ({
  useBrandedQrConfig: () => ({ logoUrl: null, dotStyle: 'square', cornerStyle: 'square', color: '#000000' }),
}));

// Stand-ins leves pros componentes pesados (combobox de cliente, seletor de
// categoria, dialog completo de cliente, QR) — o que importa aqui é a
// reorganização em abas do ChargeDialog, não o funcionamento interno deles.
vi.mock('@/components/customers/CustomerSelectField', () => ({
  CustomerSelectField: (props: any) => (
    <select
      data-testid="customer-select"
      className={props.className}
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

vi.mock('@/components/customers/CustomerFormDialog', () => ({
  CustomerFormDialog: () => null,
}));

vi.mock('@/components/financial/CategorySelectField', () => ({
  CategorySelectField: (props: any) => (
    <input data-testid="category-select" value={props.value} onChange={(e: any) => props.onValueChange(e.target.value)} />
  ),
}));

vi.mock('@/components/BrandedQRCode', () => ({
  BrandedQRCode: () => null,
}));

import { ChargeDialog } from './ChargeDialog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<ChargeDialog open onOpenChange={() => {}} />);
  });
}

// O Dialog do Radix (desktop, jsdom fica >=1024px = não-compacto) renderiza
// via Portal direto em document.body — as buscas são globais, não no container.
const text = () => document.body.textContent || '';
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const click = (el: Element | null | undefined) => {
  act(() => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
function pillByLabel(label: string) {
  return Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
}
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
function paste(input: HTMLInputElement, text: string) {
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent & { clipboardData: any };
  pasteEvent.clipboardData = { getData: () => text };
  act(() => {
    input.dispatchEvent(pasteEvent);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  accountState.allowPix = true;
  accountState.allowBoleto = true;
  accountState.allowCard = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('ChargeDialog — reorganização em abas', () => {
  it('abre com as 4 abas e começa em Cobrança', () => {
    mount();
    expect(pillByLabel('Cobrança')).toBeTruthy();
    expect(pillByLabel('Pagamento')).toBeTruthy();
    expect(pillByLabel('Encargos')).toBeTruthy();
    expect(pillByLabel('Financeiro')).toBeTruthy();
    // Campos da aba Cobrança visíveis de cara.
    expect(q('[data-testid="customer-select"]')).toBeTruthy();
    expect(q('#charge-amount')).toBeTruthy();
    expect(q('#charge-due')).toBeTruthy();
    // Campo só existente na aba Pagamento ainda não está na tela.
    expect(text()).not.toContain('Forma de pagamento');
  });

  it('trocar para a aba Pagamento mostra a forma de pagamento e esconde os campos de Cobrança', () => {
    mount();
    click(pillByLabel('Pagamento'));
    expect(text()).toContain('Forma de pagamento');
    expect(q('[data-testid="customer-select"]')).toBeNull();
    expect(q('#charge-amount')).toBeNull();
  });

  it('o resumo do recebimento nunca some ao trocar de aba (fica fora delas, fixo no rodapé)', () => {
    mount();
    const amountInput = q('#charge-amount') as HTMLInputElement;
    setInputValue(amountInput, '15000');
    // Método padrão é "cliente escolhe" (3 meios habilitados) — mostra o
    // resumo compacto de "cliente escolhe a forma".
    expect(text()).toContain('Resumo do recebimento');
    expect(text()).toContain('Cliente escolhe a forma');

    click(pillByLabel('Encargos'));
    // Ainda visível na aba Encargos — o resumo não é conteúdo de aba.
    expect(text()).toContain('Resumo do recebimento');
    expect(text()).toContain('Cliente escolhe a forma');
    expect(text()).toContain('Multa (%)');

    click(pillByLabel('Financeiro'));
    expect(text()).toContain('Resumo do recebimento');
  });

  it('com só Pix habilitado, a aba Pagamento não fica vazia (mostra o aviso de meio único)', () => {
    accountState.allowBoleto = false;
    accountState.allowCard = false;
    mount();
    click(pillByLabel('Pagamento'));
    expect(text()).toContain('Único meio de pagamento habilitado nesta conta');
    // Sem cartão, parcelas e "quem paga a taxa" não fazem sentido e não aparecem.
    expect(text()).not.toContain('Parcelas');
    expect(text()).not.toContain('Quem paga a taxa do cartão?');
  });

  it('salvar sem vencimento leva de volta pra aba Cobrança, destaca o campo e avisa por toast', () => {
    // Nota: customerId/amount/documentBlocked vazios já desabilitam o botão
    // "Gerar cobrança" (disabled cobre os 3), então essas 3 checagens do
    // handleSubmit são inalcançáveis por um clique real (já era assim antes
    // desta reorganização). O vencimento é o único campo obrigatório que NÃO
    // entra no `disabled` do botão — por isso é o caminho realista pra provar
    // que o erro leva o usuário até a aba certa.
    mount();
    const select = q('[data-testid="customer-select"]') as HTMLSelectElement;
    selectValue(select, CUSTOMER_OK.id);
    const amountInput = q('#charge-amount') as HTMLInputElement;
    setInputValue(amountInput, '10000');
    const dueDateInput = q('#charge-due') as HTMLInputElement;
    setInputValue(dueDateInput, '');

    // Usuário estava em outra aba quando tentou salvar.
    click(pillByLabel('Pagamento'));
    expect(text()).toContain('Forma de pagamento');

    click(buttonByText('Gerar cobrança'));

    // Voltou pra Cobrança — o erro nunca fica preso numa aba escondida.
    expect(text()).not.toContain('Forma de pagamento');
    const dueDateAfter = q('#charge-due') as HTMLInputElement;
    expect(dueDateAfter).toBeTruthy();
    expect(dueDateAfter.className).toContain('border-destructive');
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Informe o vencimento.' }),
    );
    expect(createMutateAsync).not.toHaveBeenCalled();

    // Corrigir o campo apaga o destaque sozinho (sem precisar reenviar).
    setInputValue(dueDateAfter, '2030-01-01');
    expect(dueDateAfter.className).not.toContain('border-destructive');
  });

  it('não muda nenhuma regra de cobrança: o payload de criação continua igual', async () => {
    mount();
    const select = q('[data-testid="customer-select"]') as HTMLSelectElement;
    selectValue(select, CUSTOMER_OK.id);
    const amountInput = q('#charge-amount') as HTMLInputElement;
    setInputValue(amountInput, '10000');

    createMutateAsync.mockResolvedValue({
      orphan: false,
      charge: { financeWarning: null, public_short_code: 'abc123', value: 100 },
    });

    await act(async () => {
      buttonByText('Gerar cobrança')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    const payload = createMutateAsync.mock.calls[0][0];
    expect(payload.customer_id).toBe(CUSTOMER_OK.id);
    expect(payload.value).toBe(100);
    expect(payload.post_to_finance).toBe(true);
  });

  it('colar "R$ 4.550" no campo de valor dá R$ 4.550,00, não R$ 45,50 (defeito residual da máscara de centavos no paste)', () => {
    mount();
    const amountInput = q('#charge-amount') as HTMLInputElement;
    paste(amountInput, 'R$ 4.550');
    expect(amountInput.value).toBe('4.550,00');
  });
});
