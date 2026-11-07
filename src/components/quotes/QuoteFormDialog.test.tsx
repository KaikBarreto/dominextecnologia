// Prova de DOM real (não só a função pura) de que os campos de dinheiro do
// QuoteFormDialog estão livres do bug de mil vezes: colar "4.550" num
// `<input type="number">` é lido pelo navegador como decimal internacional e
// vira 4,55 — mil vezes menor (bug real do sócio, 2026-09-17). `onPaste`
// intercepta o colar ANTES do navegador decidir sozinho. Campos cobertos:
// preço unitário do item de SERVIÇO já na tabela, preço manual de material
// (linha de adicionar) e desconto em R$ (não em %).
//
// Driver mínimo com createRoot + act (mesmo padrão de ContaFormDialog.test.tsx
// — o repo não usa @testing-library/react). Componentes-filho irrelevantes
// (seletor de serviço/material, seletor de cliente) são mockados como stubs
// simples, mesma prática de ContaFormDialog.test.tsx.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MESSAGES } from '@/lib/i18n/messages';
import type { Quote } from '@/hooks/useQuotes';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

const testState = vi.hoisted(() => ({
  profile: null as { company_id: string } | null,
  userId: null as string | null,
  pricing: null as null | {
    tax_rate: number;
    admin_indirect_rate: number;
    default_profit_rate: number;
    km_cost: number;
    card_discount_rate: number;
    card_installments: number;
  },
  fetchBreakdown: vi.fn(),
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  costsSaving: false,
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

vi.mock('@/hooks/useCompanyModules', () => ({ useCompanyModules: () => ({ hasModule: () => false }) }));
vi.mock('@/hooks/useCustomers', () => ({ useCustomers: () => ({ customers: [] }) }));
vi.mock('@/hooks/useQuotes', () => ({
  useQuotes: () => ({
    createQuote: { mutate: testState.createMutate, mutateAsync: vi.fn(), isPending: false },
    updateQuote: { mutate: testState.updateMutate, mutateAsync: vi.fn(), isPending: false },
    quotes: [],
  }),
}));
vi.mock('@/hooks/useCompanySettings', () => ({
  useCompanySettings: () => ({ settings: null }),
}));
vi.mock('@/hooks/useProposalTemplates', () => ({
  useProposalTemplates: () => ({ templates: [{ id: 'tpl-1', slug: 'clean', name: 'Clean' }] }),
}));
vi.mock('@/hooks/usePricingSettings', () => ({ usePricingSettings: () => ({ settings: testState.pricing }) }));
vi.mock('@/hooks/useServiceTypes', () => ({
  useServiceTypes: () => ({
    serviceTypes: [{ id: 'svc-1', name: 'Manutenção Preventiva', is_active: true, color: '#00C597', default_price: 250, description: '' }],
    createServiceType: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({ items: [{ id: 'inv-1', name: 'Filtro', sale_price: 50, cost_price: 30, sku: null }] }),
}));
vi.mock('@/hooks/useCostResources', () => ({ useCostResources: () => ({ resources: [] }) }));
vi.mock('@/hooks/useSaveQuoteServiceCosts', () => ({
  useSaveQuoteServiceCosts: () => ({ mutateAsync: vi.fn(), isPending: testState.costsSaving }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: testState.profile, user: testState.userId ? { id: testState.userId } : null }),
}));
vi.mock('@/hooks/useServiceCostBreakdown', () => ({
  fetchServiceCostBreakdown: testState.fetchBreakdown,
}));
vi.mock('@/components/customers/CustomerSelectField', () => ({ CustomerSelectField: () => null }));
vi.mock('@/components/quotes/ProposalRenderer', () => ({
  ProposalRenderer: ({ quote }: { quote: Quote }) => <div data-testid="quote-preview-data" data-total={quote.total_value} data-items={quote.quote_items?.length}>Prévia renderizada</div>,
}));

// `StepTransition` usa `AnimatePresence mode="wait"`, que só monta o conteúdo
// do próximo step DEPOIS da animação de saída do anterior terminar — em jsdom
// isso nunca "termina" sozinho dentro de um `act()` síncrono, e o DOM fica
// preso mostrando o step anterior. Mock trivial: sem animação, troca é
// imediata (é só o carimbo de wizard/UX, irrelevante pro campo de dinheiro).
// ATENÇÃO ao Proxy: devolver uma função NOVA a cada acesso (`get: () => (props) =>
// ...`) faz o React enxergar um TIPO DE COMPONENTE diferente a cada render e
// desmontar/remontar a subárvore inteira, zerando o estado local de qualquer
// filho. Isso não acontece no app real (`motion.div` é estável) e mascara
// justamente os bugs de estado que estes testes existem pra pegar. Por isso o
// cache por tag: cada `motion.x` é sempre o MESMO componente.
const motionComponentCache = new Map<string, any>();
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: new Proxy({}, {
    get: (_target, tag: string) => {
      if (!motionComponentCache.has(tag)) {
        motionComponentCache.set(tag, (props: any) => React.createElement('div', props, props.children));
      }
      return motionComponentCache.get(tag);
    },
  }),
  useReducedMotion: () => false,
}));

// Stub simples pro seletor de serviço/material: <select> nativo, cobrindo
// tanto `options` quanto `groups` (o componente real usa os dois formatos).
vi.mock('@/components/ui/SearchableSelect', () => ({
  SearchableSelect: ({ options, groups, value, onValueChange, placeholder }: any) => {
    const flat = options ?? (groups ?? []).flatMap((g: any) => g.options ?? []);
    return (
      <select aria-label={placeholder} value={value} onChange={(e) => onValueChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {flat.map((o: any) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  },
}));

import { QuoteFormDialog, buildMaterialItem, calculateItemPrice, calculateMixedQuotePricing, calculateQuoteCommercialTotal } from './QuoteFormDialog';
import { BDISummaryCard } from './BDISummaryCard';
import { calculateCommercialPaymentOptions } from '@/lib/quote-commercial-total';
import { calculateBDI } from '@/hooks/useBDICalculator';
import { OverlayCoordinatorProvider } from '@/contexts/OverlayCoordinatorContext';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const tq = MESSAGES['pt-br'].app.crm.quotes;

let container: HTMLDivElement;
let root: Root;

function mount(quote?: Quote) {
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <OverlayCoordinatorProvider>
          <QuoteFormDialog open onOpenChange={() => {}} quote={quote} />
        </OverlayCoordinatorProvider>
      </QueryClientProvider>,
    );
  });
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const qAll = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function clickAsync(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function paste(input: HTMLInputElement, text: string) {
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent & { clipboardData: any };
  pasteEvent.clipboardData = { getData: () => text };
  act(() => {
    input.dispatchEvent(pasteEvent);
  });
}

function findButtonByText(text: string) {
  return qAll('button').find((b) => b.textContent?.includes(text));
}

/** Preenche o destinatário sem depender do CustomerSelectField mockado e
 * avança para a etapa de serviços. */
async function goPastRecipient() {
  let nameInput = q('input[placeholder="' + tq.recipientNamePlaceholder + '"]') as HTMLInputElement;
  if (!nameInput) {
    // LabeledSwitch alterna existing/prospect — clicamos no rótulo "prospect".
    const prospectToggle = findButtonByText(tq.recipientProspect) ?? qAll('[role="switch"]')[0];
    if (prospectToggle) click(prospectToggle);
    nameInput = q('input[placeholder="' + tq.recipientNamePlaceholder + '"]') as HTMLInputElement;
  }
  expect(nameInput).toBeTruthy();
  if (!nameInput.value) typeInto(nameInput, 'Cliente Prospect Teste');
  await clickAsync(findButtonByText(tq.next)!);
}

async function addServiceItem() {
  const openPicker = findButtonByText('Adicionar serviço');
  expect(openPicker).toBeTruthy();
  click(openPicker!);
  const serviceSelect = q('select[aria-label="' + tq.serviceSelectPlaceholder + '"]') as HTMLSelectElement;
  expect(serviceSelect).toBeTruthy();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(serviceSelect, 'svc-1');
    serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const confirmAdd = qAll('button').find(button => button.textContent?.trim() === 'Adicionar');
  expect(confirmAdd).toBeTruthy();
  await clickAsync(confirmAdd!);
}

async function advanceToCommercial() {
  await addServiceItem();
  await clickAsync(findButtonByText(tq.next)!); // materiais e deslocamento
  await clickAsync(findButtonByText(tq.next)!); // preço e condições
}

async function advanceToMaterials() {
  await clickAsync(findButtonByText(tq.next)!);
}

beforeEach(() => {
  sessionStorage.clear();
  testState.profile = null;
  testState.userId = null;
  testState.pricing = null;
  testState.fetchBreakdown.mockReset();
  testState.createMutate.mockReset();
  testState.updateMutate.mockReset();
  testState.costsSaving = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('QuoteFormDialog — preço unitário do serviço na tabela (prova real de DOM)', () => {
  it('importa a mesma decomposição do Resumo: 25,60 + 84,85 = 110,45', async () => {
    testState.profile = { company_id: 'company-1' };
    testState.fetchBreakdown.mockResolvedValue({
      hourlyRate: 0,
      hours: 2,
      laborCost: 0,
      materialsCost: 25.6,
      extrasCost: 0,
      resourcesCost: 84.85,
      giftsCost: 0,
      linkedResourcesCost: 84.85,
      quoteExtrasCost: 84.85,
      totalCost: 110.45,
    });
    mount();
    await goPastRecipient();

    await addServiceItem();

    expect(testState.fetchBreakdown).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('110,45');

    const serviceRowButton = qAll('button').find((button) =>
      button.textContent?.includes('Manutenção Preventiva')
      && !button.textContent?.includes(tq.serviceAddButton));
    expect(serviceRowButton).toBeTruthy();
    click(serviceRowButton!);
    expect(document.body.textContent).toContain('Recursos');
    expect(document.body.textContent).toContain('84,85');
  });

  it('colar "4.550" dá 4550 (não 4.55, o bug do sócio)', async () => {
    mount();
    await goPastRecipient(); // agora em "services"

    await addServiceItem();
    click(q('button[aria-label="Abrir serviço Manutenção Preventiva"]')!);

    // Depois de adicionado, a tabela mostra o preço unitário editável. A
    // linha da tabela (`ServiceItemsList`) mapeia sem key estável no
    // Fragment externo — React troca o nó de DOM ao re-renderizar, então
    // reconsultamos o input DEPOIS do paste em vez de reusar a referência
    // capturada antes (senão o teste leria um nó órfão que nunca mudou).
    const findPriceInput = () =>
      (qAll('input[type="number"]') as HTMLInputElement[]).find((i) => i.className.includes('text-right'));
    const priceInput = findPriceInput();
    expect(priceInput).toBeTruthy();
    paste(priceInput!, '4.550');
    const priceInputAfterPaste = findPriceInput();
    expect(priceInputAfterPaste).toBeTruthy();
    expect(priceInputAfterPaste!.value).toBe('4550');
  });
});

describe('QuoteFormDialog — preço manual de material no MaterialBatchPicker (prova real de DOM)', () => {
  it('colar "4.550" dá 4550 (não 4.55, o bug do sócio)', async () => {
    mount();
    await goPastRecipient();
    await advanceToMaterials();

    // Um caminho só (desktop e celular): abre o picker em lote.
    const openPickerBtn = findButtonByText(tq.materialPickerOpen);
    expect(openPickerBtn).toBeTruthy();
    await clickAsync(openPickerBtn!);

    const searchInput = q('input[placeholder="' + tq.materialPickerSearch + '"]') as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    typeInto(searchInput, 'Material Avulso');

    // Sem correspondência exata no catálogo mockado ("Filtro") → nasce a linha
    // "Criar ... como material avulso" com o campo de preço unitário.
    const priceInput = q(`input[aria-label="${tq.materialPickerManualPrice} de Material Avulso"]`) as HTMLInputElement;
    expect(priceInput).toBeTruthy();
    paste(priceInput, '4.550');
    const priceInputAfter = q(`input[aria-label="${tq.materialPickerManualPrice} de Material Avulso"]`) as HTMLInputElement;
    expect(priceInputAfter.value).toBe('4550');
  });
});

describe('QuoteFormDialog — quantidade decimal do MaterialBatchPicker até o item (prova real de DOM)', () => {
  it('"2,5" sobrevive do picker até a tabela de itens adicionados', async () => {
    mount();
    await goPastRecipient();
    await advanceToMaterials();

    await clickAsync(findButtonByText(tq.materialPickerOpen)!);

    // "Filtro" é o único material do catálogo mockado — aparece direto (busca
    // vazia). O stepper de quantidade é o NumericInput com placeholder "0".
    const qtyInput = qAll('input').find((i) => (i as HTMLInputElement).placeholder === '0') as HTMLInputElement;
    expect(qtyInput).toBeTruthy();
    typeInto(qtyInput, '2,5');

    const confirmBtn = findButtonByText(tq.materialPickerConfirm);
    expect(confirmBtn).toBeTruthy();
    await clickAsync(confirmBtn!);

    // Picker fechou e adicionou o item — a tabela/lista de materiais mostra a
    // quantidade fracionada (não trunca pra inteiro).
    const qtyCellAfter = qAll('input').find((i) => (i as HTMLInputElement).value === '2,5') as HTMLInputElement;
    expect(qtyCellAfter).toBeTruthy();
  });
});

// Prova de NÃO-REGRESSÃO DE PREÇO: o `MaterialBatchPicker` adiciona vários
// materiais de uma vez chamando `buildMaterialItem` (função pura) uma vez por
// seleção, num único `setItems` — a MESMA função que o fluxo antigo
// (item-a-item) usava. Aqui testamos a função isolada: o valor devolvido tem
// que ser byte a byte igual ao que o handler antigo produzia.
describe('buildMaterialItem — prova de não-regressão de preço (função pura)', () => {
  const invA = { id: 'inv-a', name: 'Tubo de cobre 3/8', sale_price: 45, cost_price: 30, sku: 'COB-38' } as any;
  const invB = { id: 'inv-b', name: 'Gás R410a', sale_price: 120, cost_price: 90, sku: null } as any;

  it('3 materiais em lote (2 do catálogo + 1 avulso) saem idênticos ao cálculo item-a-item de antes', () => {
    const profitRate = 15;
    const bdiFactor = 0.35;

    const item1 = buildMaterialItem({ inv: invA, manualName: null, manualPrice: 0, quantity: 2, profitRate, bdiFactor });
    const item2 = buildMaterialItem({ inv: invB, manualName: null, manualPrice: 0, quantity: 1, profitRate, bdiFactor });
    const item3 = buildMaterialItem({ inv: null, manualName: 'Conexão avulsa', manualCost: 7.5, manualPrice: 12.5, quantity: 3, profitRate, bdiFactor });

    // Item de catálogo: preço = sale_price (nunca manualPrice), custo = cost_price.
    expect(item1).toMatchObject({
      item_type: 'material',
      description: 'Tubo de cobre 3/8',
      quantity: 2,
      unit_price: 45,
      unit_total_cost: 30,
      total_price: 90, // 45 * 2
      inventory_id: 'inv-a',
      profit_rate: 15,
      bdi: 0.35,
    });
    expect(item2).toMatchObject({
      description: 'Gás R410a',
      quantity: 1,
      unit_price: 120,
      unit_total_cost: 90,
      total_price: 120,
      inventory_id: 'inv-b',
    });
    // Material avulso mantém separados o custo da empresa e o preço do cliente.
    expect(item3).toMatchObject({
      description: 'Conexão avulsa',
      quantity: 3,
      unit_price: 12.5,
      unit_total_cost: 7.5,
      total_price: 37.5, // 12.5 * 3
      inventory_id: null,
    });
  });

  it('quantidade "2,5" (decimal) sobrevive intacta e o total é unit_price × 2,5 arredondado a 2 casas', () => {
    const item = buildMaterialItem({
      inv: { id: 'inv-c', name: 'Tubo 1/2', sale_price: 33.33, cost_price: 20 } as any,
      manualName: null,
      manualPrice: 0,
      quantity: 2.5,
      profitRate: 10,
      bdiFactor: 0.3,
    });
    expect(item?.quantity).toBe(2.5);
    expect(item?.unit_price).toBe(33.33);
    expect(item?.total_price).toBe(Math.round(33.33 * 2.5 * 100) / 100);
  });

  it('sem nome (nem catálogo nem manual) devolve null — chamador filtra', () => {
    const item = buildMaterialItem({ inv: null, manualName: '  ', manualPrice: 10, quantity: 1, profitRate: 10, bdiFactor: 0.3 });
    expect(item).toBeNull();
  });

  it('sem custo informado não inventa custo igual ao preço de venda', () => {
    const item = buildMaterialItem({
      inv: null,
      manualName: 'Material avulso',
      manualPrice: 80,
      quantity: 1,
      profitRate: 10,
      bdiFactor: 0.68,
    });

    expect(item).toMatchObject({ unit_total_cost: 0, unit_price: 80 });
  });
});

describe('calculateMixedQuotePricing — orçamento com itens dentro e fora do BDI', () => {
  it('sem BDI soma preços existentes sem aplicar coeficiente, inclusive com metadados antigos de BDI', () => {
    const item = buildMaterialItem({ inv: null, manualName: 'Item com preço definido', manualCost: 693, manualPrice: 1019.12, quantity: 1, profitRate: 10, bdiFactor: 0.68 })!;
    for (const pricingMode of ['registered', 'manual', 'cost_bdi'] as const) {
      for (const factor of [0.68, 0.2]) {
        const result = calculateMixedQuotePricing({
          items: [{ ...item, pricing_mode: pricingMode }], useBdi: false, bdiFactor: factor,
          displacementMode: 'manual', displacementCost: 150, displacementPrice: 220.59,
        });
        expect(result).toEqual({ automaticCost: 0, automaticPrice: 0, outsidePrice: 1239.71, totalKnownCost: 843, suggestedPrice: 1239.71 });
      }
    }
  });

  it('aplica o coeficiente apenas ao custo_bdi e soma preços independentes por fora', () => {
    const result = calculateMixedQuotePricing({
      items: [
        { pricing_mode: 'cost_bdi', unit_total_cost: 100, unit_price: 200, total_price: 200, quantity: 1 },
        { pricing_mode: 'registered', unit_total_cost: 40, unit_price: 70, total_price: 70, quantity: 1 },
        { pricing_mode: 'manual', unit_total_cost: 10, unit_price: 25, total_price: 50, quantity: 2 },
      ].map((item, position) => ({
        id: `item-${position}`,
        item_type: position === 0 ? 'servico' as const : 'material' as const,
        description: `Item ${position + 1}`,
        details: '',
        service_type_id: null,
        inventory_id: null,
        unit_hourly_rate: 0,
        unit_hours: 0,
        unit_labor_cost: 0,
        unit_materials_cost: 0,
        unit_extras_cost: 0,
        profit_rate: 10,
        bdi: 0.5,
        price_override: item.pricing_mode === 'cost_bdi' ? null : item.unit_price,
        ...item,
        pricing_mode: item.pricing_mode as 'registered' | 'cost_bdi' | 'manual',
      })),
      useBdi: true,
      bdiFactor: 0.5,
      displacementMode: 'manual',
      displacementCost: 20,
      displacementPrice: 35,
    });

    expect(result).toEqual({
      automaticCost: 100,
      automaticPrice: 200,
      outsidePrice: 155,
      totalKnownCost: 180,
      suggestedPrice: 355,
    });
  });
});

describe('QuoteFormDialog — total comercial canônico', () => {
  it('usa preço de venda, deslocamento e desconto nas parcelas, sem trocar pelo custo/BDI', () => {
    const material = buildMaterialItem({
      inv: { id: 'inv-total', name: 'Filtro', sale_price: 50, cost_price: 30 } as any,
      manualName: null,
      manualPrice: 0,
      quantity: 2,
      profitRate: 20,
      bdiFactor: 0.7,
    })!;
    const bdi = calculateBDI({
      taxRate: 5,
      adminRate: 5,
      profitRate: 20,
      items: [{ totalCost: material.unit_total_cost * material.quantity }],
      distanceKm: 10,
      kmCost: 1.5,
      cardDiscountRate: 5,
      cardInstallments: 3,
    });
    const commercial = calculateQuoteCommercialTotal({
      itemsTotal: material.total_price,
      displacementCost: bdi.displacementCost,
      discountType: 'percentual',
      discountValue: 10,
    });
    const payment = calculateCommercialPaymentOptions(commercial.finalTotal, 5, 3);

    expect(material.total_price).toBe(100);
    expect(bdi.totalCost).toBe(75);
    expect(bdi.finalPrice).not.toBe(commercial.finalTotal);
    expect(commercial).toEqual({
      subtotalBeforeDiscount: 115,
      discountAmount: 11.5,
      finalTotal: 103.5,
    });
    expect(payment.cashPrice).toBeCloseTo(98.325);
    expect(payment.installmentValue).toBe(34.5);
  });

  it('trata o desconto em valor como quantia fixa', () => {
    expect(calculateQuoteCommercialTotal({
      itemsTotal: 100,
      displacementCost: 15,
      discountType: 'valor',
      discountValue: 10,
    })).toEqual({
      subtotalBeforeDiscount: 115,
      discountAmount: 10,
      finalTotal: 105,
    });
  });

  it('mostra total e parcela pelo valor comercial, mantendo BDI apenas como sugestão', () => {
    act(() => {
      root.render(
        <BDISummaryCard data={{
          bdiFactor: 0.7,
          displacementCost: 15,
          totalCost: 75,
          finalPrice: 107.14,
          weightedProfitRate: 20,
          commercialTotal: 103.5,
          cashDiscountRate: 5,
          cardInstallments: 3,
        }} />,
      );
    });

    const text = container.textContent ?? '';
    expect(text).toContain('Sugestão pelo BDI');
    expect(text).toContain('Total do orçamento');
    expect(text).toContain('R$\u00a0103,50');
    expect(text).toContain('3x cartão');
    expect(text).toContain('R$\u00a034,50');
  });
});

describe('QuoteFormDialog — datas distribuídas pelas decisões corretas', () => {
  it('mantém 1º vencimento nas condições e validade na revisão, sempre com DatePicker', async () => {
    mount();
    await goPastRecipient();
    await advanceToCommercial();

    const placeholder = MESSAGES['pt-br'].app.common.datePicker.placeholder;
    expect(qAll('button').filter((b) => b.textContent?.includes(placeholder))).toHaveLength(1);
    expect(document.body.textContent).toContain(tq.receivableFirstDueDateLabel);

    await clickAsync(findButtonByText(tq.next)!);
    expect(qAll('button').filter((b) => b.textContent?.includes(placeholder))).toHaveLength(1);
    expect(document.body.textContent).toContain(tq.reviewValidUntil);
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });
});

describe('QuoteFormDialog — desconto em R$ (prova real de DOM)', () => {
  it('colar "4.550" dá 4550 (não 4.55, o bug do sócio) quando o tipo é "R$"', async () => {
    mount();
    await goPastRecipient();
    await advanceToCommercial();

    const discountInput = q(`input[aria-label="${tq.discountHeader}"]`) as HTMLInputElement;
    expect(discountInput).toBeTruthy();
    paste(discountInput, '4.550');
    const discountInputAfter = q(`input[aria-label="${tq.discountHeader}"]`) as HTMLInputElement;
    expect(discountInputAfter.value).toBe('4550');
  });
});

// A quantidade do material vira DECIMAL (2,5 m de tubo, 0,5 kg de gás). O
// `NumericInput` é controlado por STRING CRUA de propósito: o estado tem que
// guardar o texto digitado, não o número reformatado. Se a tela reescrever o
// input a partir do número a cada tecla, o separador decimal é engolido no
// exato instante em que é digitado ("2," → 2 → "2") e fica IMPOSSÍVEL chegar
// em "2,5" editando na lista de itens já adicionados.
describe('QuoteFormDialog — editar quantidade decimal na lista de materiais (prova real de DOM)', () => {
  async function addOneMaterial() {
    mount();
    await goPastRecipient();
    await advanceToMaterials();
    await clickAsync(findButtonByText(tq.materialPickerOpen)!);
    const pickerQty = qAll('input').find((i) => (i as HTMLInputElement).placeholder === '0') as HTMLInputElement;
    typeInto(pickerQty, '1');
    await clickAsync(findButtonByText(tq.materialPickerConfirm)!);
  }

  // A tabela (sm+) e os cards (mobile) coexistem no DOM — o corte é só CSS.
  // Pegamos o campo da tabela pela largura própria dele (w-16).
  const tableQtyInput = () =>
    (qAll('input') as HTMLInputElement[]).find((i) => i.className.includes('h-7') && i.className.includes('w-16'));

  it('digitar "2," mantém a vírgula no campo (não colapsa pra "2")', async () => {
    await addOneMaterial();
    const qtyInput = tableQtyInput();
    expect(qtyInput).toBeTruthy();
    typeInto(qtyInput!, '2,');
    expect(tableQtyInput()!.value).toBe('2,');
  });

  it('digitar "2,5" chega em 2,5 no campo e no total', async () => {
    await addOneMaterial();
    typeInto(tableQtyInput()!, '2');
    typeInto(tableQtyInput()!, '2,');
    typeInto(tableQtyInput()!, '2,5');
    expect(tableQtyInput()!.value).toBe('2,5');
  });

  it('apagar tudo deixa o campo vazio (não trava em "0,01")', async () => {
    await addOneMaterial();
    typeInto(tableQtyInput()!, '');
    expect(tableQtyInput()!.value).toBe('');
  });
});

describe('QuoteFormDialog — modo de precificação e estrutura do wizard', () => {
  it('bloqueia um segundo envio enquanto salva os custos no catálogo', async () => {
    mount();
    await goPastRecipient();
    await advanceToCommercial();
    await clickAsync(findButtonByText(tq.next)!);
    testState.costsSaving = true;
    mount();

    const saving = findButtonByText(tq.saving) as HTMLButtonElement;
    expect(saving).toBeTruthy();
    expect(saving.disabled).toBe(true);
    click(saving);
    expect(testState.createMutate).not.toHaveBeenCalled();
  });

  it('preserva campo de BDI editado quando os padrões da empresa resolvem depois', async () => {
    mount();
    await goPastRecipient();
    await addServiceItem();
    await clickAsync(findButtonByText(tq.next)!);
    await clickAsync(findButtonByText(tq.next)!);

    const advanced = q('#quote-bdi-advanced')!;
    const fields = Array.from(advanced.querySelectorAll('input')) as HTMLInputElement[];
    expect(fields.map(field => field.value)).toEqual(['10', '12', '10']);

    typeInto(fields[0], '17');
    testState.pricing = {
      tax_rate: 8,
      admin_indirect_rate: 9,
      default_profit_rate: 15,
      km_cost: 2.5,
      card_discount_rate: 4,
      card_installments: 12,
    };
    mount();

    const updatedFields = Array.from(q('#quote-bdi-advanced')!.querySelectorAll('input')) as HTMLInputElement[];
    expect(updatedFields.map(field => field.value)).toEqual(['17', '9', '15']);
    expect((q(`input[aria-label="${tq.bdiKmCost}"]`) as HTMLInputElement).value).toBe('2,5');
    expect((q(`input[aria-label="${tq.bdiCashDiscount}"]`) as HTMLInputElement).value).toBe('4');
    expect((q(`input[aria-label="${tq.bdiInstallments}"]`) as HTMLInputElement).value).toBe('12');
  });

  it('preserva a vírgula durante a digitação do custo por km e salva o valor numérico correto', async () => {
    testState.pricing = {
      tax_rate: 10, admin_indirect_rate: 12, default_profit_rate: 10,
      km_cost: 1.5, card_discount_rate: 6, card_installments: 10,
    };
    mount();
    await goPastRecipient();
    await advanceToCommercial();

    const kmCostInput = q(`input[aria-label="${tq.bdiKmCost}"]`) as HTMLInputElement;
    expect(kmCostInput.value).toBe('1,5');
    typeInto(kmCostInput, '2,');
    expect(kmCostInput.value).toBe('2,');
    typeInto(kmCostInput, '2,75');
    expect(kmCostInput.value).toBe('2,75');

    await clickAsync(findButtonByText(tq.saveDraft)!);
    expect(testState.createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ km_cost: 2.75 }),
      expect.anything(),
    );
  });

  it('concentra o deslocamento em preço e condições e mantém a edição disponível sem BDI', async () => {
    mount();
    await goPastRecipient();
    await addServiceItem();
    await advanceToMaterials();

    expect(q('#quote-displacement')).toBeNull();
    expect(q('#quote-use-bdi')).toBeNull();
    await clickAsync(findButtonByText(tq.next)!);
    expect(q('#quote-displacement')).toBeTruthy();
    const kmCostInput = q(`input[aria-label="${tq.bdiKmCost}"]`) as HTMLInputElement;
    typeInto(kmCostInput, '1,5');
    typeInto(q('#quote-distance-km') as HTMLInputElement, '100');
    expect((q('input[aria-label="Preço cobrado"]') as HTMLInputElement).value).toBe('220,59');
    expect(document.body.textContent).toContain('220,59');

    click(q('#quote-manual-pricing')!);
    expect(q('#quote-bdi-advanced')).toBeNull();
    expect((q('#quote-distance-km') as HTMLInputElement).value).toBe('100');
    expect((q(`input[aria-label="${tq.bdiKmCost}"]`) as HTMLInputElement).value).toBe('1,5');
    expect((q(`input[aria-label="${tq.bdiCashDiscount}"]`) as HTMLInputElement)).toBeTruthy();
    expect((q(`input[aria-label="${tq.bdiInstallments}"]`) as HTMLInputElement)).toBeTruthy();
    expect(findButtonByText('Editar deslocamento na etapa anterior')).toBeFalsy();
  });

  it('mostra a composição BDI nas condições e o resumo comercial na revisão', async () => {
    mount();
    await goPastRecipient();
    await advanceToCommercial();
    expect(document.body.textContent).toContain(tq.bdiCompositionTitle);
    expect(q('[data-testid="bdi-layer-cost"]')).toBeTruthy();
    await clickAsync(findButtonByText(tq.next)!);

    expect(document.body.textContent).toContain('Revise e finalize');
    expect(document.body.textContent).toContain('Preço praticado');
    expect(document.body.textContent).toContain('Apresentação e validade');
  });

  it('recalcula o preço comercial ao editar o lucro no compositor BDI', async () => {
    testState.profile = { company_id: 'company-1' };
    testState.fetchBreakdown.mockResolvedValue({
      hourlyRate: 50, hours: 2, laborCost: 100, materialsCost: 0,
      quoteExtrasCost: 0, totalCost: 100,
    });
    mount();
    await goPastRecipient();
    await advanceToCommercial();

    const profitInput = q('input[aria-label="Percentual de lucro"]') as HTMLInputElement;
    expect(profitInput).toBeTruthy();
    typeInto(profitInput, '20');

    expect(document.body.textContent).toContain('172,41');
    expect(document.body.textContent).toContain('0.5800');
    expect(testState.createMutate).not.toHaveBeenCalled();
  });

  it('mantém os ajustes de BDI expandidos e visíveis sem ação adicional', async () => {
    mount();
    await goPastRecipient();
    await advanceToCommercial();

    expect(q('#quote-bdi-advanced')).toBeTruthy();
    expect(findButtonByText('Ajustar taxas e entender o BDI')).toBeFalsy();
    expect(findButtonByText('Ocultar ajustes avançados')).toBeFalsy();
  });

  it('mantém o resumo comercial visível ao avançar para condições comerciais', async () => {
    mount();
    await goPastRecipient();
    await advanceToCommercial();

    expect(findButtonByText('Resumo do orçamento')).toBeTruthy();
    expect(document.body.textContent).toContain('Pagamento');
  });

  it('exige destinatário na primeira etapa e ao menos um item antes das condições comerciais', async () => {
    mount();

    expect(findButtonByText(tq.next)).toHaveAttribute('aria-disabled', 'true');
    await clickAsync(findButtonByText(tq.next)!);
    expect(document.body.textContent).toContain('Selecione um cliente ou informe o nome do prospecto para continuar.');

    await goPastRecipient();

    expect(findButtonByText(tq.next)).toHaveAttribute('aria-disabled', 'false');
    expect(findButtonByText(tq.saveDraft)).not.toBeDisabled();
    await clickAsync(findButtonByText(tq.next)!);
    expect(findButtonByText(tq.next)).toHaveAttribute('aria-disabled', 'true');
    await clickAsync(findButtonByText(tq.next)!);
    expect(document.body.textContent).toContain('Adicione ao menos um serviço ou material para continuar.');
  });

  it('persiste use_bdi=false no rascunho quando a precificação manual é ativada', async () => {
    mount();
    await goPastRecipient();
    await advanceToCommercial();

    const useBdiToggle = q('#quote-use-bdi') as HTMLElement;
    expect(useBdiToggle).toBeTruthy();
    expect(useBdiToggle).toHaveAttribute('aria-pressed', 'true');
    click(q('#quote-manual-pricing')!);

    expect(document.body.textContent).toContain('Preços definidos nos itens');
    await clickAsync(findButtonByText(tq.saveDraft)!);

    expect(testState.createMutate).toHaveBeenCalledTimes(1);
    expect(testState.createMutate.mock.calls[0][0]).toMatchObject({ use_bdi: false, status: 'rascunho' });
  });

  it('ao religar BDI preserva preços existentes e oferece aplicação explícita aos itens com custo', async () => {
    testState.profile = { company_id: 'company-1' };
    testState.fetchBreakdown.mockResolvedValue({
      hourlyRate: 50,
      hours: 2,
      laborCost: 100,
      materialsCost: 0,
      extrasCost: 0,
      resourcesCost: 0,
      giftsCost: 0,
      linkedResourcesCost: 0,
      quoteExtrasCost: 0,
      totalCost: 100,
    });
    mount();
    await goPastRecipient();
    await addServiceItem();
    await clickAsync(findButtonByText(tq.next)!);
    await clickAsync(findButtonByText(tq.next)!);

    const useBdiToggle = q('#quote-use-bdi') as HTMLElement;
    click(q('#quote-manual-pricing')!);
    click(useBdiToggle);

    expect(document.body.textContent).toContain('Itens com preço manual mantêm o valor atual');
    const applyButton = findButtonByText('Aplicar BDI aos itens com custo');
    expect(applyButton).toBeTruthy();
    await clickAsync(applyButton!);
    expect(document.body.textContent).not.toContain('Itens com preço manual mantêm o valor atual');
  });

  it('sem BDI preserva preços anteriores e usa o preço cadastrado ao adicionar outro serviço', async () => {
    testState.profile = { company_id: 'company-1' };
    testState.fetchBreakdown.mockResolvedValue({ hourlyRate: 50, hours: 2, laborCost: 100, materialsCost: 0, quoteExtrasCost: 0, totalCost: 100 });
    mount();
    await goPastRecipient();
    await advanceToCommercial();
    click(q('#quote-manual-pricing')!);

    const stepper = q('[aria-label="Etapas do orçamento"]')!;
    const servicesStep = Array.from(stepper.querySelectorAll('button')).find(button => button.textContent?.includes('Serviços e custos'))!;
    await clickAsync(servicesStep);
    await addServiceItem();
    await clickAsync(findButtonByText(tq.saveDraft)!);

    expect(testState.createMutate).toHaveBeenCalledWith(expect.objectContaining({
      use_bdi: false,
      total_value: 397.06,
      items: expect.arrayContaining([
        expect.objectContaining({ pricing_mode: 'manual', unit_price: 147.06, total_price: 147.06 }),
        expect.objectContaining({ pricing_mode: 'registered', unit_price: 250, total_price: 250 }),
      ]),
    }), expect.anything());
  });

  it('permite escolher a modalidade de preço de cada serviço', async () => {
    mount();
    await goPastRecipient();
    await addServiceItem();
    click(q('button[aria-label="Abrir serviço Manutenção Preventiva"]')!);

    expect(q('[aria-label="Modo de preço de Manutenção Preventiva"]')).toBeTruthy();
  });

  it('reidrata use_bdi=false ao editar um orçamento manual persistido', async () => {
    mount({
      id: 'quote-manual',
      quote_number: 42,
      customer_id: null,
      prospect_name: 'Cliente manual',
      prospect_phone: null,
      prospect_email: null,
      status: 'rascunho',
      valid_until: null,
      discount_type: 'valor',
      discount_value: 0,
      subtotal: 0,
      discount_amount: 0,
      total_value: 0,
      notes: null,
      terms: null,
      assigned_to: null,
      proposal_template_id: 'tpl-1',
      token: 'preview-token',
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      converted_to_os_id: null,
      final_price: 0,
      bdi: 0.68,
      use_bdi: false,
      quote_items: [],
    });

    await goPastRecipient();
    await addServiceItem();
    await clickAsync(findButtonByText(tq.next)!);
    await clickAsync(findButtonByText(tq.next)!);
    expect(q('#quote-use-bdi')).toHaveAttribute('aria-pressed', 'false');
    expect(document.body.textContent).toContain('Preços definidos nos itens');
  });

  it('mantém cabeçalho/rodapé fora do scroll e o stepper visível no corpo', () => {
    mount();

    const dialog = q('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.className).toContain('h-[100dvh]');
    expect(q('button[aria-label="Sair"]')).toHaveTextContent('Sair');
    expect(q('.sticky.top-0')).toBeTruthy();
    expect(findButtonByText('Resumo do orçamento')).toBeTruthy();
    const stepper = q('[aria-label="Etapas do orçamento"]');
    expect(stepper?.textContent).toContain('Cliente');
    expect(stepper?.textContent).toContain('Serviços e custos');
    expect(stepper?.textContent).toContain('Materiais');
    expect(stepper?.textContent).not.toContain('Materiais e deslocamento');
    expect(stepper?.textContent).toContain('Preço e condições');
    expect(stepper?.textContent).toContain('Revisão e envio');
  });

  it('oferece o rascunho em aviso flutuante sem abrir outro modal e restaura os dados ao retomar', async () => {
    sessionStorage.setItem('form-draft:quote-form', JSON.stringify({
      customerMode: 'prospect', prospectName: 'Cliente do rascunho', prospectPhone: '(11) 99999-1234',
    }));
    mount();

    expect(q('[data-fullscreen-floating]')).toHaveTextContent('Rascunho encontrado');
    expect(q('[role="alertdialog"]')).toBeNull();
    expect(qAll('[role="dialog"]')).toHaveLength(1);
    expect(q('[role="dialog"]')).not.toHaveAttribute('aria-hidden', 'true');
    await clickAsync(findButtonByText('Retomar')!);

    expect(q('[data-fullscreen-floating]')).toBeNull();
    expect((q(`input[placeholder="${tq.recipientNamePlaceholder}"]`) as HTMLInputElement).value).toBe('Cliente do rascunho');
  });

  it('descarta o rascunho pelo float e mantém o formulário aberto para começar do zero', async () => {
    sessionStorage.setItem('form-draft:quote-form', JSON.stringify({ customerMode: 'prospect', prospectName: 'Cliente anterior' }));
    mount();
    await clickAsync(findButtonByText('Começar do zero')!);
    expect(q('[data-fullscreen-floating]')).toBeNull();
    expect(sessionStorage.getItem('form-draft:quote-form')).toBeNull();
    expect(q('[role="dialog"]')).toBeTruthy();
    expect(q('[aria-label="Etapas do orçamento"]')).toBeTruthy();
  });

  it('preserva a primeira edição de um novo prospecto quando o aviso flutuante é ignorado', async () => {
    sessionStorage.setItem('form-draft:quote-form', JSON.stringify({ customerMode: 'prospect', prospectName: 'Cliente anterior' }));
    mount();
    await clickAsync(findButtonByText(tq.recipientProspect)!);
    expect(q('[data-fullscreen-floating]')).toBeTruthy();
    typeInto(q(`input[placeholder="${tq.recipientNamePlaceholder}"]`) as HTMLInputElement, 'Novo cliente');
    expect(q('[data-fullscreen-floating]')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('form-draft:quote-form')!)).toMatchObject({ customerMode: 'prospect', prospectName: 'Novo cliente' });
  });

  it('continua salvando automaticamente após escolher começar do zero', async () => {
    sessionStorage.setItem('form-draft:quote-form', JSON.stringify({ customerMode: 'prospect', prospectName: 'Cliente anterior' }));
    mount();
    await clickAsync(findButtonByText('Começar do zero')!);
    await clickAsync(findButtonByText(tq.recipientProspect)!);
    typeInto(q(`input[placeholder="${tq.recipientNamePlaceholder}"]`) as HTMLInputElement, 'Cliente novo após descarte');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
    expect(JSON.parse(sessionStorage.getItem('form-draft:quote-form')!)).toMatchObject({ prospectName: 'Cliente novo após descarte' });
  });

  it('não transporta o preenchimento para o rascunho de outra empresa quando o contexto muda', async () => {
    testState.profile = { company_id: 'company-a' };
    mount();
    await goPastRecipient();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
    const previous = sessionStorage.getItem('form-draft:quote-form:company-a:session');
    expect(previous).not.toBeNull();
    testState.profile = { company_id: 'company-b' };
    mount();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
    expect(sessionStorage.getItem('form-draft:quote-form:company-b:session')).toBeNull();
    expect(sessionStorage.getItem('form-draft:quote-form:company-a:session')).toBe(previous);
    expect(q('[aria-label="Etapas do orçamento"]')).toHaveTextContent('Cliente');
  });

  it('não anuncia salvamento nem cria rascunho vazio quando os padrões de preço carregam', async () => {
    mount();
    testState.pricing = { tax_rate: 18, admin_indirect_rate: 15, default_profit_rate: 8, km_cost: 2, card_discount_rate: 4, card_installments: 6 };
    mount();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
    expect(sessionStorage.getItem('form-draft:quote-form')).toBeNull();
    expect(q('[data-draft-status]')).toHaveAttribute('data-draft-status', 'idle');
    expect(q('[data-fullscreen-floating]')).toBeNull();
  });

  it('acompanha o autosave real no cabeçalho e recupera os itens e as taxas do rascunho', async () => {
    testState.profile = { company_id: 'company-autosave' };
    testState.fetchBreakdown.mockResolvedValue({ hourlyRate: 85, hours: 4, laborCost: 340, materialsCost: 0, extrasCost: 0, resourcesCost: 0, giftsCost: 0, linkedResourcesCost: 0, quoteExtrasCost: 0, totalCost: 340 });
    mount();
    expect(q('[role="dialog"] h2')).toHaveTextContent('Criar orçamento');
    await goPastRecipient();
    await addServiceItem();
    expect(q('[role="dialog"] > div')).toHaveTextContent('Salvando…');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
    expect(q('[role="dialog"] > div')).toHaveTextContent('Salvo neste navegador');
    const saved = JSON.parse(sessionStorage.getItem('form-draft:quote-form:company-autosave:session')!);
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({ description: 'Manutenção Preventiva', pricing_mode: 'cost_bdi' });
    expect(saved.items[0].cost_composition.labor.hours).toBeGreaterThan(0);
    expect(saved).toMatchObject({ taxRate: 10, adminRate: 12, profitRate: 10 });
    act(() => root.unmount());
    root = createRoot(container);
    mount();
    await clickAsync(findButtonByText('Retomar')!);
    await clickAsync(findButtonByText(tq.next)!);
    expect(q('button[aria-label="Abrir serviço Manutenção Preventiva"]')).toBeTruthy();
    expect(testState.createMutate).not.toHaveBeenCalled();
  });

  it('pré-visualiza o template selecionado sem salvar o orçamento', async () => {
    mount();
    await goPastRecipient();
    await advanceToCommercial();
    await clickAsync(findButtonByText(tq.next)!);

    expect(q('[data-testid="proposal-cover-preview"]')).toBeTruthy();
    expect(document.body.textContent).toContain(tq.reviewCoverTitle);
    expect(document.body.textContent).toContain('Prévia renderizada');

    const previewButton = findButtonByText(tq.reviewFullPreview);
    expect(previewButton).toBeTruthy();
    await clickAsync(previewButton!);

    expect(document.body.textContent).toContain('Como o cliente verá');
    expect(document.body.textContent).toContain('Prévia renderizada');
    expect(testState.createMutate).not.toHaveBeenCalled();
  });

  it('vai dos serviços à revisão sem alterar preços ou criar um orçamento antes de confirmar', async () => {
    mount();
    await goPastRecipient();
    await addServiceItem();
    await clickAsync(findButtonByText('Revisar orçamento')!);
    expect(document.body.textContent).toContain('Revise e finalize');
    expect(document.body.textContent).toContain('Sem materiais cobrados por fora.');
    expect(document.body.textContent).toContain('Parcela única · Sem desconto.');
    expect(document.body.textContent).not.toContain('observações revisados');
    expect(testState.createMutate).not.toHaveBeenCalled();
    await clickAsync(findButtonByText(tq.createQuote)!);
    expect(testState.createMutate.mock.calls[0][0]).toMatchObject({
      total_value: 250, displacement_cost: 0, discount_value: 0, receivable_installments: 1,
      items: [expect.objectContaining({ unit_price: 250, quantity: 1, pricing_mode: 'registered' })],
    });
  });

  it('aponta um serviço sem preço e permite voltar à composição pela revisão', async () => {
    mount();
    await goPastRecipient();
    await addServiceItem();
    await clickAsync(q('button[aria-label="Abrir serviço Manutenção Preventiva"]')!);
    typeInto(q('input[aria-label="Preço de Manutenção Preventiva"]') as HTMLInputElement, '0');
    await clickAsync(findButtonByText('Revisar orçamento')!);
    expect(document.body.textContent).toContain('Há itens sem preço');
    expect(findButtonByText(tq.createQuote)).not.toBeDisabled();
    await clickAsync(findButtonByText('Rever serviços')!);
    expect(q('button[aria-label="Abrir serviço Manutenção Preventiva"]')).toBeTruthy();
    expect(testState.createMutate).not.toHaveBeenCalled();
  });

  it('preserva o rascunho pessoal de criação ao salvar outro orçamento existente', async () => {
    const personalDraft = JSON.stringify({ prospectName: 'Orçamento ainda em criação', customerMode: 'prospect' });
    sessionStorage.setItem('form-draft:quote-form', personalDraft);
    testState.updateMutate.mockImplementation((_payload, callbacks) => callbacks.onSuccess());
    mount({ id: 'existing-quote', quote_number: 42, prospect_name: 'Outro cliente', quote_items: [], use_bdi: false } as Quote);
    await goPastRecipient();
    await addServiceItem();
    await clickAsync(findButtonByText('Revisar orçamento')!);
    await clickAsync(findButtonByText(tq.saveChanges)!);
    expect(testState.updateMutate).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('form-draft:quote-form')).toBe(personalDraft);
  });

  it('permite editar orçamento existente com usuário autenticado sem esperar o autosave pessoal', async () => {
    testState.profile = { company_id: 'company-editing' };
    testState.userId = 'user-editing';
    mount({ id: 'existing-quote', quote_number: 42, prospect_name: 'Cliente existente', quote_items: [], use_bdi: false } as Quote);
    expect(findButtonByText(tq.next)).toHaveAttribute('aria-disabled', 'false');
    expect(findButtonByText(tq.saveDraft)).not.toBeDisabled();
    await goPastRecipient();
    expect(findButtonByText('Adicionar serviço')).toBeTruthy();
  });

  it('abre a prévia durante o preenchimento e acompanha os preços sem salvar nem mudar de etapa', async () => {
    mount();
    await clickAsync(findButtonByText(tq.reviewFullPreview)!);
    expect(document.body.textContent).toContain('Prévia em preenchimento.');
    expect(q('[data-testid="quote-preview-data"]')).toHaveAttribute('data-total', '0');
    await clickAsync(findButtonByText('Fechar')!);
    await goPastRecipient();
    await addServiceItem();
    await clickAsync(q('button[aria-label="Abrir serviço Manutenção Preventiva"]')!);
    typeInto(q('input[aria-label="Preço de Manutenção Preventiva"]') as HTMLInputElement, '375');
    await clickAsync(findButtonByText(tq.reviewFullPreview)!);
    expect(q('[data-testid="quote-preview-data"]')).toHaveAttribute('data-total', '375');
    expect(q('[data-testid="quote-preview-data"]')).toHaveAttribute('data-items', '1');
    expect(document.body.textContent).not.toContain('Prévia em preenchimento.');
    await clickAsync(findButtonByText('Fechar')!);
    expect(q('input[aria-label="Preço de Manutenção Preventiva"]')).toHaveValue(375);
    expect(testState.createMutate).not.toHaveBeenCalled();
    expect(testState.updateMutate).not.toHaveBeenCalled();
  });
});

describe('calculateItemPrice — modalidades de material', () => {
  it('usa preço cadastrado, custo + BDI ou valor manual conforme a modalidade', () => {
    const base = { registeredPrice: 150, unitCost: 80, bdiFactor: 0.5, manualPrice: 123 };

    expect(calculateItemPrice({ ...base, mode: 'registered' })).toBe(150);
    expect(calculateItemPrice({ ...base, mode: 'cost_bdi' })).toBe(160);
    expect(calculateItemPrice({ ...base, mode: 'manual' })).toBe(123);
  });
});
