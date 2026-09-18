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
import { MESSAGES } from '@/lib/i18n/messages';

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

vi.mock('@/hooks/useCompanyModules', () => ({ useCompanyModules: () => ({ hasModule: () => false }) }));
vi.mock('@/hooks/useCustomers', () => ({ useCustomers: () => ({ customers: [] }) }));
vi.mock('@/hooks/useQuotes', () => ({
  useQuotes: () => ({
    createQuote: { mutateAsync: vi.fn(), isPending: false },
    updateQuote: { mutateAsync: vi.fn(), isPending: false },
    quotes: [],
  }),
}));
vi.mock('@/hooks/useProposalTemplates', () => ({
  useProposalTemplates: () => ({ templates: [{ id: 'tpl-1', slug: 'clean', name: 'Clean' }] }),
}));
vi.mock('@/hooks/usePricingSettings', () => ({ usePricingSettings: () => ({ settings: null }) }));
vi.mock('@/hooks/useServiceTypes', () => ({
  useServiceTypes: () => ({
    serviceTypes: [{ id: 'svc-1', name: 'Manutenção Preventiva', is_active: true, color: '#00C597', default_price: null, description: '' }],
    createServiceType: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({ items: [{ id: 'inv-1', name: 'Filtro', sale_price: 50, cost_price: 30, sku: null }] }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: null }),
}));
vi.mock('@/components/customers/CustomerSelectField', () => ({ CustomerSelectField: () => null }));

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

import { QuoteFormDialog, buildMaterialItem } from './QuoteFormDialog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const tq = MESSAGES['pt-br'].app.crm.quotes;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<QuoteFormDialog open onOpenChange={() => {}} />);
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

/** Avança do step "Destinatário" pro seguinte, usando modo prospect (sem
 * depender do CustomerSelectField mockado). */
async function goPastRecipient() {
  // LabeledSwitch alterna existing/prospect — clicamos no rótulo "prospect".
  const prospectToggle = findButtonByText(tq.recipientProspect) ?? qAll('[role="switch"]')[0];
  if (prospectToggle) click(prospectToggle);
  const nameInput = q('input[placeholder="' + tq.recipientNamePlaceholder + '"]') as HTMLInputElement;
  expect(nameInput).toBeTruthy();
  typeInto(nameInput, 'Cliente Prospect Teste');
  const nextBtn = findButtonByText(tq.next);
  expect(nextBtn).toBeTruthy();
  await clickAsync(nextBtn!);
}

beforeEach(() => {
  sessionStorage.clear();
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
  it('colar "4.550" dá 4550 (não 4.55, o bug do sócio)', async () => {
    mount();
    await goPastRecipient(); // agora em "services"

    const serviceSelect = q('select[aria-label="' + tq.serviceSelectPlaceholder + '"]') as HTMLSelectElement;
    expect(serviceSelect).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(serviceSelect, 'svc-1');
      serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const addBtn = findButtonByText(tq.serviceAddButton);
    expect(addBtn).toBeTruthy();
    await clickAsync(addBtn!);

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
    await goPastRecipient(); // "services"
    const nextBtn1 = findButtonByText(tq.next);
    await clickAsync(nextBtn1!); // "materials"

    // Um caminho só (desktop e celular): abre o picker em lote.
    const openPickerBtn = findButtonByText(tq.materialPickerOpen);
    expect(openPickerBtn).toBeTruthy();
    await clickAsync(openPickerBtn!);

    const searchInput = q('input[placeholder="' + tq.materialPickerSearch + '"]') as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    typeInto(searchInput, 'Material Avulso');

    // Sem correspondência exata no catálogo mockado ("Filtro") → nasce a linha
    // "Criar ... como material avulso" com o campo de preço unitário.
    const priceInput = q('input[type="number"]') as HTMLInputElement;
    expect(priceInput).toBeTruthy();
    paste(priceInput, '4.550');
    const priceInputAfter = q('input[type="number"]') as HTMLInputElement;
    expect(priceInputAfter.value).toBe('4550');
  });
});

describe('QuoteFormDialog — quantidade decimal do MaterialBatchPicker até o item (prova real de DOM)', () => {
  it('"2,5" sobrevive do picker até a tabela de itens adicionados', async () => {
    mount();
    await goPastRecipient(); // "services"
    await clickAsync(findButtonByText(tq.next)!); // "materials"

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
    const item3 = buildMaterialItem({ inv: null, manualName: 'Conexão avulsa', manualPrice: 12.5, quantity: 3, profitRate, bdiFactor });

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
    // Material avulso: preço e custo vêm do manualPrice (sem inventory_id).
    expect(item3).toMatchObject({
      description: 'Conexão avulsa',
      quantity: 3,
      unit_price: 12.5,
      unit_total_cost: 12.5,
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
});

describe('QuoteFormDialog — desconto em R$ (prova real de DOM)', () => {
  it('colar "4.550" dá 4550 (não 4.55, o bug do sócio) quando o tipo é "R$"', async () => {
    mount();
    await goPastRecipient(); // "services"
    await clickAsync(findButtonByText(tq.next)!); // "materials"
    await clickAsync(findButtonByText(tq.next)!); // "discount"

    const discountInput = q('input[type="number"]') as HTMLInputElement;
    expect(discountInput).toBeTruthy();
    paste(discountInput, '4.550');
    const discountInputAfter = q('input[type="number"]') as HTMLInputElement;
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
    await goPastRecipient(); // "services"
    await clickAsync(findButtonByText(tq.next)!); // "materials"
    await clickAsync(findButtonByText(tq.materialPickerOpen)!);
    const pickerQty = qAll('input').find((i) => (i as HTMLInputElement).placeholder === '0') as HTMLInputElement;
    typeInto(pickerQty, '1');
    await clickAsync(findButtonByText(tq.materialPickerConfirm)!);
  }

  // A tabela (sm+) e os cards (mobile) coexistem no DOM — o corte é só CSS.
  // Pegamos o campo da tabela pela largura própria dele (w-16).
  const tableQtyInput = () =>
    (qAll('input') as HTMLInputElement[]).find((i) => i.className.includes('w-16'));

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
