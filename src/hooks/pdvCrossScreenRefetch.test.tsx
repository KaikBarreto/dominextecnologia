import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rpc: vi.fn(), purchased: false, paid: false, delivered: false, opened: false, quantity: 2, denied: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'operator' },
  profile: { user_id: 'operator', company_id: 'company', is_active: true }, permissions: ['*'], roles: ['admin'],
  hasPermissionRecord: true, loading: false, profileLoading: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));

import { useDirectMaterialPurchase, type DirectMaterialPurchaseInput } from './useDirectMaterialPurchase';
import { usePdvManagementReport } from './usePdvReportsV2';
import { usePdvDirectSaleV2 } from './usePdvDirectSaleV2';
import { usePdvCashSessionsV2 } from './usePdvCashSessionsV2';
import { usePdvOrdersList, type PdvOrdersListFilters } from './usePdvOrdersList';
import { usePdvCoverOrder } from './usePdvCounterFlow';
import { usePdvCompleteDispatch, usePdvDispatchHistory } from './usePdvDispatch';
import { usePdvPreorderCatalog } from './usePdvPreorderCatalog';
import { usePdvCreateReturn } from './usePdvReturns';

const period = { from: '2026-11-01', to: '2026-11-24' };
const purchase: DirectMaterialPurchaseInput = { clientRequestId: 'purchase-attempt', stockId: 'stock', supplierId: 'supplier',
  items: [{ inventory_id: 'material', quantity: 1, unit_price: 10 }], purchaseDate: '2026-11-24', accountId: 'cash',
  categoryId: 'category', isPaid: true, paidDate: '2026-11-24', paymentMethod: 'dinheiro',
  cashContext: { sessionId: 'session', terminalId: 'terminal', stockId: 'stock' } };
const filters: PdvOrdersListFilters = { query: '', status: null, paymentStatus: null, pickupStatus: null,
  terminalId: null, operatorId: null, from: null, to: null, sort: 'newest', page: 0, pageSize: 25 };
const total = { orders_count: 1, quantity: 1, revenue: 100, cmv: 40, margin: 60, margin_rate: 0.6,
  average_ticket: 100, returns_count: 0, returns_impact: 0 };
function management() { return { scope: 'pdv_management', ...period, previous_from: '2026-10-08', previous_to: '2026-10-31',
  current: total, previous: total, daily: [], payments: [], payment_total: 0,
  cash: { closed_sessions: 1, expected: state.purchased ? 90 : 100, counted: 100, difference: 0, shortage: 0, surplus: 0 } }; }
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks(); Object.assign(state, { purchased: false, paid: false, delivered: false, opened: false, quantity: 2, denied: false });
  state.rpc.mockImplementation(async (name: string) => {
    if (state.denied && name === 'pdv_registrar_compra_material_direta_v2') return { data: null, error: { code: '42501' } };
    let data: unknown;
    switch (name) {
      case 'pdv_management_report_v1': data = management(); break;
      case 'pdv_registrar_compra_material_direta_v2': state.purchased = true; data = { compra_id: 'purchase' }; break;
      case 'pdv_get_direct_sale_capability_v2': data = { enabled: true, contract_version: 2 }; break;
      case 'pdv_get_direct_sale_catalog_v3': data = { sessions: state.opened ? [{ id: 'session', terminal_id: 'terminal', cash_account_id: 'cash', opened_at: '2026-11-24T10:00:00Z' }] : [] }; break;
      case 'pdv_open_cash_session_v2': state.opened = true; data = { ok: true, session_id: 'session', terminal_id: 'terminal', opening_amount: 0, opened_at: '2026-11-24T10:00:00Z' }; break;
      case 'pdv_list_orders_workspace_v3': data = { rows: [{ id: 'order', number: 1, created_at: '2026-11-24T10:00:00Z', payment_status: state.paid ? 'pago' : 'aguardando' }], total: 1, page: 0, page_size: 25 }; break;
      case 'pdv_cover_existing_order_v2': state.paid = true; data = { order_id: 'order' }; break;
      case 'pdv_list_delivered_orders_v2': data = state.delivered ? [{ id: 'order', stock_id: 'stock', status: 'entregue' }] : []; break;
      case 'pdv_complete_dispatch_delivery_v2': state.delivered = true; data = { delivery_id: 'delivery' }; break;
      case 'pdv_get_preorder_catalog_v3': data = { materials: [{ id: 'material', name: 'Peça fictícia', available_by_stock: [{ stock_id: 'stock', available_quantity: state.quantity }] }] }; break;
      case 'pdv_list_preorder_terminals_v3': data = []; break;
      case 'pdv_return_delivery_items_v2': state.quantity = 3; data = { return_id: 'return', order_id: 'order' }; break;
      default: throw new Error(`RPC não prevista no teste: ${name}`);
    }
    return { data, error: null };
  });
});

