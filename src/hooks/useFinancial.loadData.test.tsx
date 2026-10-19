import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, rpc } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from, rpc },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ timezone: 'America/Sao_Paulo' }),
}));

vi.mock('@/hooks/useUserCompany', () => ({
  getCurrentUserCompanyId: vi.fn().mockResolvedValue('company-1'),
}));

import { useFinancial } from './useFinancial';

function createHarness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return {
    client,
    Wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

describe('useFinancial loadData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nao baixa lista nem resumo quando a tela usa somente mutations', () => {
    const { Wrapper } = createHarness();
    const { result } = renderHook(() => useFinancial({ loadData: false }), {
      wrapper: Wrapper,
    });

    expect(from).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.transactions).toEqual([]);
    expect(result.current.createTransaction).toBeDefined();
    expect(result.current.updateTransaction).toBeDefined();
  });

  it('invalida detalhe e cofre do Caixa depois de mutation financeira', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'txn-1' },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    from.mockReturnValue({ insert });

    const { client, Wrapper } = createHarness();
    client.setQueryData(['pdv-cash-session-detail', 'session-1'], { orders: [] });
    client.setQueryData(['pdv-cofre-balance'], { disponivel: 100 });
    const { result } = renderHook(() => useFinancial({ loadData: false }), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.createTransaction.mutateAsync({
        transaction_type: 'entrada',
        description: 'Receita de teste',
        amount: 125.5,
        transaction_date: '2026-10-19',
      });
    });

    expect(client.getQueryState(['pdv-cash-session-detail', 'session-1'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['pdv-cofre-balance'])?.isInvalidated).toBe(true);
  });
});
