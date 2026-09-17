// Prova de DOM real (não só função pura) de que o campo de edição de
// "Salário Fixo" em SalespersonPaymentControl está livre do bug de mil vezes:
// <input type="number"> aceitava colar "4.550" como float válido do HTML, e
// Number("4.550") devolvia 4.55 — mil vezes menor. Este é o campo mais crítico
// da leva: ele grava o salário que de fato compõe o total pago a um vendedor.
//
// Driver mínimo com createRoot + act, mesmo padrão de
// ContaFormDialog.test.tsx (o repo não usa @testing-library/react).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Salesperson } from '@/hooks/useSalespersonData';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

const saveMutateAsync = vi.fn().mockResolvedValue({});

vi.mock('@/hooks/useSalespersonData', () => ({
  useCreatePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveSalesperson: () => ({ mutateAsync: saveMutateAsync, isPending: false }),
  useUpdatePaymentDate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  commissionForPerson: () => 0,
  salesForPerson: () => [],
}));

import { SalespersonPaymentControl } from './SalespersonPaymentControl';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const salesperson: Salesperson = {
  id: 'sp-1',
  name: 'João Vendedor',
  email: null,
  phone: null,
  salary: 3000,
  monthly_goal: 10,
  is_active: true,
  no_commission: false,
  referral_code: null,
  notes: null,
  photo_url: null,
  role: 'closer' as any,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function mount() {
  act(() => {
    root.render(
      <SalespersonPaymentControl salesperson={salesperson} allSales={[]} allAdvances={[]} payments={[]} />,
    );
  });
}

function paste(input: HTMLInputElement, text: string) {
  // Ao contrário do NumericInput (que MESCLA o texto colado na posição do
  // cursor/seleção), a máscara de centavos (`readPastedCents`) SUBSTITUI o
  // campo inteiro no paste — não precisa simular seleção prévia pra colar por
  // cima de "3.000" (salário atual já preenchido) sem grudar dígitos.
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

function clickButtonWithText(text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLButtonElement;
  act(() => {
    button.click();
  });
}

beforeEach(() => {
  saveMutateAsync.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SalespersonPaymentControl — edição de salário fixo (prova real de DOM)', () => {
  it('não usa mais <input type="number"> (o bug do sócio nasceu daí)', () => {
    mount();
    clickButtonWithText('Editar');
    const input = container.querySelector('#sp-salary-edit') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe('text');
  });

  it('digitar "455000" dá 4.550,00 (centavos, mesmo padrão dos outros campos de dinheiro)', () => {
    mount();
    clickButtonWithText('Editar');
    const input = container.querySelector('#sp-salary-edit') as HTMLInputElement;
    typeInto(input, '455000');
    expect(input.value).toBe('4.550,00');
  });

  it('colar "R$ 4.550" SEM selecionar o valor atual ("3.000") substitui tudo, não gruda dígitos', () => {
    mount();
    clickButtonWithText('Editar');
    const input = container.querySelector('#sp-salary-edit') as HTMLInputElement;
    expect(input.value).toBe('3.000,00'); // valor atual do vendedor, pré-preenchido
    paste(input, 'R$ 4.550');
    expect(input.value).toBe('4.550,00'); // substituído, não "3.0004.550" nem outro glued value
  });

  it('salvar após colar "R$ 4.550" envia salary=4550 pro hook (não 4.55) — dinheiro pago de verdade ao vendedor', async () => {
    mount();
    clickButtonWithText('Editar');
    const input = container.querySelector('#sp-salary-edit') as HTMLInputElement;
    paste(input, 'R$ 4.550');

    await act(async () => {
      clickButtonWithText('Salvar');
    });

    expect(saveMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-1', salary: 4550 }),
    );
  });
});
