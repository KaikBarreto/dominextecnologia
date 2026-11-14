import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getQuoteApprovalRevertErrorCode } from '@/lib/quote-approval-revert';
import { useQuotes } from './useQuotes';

const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), toast: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: state.rpc, from: state.from },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-a' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    ...renderHook(() => useQuotes(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
    client,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.from.mockImplementation(() => ({
    select: () => ({ order: async () => ({ data: [], error: null }) }),
  }));
});

describe('useQuotes.revertApproval', () => {
  it('usa a RPC protegida e invalida a lista ao concluir', async () => {
    state.rpc.mockResolvedValue({
      data: { ok: true, status: 'enviado', reverted: true },
      error: null,
    });
    const { result, client } = mount();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await expect(result.current.revertApproval.mutateAsync('quote-a')).resolves.toEqual({
        status: 'enviado',
        reverted: true,
      });
    });

    expect(state.rpc).toHaveBeenCalledWith('revert_quote_approval', {
      p_quote_id: 'quote-a',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['quotes'] });
  });

  it('preserva somente o código de domínio conhecido', async () => {
    state.rpc.mockResolvedValue({ data: { ok: false, error: 'charge_exists' }, error: null });
    const { result } = mount();

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.revertApproval.mutateAsync('quote-a');
      } catch (error) {
        caught = error;
      }
    });

    expect(getQuoteApprovalRevertErrorCode(caught)).toBe('charge_exists');
    expect((caught as Error).message).not.toMatch(/tenant_charges|SQLSTATE|constraint/);
  });

  it('não expõe o erro técnico retornado pelo PostgREST', async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for table quotes' },
    });
    const { result } = mount();

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.revertApproval.mutateAsync('quote-a');
      } catch (error) {
        caught = error;
      }
    });

    expect(getQuoteApprovalRevertErrorCode(caught)).toBe('unknown');
    expect((caught as Error).message).not.toContain('permission denied');
  });
});
