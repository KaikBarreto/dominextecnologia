import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmployeeMovement } from '@/utils/employeeCalculations';

const { rpc, from, toast } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc, from },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/hooks/useCreditCardBills', () => ({
  getRpcErrorMessage: (error: { message?: string }) => error.message || 'Erro inesperado',
}));

import { useEmployeeMovements } from './useEmployeeMovements';

const vale: EmployeeMovement = {
  id: 'mov-vale-1',
  employee_id: 'emp-1',
  type: 'vale',
  amount: 100,
  balance_after: 900,
  description: 'Adiantamento',
  payment_method: 'acc-1',
  payment_details: null,
  created_by: 'user-1',
  created_at: '2026-09-22T10:00:00Z',
  financial_transaction_id: 'txn-1',
  idempotency_key: '00000000-0000-4000-8000-000000000001',
};

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useEmployeeMovements — vale financeiro atômico', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: null, error: null });
  });

  it('cria RH e Financeiro pela RPC com a chave idempotente do cliente', async () => {
    const { result } = renderHook(() => useEmployeeMovements(), { wrapper: wrapper() });

    await act(async () => {
      await result.current.createVale.mutateAsync({
        employee_id: 'emp-1',
        account_id: 'acc-1',
        amount: 143.87,
        description: 'Vale de setembro',
        cost_center_id: 'cc-1',
        idempotency_key: '00000000-0000-4000-8000-000000000001',
        transaction_date: '2026-09-22',
      });
    });

    expect(rpc).toHaveBeenCalledWith('create_employee_vale', {
      p_employee_id: 'emp-1',
      p_account_id: 'acc-1',
      p_amount: 143.87,
      p_description: 'Vale de setembro',
      p_cost_center_id: 'cc-1',
      p_idempotency_key: '00000000-0000-4000-8000-000000000001',
      p_transaction_date: '2026-09-22',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('exclui vale pela RPC vinculada e não pelo delete direto da tabela', async () => {
    const { result } = renderHook(() => useEmployeeMovements(), { wrapper: wrapper() });

    await act(async () => {
      await result.current.deleteMovement.mutateAsync({
        id: vale.id,
        movements: [vale],
        salary: 1000,
      });
    });

    expect(rpc).toHaveBeenCalledWith('delete_employee_vale', {
      p_movement_id: vale.id,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('mantém o vale legado na tela quando o banco recusa excluir sem vínculo', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Vale antigo sem vínculo financeiro. Faça a conciliação antes de excluir.' },
    });
    const { result } = renderHook(() => useEmployeeMovements(), { wrapper: wrapper() });

    await expect(act(async () => {
      await result.current.deleteMovement.mutateAsync({
        id: vale.id,
        movements: [{ ...vale, financial_transaction_id: null }],
        salary: 1000,
      });
    })).rejects.toMatchObject({ message: expect.stringContaining('sem vínculo financeiro') });

    expect(from).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        variant: 'destructive',
        title: 'Erro ao excluir movimentação',
        description: expect.stringContaining('sem vínculo financeiro'),
      }));
    });
  });

  it('exclui saldo residual como movimento de RH sem chamar a RPC financeira', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const deleteRow = vi.fn(() => ({ eq }));
    from.mockReturnValue({ delete: deleteRow });
    const residual = { ...vale, id: 'residual-1', type: 'vale_residual', financial_transaction_id: null };
    const { result } = renderHook(() => useEmployeeMovements(), { wrapper: wrapper() });

    await act(async () => {
      await result.current.deleteMovement.mutateAsync({
        id: residual.id,
        movements: [residual],
        salary: 1000,
      });
    });

    expect(from).toHaveBeenCalledWith('employee_movements');
    expect(deleteRow).toHaveBeenCalledOnce();
    expect(eq).toHaveBeenCalledWith('id', residual.id);
    expect(rpc).not.toHaveBeenCalled();
  });
});
