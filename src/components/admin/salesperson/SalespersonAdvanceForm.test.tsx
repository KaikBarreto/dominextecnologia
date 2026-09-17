// Prova de DOM real (não só função pura) de que o campo "Valor (R$)" de
// SalespersonAdvanceForm (vale/adiantamento a vendedor) está livre do bug de
// mil vezes: <input type="number"> aceitava colar "4.550" como float válido
// do HTML, e Number("4.550") devolvia 4.55 — mil vezes menor. Aqui é dinheiro
// real que sai como adiantamento a uma pessoa, por isso a prova cobre o
// evento de colar de verdade no elemento renderizado, não a função de
// sanitização isolada.
//
// Driver mínimo com createRoot + act, mesmo padrão de
// ContaFormDialog.test.tsx e numeric-input-paste-proof.test.tsx (o repo não
// usa @testing-library/react).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mutateAsync = vi.fn().mockResolvedValue({});

vi.mock('@/hooks/useSalespersonData', () => ({
  useCreateAdvance: () => ({ mutateAsync, isPending: false }),
}));

import { SalespersonAdvanceForm } from './SalespersonAdvanceForm';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<SalespersonAdvanceForm salespersonId="sp-1" salespersonName="Fulano" />);
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

function submitForm(container: HTMLDivElement) {
  const form = container.querySelector('form') as HTMLFormElement;
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  mutateAsync.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SalespersonAdvanceForm — campo de valor do vale (prova real de DOM)', () => {
  it('não usa mais <input type="number"> (o bug do sócio nasceu daí)', () => {
    mount();
    const input = container.querySelector('#amount') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe('text');
  });

  it('digitar "455000" dá 4.550,00 (centavos, mesmo padrão dos outros campos de dinheiro)', () => {
    mount();
    const input = container.querySelector('#amount') as HTMLInputElement;
    typeInto(input, '455000');
    expect(input.value).toBe('4.550,00');
  });

  it('colar "R$ 4.550" (valor pronto, sem centavos) dá 4.550,00, não 4,55 e não 45,50', () => {
    mount();
    const input = container.querySelector('#amount') as HTMLInputElement;
    paste(input, 'R$ 4.550');
    expect(input.value).toBe('4.550,00');
  });

  it('registrar vale após colar "R$ 4.550" envia amount=4550 pro hook (não 4.55)', async () => {
    mount();
    const input = container.querySelector('#amount') as HTMLInputElement;
    paste(input, 'R$ 4.550');
    await act(async () => {
      submitForm(container);
    });
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4550 }),
    );
  });

  it('colar "1.234,56" dá 1.234,56', () => {
    mount();
    const input = container.querySelector('#amount') as HTMLInputElement;
    paste(input, '1.234,56');
    expect(input.value).toBe('1.234,56');
  });
});
