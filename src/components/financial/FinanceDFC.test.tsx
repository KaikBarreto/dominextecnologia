import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const categoriesState = vi.hoisted(() => ({
  isLoading: false,
  categories: [] as Array<{
    id?: string;
    name: string;
    parent_id?: string | null;
    color?: string;
    icon?: string | null;
    dfc_group?: string | null;
  }>,
}));

const accountsState = vi.hoisted(() => ({
  isLoading: false,
  accounts: [] as Array<{ type: string; initial_balance: number }>,
}));

const costCentersState = vi.hoisted(() => ({
  isLoading: false,
  costCenters: [] as Array<{ id: string; name: string; color: string }>,
}));

// A aba do fluxo de caixa tem DUAS lentes e abre na "Previsto", que busca
// dados próprios e precisa de sessão. Este arquivo testa a lente REALIZADA
// (o demonstrativo por atividade), então a outra entra como dublê. O previsto
// tem suíte própria em `src/lib/cash-flow-forecast*.test.ts`.
vi.mock('./CashFlowForecast', () => ({
  CashFlowForecast: () => null,
}));

vi.mock('@/hooks/useFinancialCategories', () => ({
  useFinancialCategories: () => categoriesState,
}));

vi.mock('@/hooks/useFinancialAccounts', () => ({
  useFinancialAccounts: () => accountsState,
}));

vi.mock('@/hooks/useCostCenters', () => ({
  useCostCenters: () => costCentersState,
}));

vi.mock('@/hooks/useCompanySettings', () => ({
  useCompanySettings: () => ({ settings: { name: 'Empresa teste' }, isLoading: false }),
}));

vi.mock('@/lib/format/hooks', () => ({
  useLocaleFormatters: () => ({
    money: (value: number) => `BRL ${value.toFixed(2)}`,
    date: (value: string | Date) => typeof value === 'string'
      ? value.slice(0, 10)
      : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`,
  }),
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-BR', currency: 'BRL' }),
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
    costCentersState.isLoading = false;
    costCentersState.costCenters = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  /**
   * A aba abre na lente "Previsto". Estes testes são da lente REALIZADA, então
   * clicam para trocar — como o usuário faria, em vez de um prop só de teste.
   */
  const abrirRealizado = () => {
    const botao = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Realizado',
    );
    if (!botao) throw new Error('não achei o botão da lente Realizado');
    act(() => {
      botao.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };


  it('reconcilia saldos e detalha somente categoria e subcategoria', () => {
    categoriesState.categories = [
      { id: 'cat-parent', name: 'Ativos', parent_id: null, color: '#7c3aed', icon: 'Landmark', dfc_group: 'investimento' },
      { id: 'cat-child', name: 'Máquinas', parent_id: 'cat-parent', color: '#2563eb', icon: 'Wrench', dfc_group: 'investimento' },
    ];
    accountsState.accounts = [
      { type: 'banco', initial_balance: 300 },
      { type: 'cartao', initial_balance: 99_999 },
    ];
    costCentersState.costCenters = [
      { id: 'cc-fabrica', name: 'Fábrica', color: '#f97316' },
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
        cost_center_id: 'cc-fabrica',
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
    abrirRealizado();

    const text = container.textContent ?? '';
    expect(text).toContain('BRL 1300.00');
    expect(text).toContain('BRL 250.00');
    expect(text).toContain('BRL 1550.00');
    expect(text).not.toContain('BRL 50000.00');
    expect(text).toContain('Vendas');
    const realizedBadge = Array.from(container.querySelectorAll('span')).find(
      (span) => span.textContent === 'Somente realizado',
    );
    expect(realizedBadge?.className).toContain('bg-success');
    expect(realizedBadge?.className).toContain('text-white');
    expect(container.querySelector('[data-dfc-group-icon="operacional"]')).toBeTruthy();
    expect(container.querySelector('[data-dfc-group-icon="investimento"]')).toBeTruthy();
    expect(container.querySelector('[data-dfc-group-icon="financiamento"]')).toBeTruthy();
    const exportButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Exportar',
    );
    expect(exportButton).toBeTruthy();
    expect(text).not.toContain('Exportar CSV');

    const investmentButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Atividades de investimento'),
    );
    expect(investmentButton).toBeTruthy();
    expect(container.textContent).toContain('Ativos');

    const parentButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Ativos'),
    );
    expect(parentButton).toBeTruthy();
    act(() => parentButton!.click());
    expect(container.textContent).toContain('Máquinas');

    expect(container.textContent).toContain('Máquinas');
    expect(container.textContent).not.toContain('Compressor novo');
    expect(container.textContent).toContain('Filtros');
    expect(container.textContent).toContain('Realizado dia a dia');
    expect(container.textContent).toContain('Saldo realizado');
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
    abrirRealizado();
    expect(container.textContent).toContain('Nenhuma movimentação realizada no período');
    expect(container.textContent).toContain('Somente realizado');
  });
});
