// Prova de DOM real (não só função pura) de que o campo de salário base do
// MonthlyCostCalculatorModal (o motor usado a partir do "calculadora de
// custo mensal" dentro do LaborCalculatorModal) está livre do defeito mais
// leve da máscara de centavos: colar um valor pronto (ex. "4.550" copiado de
// planilha) pela mesma regra de "dígitos = centavos" da digitação daria
// R$ 45,50 — 100x menor (não é o bug do <input type="number"> de 1000x, mas
// ainda é dinheiro errado). `onPaste` intercepta e reinterpreta o texto
// colado como valor de verdade via `readPastedCents`
// (`src/lib/money-paste-mask.ts`), igual ao `ContaFormDialog.tsx`.
//
// Driver mínimo com createRoot + act (mesmo padrão de
// ContaFormDialog.test.tsx — o repo não usa @testing-library/react).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/hooks/useFiscalSettings', () => ({
  useFiscalSettings: () => ({ settings: null }),
}));

import { MonthlyCostCalculatorModal } from './MonthlyCostCalculatorModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(
      <MonthlyCostCalculatorModal
        open
        onOpenChange={() => {}}
        onApply={() => {}}
      />
    );
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

function getSalaryInput() {
  return document.querySelector('input[placeholder="R$ 0,00"]') as HTMLInputElement;
}

describe('MonthlyCostCalculatorModal — CurrencyField do salário base (prova real de DOM)', () => {
  it('digitar "455000" continua dando R$ 4.550,00 (centavos, comportamento inalterado)', () => {
    mount();
    const input = getSalaryInput();
    expect(input).toBeTruthy();
    typeInto(input, '455000');
    expect(input.value).toBe('R$ 4.550,00');
  });

  it('colar "R$ 4.550" (valor pronto, sem centavos) dá R$ 4.550,00 — não R$ 45,50 (defeito da máscara)', () => {
    mount();
    const input = getSalaryInput();
    paste(input, 'R$ 4.550');
    expect(input.value).toBe('R$ 4.550,00');
  });

  it('colar "1.234,56" dá R$ 1.234,56', () => {
    mount();
    const input = getSalaryInput();
    paste(input, '1.234,56');
    expect(input.value).toBe('R$ 1.234,56');
  });
});
