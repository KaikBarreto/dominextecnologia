import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, rpcResult, toast } = vi.hoisted(() => ({
  rpc: vi.fn(),
  rpcResult: {
    current: { data: [] as Array<{ id: string; title: string }> | null, error: null as unknown },
  },
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, params: unknown) => {
      rpc(name, params);
      return Promise.resolve(rpcResult.current);
    },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  // loading=true mantém a query de listagem desligada; estes testes exercitam
  // exclusivamente o contrato da mutation de duplicação.
  useAuth: () => ({ user: { id: 'user-1' }, loading: true }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

import { useLeadCaptureForms } from './useLeadCaptureForms';

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useLeadCaptureForms(), { wrapper: Wrapper });
  return { ...hook, invalidate };
}

beforeEach(() => {
  rpc.mockClear();
  toast.mockClear();
  rpcResult.current = { data: [], error: null };
});

describe('useLeadCaptureForms — duplicação', () => {
  it.each([1, 20])('envia os parâmetros corretos para a RPC com %i cópia(s)', async (copyCount) => {
    rpcResult.current = {
      data: Array.from({ length: copyCount }, (_, index) => ({
        id: `copy-${index + 1}`,
        title: copyCount === 1 ? 'Pesquisa filial' : `Pesquisa filial (${index + 1})`,
      })),
      error: null,
    };
    const { result } = setup();

    await act(async () => {
      await result.current.duplicateForm.mutateAsync({
        sourceId: 'form-original',
        baseName: 'Pesquisa filial',
        copyCount,
      });
    });

    expect(rpc).toHaveBeenCalledWith('duplicate_lead_capture_form', {
      p_source_id: 'form-original',
      p_base_name: 'Pesquisa filial',
      p_copy_count: copyCount,
    });
  });

  it('invalida todas as leituras derivadas e informa sucesso no singular', async () => {
    rpcResult.current = { data: [{ id: 'copy-1', title: 'Pesquisa filial' }], error: null };
    const { result, invalidate } = setup();

    await act(async () => {
      await result.current.duplicateForm.mutateAsync({
        sourceId: 'form-original',
        baseName: 'Pesquisa filial',
        copyCount: 1,
      });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['lead-capture-forms'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['public-form-questions'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['public-form-question-counts'] });
    expect(toast).toHaveBeenCalledWith({
      title: 'Formulário duplicado',
      description: 'A cópia está inativa para você revisar antes de publicar.',
    });
  });

  it('usa a quantidade solicitada quando a resposta de sucesso vier vazia', async () => {
    rpcResult.current = { data: null, error: null };
    const { result } = setup();

    await act(async () => {
      await result.current.duplicateForm.mutateAsync({
        sourceId: 'form-original',
        baseName: 'Pesquisa filial',
        copyCount: 20,
      });
    });

    expect(toast).toHaveBeenCalledWith({
      title: '20 formulários duplicados',
      description: 'As cópias estão inativas para você revisar antes de publicar.',
    });
  });

  it('propaga a falha, não invalida caches e traduz o erro de permissão para PT-BR', async () => {
    const databaseError = { code: '42501', message: 'permission denied' };
    rpcResult.current = { data: null, error: databaseError };
    const { result, invalidate } = setup();

    await expect(result.current.duplicateForm.mutateAsync({
      sourceId: 'form-original',
      baseName: 'Pesquisa filial',
      copyCount: 1,
    })).rejects.toBe(databaseError);

    expect(invalidate).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      variant: 'destructive',
      title: 'Não foi possível duplicar o formulário',
      description: 'Você não tem permissão para realizar esta ação.',
    });
  });
});
