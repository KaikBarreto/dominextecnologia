import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import {
  mapPdvPreorderError,
  usePdvPreorderActions,
  usePdvPreorderQueue,
} from '@/hooks/usePdvPreorders';

describe('usePdvPreorders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('valoriza somente pela RPC e invalida fila, pedido e reserva', async () => {
    rpc.mockResolvedValue({
      data: { preorder_id: 'pre-1', revision: 3, status: 'encaminhado', has_missing_prices: false },
      error: null,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePdvPreorderActions(), { wrapper });

    await act(async () => {
      await result.current.value.mutateAsync({
        preorderId: 'pre-1',
        expectedRevision: 2,
        header: { customer_id: null, notes: 'Retirada', discount_amount: 0 },
        items: [{ id: 'item-1', unit_price: 10, discount_amount: 0 }],
        requestId: 'value-request-1',
      });
    });

    expect(rpc).toHaveBeenCalledWith('pdv_value_preorder_v2', {
      p_preorder_id: 'pre-1',
      p_expected_revision: 2,
      p_header: { customer_id: null, notes: 'Retirada', discount_amount: 0 },
      p_items: [{ id: 'item-1', unit_price: 10, discount_amount: 0 }],
      p_idempotency_key: 'value-request-1',
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-preorders'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-orders'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-stock-reservations'] });
    });
  });

  it('traduz conflito CAS sem expor código interno na copy', () => {
    const error = mapPdvPreorderError({
      code: '40001',
      message: 'internal revision failure',
      details: 'code=pdv_preorder_revision_conflict',
    });
    expect(error.kind).toBe('conflict');
    expect(error.message).toContain('outro dispositivo');
    expect(error.message).not.toContain('pdv_preorder');
  });

  it('distingue operação pendente de falha genérica', () => {
    const error = mapPdvPreorderError({
      code: '55000',
      details: 'code=pdv_preorder_operation_pending',
    });
    expect(error.kind).toBe('pending');
    expect(error.message).toContain('processada');
  });

  it('não consulta a fila comercial para perfil somente de expedição', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePdvPreorderQueue(null, false), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(rpc).not.toHaveBeenCalled();
  });
});
