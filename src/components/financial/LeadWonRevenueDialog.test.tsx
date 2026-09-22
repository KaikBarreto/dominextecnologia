// Prova de DOM real de que o VALOR da receita é editável já no primeiro passo
// do "Oportunidade ganha" e de que o que foi digitado chega no formulário do
// Financeiro (passo 2).
//
// Bug real do sócio (2026-09-19): arrastou o card pro estágio Fechado, o modal
// ofereceu lançar a receita com o valor ESTIMADO da oportunidade (R$ 297,00) e
// não havia onde corrigir — o cliente tinha fechado por outro valor. O valor só
// era editável depois de clicar em "Sim", no passo 2, e ninguém descobria isso.
//
// Os casos abaixo prendem o que não pode regredir:
// 1) o campo nasce com o valor estimado da oportunidade;
// 2) o valor digitado (máscara de centavos) é o que vai pro passo 2;
// 3) COLAR um valor de planilha ("4.550") não vira R$ 45,50;
// 4) trocar de oportunidade não carrega o valor digitado na anterior.
//
// Driver mínimo com createRoot + act, mesmo padrão de ChargeDialog.test.tsx.
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

vi.mock('@/hooks/use-mobile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-mobile')>();
  return { ...actual, useIsMobile: () => false };
});

// Captura o `prefill` que o passo 2 recebe — é o contrato sob teste.
const capturedPrefill: { current: any } = { current: null };
const capturedRequireDueDate: { current: boolean | null } = { current: null };
vi.mock('@/components/financial/TransactionFormDialog', () => ({
  TransactionFormDialog: ({ open, prefill, requireDueDateWhenUnpaid }: any) => {
    if (open) {
      capturedPrefill.current = prefill;
      capturedRequireDueDate.current = requireDueDateWhenUnpaid;
    }
    return null;
  },
}));

vi.mock('@/hooks/useFinancial', () => ({
  useFinancial: () => ({
    createTransaction: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useLeadWonRevenue', () => ({ linkLeadWonTransaction: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { LeadWonRevenueDialog } from './LeadWonRevenueDialog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXT = {
  leadId: 'lead-1',
  leadTitle: 'Serviço de manutenção',
  customerId: 'cust-1',
  customerName: 'Bruno Guerra',
  suggestedAmount: 297,
};

let container: HTMLDivElement;
let root: Root;

const qAll = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

function render(context: any = CONTEXT, open = true) {
  act(() => {
    root.render(<LeadWonRevenueDialog open={open} onOpenChange={() => {}} context={context} />);
  });
}

function amountInput(): HTMLInputElement {
  const el = document.querySelector('#lead-revenue-amount') as HTMLInputElement | null;
  expect(el).toBeTruthy();
  return el!;
}

/** Digitação: a máscara empurra os dígitos pela direita como centavos. */
function type(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function paste(input: HTMLInputElement, text: string) {
  const ev = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent & {
    clipboardData: any;
  };
  ev.clipboardData = { getData: () => text };
  act(() => {
    input.dispatchEvent(ev);
  });
}

function clickYes() {
  const botao = qAll('button').find((b) => /lançar receita/i.test(b.textContent || ''));
  expect(botao).toBeTruthy();
  act(() => {
    botao!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  capturedPrefill.current = null;
  capturedRequireDueDate.current = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('Oportunidade ganha — valor editável no primeiro passo', () => {
  it('o campo nasce com o valor estimado da oportunidade', () => {
    render();
    expect(amountInput().value).toBe('297,00');
  });

  it('o valor digitado é o que vai pro formulário do Financeiro', () => {
    render();
    type(amountInput(), '118800'); // máscara de centavos: R$ 1.188,00
    expect(amountInput().value).toBe('1.188,00');

    clickYes();
    expect(capturedPrefill.current?.amount).toBe(1188);
    expect(capturedPrefill.current?.transaction_type).toBe('entrada');
    expect(capturedPrefill.current?.customer_id).toBe('cust-1');
    expect(capturedRequireDueDate.current).toBe(true);
  });

  it('colar valor de planilha não vira cem vezes menor', () => {
    render();
    paste(amountInput(), '4.550');
    expect(amountInput().value).toBe('4.550,00');

    clickYes();
    expect(capturedPrefill.current?.amount).toBe(4550);
  });

  it('apagar tudo e seguir manda zero, pro passo 2 cobrar o valor', () => {
    render();
    type(amountInput(), '');
    expect(amountInput().value).toBe('');

    clickYes();
    expect(capturedPrefill.current?.amount).toBe(0);
  });

  it('oportunidade sem valor estimado abre o campo vazio', () => {
    render({ ...CONTEXT, suggestedAmount: null });
    expect(amountInput().value).toBe('');
  });

  it('trocar de oportunidade não carrega o valor digitado na anterior', () => {
    render();
    type(amountInput(), '118800');
    expect(amountInput().value).toBe('1.188,00');

    // Mesmo componente, outra oportunidade: tem que reancorar no estimado dela.
    render({ ...CONTEXT, leadId: 'lead-2', suggestedAmount: 50 });
    expect(amountInput().value).toBe('50,00');
  });
});
