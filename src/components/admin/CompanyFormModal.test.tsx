// Prova de DOM real (não só função pura) de que os DOIS campos "Valor (R$)"
// de CompanyFormModal estão livres do bug de mil vezes:
// <input type="number"> aceitava colar "4.550" como float válido do HTML, e
// `parseFloat`/`Number` liam ponto como decimal e devolviam 4.55 — mil vezes
// menor. Os dois campos escrevem no mesmo `formData.subscription_value`
// (valor da assinatura da empresa), um sempre editável (plano com preço
// personalizado ligado) e outro editável só quando o plano é "personalizado"
// e o preço personalizado está desligado (não é um mero espelho estático —
// por isso os dois precisam do mesmo tratamento de paste).
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

const { EMPTY_ARRAY, QUERY_RESULT, MUTATION_RESULT } = vi.hoisted(() => {
  const EMPTY_ARRAY: any[] = [];
  return {
    EMPTY_ARRAY,
    QUERY_RESULT: { data: EMPTY_ARRAY },
    MUTATION_RESULT: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => QUERY_RESULT,
  useMutation: () => MUTATION_RESULT,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
  useIsCompact: () => false,
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'admin-1' } }),
}));
vi.mock('@/hooks/useNfseTiers', () => ({
  useNfseTiers: () => ({ tiers: EMPTY_ARRAY }),
}));
vi.mock('./ModuleGrid', () => ({
  useSubscriptionModules: () => QUERY_RESULT,
  withBaseModules: (s: string[]) => s,
  sumModulesPrice: () => 0,
  BASE_MODULE_CODES: EMPTY_ARRAY,
  ModuleGrid: () => null,
}));
vi.mock('./GenerateLinkModal', () => ({
  GenerateLinkModal: () => null,
}));

import CompanyFormModal from './CompanyFormModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(props: Partial<React.ComponentProps<typeof CompanyFormModal>> = {}) {
  act(() => {
    root.render(
      <CompanyFormModal open onOpenChange={() => {}} onSuccess={() => {}} {...props} />,
    );
  });
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

function clickTab(text: string) {
  // Radix Tabs troca de aba no `onMouseDown` (não `onClick`) — precisa
  // disparar o evento de verdade, `.click()` sozinho não muda a aba ativa.
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

describe('CompanyFormModal — campo "Valor (R$)" com preço personalizado ligado (prova real de DOM)', () => {
  it('não usa mais <input type="number"> (o bug do sócio nasceu daí)', () => {
    mount();
    clickTab('Comercial');
    const toggle = q('#use-custom-price') as HTMLButtonElement;
    act(() => { toggle.click(); });
    const input = q('#company-subscription-value-custom') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe('text');
  });

  it('colar "R$ 4.550" dá 4.550,00, não 4,55 e não 45,50', () => {
    mount();
    clickTab('Comercial');
    const toggle = q('#use-custom-price') as HTMLButtonElement;
    act(() => { toggle.click(); });
    const input = q('#company-subscription-value-custom') as HTMLInputElement;
    paste(input, 'R$ 4.550');
    expect(input.value).toBe('4.550,00');
  });
});

describe('CompanyFormModal — campo "Valor (R$)" do plano personalizado sem preço próprio (prova real de DOM)', () => {
  // Empresa já cadastrada no plano "personalizado" SEM preço personalizado
  // ligado: este campo fica editável (não é um mero espelho estático do
  // outro — ver comentário no handleSubmit) porque reflete a soma dos
  // módulos, mas o operador pode digitar/colar um valor diferente por cima.
  const company = { subscription_plan: 'personalizado', subscription_value: 500, custom_price: 0 };

  it('digitar "455000" dá 4.550,00 (centavos, mesmo padrão dos outros campos de dinheiro)', () => {
    mount({ company });
    clickTab('Comercial');
    const input = q('#company-subscription-value-default') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    typeInto(input, '455000');
    expect(input.value).toBe('4.550,00');
  });

  it('colar "R$ 4.550" dá 4.550,00, não 4,55 e não 45,50', () => {
    mount({ company });
    clickTab('Comercial');
    const input = q('#company-subscription-value-default') as HTMLInputElement;
    paste(input, 'R$ 4.550');
    expect(input.value).toBe('4.550,00');
  });
});
