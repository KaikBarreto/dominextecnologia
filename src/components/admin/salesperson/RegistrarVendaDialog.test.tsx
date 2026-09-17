// Prova de DOM real (não só função pura) de que o campo "Valor (R$)" de
// RegistrarVendaDialog está livre do bug de mil vezes:
// <input type="number"> aceitava colar "4.550" como float válido do HTML, e
// Number("4.550") devolvia 4.55 — mil vezes menor. Este é o campo MAIS grave
// da leva: alimenta direto `calculateCommission` — uma venda registrada 1000x
// menor distorce a comissão de closer e SDR naquele mês.
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

const createSaleMutateAsync = vi.fn().mockResolvedValue({ id: 'sale-1' });
const EMPTY_ARRAY: any[] = [];

vi.mock('@/hooks/useSalespersonData', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useSalespersonData')>('@/hooks/useSalespersonData');
  return {
    ...actual,
    useSalespeopleBasic: () => ({ data: [{ id: 'closer-1', name: 'Fulano', role: 'closer', photo_url: null }], isLoading: false }),
    useCreateSale: () => ({ mutateAsync: createSaleMutateAsync, isPending: false }),
  };
});
vi.mock('@/hooks/useAdminPermissions', () => ({
  useAdminPermissions: () => ({ linkedSalespersonId: null }),
}));

import { RegistrarVendaDialog } from './RegistrarVendaDialog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<RegistrarVendaDialog open onOpenChange={() => {}} />);
  });
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

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

beforeEach(() => {
  createSaleMutateAsync.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('RegistrarVendaDialog — campo de valor da venda (prova real de DOM)', () => {
  it('não usa mais <input type="number"> (o bug do sócio nasceu daí)', () => {
    mount();
    const input = q('#rv-amount') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe('text');
  });

  it('digitar "455000" dá 4.550,00 (centavos, mesmo padrão dos outros campos de dinheiro)', () => {
    mount();
    const input = q('#rv-amount') as HTMLInputElement;
    typeInto(input, '455000');
    expect(input.value).toBe('4.550,00');
  });

  it('colar "R$ 4.550" (valor pronto, sem centavos) dá 4.550,00 — não 4,55 e não 45,50', () => {
    mount();
    const input = q('#rv-amount') as HTMLInputElement;
    paste(input, 'R$ 4.550');
    expect(input.value).toBe('4.550,00');
  });

  it('registrar venda após colar "R$ 4.550" envia amount=4550 e comissão calculada sobre 4550 (não 4.55)', async () => {
    mount();
    const input = q('#rv-amount') as HTMLInputElement;
    paste(input, 'R$ 4.550');

    // Seleciona o closer via <select> nativo por trás do Radix Select é
    // complexo no jsdom; setamos via clique no trigger + item usando o texto.
    const closerTrigger = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Selecione o closer'),
    ) as HTMLButtonElement;
    act(() => { closerTrigger.click(); });
    const closerItem = Array.from(document.querySelectorAll('[role="option"]')).find((el) =>
      el.textContent?.includes('Fulano'),
    ) as HTMLElement;
    act(() => { closerItem.click(); });

    const saveButton = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Registrar Venda',
    ) as HTMLButtonElement;
    await act(async () => {
      saveButton.click();
    });

    expect(createSaleMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4550 }),
    );
  });
});
