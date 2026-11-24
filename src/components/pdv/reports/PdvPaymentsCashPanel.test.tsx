import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvPaymentsCashPanel } from './PdvPaymentsCashPanel';

const mocks = vi.hoisted(() => ({ data: null as unknown }));

vi.mock('@/lib/format/hooks', () => ({ useLocaleFormatters: () => ({ money: (value: number) => `R$ ${value}` }) }));
vi.mock('@/hooks/usePdvReportsV2', () => ({
  usePdvManagementReport: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: mocks.data }),
}));
vi.mock('./PdvCardSettlementsPanel', () => ({ PdvCardSettlementsPanel: () => <div>Conciliação fictícia</div> }));

describe('aba Pagamentos e caixas do PDV', () => {
  it('resume a forma principal e destaca divergência de caixa', () => {
    mocks.data = {
      payments: [
        { method: 'pix', ordersCount: 5, amount: 700, share: 0.7 },
        { method: 'dinheiro', ordersCount: 2, amount: 300, share: 0.3 },
      ],
      paymentTotal: 1000,
      cash: { closedSessions: 2, expected: 1000, counted: 985, difference: -15, shortage: 15, surplus: 0 },
    };

    render(<PdvPaymentsCashPanel from="2026-11-01" to="2026-11-21" />);

    expect(screen.getByText('Pagamentos classificados')).toBeInTheDocument();
    expect(screen.getByText('Forma principal')).toBeInTheDocument();
    expect(screen.getByText('70% do valor recebido')).toBeInTheDocument();
    expect(screen.getByText('Com divergência')).toBeInTheDocument();
    expect(screen.getByText(/falta líquida de R\$ 15/)).toBeInTheDocument();
  });

  it('explica quando ainda não há pagamento nem fechamento', () => {
    mocks.data = {
      payments: [],
      paymentTotal: 0,
      cash: { closedSessions: 0, expected: 0, counted: 0, difference: 0, shortage: 0, surplus: 0 },
    };

    render(<PdvPaymentsCashPanel from="2026-11-01" to="2026-11-21" />);

    expect(screen.getByText('Sem pagamentos')).toBeInTheDocument();
    expect(screen.getByText('Sem fechamento')).toBeInTheDocument();
    expect(screen.getByText('Nenhum caixa fechado no período')).toBeInTheDocument();
    expect(screen.queryByText(/diferença líquida/)).not.toBeInTheDocument();
  });
});
