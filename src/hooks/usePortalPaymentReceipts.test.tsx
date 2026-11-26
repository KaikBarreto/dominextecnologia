import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
vi.mock('@/utils/osReceiptPdf', () => ({ downloadOsReceipt: state.download }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
import { usePortalPaymentReceipts, type PortalPayment } from './usePortalPaymentReceipts';
const payment: PortalPayment = { id: 'payment', kind: 'charge', description: 'Serviço fictício', amount: 100, method: 'PIX', paid_date: '2026-11-26' };
const mount = () => {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
 const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
 return { client, ...renderHook(({ token, session }) => usePortalPaymentReceipts(token, session), { wrapper, initialProps: { token: 'portal-a', session: 'session-a' } }) };
};
beforeEach(() => vi.clearAllMocks());
describe('recibos no portal do cliente', () => {
 it('não reaproveita os pagamentos ao trocar portal ou sessão protegida', async () => {
  state.rpc.mockResolvedValueOnce({ data: [payment], error: null }).mockImplementation(() => new Promise(() => {}));
  const { result, rerender, unmount, client } = mount();
  await waitFor(() => expect(result.current.data).toEqual([payment]));
  rerender({ token: 'portal-b', session: 'session-a' }); expect(result.current.data).toBeUndefined();
  rerender({ token: 'portal-a', session: 'session-b' }); expect(result.current.data).toBeUndefined();
  unmount(); client.clear();
 });
 it('revalida sessão, cliente e pagamento no servidor antes do PDF', async () => {
  state.rpc.mockResolvedValue({ data: [payment], error: null });
  const { result, unmount, client } = mount();
  await waitFor(() => expect(result.current.data).toHaveLength(1));
  state.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
  await act(() => result.current.download(payment));
  expect(state.rpc).toHaveBeenLastCalledWith('get_customer_portal_payment_receipt', { p_token: 'portal-a', p_session_token: 'session-a', p_kind: 'charge', p_id: 'payment' });
  expect(state.download).not.toHaveBeenCalled(); expect(state.toast).toHaveBeenCalled();
  unmount(); client.clear();
 });
});
