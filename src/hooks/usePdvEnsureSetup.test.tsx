import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc },
}));

import { usePdvEnsureSetup } from './usePdvEnsureSetup';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePdvEnsureSetup', () => {
  beforeEach(() => rpc.mockReset());

  it('aceita o contrato legado confirmado de três booleanos sem inventar pendências', async () => {
    rpc.mockResolvedValue({ data: { configured: true, cash_account_created: false, terminal_created: true }, error: null });
    const { result } = renderHook(() => usePdvEnsureSetup(), { wrapper });

    await expect(result.current.mutateAsync()).resolves.toEqual({ configured: true, cashAccountCreated: false, terminalCreated: true, needsStock: false, needsCashClose: false });
  });

  it.each([
    ['estoque pendente', { needs_stock: true, needs_cash_close: false }],
    ['fechamento pendente', { needs_stock: false, needs_cash_close: true }],
    ['preparação não confirmada', { needs_stock: false, needs_cash_close: false }],
  ])('preserva resposta moderna não configurada: %s', async (_name, flags) => {
    rpc.mockResolvedValue({ data: { configured: false, cash_account_created: false, terminal_created: false, ...flags }, error: null });
    const { result } = renderHook(() => usePdvEnsureSetup(), { wrapper });

    await expect(result.current.mutateAsync()).resolves.toEqual({ configured: false, cashAccountCreated: false, terminalCreated: false, needsStock: flags.needs_stock, needsCashClose: flags.needs_cash_close });
  });

  it.each([
    ['legado não configurado', { configured: false, cash_account_created: false, terminal_created: false }],
    ['legado incompleto', { configured: true, cash_account_created: false }],
    ['base com string', { configured: true, cash_account_created: 'false', terminal_created: false }],
    ['configured nulo', { configured: null, cash_account_created: false, terminal_created: false }],
    ['configured string', { configured: 'true', cash_account_created: false, terminal_created: false }],
    ['somente needs_stock', { configured: true, cash_account_created: false, terminal_created: false, needs_stock: false }],
    ['somente needs_cash_close', { configured: true, cash_account_created: false, terminal_created: false, needs_cash_close: false }],
    ['needs_stock nulo', { configured: true, cash_account_created: false, terminal_created: false, needs_stock: null, needs_cash_close: false }],
    ['needs_cash_close string', { configured: true, cash_account_created: false, terminal_created: false, needs_stock: false, needs_cash_close: 'false' }],
    ['opcionais undefined explícitos', { configured: true, cash_account_created: false, terminal_created: false, needs_stock: undefined, needs_cash_close: undefined }],
    ['valor nulo', null],
    ['array', []],
  ])('rejeita contrato malformado ou incompleto: %s', async (_name, data) => {
    rpc.mockResolvedValue({ data, error: null });
    const { result } = renderHook(() => usePdvEnsureSetup(), { wrapper });

    await expect(result.current.mutateAsync()).rejects.toThrow('O servidor não confirmou a preparação do caixa.');
    expect(result.current.data).toBeUndefined();
  });

  it('projeta somente o resultado operacional da preparação', async () => {
    rpc.mockResolvedValue({ data: { configured: true, cash_account_created: true, terminal_created: false, needs_stock: true, needs_cash_close: false, company_id: 'segredo' }, error: null });
    const { result } = renderHook(() => usePdvEnsureSetup(), { wrapper });

    const setup = await result.current.mutateAsync();

    expect(rpc).toHaveBeenCalledWith('pdv_ensure_setup');
    expect(setup).toEqual({ configured: true, cashAccountCreated: true, terminalCreated: false, needsStock: true, needsCashClose: false });
    expect(setup).not.toHaveProperty('company_id');
  });

  it('orienta a fechar o turno antes de trocar uma conta inválida', async () => {
    rpc.mockResolvedValue({ data: {
      configured: false,
      cash_account_created: false,
      terminal_created: false,
      needs_stock: false,
      needs_cash_close: true,
    }, error: null });
    const { result } = renderHook(() => usePdvEnsureSetup(), { wrapper });

    await expect(result.current.mutateAsync()).resolves.toEqual(expect.objectContaining({
      configured: false,
      needsCashClose: true,
    }));
  });

  it('não expõe erro interno de permissão', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', details: 'code=pdv_setup_permission_denied', message: 'internal' } });
    const { result } = renderHook(() => usePdvEnsureSetup(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.error?.message).toBe('Somente um administrador ou gestor pode preparar o primeiro caixa.'));
  });

  it('diferencia assinatura indisponível de falta de permissão', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', details: 'code=pdv_setup_subscription_denied', message: 'internal' } });
    const { result } = renderHook(() => usePdvEnsureSetup(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.error?.message).toBe('A assinatura da empresa não permite preparar o PDV agora.'));
  });

  it('falha fechado quando o servidor não confirma o contrato', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => usePdvEnsureSetup(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.error?.message).toMatch(/não confirmou a preparação/i));
  });
});
