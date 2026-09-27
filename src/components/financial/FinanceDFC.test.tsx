import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const categoriesState = vi.hoisted(() => ({
  isLoading: false,
  categories: [] as Array<{ name: string; dfc_group?: string | null }>,
}));

const accountsState = vi.hoisted(() => ({
  isLoading: false,
  accounts: [] as Array<{ type: string; initial_balance: number }>,
}));

vi.mock('@/hooks/useFinancialCategories', () => ({
  useFinancialCategories: () => categoriesState,
}));

vi.mock('@/hooks/useFinancialAccounts', () => ({
  useFinancialAccounts: () => accountsState,
}));

vi.mock('@/lib/format/hooks', () => ({
  useLocaleFormatters: () => ({
    money: (value: number) => `BRL ${value.toFixed(2)}`,
    date: (value: string | Date) => typeof value === 'string'
      ? value.slice(0, 10)
      : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`,
  }),
}));

import { FinanceDFC } from './FinanceDFC';
import type { FinancialTransaction } from '@/types/database';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const transaction = (
  id: string,
  overrides: Partial<FinancialTransaction> = {},
): FinancialTransaction => ({
  id,
  transaction_type: 'entrada',
  description: `Lançamento ${id}`,
  amount: 100,
  transaction_date: '2026-02-01',
  paid_date: '2026-02-01',
  is_paid: true,
  created_at: '2026-02-01T12:00:00Z',
  updated_at: '2026-02-01T12:00:00Z',
  ...overrides,
});

describe('FinanceDFC', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    categoriesState.isLoading = false;
    categoriesState.categories = [];
    accountsState.isLoading = false;
    accountsState.accounts = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('reconcilia saldos e permite drilldown por atividade e categoria', () => {
    categoriesState.categories = [
      { name: 'Máquinas', dfc_group: 'investimento' },
    ];
    accountsState.accounts = [
      { type: 'banco', initial_balance: 300 },
      { type: 'cartao', initial_balance: 99_999 },
    ];

    const transactions = [
      transaction('anterior', { amount: 1_000, paid_date: '2026-01-10', category: 'Vendas' }),
      transaction('receita', { amount: 400, paid_date: '2026-02-05', category: 'Vendas' }),
      transaction('maquina', {
        transaction_type: 'saida',
        description: 'Compressor novo',
        amount: 150,
        paid_date: '2026-02-12',
        category: 'Máquinas',
      }),
      transaction('pendente', { amount: 50_000, is_paid: false, paid_date: undefined, category: 'Vendas' }),
    ];

    act(() => {
      root.render(
        <FinanceDFC
          transactions={transactions}
          range={{ from: new Date(2026, 1, 1), to: new Date(2026, 1, 28) }}
        />,
      );
    });

    const text = container.textContent ?? '';
    expect(text).toContain('BRL 1300.00');
    expect(text).toContain('BRL 250.00');
    expect(text).toContain('BRL 1550.00');
    expect(text).not.toContain('BRL 50000.00');
    expect(text).toContain('Vendas');

    const investmentButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Atividades de investimento'),
    );
    expect(investmentButton).toBeTruthy();
    act(() => investmentButton!.click());
    expect(container.textContent).toContain('Máquinas');

    const categoryButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Máquinas'),
    );
    expect(categoryButton).toBeTruthy();
    act(() => categoryButton!.click());
    expect(container.textContent).toContain('Compressor novo');
  });

  it('distingue carregamento de período sem movimentações realizadas', () => {
    act(() => {
      root.render(<FinanceDFC transactions={[]} isLoading />);
    });
    expect(container.getAttribute('aria-busy')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Carregando DFC gerencial"]')).toBeTruthy();

    act(() => {
      root.render(<FinanceDFC transactions={[]} />);
    });
    expect(container.textContent).toContain('Nenhuma movimentação realizada no período');
    expect(container.textContent).toContain('Somente realizado');
  });
});
