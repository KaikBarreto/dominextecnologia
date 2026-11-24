import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  target: { status: 'pending', sessionId: null } as { status: 'pending' | 'ready' | 'unavailable'; sessionId: string | null },
  cash: {} as Record<string, unknown>, detail: vi.fn(),
}));
vi.mock('@/hooks/usePdvReceivingTarget', () => ({ usePdvReceivingTarget: ({ orderId }: { orderId: string | null }) => orderId ? { ...state.target, refetch: vi.fn() } : { status: 'none', sessionId: null, refetch: vi.fn() } }));
vi.mock('@/hooks/usePdvCashSessionsV2', () => ({ usePdvCashSessionsV2: () => state.cash, usePdvCashV2AttemptRegistry: () => ({}) }));
vi.mock('@/hooks/usePdvCashSessionDetailV2', () => ({ usePdvCashSessionDetailV2: (id: string | null) => { state.detail(id); return { detail: null, entries: [], isLoading: false, isError: false, refetch: vi.fn() }; } }));
vi.mock('@/hooks/useFinancialAccounts', () => ({ useFinancialAccounts: () => ({ accounts: [], balances: {} }) }));
vi.mock('@/hooks/usePdvReceiptSettings', () => ({ usePdvReceiptSettings: () => ({ data: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/pdv/receipt/PdvOrderReceiptButton', () => ({ usePdvOrderReceiptOpener: () => ({}) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/lib/format/hooks', () => ({ useLocaleFormatters: () => ({ money: String, dateTime: String }) }));
vi.mock('@/components/ui/HorizontalTabBar', () => ({ HorizontalTabBar: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/layout/PageHeader', () => ({ PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => <header><h1>{title}</h1>{subtitle}</header> }));
vi.mock('@/components/pdv/loading/PdvPageSkeleton', () => ({ PdvPageSkeleton: ({ label }: { label: string }) => <div role="status">{label}</div> }));
vi.mock('@/components/pdv/caixa/PdvCashIndicators', () => ({ PdvCashIndicators: ({ drawerAmount }: { drawerAmount: number }) => <div>Dinheiro {drawerAmount}</div> }));
vi.mock('./PdvCashV2Dialogs', () => ({ PdvCashV2OpenDialog: () => null, PdvCashV2EventDialog: () => null, PdvCashV2CloseDialog: () => null }));
vi.mock('@/components/pdv/caixa/PdvFirstCashSetupDialog', () => ({ PdvFirstCashSetupDialog: () => null }));
vi.mock('@/components/pdv/counter/PdvCashQueuePanel', () => ({ PdvCashQueuePanel: function Queue({ sessionId }: { sessionId: string }) {
  const [, setParams] = useSearchParams();
  return <button onClick={() => setParams(params => { const next = new URLSearchParams(params); next.delete('pedido'); return next; }, { replace: true })}>Fila {sessionId}</button>;
} }));
import { PdvCashV2Page } from './PdvCashV2Page';

const pageProps = { cashAccountId: 'cofre', allowNewSessions: true, userId: 'admin', canManageOthers: true, canViewTreasury: false, canUseBankAccounts: false, canManageFinance: true, canCoverPdvOrders: true, canManageSettings: true };
const targetPath = '/pdv?fila=1&pedido=11111111-1111-4111-8111-111111111111';
const page = (path = targetPath) => <MemoryRouter initialEntries={[path]}><PdvCashV2Page {...pageProps} /></MemoryRouter>;
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.clearAllMocks(); state.target = { status: 'pending', sessionId: null };
  state.cash = {
    authorizationReady: true, authorizationScopeKey: 'companyA:admin', isLoading: false, isError: false, snapshot: null, operators: {},
    openSessions: [
      { id: 'own', terminalId: 'own-terminal', openedBy: 'admin', openingAmount: 5000, cashAccountId: 'cofre', openedAt: '2026-11-16' },
      { id: 'target', terminalId: 'target-terminal', openedBy: 'operatorA', openingAmount: 10, cashAccountId: 'cofre', openedAt: '2026-11-16' },
    ],
    terminals: [{ id: 'own-terminal', name: 'Caixa próprio', stockId: 'stock' }, { id: 'target-terminal', name: 'Caixa destino', stockId: 'stock' }], refetch: vi.fn(),
  };
});

describe('navegação de recebimento entre caixas na página', () => {
  it('não consulta nem mostra o caixa próprio durante a resolução e abre somente o destino', async () => {
    const view = render(page());
    expect(screen.getByRole('status')).toHaveTextContent('Conferindo o caixa deste pedido');
    expect(screen.queryByText('Dinheiro 5000')).not.toBeInTheDocument();
    expect(state.detail.mock.calls.every(([id]) => id === null)).toBe(true);
    state.target = { status: 'ready', sessionId: 'target' }; view.rerender(page());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fila target' })).toBeInTheDocument());
    expect(screen.getByText('Dinheiro 10')).toBeInTheDocument();
    expect(state.detail).not.toHaveBeenCalledWith('own');
  });

  it('continua no destino quando a fila consome pedido e respeita seleção manual/refetch', async () => {
    state.target = { status: 'ready', sessionId: 'target' };
    const view = render(page());
    fireEvent.click(await screen.findByRole('button', { name: 'Fila target' }));
    await waitFor(() => expect(screen.getByText('Dinheiro 10')).toBeInTheDocument());
    expect(state.detail).not.toHaveBeenCalledWith('own');
    fireEvent.click(screen.getByRole('button', { name: /Caixa próprio/ }));
    await waitFor(() => expect(screen.getByText('Dinheiro 5000')).toBeInTheDocument());
    view.rerender(page());
    expect(screen.getByText('Dinheiro 5000')).toBeInTheDocument();
  });

  it('mantém a entrada normal no caixa próprio', async () => {
    render(page('/pdv'));
    expect(await screen.findByText('Dinheiro 5000')).toBeInTheDocument();
  });

  it('mostra orientação neutra e não monta contexto financeiro quando o destino está indisponível', () => {
    state.target = { status: 'unavailable', sessionId: null }; render(page());
    expect(screen.getByRole('heading', { name: 'Não foi possível abrir este recebimento' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar aos pedidos' })).toBeInTheDocument();
    expect(screen.queryByText(/Dinheiro/)).not.toBeInTheDocument();
    expect(state.detail.mock.calls.every(([id]) => id === null)).toBe(true);
  });

  it('mascara o detalhe imediatamente se a autorização muda enquanto o endereço é resolvido', async () => {
    state.target = { status: 'ready', sessionId: 'target' }; const view = render(page());
    await screen.findByText('Dinheiro 10');
    state.cash = { ...state.cash, authorizationReady: false, authorizationScopeKey: 'companyB:admin' };
    await act(async () => { view.rerender(page()); });
    expect(screen.queryByText('Dinheiro 10')).not.toBeInTheDocument();
    expect(screen.queryByText('Dinheiro 5000')).not.toBeInTheDocument();
  });
});