describe('PDV: atualização entre telas com cache recente', () => {
  it('compra feita no Caixa atualiza relatório já aberto e ao voltar sem refresh', async () => {
    const { client, wrapper } = setup();
    const report = renderHook(() => usePdvManagementReport(period), { wrapper });
    const action = renderHook(useDirectMaterialPurchase, { wrapper });
    await waitFor(() => expect(report.result.current.data?.cash.expected).toBe(100));
    await act(async () => { await action.result.current.registerPurchase.mutateAsync(purchase); });
    await waitFor(() => expect(report.result.current.data?.cash.expected).toBe(90));
    report.unmount();
    const next = renderHook(() => usePdvManagementReport(period), { wrapper });
    await waitFor(() => expect(next.result.current.data?.cash.expected).toBe(90));
    action.unmount(); next.unmount(); client.clear();
  });
  it('retornar ao relatório consulta alterações feitas em outro acesso, mesmo dentro de 30 segundos', async () => {
    const { client, wrapper } = setup();
    const report = renderHook(() => usePdvManagementReport(period), { wrapper });
    await waitFor(() => expect(report.result.current.data?.cash.expected).toBe(100));
    report.unmount(); state.purchased = true;
    const next = renderHook(() => usePdvManagementReport(period), { wrapper });
    await waitFor(() => expect(next.result.current.data?.cash.expected).toBe(90));
    next.unmount(); client.clear();
  });
  it('retomar a janela confirma novamente o relatório recente', async () => {
    const { client, wrapper } = setup();
    const report = renderHook(() => usePdvManagementReport(period), { wrapper });
    try {
      await waitFor(() => expect(report.result.current.data?.cash.expected).toBe(100));
      focusManager.setFocused(false); state.purchased = true;
      await act(async () => { focusManager.setFocused(true); });
      await waitFor(() => expect(report.result.current.data?.cash.expected).toBe(90));
    } finally { report.unmount(); client.clear(); focusManager.setFocused(undefined); }
  });
  it('resposta antiga de relatório não vence a compra confirmada durante navegação', async () => {
    const { client, wrapper } = setup();
    const normal = state.rpc.getMockImplementation()!;
    let finish!: (value: unknown) => void;
    let first = true;
    state.rpc.mockImplementation((name: string, ...args: unknown[]) => {
      if (name === 'pdv_management_report_v1' && first) {
        first = false;
        const oldSnapshot = management();
        return new Promise(resolve => { finish = () => resolve({ data: oldSnapshot, error: null }); });
      }
      return normal(name, ...args);
    });
    const report = renderHook(() => usePdvManagementReport(period), { wrapper });
    await waitFor(() => expect(finish).toBeDefined());
    report.unmount();
    const action = renderHook(useDirectMaterialPurchase, { wrapper });
    await act(async () => { await action.result.current.registerPurchase.mutateAsync(purchase); });
    const next = renderHook(() => usePdvManagementReport(period), { wrapper });
    await act(async () => { finish(null); });
    await waitFor(() => expect(next.result.current.data?.cash.expected).toBe(90));
    action.unmount(); next.unmount(); client.clear();
  });
  it('primeira leitura ainda aberta não repõe o saldo anterior à compra', async () => {
    const { client, wrapper } = setup();
    const normal = state.rpc.getMockImplementation()!;
    let finish!: () => void;
    let first = true;
    state.rpc.mockImplementation((name: string, ...args: unknown[]) => {
      if (name === 'pdv_management_report_v1' && first) {
        first = false;
        const oldSnapshot = management();
        return new Promise(resolve => { finish = () => resolve({ data: oldSnapshot, error: null }); });
      }
      return normal(name, ...args);
    });
    const report = renderHook(() => usePdvManagementReport(period), { wrapper });
    const action = renderHook(useDirectMaterialPurchase, { wrapper });
    await waitFor(() => expect(finish).toBeDefined());
    await act(async () => { await action.result.current.registerPurchase.mutateAsync(purchase); });
    await act(async () => { finish(); });
    await waitFor(() => expect(report.result.current.data?.cash.expected).toBe(90));
    action.unmount(); report.unmount(); client.clear();
  });
  it('abrir caixa atualiza as opções de recebimento da Venda sem recarregar', async () => {
    const { client, wrapper } = setup();
    const sale = renderHook(usePdvDirectSaleV2, { wrapper });
    const cash = renderHook(() => usePdvCashSessionsV2({ enabled: false, userId: 'operator', cashAccountId: 'cash',
      canManageOthers: true, history: { terminalId: null, operatorId: null, page: 0, pageSize: 20 } }), { wrapper });
    await waitFor(() => expect(sale.result.current.catalog.data?.sessions).toEqual([]));
    await act(async () => { await cash.result.current.openSession.mutateAsync({ terminalId: 'terminal', cashAccountId: 'cash', openingAmount: 0, attemptId: 'open-attempt' }); });
    await waitFor(() => expect(sale.result.current.catalog.data?.sessions).toHaveLength(1));
    cash.unmount(); sale.unmount(); client.clear();
  });
  it('receber no Caixa atualiza os pedidos consultados pela tela atual', async () => {
    const { client, wrapper } = setup();
    const orders = renderHook(() => usePdvOrdersList(filters), { wrapper });
    const action = renderHook(usePdvCoverOrder, { wrapper });
    await waitFor(() => expect(orders.result.current.data?.rows[0].paymentStatus).toBe('aguardando'));
    await act(async () => { await action.result.current.mutateAsync({ orderId: 'order', terminalId: 'terminal', cashSessionId: 'session', cashAccountId: 'cash', payments: [{ method: 'dinheiro', amount: 10 }], attemptId: 'cover-attempt' }); });
    await waitFor(() => expect(orders.result.current.data?.rows[0].paymentStatus).toBe('pago'));
    action.unmount(); orders.unmount(); client.clear();
  });
  it('registrar retirada atualiza o histórico da Expedição sem callback da página', async () => {
    const { client, wrapper } = setup();
    const history = renderHook(usePdvDispatchHistory, { wrapper });
    const action = renderHook(usePdvCompleteDispatch, { wrapper });
    await waitFor(() => expect(history.result.current.data).toEqual([]));
    await act(async () => { await action.result.current.mutateAsync({ orderId: 'order', lines: [{ orderItemId: 'item', quantity: 1 }], attemptId: 'delivery-attempt' }); });
    await waitFor(() => expect(history.result.current.data).toHaveLength(1));
    action.unmount(); history.unmount(); client.clear();
  });
  it('devolver material atualiza o saldo do catálogo do Balcão', async () => {
    const { client, wrapper } = setup();
    const catalog = renderHook(usePdvPreorderCatalog, { wrapper });
    const action = renderHook(usePdvCreateReturn, { wrapper });
    await waitFor(() => expect(catalog.result.current.data?.materials[0].available_by_stock[0].available_quantity).toBe(2));
    await act(async () => { await action.result.current.mutateAsync({ orderId: 'order', lines: [], dispositions: [], occurredOn: '2026-11-24', reason: 'Devolução fictícia', attemptId: 'return-attempt' }); });
    await waitFor(() => expect(catalog.result.current.data?.materials[0].available_by_stock[0].available_quantity).toBe(3));
    action.unmount(); catalog.unmount(); client.clear();
  });
  it('compra negada preserva o relatório confirmado e não faz nova consulta', async () => {
    const { client, wrapper } = setup();
    const report = renderHook(() => usePdvManagementReport(period), { wrapper });
    const action = renderHook(useDirectMaterialPurchase, { wrapper });
    await waitFor(() => expect(report.result.current.data?.cash.expected).toBe(100));
    const reads = state.rpc.mock.calls.filter(([name]) => name === 'pdv_management_report_v1').length;
    state.denied = true;
    await act(async () => { await expect(action.result.current.registerPurchase.mutateAsync(purchase)).rejects.toBeDefined(); });
    expect(report.result.current.data?.cash.expected).toBe(100);
    expect(state.rpc.mock.calls.filter(([name]) => name === 'pdv_management_report_v1')).toHaveLength(reads);
    action.unmount(); report.unmount(); client.clear();
  });
});
