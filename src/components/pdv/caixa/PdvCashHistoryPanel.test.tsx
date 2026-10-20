import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvCashHistoryPanel } from './PdvCashHistoryPanel';
import type { PdvLedgerEntry } from '@/lib/pdv/cash';
import { pdv } from '@/lib/i18n/messages/app/pdv';

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
      <PdvCashHistoryPanel {...props} entries={[older]} />,
    );
    expect(container.querySelector('[data-new-entry="true"]')).toBeNull();

    rerender(<PdvCashHistoryPanel {...props} entries={[newer, older]} />);

    const animatedRow = container.querySelector('[data-new-entry="true"]');
    expect(animatedRow).not.toBeNull();
    expect(animatedRow).toHaveTextContent('#2');
    expect(animatedRow).not.toHaveTextContent('#1');
  });
});
