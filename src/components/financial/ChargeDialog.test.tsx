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

// Zero centros de custo cadastrados: o campo (gated por `activeCostCenters.length
// > 0`, mesma régua do resto do domínio) nunca renderiza nestes testes, então
// `CostCenterSelect` nunca é instanciado — só o hook precisa de stub aqui pra
// não exigir um QueryClientProvider real (o componente não mocka react-query).
vi.mock('@/hooks/useCostCenters', () => ({
  useCostCenters: () => ({ activeCostCenters: [], costCenters: [] }),
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
/** O resumo do rodapé começa fechado: só a linha do líquido fica visível. */
function expandNetSummary() {
  const header = Array.from(document.querySelectorAll('button')).find(
    (b) => b.hasAttribute('aria-expanded') && b.textContent?.includes('Resumo do recebimento'),
  );
  click(header);
}
/** Botão do seletor de unidade da multa (% ou R$), que é um radiogroup. */
function fineUnitButton(label: string) {
  return Array.from(document.querySelectorAll('button[role="radio"]')).find(
    (b) => b.textContent?.trim() === label,
  );
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

    // Usuário estava em outra aba quando tentou salvar. Fora da última aba a
    // ação principal é "Avançar"; quem quer gerar sem passar pelas outras usa
    // o atalho "Gerar agora", e é ele que exercita o handleSubmit daqui.
    click(pillByLabel('Pagamento'));
    expect(text()).toContain('Forma de pagamento');

    click(buttonByText('Gerar agora'));

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
      // Aba Cobrança (a primeira): o botão que gera é o atalho "Gerar agora".
      buttonByText('Gerar agora')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    const payload = createMutateAsync.mock.calls[0][0];
    expect(payload.customer_id).toBe(CUSTOMER_OK.id);
    expect(payload.value).toBe(100);
    expect(payload.post_to_finance).toBe(true);
    // Multa em % (padrão, vindo da conta) manda EXATAMENTE o payload histórico:
    // `fine_percent` sozinho, sem `fine_type` nem `fine_value`. É o que garante
    // que a edge antiga continua entendendo o front novo.
    expect(payload.fine_percent).toBe(2);
    expect(payload.fine_type).toBeUndefined();
    expect(payload.fine_value).toBeUndefined();
  });

  /**
   * O modal tem 4 abas e o botão "Gerar cobrança" aparecia já na primeira: o
   * usuário gerava sem nunca descobrir que Pagamento, Encargos e Financeiro
   * existiam. Fora da última aba a ação principal passa a ser "Avançar", com
   * "Gerar agora" como atalho pra quem não quer configurar o resto.
   */
  it('fora da última aba a ação principal é Avançar, e ela caminha pelas abas', () => {
    mount();
    // Aba 1 (Cobrança): avançar, não gerar.
    expect(buttonByText('Avançar')).toBeTruthy();
    expect(buttonByText('Gerar cobrança')).toBeFalsy();
    // O atalho de gerar continua disponível pra quem não quer as outras abas.
    expect(buttonByText('Gerar agora')).toBeTruthy();

    click(buttonByText('Avançar'));
    expect(text()).toContain('Forma de pagamento');

    click(buttonByText('Avançar'));
    click(buttonByText('Avançar'));

    // Última aba: a ação principal vira gerar, e o atalho some (seria duplicado).
    expect(buttonByText('Gerar cobrança')).toBeTruthy();
    expect(buttonByText('Avançar')).toBeFalsy();
    expect(buttonByText('Gerar agora')).toBeFalsy();
  });

  it('colar "R$ 4.550" no campo de valor dá R$ 4.550,00, não R$ 45,50 (defeito residual da máscara de centavos no paste)', () => {
    mount();
    const amountInput = q('#charge-amount') as HTMLInputElement;
    paste(amountInput, 'R$ 4.550');
    expect(amountInput.value).toBe('4.550,00');
  });
});

/**
 * Multa fixa em R$ (pedido do CEO: "poderia ser possível botar uma multa fixa
 * em R$ ao invés de % sempre"). A Asaas aceita `fine.type = FIXED`, e a escolha
 * vale POR COBRANÇA — o padrão da conta continua sendo percentual.
 */
