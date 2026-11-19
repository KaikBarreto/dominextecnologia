import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), getCurrentUserCompanyId: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useUserCompany', () => ({ getCurrentUserCompanyId: mocks.getCurrentUserCompanyId }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
      insert: (payload: unknown) => {
        mocks.insert(payload);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'task-type-1' }, error: null }) }) };
      },
    }),
  },
}));

import { useTaskTypes } from './useTaskTypes';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useTaskTypes: criar tipo de tarefa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserCompanyId.mockResolvedValue('company-1');
  });

  it('manda a empresa de quem está criando junto com o tipo de tarefa', async () => {
    const { result } = renderHook(() => useTaskTypes(), { wrapper });

    await result.current.createTaskType.mutateAsync({ name: 'Visita técnica', color: '#8b5cf6' });

    expect(mocks.insert).toHaveBeenCalledWith({ name: 'Visita técnica', color: '#8b5cf6', company_id: 'company-1' });
  });
});
