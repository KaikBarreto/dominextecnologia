import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { gates, fetchOsRevenueSuggestedAmount } = vi.hoisted(() => ({
  gates: {
    screenAccess: true,
    moduleAccess: true,
    canLaunchRevenue: true,
  },
  fetchOsRevenueSuggestedAmount: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasScreenAccess: () => gates.screenAccess }),
}));

vi.mock('@/hooks/useCompanyModules', () => ({
  useCompanyModules: () => ({ hasScreen: () => gates.moduleAccess }),
}));

vi.mock('@/hooks/useCanLaunchOsRevenue', () => ({
  useCanLaunchOsRevenue: () => gates.canLaunchRevenue,
}));

vi.mock('@/hooks/useOsRevenueSuggestedAmount', () => ({
  fetchOsRevenueSuggestedAmount,
}));

import { buildOsBillingContext, useOsBillingAction } from './useOsBillingAction';

const OS = {
  id: 'os-1',
  order_number: 8590,
  customer_id: 'customer-1',
  customer: { name: 'Cliente de teste' },
  total_value: 0,
};

describe('useOsBillingAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gates.screenAccess = true;
    gates.moduleAccess = true;
    gates.canLaunchRevenue = true;
    fetchOsRevenueSuggestedAmount.mockResolvedValue(875.4);
  });

  it('monta o contexto base completo da OS', () => {
    expect(buildOsBillingContext(OS)).toEqual({
      serviceOrderId: 'os-1',
      osNumber: 8590,
      customerId: 'customer-1',
      customerName: 'Cliente de teste',
      suggestedAmount: 0,
    });
  });

  it.each([
    [true, true, true, true],
    [false, true, true, false],
    [true, false, true, false],
    [true, true, false, false],
  ])(
    'gate screen=%s módulo=%s permissão=%s resulta em canBill=%s',
    (screenAccess, moduleAccess, canLaunchRevenue, expected) => {
      gates.screenAccess = screenAccess;
      gates.moduleAccess = moduleAccess;
      gates.canLaunchRevenue = canLaunchRevenue;
      const { result } = renderHook(() => useOsBillingAction());
      expect(result.current.canBill).toBe(expected);
    },
  );

  it('relê o total canônico antes de abrir a ação manual', async () => {
    const { result } = renderHook(() => useOsBillingAction());

    await act(async () => {
      await result.current.open(OS);
    });

    expect(fetchOsRevenueSuggestedAmount).toHaveBeenCalledWith('os-1');
    expect(result.current.isOpen).toBe(true);
    expect(result.current.context?.suggestedAmount).toBe(875.4);
  });

  it('preserva o valor da tela quando a releitura falha', async () => {
    fetchOsRevenueSuggestedAmount.mockResolvedValue(null);
    const { result } = renderHook(() => useOsBillingAction());

    await act(async () => {
      await result.current.open({ ...OS, total_value: 320 });
    });

    expect(result.current.context?.suggestedAmount).toBe(320);
  });

  it('mantém somente a OS da abertura mais recente quando as respostas chegam fora de ordem', async () => {
    let resolveA!: (value: number | null) => void;
    let resolveB!: (value: number | null) => void;
    const promiseA = new Promise<number | null>((resolve) => { resolveA = resolve; });
    const promiseB = new Promise<number | null>((resolve) => { resolveB = resolve; });
    fetchOsRevenueSuggestedAmount.mockImplementation((id: string) => id === 'os-a' ? promiseA : promiseB);
    const { result } = renderHook(() => useOsBillingAction());

    let openingA!: Promise<void>;
    let openingB!: Promise<void>;
    act(() => {
      openingA = result.current.open({ ...OS, id: 'os-a', order_number: 1 });
      openingB = result.current.open({ ...OS, id: 'os-b', order_number: 2 });
    });

    await act(async () => {
      resolveB(200);
      await openingB;
    });
    expect(result.current.context?.serviceOrderId).toBe('os-b');
    expect(result.current.context?.suggestedAmount).toBe(200);

    await act(async () => {
      resolveA(100);
      await openingA;
    });
    expect(result.current.context?.serviceOrderId).toBe('os-b');
    expect(result.current.context?.suggestedAmount).toBe(200);
  });
});
