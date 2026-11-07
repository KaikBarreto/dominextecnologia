import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuotes, type QuoteInput } from './useQuotes';

const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc, from: state.from } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-a' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/hooks/useUserCompany', () => ({ getCurrentUserCompanyId: async () => 'company-a' }));

const payload: QuoteInput = {
  number_reservation_id: 'reservation-a', prospect_name: 'Cliente de teste', total_value: 63,
  final_price: 63, items: [{ position: 0, item_type: 'servico', description: 'Serviço', quantity: 6, unit_price: 10.5, total_price: 63 }],
};
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...renderHook(() => useQuotes(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }), client };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.from.mockImplementation(() => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }));
  state.rpc.mockResolvedValue({ data: { id: 'quote-a', quote_number: 731 }, error: null });
});
describe('criação com número reservado', () => {
  it('cria orçamento e itens pela chamada atômica sem inserts separados e retorna o número confirmado', async () => {
    const { result } = mount();
    let created;
    await act(async () => { created = await result.current.createQuote.mutateAsync(payload); });
    expect(created).toMatchObject({ id: 'quote-a', quote_number: 731 });
    expect(state.rpc).toHaveBeenCalledWith('create_reserved_quote', expect.objectContaining({
      p_reservation_id: 'reservation-a', p_company_id: 'company-a', p_user_id: 'user-a',
      p_quote: expect.objectContaining({ prospect_name: 'Cliente de teste', total_value: 63 }),
      p_items: [expect.objectContaining({ position: 0, quantity: 6, unit_price: 10.5, total_price: 63 })],
    }));
    const args = state.rpc.mock.calls[0][1];
    expect(args.p_quote).not.toHaveProperty('number_reservation_id');
    expect(args.p_quote).not.toHaveProperty('final_price');
    expect(args.p_items[0]).not.toHaveProperty('quote_id');
    expect(state.from.mock.calls.every(([table]) => table === 'quotes')).toBe(true);
  });
  it('traduz conflito antes de chegar à mensagem de erro da tela', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: 'QNR03', message: 'SQLSTATE constraint quote_number_reservations' } });
    const { result, client } = mount();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await act(async () => { await expect(result.current.createQuote.mutateAsync(payload)).rejects.toThrow('outra versão'); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['quote-number-reservation', 'company-a', 'user-a', 'reservation-a'], exact: true });
    const toast = state.toast.mock.calls[state.toast.mock.calls.length - 1]?.[0];
    expect(toast.description).toContain('outra versão');
    expect(toast.description).not.toMatch(/QNR03|SQLSTATE|constraint|quote_number/);
  });
  it('mantém a mesma reserva para repetir uma falha de rede sem confirmação', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    const { result, client } = mount();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await act(async () => { await expect(result.current.createQuote.mutateAsync(payload)).rejects.toThrow('Seus dados foram mantidos'); });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
