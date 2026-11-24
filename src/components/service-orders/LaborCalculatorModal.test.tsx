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

let mockedEmployees: any[] = [];
vi.mock('@/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: mockedEmployees }) }));
// Custo-hora vem da RPC get_employee_hourly_costs (qualquer membro). A função
// pura de conversão é a real.
let mockedHourlyCosts = new Map<string, number>();
vi.mock('@/hooks/useEmployeeHourlyCosts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useEmployeeHourlyCosts')>();
  return { ...actual, useEmployeeHourlyCosts: () => ({ hourlyCosts: mockedHourlyCosts, isLoading: false }) };
});
let mockedCanManageEmployees = false;
vi.mock('@/hooks/useCanManageEmployees', () => ({ useCanManageEmployees: () => mockedCanManageEmployees }));
const updateSpy = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (payload: unknown) => {
        updateSpy(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));
let mockedCompanyMonthlyHours = 176;
vi.mock('@/hooks/useEmployeeWorkHours', () => ({ useEmployeeWorkHours: () => ({ monthlyHours: mockedCompanyMonthlyHours }) }));
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

function renderModal(open: boolean) {
  act(() => {
    root.render(<LaborCalculatorModal open={open} onOpenChange={() => {}} onApply={() => {}} />);
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
  mockedCompanyMonthlyHours = 176;
  mockedEmployees = [];
  mockedHourlyCosts = new Map();
  mockedCanManageEmployees = false;
  updateSpy.mockClear();
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
    const salaryInput = moneyInputs().find(i => i.getAttribute('aria-label') === 'Custo mensal');
    expect(salaryInput).toBeTruthy();

    paste(salaryInput!, 'R$ 4.550');
    expect(salaryInput!.value).toBe('4550');
  });

  it('digitar continua number nativo (comportamento inalterado)', () => {
    mount();
    const salaryInput = moneyInputs().find(i => i.getAttribute('aria-label') === 'Custo mensal')!;
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

describe('LaborCalculatorModal — jornada mensal configurada', () => {
  it('não sobrescreve a edição manual quando a configuração da empresa resolve', () => {
    mount();
    const monthlyHoursInput = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
    expect(monthlyHoursInput.value).toBe('176');

    typeInto(monthlyHoursInput, '144');
    mockedCompanyMonthlyHours = 220;
    renderModal(true);
    expect(monthlyHoursInput.value).toBe('144');

    renderModal(false);
    renderModal(true);
    const reopenedInput = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
    expect(reopenedInput.value).toBe('220');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Custo-hora do cadastro (fase B da leitura de RH): a calculadora não lê mais
// salário/custo mensal do funcionário. Prova de que o resultado numérico é o
// MESMO da conta antiga (custo mensal ÷ horas mensais informadas), inclusive
// com horas mensais alteradas à mão.
// ─────────────────────────────────────────────────────────────────────────────
import { formatMoney } from '@/lib/format';

function selectEmployee(name: string) {
  const toggle = Array.from(document.querySelectorAll('button')).find((b) => b.querySelector('svg.lucide-chevrons-up-down'));
  expect(toggle).toBeTruthy();
  act(() => { toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const option = Array.from(document.querySelectorAll('[cmdk-item]')).find((el) => el.textContent?.includes(name)) as HTMLElement | undefined;
  expect(option).toBeTruthy();
  act(() => { option!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function applyButtonText() {
  return Array.from(document.querySelectorAll('button')).map((b) => b.textContent ?? '').find((t) => t.includes('/h') || t.includes('R$')) ?? '';
}

const brl = (v: number) => formatMoney(v, 'BRL', 'pt-br');

// jsdom não tem ResizeObserver nem scrollIntoView, que o cmdk (lista do combobox) usa.
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
(Element.prototype as any).scrollIntoView ??= function scrollIntoView() {};

/** Conta ANTIGA: custo mensal do cadastro ÷ horas mensais informadas. */
const oldRate = (monthlyCost: number, informedHours: number) => monthlyCost / informedHours;

describe('LaborCalculatorModal — custo-hora do cadastro, sem ler salário', () => {
  const ANA = {
    id: 'e1', name: 'Ana Souza', position: 'Técnica', is_active: true,
    // Não-RH recebe estes campos em null: a calculadora não pode depender deles.
    salary: null, monthly_cost: null, monthly_cost_breakdown: null,
  };

  it('mesma taxa do cálculo antigo com as horas da empresa (176h)', () => {
    mockedEmployees = [ANA];
    mockedHourlyCosts = new Map([['e1', 4550 / 176]]); // o que a RPC devolve
    mount();
    selectEmployee('Ana Souza');

    const monthlyCost = moneyInputs().find((i) => i.getAttribute('aria-label') === 'Custo mensal')!;
    expect(monthlyCost.value).toBe('4550');
    expect(applyButtonText()).toContain(brl(oldRate(4550, 176)));
  });

  it('respeita as horas mensais trocadas à mão (taxa = custo-hora × horas da empresa ÷ horas informadas)', () => {
    mockedCompanyMonthlyHours = 220;
    mockedEmployees = [ANA];
    mockedHourlyCosts = new Map([['e1', 4550 / 220]]); // banco usa a jornada da empresa (220h)
    mount();
    // Jornada da empresa resolvida no campo.
    const monthlyHoursInput = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
    expect(monthlyHoursInput.value).toBe('220');
    selectEmployee('Ana Souza');
    typeInto(monthlyHoursInput, '200');

    expect(monthlyHoursInput.value).toBe('200');
    // Antiga: 4550 / 200 = 22,75 por hora.
    expect(applyButtonText()).toContain(brl(oldRate(4550, 200)));
    expect(brl(oldRate(4550, 200))).toBe(brl(22.75));
  });

  it('a lista mostra o custo-hora, nunca o custo mensal', () => {
    mockedEmployees = [ANA];
    mockedHourlyCosts = new Map([['e1', 4550 / 176]]);
    mount();
    const toggle = Array.from(document.querySelectorAll('button')).find((b) => b.querySelector('svg.lucide-chevrons-up-down'))!;
    act(() => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const option = Array.from(document.querySelectorAll('[cmdk-item]')).find((el) => el.textContent?.includes('Ana Souza'))!;
    expect(option.textContent).toContain(`${brl(4550 / 176)}/h`);
    expect(option.textContent).not.toContain(brl(4550));
  });

  it('digitar o custo mensal substitui o do cadastro', () => {
    mockedEmployees = [ANA];
    mockedHourlyCosts = new Map([['e1', 4550 / 176]]);
    mount();
    selectEmployee('Ana Souza');
    const monthlyCost = moneyInputs().find((i) => i.getAttribute('aria-label') === 'Custo mensal')!;
    typeInto(monthlyCost, '3520');
    expect(monthlyCost.value).toBe('3520');
    expect(applyButtonText()).toContain(brl(oldRate(3520, 176)));
  });
});
