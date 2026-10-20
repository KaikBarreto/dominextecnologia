import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvCashHistoryPanel } from './PdvCashHistoryPanel';
import type { PdvLedgerEntry } from '@/lib/pdv/cash';
import { pdv } from '@/lib/i18n/messages/app/pdv';
import { TooltipProvider } from '@/components/ui/tooltip';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function entry(key: string, reference: string): PdvLedgerEntry {
  return {
    key,
    id: key,
    kind: 'venda',
    reference,
    label: 'Venda no balcão',
    customerName: 'Cliente teste',
    amount: 100,
    signedAmount: 100,
    methods: ['dinheiro'],
    occurredAt: '2026-10-20T10:00:00.000Z',
    detail: {},
  };
}

describe('PdvCashHistoryPanel', () => {
  it('marca apenas a transação que chegou depois da carga inicial', () => {
    const older = entry('sale-1', '#1');
    const newer = entry('sale-2', '#2');
    const props = {
      texts: pdv['pt-br'].cashPanel.history,
      isLoading: false,
      valuesVisible: true,
      money: (value: number) => `R$ ${value}`,
      dateTime: (value: string) => value,
      number: (value: number) => String(value),
      canManageFinance: false,
      canDeleteFinance: false,
      canEditPdvSales: false,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    };

    const { container, rerender } = render(
      <TooltipProvider><PdvCashHistoryPanel {...props} entries={[older]} /></TooltipProvider>,
    );
    expect(container.querySelector('[data-new-entry="true"]')).toBeNull();

    rerender(<TooltipProvider><PdvCashHistoryPanel {...props} entries={[newer, older]} /></TooltipProvider>);

    const animatedRow = container.querySelector('[data-new-entry="true"]');
    expect(animatedRow).not.toBeNull();
    expect(animatedRow).toHaveTextContent('#2');
    expect(animatedRow).not.toHaveTextContent('#1');
  });

  it('mostra operador, conta do Pix e unidade no detalhe da venda', () => {
    const sale = {
      ...entry('sale-1', '#1'),
      actor: { name: 'Ana Teste', email: 'ana@exemplo.com', avatarUrl: null },
      methods: ['pix'],
      detail: {
        items: [{ description: 'Cabo', quantity: 2, unit: 'kg', unitPrice: 10, total: 20 }],
        payments: [{
          method: 'pix',
          amount: 20,
          changeAmount: 0,
          accountName: 'Banco Principal',
          accountColor: '#0ea5e9',
        }],
      },
    } satisfies PdvLedgerEntry;
    const props = {
      texts: pdv['pt-br'].cashPanel.history,
      entries: [sale],
      isLoading: false,
      valuesVisible: true,
      money: (value: number) => `R$ ${value}`,
      dateTime: (value: string) => value,
      number: (value: number) => String(value),
      canManageFinance: false,
      canDeleteFinance: false,
      canEditPdvSales: false,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    };

    render(<TooltipProvider delayDuration={0}><PdvCashHistoryPanel {...props} /></TooltipProvider>);
    expect(screen.getByText('Banco Principal')).toBeInTheDocument();
    expect(screen.getByText('AT')).toBeInTheDocument();

    fireEvent.click(screen.getByText('#1'));
    expect(screen.getByText('2 kg')).toBeInTheDocument();
    expect(screen.getByText('Total da venda').className).toContain('font-bold');
  });

  it('usa badges saturados e distingue transferência de sangria simples', () => {
    const sale = entry('sale-1', '#1');
    const expense: PdvLedgerEntry = {
      ...entry('expense-1', ''),
      kind: 'despesa',
      label: 'Despesa avulsa',
      signedAmount: -100,
    };
    const purchase: PdvLedgerEntry = {
      ...entry('purchase-1', ''),
      kind: 'compra',
      label: 'Compra de materiais',
      signedAmount: -100,
    };
    const transfer: PdvLedgerEntry = {
      ...entry('movement-1', ''),
      kind: 'sangria',
      label: 'Transferência para banco',
      signedAmount: -100,
      detail: { movedBetweenAccounts: true },
    };

    render(
      <TooltipProvider>
        <PdvCashHistoryPanel
          texts={pdv['pt-br'].cashPanel.history}
          entries={[sale, purchase, expense, transfer]}
          isLoading={false}
          valuesVisible
          money={(value) => `R$ ${value}`}
          dateTime={(value) => value}
          number={(value) => String(value)}
          canManageFinance={false}
          canDeleteFinance={false}
          canEditPdvSales={false}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </TooltipProvider>,
    );

    for (const badge of screen.getAllByText('Venda')) {
      expect(badge.className).toContain('bg-emerald-600');
      expect(badge.className).toContain('text-white');
    }
    for (const badge of screen.getAllByText('Despesa')) {
      expect(badge.className).toContain('bg-red-600');
      expect(badge.className).toContain('text-white');
    }
    for (const badge of screen.getAllByText('Compra')) {
      expect(badge.className).toContain('bg-blue-600');
      expect(badge.className).toContain('text-white');
    }
    for (const badge of screen.getAllByText('Transferência')) {
      expect(badge.className).toContain('bg-indigo-600');
      expect(badge.className).toContain('text-white');
    }
  });
});
