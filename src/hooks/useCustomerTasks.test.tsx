import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  profile: { company_id: 'company-1' } as { company_id: string } | null,
  from: vi.fn(),
  taskEq: vi.fn(),
  assigneeIn: vi.fn(),
  taskResult: {
    data: [
      { id: 'task-2', customer_id: 'customer-1', entry_type: 'tarefa', task_title: 'Retornar contato' },
      { id: 'task-1', customer_id: 'customer-1', entry_type: 'tarefa', task_title: 'Enviar proposta' },
    ],
    error: null as unknown,
  },
  assigneeResult: {
    data: [
      { service_order_id: 'task-2', user_id: 'user-2' },
      { service_order_id: 'task-2', user_id: 'user-1' },
    ],
    error: null as unknown,
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: mocks.profile }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from },
}));

import { useCustomerTasks } from './useCustomerTasks';

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function queryChain(kind: 'tasks' | 'assignees') {
  type QueryChain = {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
  };
  const chain: QueryChain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: string) => {
      if (kind === 'tasks') mocks.taskEq(column, value);
      return chain;
    }),
    in: vi.fn((column: string, value: string[]) => {
      if (kind === 'assignees') mocks.assigneeIn(column, value);
      return chain;
    }),
    order: vi.fn(() => chain),
    range: vi.fn(() => Promise.resolve(kind === 'tasks' ? mocks.taskResult : mocks.assigneeResult)),
  };
  return chain;
}

describe('useCustomerTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile = { company_id: 'company-1' };
    mocks.taskResult = {
      data: [
        { id: 'task-2', customer_id: 'customer-1', entry_type: 'tarefa', task_title: 'Retornar contato' },
        { id: 'task-1', customer_id: 'customer-1', entry_type: 'tarefa', task_title: 'Enviar proposta' },
      ],
      error: null,
    };
    mocks.assigneeResult = {
      data: [
        { service_order_id: 'task-2', user_id: 'user-2' },
        { service_order_id: 'task-2', user_id: 'user-1' },
      ],
      error: null,
    };
    mocks.from.mockImplementation((table: string) => {
      if (table === 'service_orders') return queryChain('tasks');
      if (table === 'service_order_assignees') return queryChain('assignees');
      throw new Error(`Tabela inesperada: ${table}`);
    });
  });

  it('consulta somente tarefas do cliente e empresa atuais e carrega responsáveis', async () => {
    const { result } = renderHook(() => useCustomerTasks('customer-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.taskEq).toHaveBeenCalledWith('company_id', 'company-1');
    expect(mocks.taskEq).toHaveBeenCalledWith('customer_id', 'customer-1');
    expect(mocks.taskEq).toHaveBeenCalledWith('entry_type', 'tarefa');
    expect(mocks.assigneeIn).toHaveBeenCalledWith('service_order_id', ['task-2', 'task-1']);
    expect(result.current.tasks).toEqual([
      expect.objectContaining({ id: 'task-2', _assignee_user_ids: ['user-2', 'user-1'] }),
      expect.objectContaining({ id: 'task-1', _assignee_user_ids: [] }),
    ]);
  });

  it('preserva o estado de erro em vez de converter a falha em lista vazia bem-sucedida', async () => {
    mocks.taskResult = { data: [], error: { message: 'permission denied' } };
    const { result } = renderHook(() => useCustomerTasks('customer-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.tasks).toEqual([]);
    expect(result.current.error).toMatchObject({ message: 'permission denied' });
  });

  it('não consulta sem cliente, empresa ou quando a aba está desativada', () => {
    const first = renderHook(() => useCustomerTasks(undefined), { wrapper });
    expect(mocks.from).not.toHaveBeenCalled();
    first.unmount();

    mocks.profile = null;
    const second = renderHook(() => useCustomerTasks('customer-1'), { wrapper });
    expect(mocks.from).not.toHaveBeenCalled();
    second.unmount();

    mocks.profile = { company_id: 'company-1' };
    renderHook(() => useCustomerTasks('customer-1', false), { wrapper });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
