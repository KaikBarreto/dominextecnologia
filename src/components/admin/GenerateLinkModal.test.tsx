// Prova de DOM real (não só função pura) de que os DOIS campos "Valor (R$)"
// de preço personalizado em GenerateLinkModal (link de assinatura Auctus)
// estão livres do bug de mil vezes: <input type="number"> aceitava colar
// "4.550" como float válido do HTML, e `parseFloat` lia ponto como decimal e
// devolvia 4.55 — mil vezes menor. Os dois campos (aba "Plano" e aba
// "Personalizado") escrevem no MESMO estado `customPriceValue`.
//
// Máscara de centavos + `onPaste` (`src/lib/money-paste-mask.ts`), igual aos
// demais campos de dinheiro da leva — não `NumericInput` (dinheiro tem
// formatação própria, régua da casa).
//
// Driver mínimo com createRoot + act (o repo não usa @testing-library/react).
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

const { EMPTY_ARRAY, QUERY_RESULT } = vi.hoisted(() => {
  const EMPTY_ARRAY: any[] = [];
  return { EMPTY_ARRAY, QUERY_RESULT: { data: EMPTY_ARRAY } };
});

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => QUERY_RESULT,
}));
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
  useIsCompact: () => false,
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('./ModuleGrid', () => ({
  useSubscriptionModules: () => QUERY_RESULT,
  withBaseModules: (s: string[]) => s,
  sumModulesPrice: () => 0,
  BASE_MODULE_CODES: EMPTY_ARRAY,
  ModuleGrid: () => null,
}));

import { GenerateLinkModal } from './GenerateLinkModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<GenerateLinkModal open onOpenChange={() => {}} />);
  });
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

function click(el: HTMLElement) {
  act(() => { el.click(); });
}

// Radix Tabs troca de aba no `onMouseDown` (não `onClick`) — precisa
// disparar o evento de verdade, `.click()` sozinho não muda a aba ativa.
function clickTab(text: string) {
  const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLElement;
  act(() => {
    tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  });
}

function paste(input: HTMLInputElement, text: string) {
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent & { clipboardData: any };
  pasteEvent.clipboardData = { getData: () => text };
  act(() => {
    input.dispatchEvent(pasteEvent);
  });
}

function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
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

describe('GenerateLinkModal — campo de preço personalizado, aba "Plano" (prova real de DOM)', () => {
  it('não usa mais <input type="number"> (o bug do sócio nasceu daí)', () => {
    mount();
    clickTab('Comercial');
    click(q('#plano')!.closest('div')!); // clica no cartão do modo "Plano"
    click(q('#use-custom-price-link')!);
    const input = q('#link-custom-price-plano') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe('text');
  });

  it('digitar "455000" dá 4.550,00 (centavos, mesmo padrão dos outros campos de dinheiro)', () => {
    mount();
    clickTab('Comercial');
    click(q('#plano')!.closest('div')!);
    click(q('#use-custom-price-link')!);
    const input = q('#link-custom-price-plano') as HTMLInputElement;
    typeInto(input, '455000');
    expect(input.value).toBe('4.550,00');
  });

  it('colar "R$ 4.550" dá 4.550,00, não 4,55 e não 45,50', () => {
    mount();
    clickTab('Comercial');
    click(q('#plano')!.closest('div')!);
    click(q('#use-custom-price-link')!);
    const input = q('#link-custom-price-plano') as HTMLInputElement;
    paste(input, 'R$ 4.550');
    expect(input.value).toBe('4.550,00');
  });
});

describe('GenerateLinkModal — campo de preço personalizado, aba "Personalizado" (prova real de DOM)', () => {
  it('colar "R$ 4.550" dá 4.550,00, não 4,55 e não 45,50 — mesmo estado da outra aba', () => {
    mount();
    clickTab('Comercial');
    click(q('#personalizado')!.closest('div')!);
    click(q('#use-custom-price-link-personalizado')!);
    const input = q('#link-custom-price-personalizado') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe('text');
    paste(input, 'R$ 4.550');
    expect(input.value).toBe('4.550,00');
  });
});
