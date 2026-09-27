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
import type { FinancialTransaction } from '@/types/database';

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
  CustomerSelectField: ({ value, onValueChange }: { value?: string; onValueChange: (value: string) => void }) => (
    <input
      aria-label="customer-field"
      value={value ?? ''}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
}));
vi.mock('@/components/financial/SupplierSelectField', () => ({
  SupplierSelectField: ({ value, onValueChange }: { value?: string; onValueChange: (value: string) => void }) => (
    <input
      aria-label="supplier-field"
      value={value ?? ''}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
}));
vi.mock('@/components/financial/CategorySelectField', () => ({
  CategorySelectField: () => null,
}));
vi.mock('@/components/financial/BankInstitutionCombobox', () => ({
  BankLogo: () => null,
}));

import { ContaFormDialog } from './ContaFormDialog';
import { MESSAGES } from '@/lib/i18n/messages';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const t = MESSAGES['pt-br'].app.finance.contaForm;

function mount(defaultType: 'entrada' | 'saida' = 'saida', editingTransaction?: FinancialTransaction) {
  act(() => {
    root.render(
      <ContaFormDialog
        open
        onOpenChange={() => {}}
        defaultType={defaultType}
        editingTransaction={editingTransaction}
      />,
    );
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

function sectionByTitle(title: string): HTMLElement {
  const section = Array.from(document.querySelectorAll('section'))
    .find((item) => Array.from(item.querySelectorAll('h3, button span'))
      .some((heading) => heading.textContent?.trim() === title)) as HTMLElement | undefined;
  if (!section) throw new Error(`Seção não encontrada: ${title}`);
  return section;
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button'))
    .find((item) => item.textContent?.trim() === text) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Botão não encontrado: ${text}`);
  return button;
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

describe('ContaFormDialog — tipo, vínculos e responsividade', () => {
  it('troca o select por cards acessíveis e saturados de A receber/A pagar', () => {
    mount('saida');

    const receivable = buttonByText(t.types.entrada);
    const payable = buttonByText(t.types.saida);
    expect(receivable.getAttribute('aria-pressed')).toBe('false');
    expect(payable.getAttribute('aria-pressed')).toBe('true');
    expect(payable.className).toContain('bg-destructive');

    act(() => receivable.click());
    expect(receivable.getAttribute('aria-pressed')).toBe('true');
    expect(receivable.className).toContain('bg-success');
  });

  it('prioriza Cliente em A receber e Fornecedor em A pagar', () => {
    mount('entrada');
    const main = sectionByTitle(t.sections.whatIsIt);
    const details = sectionByTitle(t.sections.moreDetails);
    expect(main.querySelector('[aria-label="customer-field"]')).toBeTruthy();
    expect(main.querySelector('[aria-label="supplier-field"]')).toBeNull();
    expect(details.querySelector('[aria-label="supplier-field"]')).toBeTruthy();

    act(() => buttonByText(t.types.saida).click());
    expect(main.querySelector('[aria-label="supplier-field"]')).toBeTruthy();
    expect(sectionByTitle(t.sections.moreDetails).querySelector('[aria-label="customer-field"]')).toBeTruthy();
  });

  it('preserva e revela o vínculo ao trocar o tipo', () => {
    mount('entrada');
    const customer = document.querySelector('[aria-label="customer-field"]') as HTMLInputElement;
    typeInto(customer, 'customer-1');

    act(() => buttonByText(t.types.saida).click());

    const details = sectionByTitle(t.sections.moreDetails);
    const movedCustomer = details.querySelector('[aria-label="customer-field"]') as HTMLInputElement;
    expect(movedCustomer.value).toBe('customer-1');
    expect(details.lastElementChild?.className).not.toContain('hidden');
  });

  it('em edição mantém os dois vínculos visíveis nos blocos corretos', () => {
    mount('saida', {
      id: 'txn-1',
      transaction_type: 'saida',
      description: 'Compra de material',
      amount: 100,
      due_date: '2026-09-27',
      transaction_date: '2026-09-27',
      is_paid: false,
      account_id: 'acc-1',
      customer_id: 'customer-1',
      supplier_id: 'supplier-1',
    } as FinancialTransaction);

    const main = sectionByTitle(t.sections.whatIsIt);
    const details = sectionByTitle(t.sections.moreDetails);
    expect((main.querySelector('[aria-label="supplier-field"]') as HTMLInputElement).value).toBe('supplier-1');
    expect((details.querySelector('[aria-label="customer-field"]') as HTMLInputElement).value).toBe('customer-1');
    expect(details.lastElementChild?.className).not.toContain('hidden');
  });

  it('empilha ações e recorrência no mobile', () => {
    mount();
    const footer = buttonByText(t.cancelLabel).parentElement;
    expect(footer?.className).toContain('flex-col-reverse');
    expect(footer?.className).toContain('sm:flex-row');

    const recurrenceSection = sectionByTitle(t.sections.installmentsOrRecurrence);
    const recurrenceGrid = recurrenceSection.querySelector('.grid');
    expect(recurrenceGrid?.className).toContain('grid-cols-1');
    expect(recurrenceGrid?.className).toContain('sm:grid-cols-2');
  });
});
