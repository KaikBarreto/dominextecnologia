import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, rpcResult, toast } = vi.hoisted(() => ({
  rpc: vi.fn(),
  rpcResult: {
    current: { data: [] as Array<{ id: string; name: string }> | null, error: null as unknown },
  },
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'form_templates') throw new Error(`tabela inesperada: ${table}`);
      return {
        select: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    },
    rpc: (name: string, params: unknown) => {
      rpc(name, params);
      return Promise.resolve(rpcResult.current);
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }),
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

import { useFormTemplates } from './useFormTemplates';

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useFormTemplates(), { wrapper: Wrapper });
  return { ...hook, invalidate };
}

beforeEach(() => {
  rpc.mockClear();
  toast.mockClear();
  rpcResult.current = { data: [], error: null };
});

describe('useFormTemplates — duplicação', () => {
  it.each([1, 20])('remove espaços do nome e envia %i cópia(s) para a RPC', async (copyCount) => {
    rpcResult.current = {
      data: Array.from({ length: copyCount }, (_, index) => ({
        id: `copy-${index + 1}`,
        name: copyCount === 1 ? 'Checklist filial' : `Checklist filial (${index + 1})`,
      })),
      error: null,
    };
    const { result } = setup();

    await act(async () => {
      await result.current.duplicateTemplate.mutateAsync({
        sourceId: 'template-original',
        baseName: '  Checklist filial  ',
        copyCount,
      });
    });

    expect(rpc).toHaveBeenCalledWith('duplicate_form_template', {
      p_source_id: 'template-original',
      p_base_name: 'Checklist filial',
      p_copy_count: copyCount,
    });
  });

  it('invalida a raiz canônica e informa sucesso no singular', async () => {
    rpcResult.current = { data: [{ id: 'copy-1', name: 'Checklist filial' }], error: null };
    const { result, invalidate } = setup();

    await act(async () => {
      await result.current.duplicateTemplate.mutateAsync({
        sourceId: 'template-original',
        baseName: 'Checklist filial',
        copyCount: 1,
      });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['form-templates'] });
    expect(toast).toHaveBeenCalledWith({ title: 'Checklist duplicado como inativo' });
  });

  it('informa corretamente vinte cópias concluídas', async () => {
    rpcResult.current = {
      data: Array.from({ length: 20 }, (_, index) => ({ id: `copy-${index}`, name: `Cópia ${index}` })),
      error: null,
    };
    const { result } = setup();

    await act(async () => {
      await result.current.duplicateTemplate.mutateAsync({
        sourceId: 'template-original',
        baseName: 'Checklist filial',
        copyCount: 20,
      });
    });

    expect(toast).toHaveBeenCalledWith({ title: '20 checklists duplicados como inativos' });
  });

  it('propaga a falha, não invalida o cache e traduz o erro de permissão', async () => {
    const databaseError = { code: '42501', message: 'permission denied' };
    rpcResult.current = { data: null, error: databaseError };
    const { result, invalidate } = setup();

    await expect(result.current.duplicateTemplate.mutateAsync({
      sourceId: 'template-original',
      baseName: 'Checklist filial',
      copyCount: 1,
    })).rejects.toBe(databaseError);

    expect(invalidate).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      title: 'Erro ao duplicar checklist',
      description: 'Você não tem permissão para realizar esta ação.',
      variant: 'destructive',
    });
  });
});