describe('ChargeDialog — multa em R$ ou em %', () => {
  it('começa em % (padrão da conta) e o seletor troca o campo para máscara de dinheiro', () => {
    mount();
    click(pillByLabel('Encargos'));
    // Modo % : rótulo e valor decimal livre, herdado da conta (2).
    expect(text()).toContain('Multa (%)');
    expect((q('#adv-fine') as HTMLInputElement).value).toBe('2');

    click(fineUnitButton('R$'));
    expect(text()).toContain('Multa (R$)');
    // Campo de dinheiro começa vazio (não herda o "2" do percentual, que em
    // reais seria R$ 2,00 e ninguém pediu isso).
    const fineInput = q('#adv-fine') as HTMLInputElement;
    expect(fineInput.value).toBe('');
    setInputValue(fineInput, '5000');
    expect((q('#adv-fine') as HTMLInputElement).value).toBe('50,00');

    // Voltar pro % devolve o percentual intacto: alternar não estraga o que
    // já estava digitado de cada lado.
    click(fineUnitButton('%'));
    expect((q('#adv-fine') as HTMLInputElement).value).toBe('2');
  });

  it('multa em R$ vai no payload como fine_type FIXED + fine_value, e NUNCA como fine_percent', async () => {
    mount();
    selectValue(q('[data-testid="customer-select"]') as HTMLSelectElement, CUSTOMER_OK.id);
    setInputValue(q('#charge-amount') as HTMLInputElement, '100000'); // R$ 1.000,00

    click(pillByLabel('Encargos'));
    click(fineUnitButton('R$'));
    setInputValue(q('#adv-fine') as HTMLInputElement, '5000'); // R$ 50,00

    createMutateAsync.mockResolvedValue({
      orphan: false,
      charge: { financeWarning: null, public_short_code: 'abc123', value: 1000 },
    });

    await act(async () => {
      buttonByText('Gerar agora')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const payload = createMutateAsync.mock.calls[0][0];
    expect(payload.fine_type).toBe('FIXED');
    expect(payload.fine_value).toBe(50);
    // Crítico: mandar 50 em `fine_percent` faria uma edge antiga (ou um
    // fallback de tipo) cobrar 50% de multa em vez de R$ 50,00.
    expect(payload.fine_percent).toBeUndefined();
  });
});

/**
 * "Quanto o cliente paga" — o outro lado do resumo do rodapé (que só mostrava
 * o que SOBRA pra empresa). Pedido do CEO: ver quanto o cliente paga adiantado
 * com desconto e atrasado com multa e juros.
 */
describe('ChargeDialog — resumo de quanto o cliente paga', () => {
  it('mostra o cenário de atraso com a premissa de dias escrita junto do valor', () => {
    mount();
    setInputValue(q('#charge-amount') as HTMLInputElement, '100000'); // R$ 1.000,00
    expandNetSummary();

    expect(text()).toContain('Quanto o cliente paga');
    // A premissa NUNCA pode faltar: juros da Asaas são ao mês e crescem por dia.
    expect(text()).toContain('Pagando 30 dias depois do vencimento');
    // Multa 2% (R$ 20) + juros 1% ao mês em 30 dias (R$ 10) = R$ 1.030,00.
    expect(text()).toContain('1.030,00');
    expect(text()).toContain('dias de atraso');
  });

  it('o cenário de atraso acompanha a multa em R$ digitada na aba Encargos', () => {
    mount();
    setInputValue(q('#charge-amount') as HTMLInputElement, '100000');
    click(pillByLabel('Encargos'));
    click(fineUnitButton('R$'));
    setInputValue(q('#adv-fine') as HTMLInputElement, '15000'); // multa de R$ 150,00
    expandNetSummary();

    // 1.000 + 150 de multa + 10 de juros = 1.160,00 (e não 1.000 + 150% ).
    expect(text()).toContain('1.160,00');
  });

  it('sem desconto configurado não existe linha de desconto (nada é inventado)', () => {
    mount();
    setInputValue(q('#charge-amount') as HTMLInputElement, '100000');
    expandNetSummary();
    expect(text()).not.toContain('Pagando até o vencimento');

    // Configurando o desconto, a linha aparece com o valor já abatido.
    click(pillByLabel('Encargos'));
    setInputValue(q('#adv-discount') as HTMLInputElement, '5');
    expect(text()).toContain('Pagando até o vencimento');
    expect(text()).toContain('950,00');
  });
});
