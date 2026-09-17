// Prova de DOM real (não só função pura) de que os dois campos de dinheiro
// por trabalhador do LaborCalculatorModal (custo mensal e valor fixo por
// serviço) estão livres do bug de "mil vezes" do <input type="number">
// (2026-09-17, "PMOC - Daluz Freguesia": colar "4.550" virou R$ 4,55, porque
// o input nativo lê ponto como separador decimal do HTML e normaliza pra
// 4.55). DIGITAR continua exatamente como sempre foi (number nativo); só o
// COLAR passa a ser interceptado via `readPastedCents`
// (`src/lib/money-paste-mask.ts`).
//
// Driver mínimo com createRoot + act (mesmo padrão de
// ContaFormDialog.test.tsx — o repo não usa @testing-library/react).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: [] }) }));
vi.mock('@/hooks/useEmployeeWorkHours', () => ({ useEmployeeWorkHours: () => ({ monthlyHours: 176 }) }));
// Sub-modal não é o alvo deste teste (tem sua própria prova em
// MonthlyCostCalculatorModal.test.tsx) — stub pra não puxar useFiscalSettings/react-query aqui.
vi.mock('./MonthlyCostCalculatorModal', () => ({
  MonthlyCostCalculatorModal: () => null,
}));

import { LaborCalculatorModal } from './LaborCalculatorModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<LaborCalculatorModal open onOpenChange={() => {}} onApply={() => {}} />);
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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

function moneyInputs() {
  return Array.from(document.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
}

describe('LaborCalculatorModal — campos de dinheiro por trabalhador (prova real de DOM)', () => {
  it('colar "R$ 4.550" no custo mensal dá 4550, não 4.55 (bug do sócio)', () => {
    mount();
    // Único trabalhador nasce sem custo fixo: campo visível é "Custo mensal".
    const salaryInput = moneyInputs().find(i => i.placeholder === 'Ex: 3500');
    expect(salaryInput).toBeTruthy();

    paste(salaryInput!, 'R$ 4.550');
    expect(salaryInput!.value).toBe('4550');
  });

  it('digitar continua number nativo (comportamento inalterado)', () => {
    mount();
    const salaryInput = moneyInputs().find(i => i.placeholder === 'Ex: 3500')!;
    expect(salaryInput.type).toBe('number');
  });

  it('colar "R$ 4.550" no custo fixo por serviço dá 4550, não 4.55', () => {
    mount();
    // Ativa o toggle "Valor fixo por serviço" pra revelar o campo de custo
    // fixo (id do trabalhador é gerado por contador de módulo, não fixo).
    const toggle = document.querySelector('[id^="fixed-"]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    act(() => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const fixedInput = moneyInputs().find(i => i.placeholder === 'Ex: 150');
    expect(fixedInput).toBeTruthy();

    paste(fixedInput!, 'R$ 4.550');
    expect(fixedInput!.value).toBe('4550');
  });
});
