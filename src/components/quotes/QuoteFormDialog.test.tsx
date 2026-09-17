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
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: new Proxy({}, { get: () => ((props: any) => React.createElement('div', props, props.children)) }),
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

import { QuoteFormDialog } from './QuoteFormDialog';

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

describe('QuoteFormDialog — preço manual de material (prova real de DOM)', () => {
  it('colar "4.550" dá 4550 (não 4.55, o bug do sócio)', async () => {
    mount();
    await goPastRecipient(); // "services"
    const nextBtn1 = findButtonByText(tq.next);
    await clickAsync(nextBtn1!); // "materials"

    const manualNameInput = q('input[placeholder="' + tq.materialManualPlaceholder + '"]') as HTMLInputElement;
    expect(manualNameInput).toBeTruthy();
    typeInto(manualNameInput, 'Material Avulso');

    const priceInput = q('input[type="number"]') as HTMLInputElement;
    expect(priceInput).toBeTruthy();
    paste(priceInput, '4.550');
    const priceInputAfter = q('input[type="number"]') as HTMLInputElement;
    expect(priceInputAfter.value).toBe('4550');
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
