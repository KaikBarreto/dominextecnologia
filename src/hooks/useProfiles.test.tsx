import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authState, from, select, eq, order } = vi.hoisted(() => ({
  authState: {
    profile: { company_id: 'company-1' } as { company_id?: string | null } | null,
  },
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = { select, eq, order };
  from.mockReturnValue(builder);
  select.mockReturnValue(builder);
  eq.mockReturnValue(builder);

  return { supabase: { from } };
});

import { useActiveCompanyProfiles } from './useProfiles';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useActiveCompanyProfiles', () => {
  beforeEach(() => {
    authState.profile = { company_id: 'company-1' };
    from.mockClear();
    select.mockClear();
    eq.mockClear();
    order.mockReset();
    order.mockResolvedValue({
      data: [
        { user_id: 'user-1', full_name: 'Ana Gestora', avatar_url: null },
        { user_id: 'user-2', full_name: 'Bruno Comercial', avatar_url: null },
      ],
      error: null,
    });
  });

  it('lista colaboradores ativos da empresa atual sem restringir por cargo', async () => {
    const { result } = renderHook(() => useActiveCompanyProfiles(), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('user_id, full_name, avatar_url');
    expect(eq).toHaveBeenNthCalledWith(1, 'company_id', 'company-1');
    expect(eq).toHaveBeenNthCalledWith(2, 'is_active', true);
    expect(order).toHaveBeenCalledWith('full_name');
    expect(result.current.data?.map((profile) => profile.user_id)).toEqual([
      'user-1',
      'user-2',
    ]);
  });

  it('falha fechado e não consulta perfis sem empresa associada', () => {
    authState.profile = { company_id: null };

    const { result } = renderHook(() => useActiveCompanyProfiles(), {
      wrapper: wrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(from).not.toHaveBeenCalled();
  });
});
