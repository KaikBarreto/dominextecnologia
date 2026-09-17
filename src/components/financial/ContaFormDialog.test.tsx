// Prova de DOM real (não só a função pura) de que o campo de valor do
// ContaFormDialog está livre dos dois bugs de dinheiro desta leva:
//
// 1. O `<input type="number">` que causou o incidente real (2026-09-17,
//    "PMOC - Daluz Freguesia": colar "4.550" virou R$ 4,55 — mil vezes
//    menor, porque o input nativo lê ponto como separador decimal do HTML).
//    Aqui o campo já é `type="text"` com máscara de centavos — provamos que
//    DIGITAR continua funcionando como sempre funcionou.
// 2. O defeito mais leve da própria máscara de centavos: colar um valor
//    pronto sem passar pelo `onPaste` dedicado trataria "4.550" como
//    dígitos-cents e devolveria R$ 45,50 (100x menor). Provamos que colar
//    de verdade (evento `paste` real, não só chamar a função pura) cai no
//    `onPaste` (`readPastedCents`, ver `src/lib/money-paste-mask.ts`) e dá
//    R$ 4.550,00.
//
// Driver mínimo com createRoot + act, mesmo padrão de
// `ChargeDialog.test.tsx` e `numeric-input-paste-proof.test.tsx` (o repo não
// usa @testing-library/react). O modal do Radix (desktop, jsdom >=1024px)
// renderiza via Portal em document.body.
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

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    isLoading: false,
    setUserLanguage: async () => {},
  }),
}));

vi.mock('@/hooks/useFinancial', () => ({
  useFinancial: () => ({
    createTransaction: { mutateAsync: vi.fn(), isPending: false },
    updateTransaction: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: [] }) }));
vi.mock('@/hooks/useContracts', () => ({ useContracts: () => ({ contracts: [] }) }));
vi.mock('@/hooks/useCustomers', () => ({ useCustomers: () => ({ customers: [] }) }));
vi.mock('@/hooks/useSuppliers', () => ({ useSuppliers: () => ({ suppliers: [] }) }));
vi.mock('@/hooks/useFinancialAccounts', () => ({
  useFinancialAccounts: () => ({
    accounts: [{ id: 'acc-1', name: 'Caixa', is_active: true, institution_code: null, institution_name: null, bank_name: null, color: '#000000' }],
  }),
}));
vi.mock('@/hooks/useCostCenters', () => ({ useCostCenters: () => ({ activeCostCenters: [] }) }));

// Stand-ins leves — o que importa aqui é o campo de valor, não os combobox.
vi.mock('@/components/customers/CustomerSelectField', () => ({
  CustomerSelectField: () => null,
}));
vi.mock('@/components/financial/SupplierSelectField', () => ({
  SupplierSelectField: () => null,
}));
vi.mock('@/components/financial/CategorySelectField', () => ({
  CategorySelectField: () => null,
}));
vi.mock('@/components/financial/BankInstitutionCombobox', () => ({
  BankLogo: () => null,
}));

import { ContaFormDialog } from './ContaFormDialog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<ContaFormDialog open onOpenChange={() => {}} />);
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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('ContaFormDialog — campo de valor (prova real de DOM)', () => {
  it('não usa mais <input type="number"> (o bug do sócio nasceu daí)', () => {
    mount();
    const input = q('#conta-amount') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe('text');
  });

  it('digitar "455000" continua dando R$ 4.550,00 (centavos, comportamento inalterado)', () => {
    mount();
    const input = q('#conta-amount') as HTMLInputElement;
    typeInto(input, '455000');
    expect(input.value).toBe('4.550,00');
  });

  it('colar "R$ 4.550" (valor pronto, sem centavos) dá R$ 4.550,00 — não R$ 45,50 e não R$ 4,55', () => {
    mount();
    const input = q('#conta-amount') as HTMLInputElement;
    paste(input, 'R$ 4.550');
    expect(input.value).toBe('4.550,00');
  });

  it('colar "1.234,56" dá R$ 1.234,56', () => {
    mount();
    const input = q('#conta-amount') as HTMLInputElement;
    paste(input, '1.234,56');
    expect(input.value).toBe('1.234,56');
  });
});
