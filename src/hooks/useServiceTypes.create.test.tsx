import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  toast: vi.fn(),
  getCurrentUserCompanyId: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/useUserCompany', () => ({ getCurrentUserCompanyId: mocks.getCurrentUserCompanyId }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      insert: (payload: unknown) => {
        mocks.insert(payload);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'service-type-1' }, error: null }) }) };
      },
    }),
  },
}));

import { useServiceTypes } from './useServiceTypes';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useServiceTypes: criar serviço', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserCompanyId.mockResolvedValue('company-1');
  });

  it('manda a empresa de quem está criando junto com o serviço', async () => {
    const { result } = renderHook(() => useServiceTypes(), { wrapper });

    await result.current.createServiceType.mutateAsync({
      name: 'Instalação de split',
      color: '#22c55e',
      requires_equipment: true,
      is_active: true,
    } as never);

    expect(mocks.insert).toHaveBeenCalledWith({
      name: 'Instalação de split',
      color: '#22c55e',
      requires_equipment: true,
      is_active: true,
      company_id: 'company-1',
    });
  });

  it('não tenta gravar quando a empresa do usuário não pôde ser identificada', async () => {
    mocks.getCurrentUserCompanyId.mockRejectedValue(new Error('Usuário sem empresa associada. Contate o administrador.'));
    const { result } = renderHook(() => useServiceTypes(), { wrapper });

    await expect(result.current.createServiceType.mutateAsync({ name: 'Limpeza', color: '#22c55e' } as never)).rejects.toThrow();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
