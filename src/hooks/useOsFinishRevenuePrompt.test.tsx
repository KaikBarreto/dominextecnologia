import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  gates,
  fetchOsRevenueTotals,
  fetchOsRevenueSuggestedAmount,
} = vi.hoisted(() => ({
  gates: {
    settings: { os_finish_revenue_prompt_enabled: true } as Record<string, unknown> | null,
    canLaunch: true,
    planAllowsFinance: true,
  },
  fetchOsRevenueTotals: vi.fn(),
  fetchOsRevenueSuggestedAmount: vi.fn(),
}));

vi.mock('@/hooks/useCompanySettings', () => ({
  useCompanySettings: () => ({ settings: gates.settings }),
}));

vi.mock('@/hooks/useCanLaunchOsRevenue', () => ({
  useCanLaunchOsRevenue: () => gates.canLaunch,
}));

vi.mock('@/hooks/useCompanyModules', () => ({
  useCompanyModules: () => ({ hasScreen: () => gates.planAllowsFinance }),
}));

vi.mock('@/hooks/useOsRevenueSummary', () => ({
  fetchOsRevenueTotals,
}));

vi.mock('@/hooks/useOsRevenueSuggestedAmount', () => ({
  fetchOsRevenueSuggestedAmount,
}));

import { useOsFinishRevenuePrompt } from './useOsFinishRevenuePrompt';

const BASE_CONTEXT = {
  serviceOrderId: 'os-1',
  osNumber: 8590,
  customerId: 'customer-1',
  customerName: 'Cliente de teste',
  suggestedAmount: 320,
};

