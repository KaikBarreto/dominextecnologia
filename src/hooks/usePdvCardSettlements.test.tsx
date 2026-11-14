import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { projectCardSettlementWorkspace, usePdvCardSettlements } from '@/hooks/usePdvCardSettlements';

const payload = {
  company_today: '2026-11-08',
  payments: [{ id: 'payment-1', order_id: 'order-1', order_number: 42,
    customer_name: 'Cliente teste', method: 'credito', amount: 150.25,
    authorized_at: '2026-11-08T10:00:00Z', document: 'nao pode entrar' }],
  accounts: [{ id: 'account-1', name: 'Banco principal', balance: 999999 }],
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

describe('usePdvCardSettlements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('projeta somente os campos operacionais e valores completos', () => {
    const result = projectCardSettlementWorkspace(payload);
    expect(result.payments[0]).toEqual({ id: 'payment-1', orderId: 'order-1', orderNumber: 42,
      customerName: 'Cliente teste', method: 'credito', amount: 150.25,
      authorizedAt: '2026-11-08T10:00:00Z' });
    expect(JSON.stringify(result)).not.toMatch(/document|balance/);
  });

  it('envia todos os dados de conciliacao e preserva a chave idempotente', async () => {
    rpc.mockResolvedValueOnce({ data: payload, error: null });
    const { wrapper } = setup();
    const { result } = renderHook(() => usePdvCardSettlements(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await act(async () => { await result.current.settle.mutateAsync({
      paymentId: 'payment-1', accountId: 'account-1', settledOn: '2026-11-08',
      acquirer: ' Stone ', nsu: ' 123456 ', installments: 3, feeAmount: 4.51,
      idempotencyKey: 'card-attempt-0001',
    }); });
    expect(rpc).toHaveBeenCalledWith('pdv_settle_card_authorization_v3', {
      p_payment_id: 'payment-1', p_account_id: 'account-1', p_settled_on: '2026-11-08',
      p_acquirer: 'Stone', p_nsu: '123456', p_installments: 3, p_fee_amount: 4.51,
      p_idempotency_key: 'card-attempt-0001',
    });
  });

  it('nao mostra erro interno de sessao/terminal', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501',
      details: 'code=pdv_card_cash_session_denied', message: 'table pdv_cash_sessions' } });
    const { wrapper } = setup();
    const { result } = renderHook(() => usePdvCardSettlements(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Este cartão pertence a outro caixa ou terminal.');
    expect(result.current.error?.message).not.toMatch(/pdv_|table/i);
  });
});
