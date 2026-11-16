import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
import { usePlanChange } from './usePlanChange';
function setup(error: unknown) {
  invoke.mockResolvedValue({ data: null, error });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(() => usePlanChange(), { wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
const input = { companyId: 'fictitious-company', planCode: 'retail_start', billingCycle: 'monthly' as const, confirm: true };
describe('orientação da contratação', () => {
  it('preserva a orientação de domínio em PT-BR enviada pela edge', async () => {
    const { result } = setup({ message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: 'O preço do kit Loja ainda não está disponível.' }), { status: 400 }) });
    await expect(result.current.mutateAsync(input)).rejects.toThrow('O preço do kit Loja ainda não está disponível.');
  });
  it('falha com orientação local quando não há mensagem de domínio', async () => {
    const { result } = setup(new Error('SQLSTATE fixture_internal_error'));
    await expect(result.current.mutateAsync(input)).rejects.toThrow('Não foi possível confirmar as condições do plano. Atualize a página e tente novamente.');
  });
});