describe('useOsFinishRevenuePrompt — gates, valor e idempotência', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    gates.settings = { os_finish_revenue_prompt_enabled: true };
    gates.canLaunch = true;
    gates.planAllowsFinance = true;
    fetchOsRevenueTotals.mockResolvedValue({ total: 0, count: 0 });
    fetchOsRevenueSuggestedAmount.mockResolvedValue(875.4);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('relê o total canônico e substitui o valor defasado recebido da tela', async () => {
    const { result } = renderHook(() => useOsFinishRevenuePrompt());

    await act(async () => {
      await result.current.maybeOpen({ ...BASE_CONTEXT, suggestedAmount: 0 });
    });

    expect(fetchOsRevenueTotals).toHaveBeenCalledWith('os-1');
    expect(fetchOsRevenueSuggestedAmount).toHaveBeenCalledWith('os-1');
    expect(result.current.dialogProps.open).toBe(true);
    expect(result.current.dialogProps.context).toEqual({
      ...BASE_CONTEXT,
      suggestedAmount: 875.4,
    });
  });

  it.each([
    { label: 'zero', fresh: 0, expected: 0 },
    { label: 'decimal', fresh: 1234.56, expected: 1234.56 },
  ])('aceita o valor canônico $label', async ({ fresh, expected }) => {
    fetchOsRevenueSuggestedAmount.mockResolvedValue(fresh);
    const { result } = renderHook(() => useOsFinishRevenuePrompt());

    await act(async () => {
      await result.current.maybeOpen(BASE_CONTEXT);
    });

    expect(result.current.dialogProps.open).toBe(true);
    expect(result.current.dialogProps.context?.suggestedAmount).toBe(expected);
  });

  it('preserva o valor da tela quando a releitura não encontra um total utilizável', async () => {
    fetchOsRevenueSuggestedAmount.mockResolvedValue(null);
    const { result } = renderHook(() => useOsFinishRevenuePrompt());

    await act(async () => {
      await result.current.maybeOpen(BASE_CONTEXT);
    });

    expect(result.current.dialogProps.open).toBe(true);
    expect(result.current.dialogProps.context?.suggestedAmount).toBe(320);
  });

  it('preserva null quando não existe valor fresco nem fallback da tela', async () => {
    fetchOsRevenueSuggestedAmount.mockResolvedValue(null);
    const { result } = renderHook(() => useOsFinishRevenuePrompt());

    await act(async () => {
      await result.current.maybeOpen({ serviceOrderId: 'os-sem-valor' });
    });

    expect(result.current.dialogProps.open).toBe(true);
    expect(result.current.dialogProps.context?.suggestedAmount).toBeNull();
  });

  it('não consulta nada quando o ID da OS está vazio', async () => {
    const { result } = renderHook(() => useOsFinishRevenuePrompt());

    await act(async () => {
      await result.current.maybeOpen({ serviceOrderId: '' });
    });

    expect(fetchOsRevenueTotals).not.toHaveBeenCalled();
    expect(fetchOsRevenueSuggestedAmount).not.toHaveBeenCalled();
    expect(result.current.dialogProps.open).toBe(false);
    expect(result.current.dialogProps.context).toBeNull();
  });

  it.each([
    {
      label: 'toggle desligado',
      configure: () => { gates.settings = { os_finish_revenue_prompt_enabled: false }; },
    },
    {
      label: 'toggle ausente',
      configure: () => { gates.settings = {}; },
    },
    {
      label: 'configuração indisponível',
      configure: () => { gates.settings = null; },
    },
    {
      label: 'usuário sem permissão',
      configure: () => { gates.canLaunch = false; },
    },
    {
      label: 'plano sem Financeiro',
      configure: () => { gates.planAllowsFinance = false; },
    },
  ])('não abre nem consulta dados com $label', async ({ configure }) => {
    configure();
    const { result } = renderHook(() => useOsFinishRevenuePrompt());

    await act(async () => {
      await result.current.maybeOpen(BASE_CONTEXT);
    });

    expect(fetchOsRevenueTotals).not.toHaveBeenCalled();
    expect(fetchOsRevenueSuggestedAmount).not.toHaveBeenCalled();
    expect(result.current.dialogProps.open).toBe(false);
    expect(result.current.dialogProps.context).toBeNull();
  });

  it('falha fechado quando a consulta de receitas não confirma a idempotência', async () => {
    fetchOsRevenueTotals.mockResolvedValue(null);
    const { result } = renderHook(() => useOsFinishRevenuePrompt());

    await act(async () => {
      await result.current.maybeOpen(BASE_CONTEXT);
    });

    expect(result.current.dialogProps.open).toBe(false);
    expect(result.current.dialogProps.context).toBeNull();
  });

  it('não propaga exceção da consulta de receitas e permanece fechado', async () => {
    fetchOsRevenueTotals.mockRejectedValue(new Error('falha ao consultar receitas'));
    const { result } = renderHook(() => useOsFinishRevenuePrompt());

    await act(async () => {
      await expect(result.current.maybeOpen(BASE_CONTEXT)).resolves.toBeUndefined();
    });

    expect(result.current.dialogProps.open).toBe(false);
    expect(result.current.dialogProps.context).toBeNull();
  });

  it('não propaga exceção inesperada da releitura do valor e permanece fechado', async () => {
    fetchOsRevenueSuggestedAmount.mockRejectedValue(new Error('falha inesperada'));
    const { result } = renderHook(() => useOsFinishRevenuePrompt());

    await act(async () => {
      await expect(result.current.maybeOpen(BASE_CONTEXT)).resolves.toBeUndefined();
    });

    expect(result.current.dialogProps.open).toBe(false);
    expect(result.current.dialogProps.context).toBeNull();
  });

  it('continua sem abrir quando a OS já possui receita', async () => {
    fetchOsRevenueTotals.mockResolvedValue({ total: 875.4, count: 1 });
    const { result } = renderHook(() => useOsFinishRevenuePrompt());

    await act(async () => {
      await result.current.maybeOpen(BASE_CONTEXT);
    });

    expect(result.current.dialogProps.open).toBe(false);
    expect(result.current.dialogProps.context).toBeNull();
  });

  it('fecha e reabre com o contexto atualizado de outra OS', async () => {
    const { result } = renderHook(() => useOsFinishRevenuePrompt());

    await act(async () => {
      await result.current.maybeOpen(BASE_CONTEXT);
    });
    expect(result.current.dialogProps.open).toBe(true);
    expect(result.current.dialogProps.context?.serviceOrderId).toBe('os-1');

    act(() => {
      result.current.dialogProps.onOpenChange(false);
    });
    expect(result.current.dialogProps.open).toBe(false);
    // O contexto fica vivo durante a animação de saída, por contrato do hook.
    expect(result.current.dialogProps.context?.serviceOrderId).toBe('os-1');

    fetchOsRevenueSuggestedAmount.mockResolvedValue(450);
    await act(async () => {
      await result.current.maybeOpen({ serviceOrderId: 'os-2', suggestedAmount: 10 });
    });

    expect(result.current.dialogProps.open).toBe(true);
    expect(result.current.dialogProps.context).toEqual({
      serviceOrderId: 'os-2',
      suggestedAmount: 450,
    });
    expect(fetchOsRevenueTotals).toHaveBeenLastCalledWith('os-2');
    expect(fetchOsRevenueSuggestedAmount).toHaveBeenLastCalledWith('os-2');
  });
});
