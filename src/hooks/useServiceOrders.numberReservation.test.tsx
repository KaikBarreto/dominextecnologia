import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServiceOrders, type ServiceOrderInput } from './useServiceOrders';

const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), insert: vi.fn(), toast: vi.fn(), syncServices: vi.fn(), syncBudget: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc, from: state.from } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/hooks/useUserCompany', () => ({ getCurrentUserCompanyId: async () => '22222222-2222-4222-8222-222222222222' }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/hooks/useServiceOrderBudget', () => ({
  SERVICE_ORDER_BUDGET_KEY: 'os-budget', SERVICE_ORDER_EQUIPMENT_SERVICES_KEY: 'os-equipment-services', SERVICE_ORDER_SERVICE_TYPES_KEY: 'os-services',
  syncServiceOrderBudget: state.syncBudget, syncServiceOrderServiceTypes: state.syncServices,
}));

const id = '33333333-3333-4333-8333-333333333333';
const payload: ServiceOrderInput = { number_reservation_id: id, customer_id: '44444444-4444-4444-8444-444444444444', os_type: 'manutencao_corretiva', status: 'pendente' };
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false }, mutations: { retry: false } } });
  return renderHook(() => useServiceOrders(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.rpc.mockImplementation(async (name: string) => name === 'reserve_service_order_number'
    ? { data: { reservation_id: id, order_number: 731 }, error: null }
    : { data: { id, order_number: 731 }, error: null });
  state.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id, order_number: 731 }, error: null }) }) });
  state.from.mockReturnValue({ insert: state.insert });
});

describe('useServiceOrders — número reservado', () => {
  it('revalida a reserva e insere o UUID e o número confirmados sem campo privado na tabela', async () => {
    const { result } = mount();
    await act(async () => { await result.current.createServiceOrder.mutateAsync(payload); });
    expect(state.rpc).toHaveBeenCalledWith('reserve_service_order_number', {
      p_company_id: '22222222-2222-4222-8222-222222222222', p_user_id: '11111111-1111-4111-8111-111111111111', p_request_id: id,
    });
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ id, order_number: 731 }));
    expect(state.insert.mock.calls[0][0]).not.toHaveProperty('number_reservation_id');
  });
  it('preserva a criação legada sem reservar número quando o chamador não usa reserva', async () => {
    const { result } = mount();
    const { number_reservation_id: _ignored, ...legacy } = payload;
    await act(async () => { await result.current.createServiceOrder.mutateAsync(legacy); });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.insert.mock.calls[0][0]).not.toHaveProperty('id');
    expect(state.insert.mock.calls[0][0]).not.toHaveProperty('order_number');
  });
  it('transporta a reserva para a RPC canônica de override e não insere por fora', async () => {
    const { result } = mount();
    await act(async () => { await result.current.createServiceOrder.mutateAsync({ ...payload, schedule_override: true, schedule_override_reason: 'Conflito autorizado pelo gestor' }); });
    expect(state.rpc).toHaveBeenCalledWith('schedule_create_service_order_with_override', expect.objectContaining({
      p_order: expect.objectContaining({ number_reservation_id: id }),
    }));
    expect(state.insert).not.toHaveBeenCalled();
  });
  it('preserva a reserva no override de plano com múltiplas jornadas', async () => {
    const { result } = mount();
    await act(async () => { await result.current.createServiceOrder.mutateAsync({ ...payload, schedule_override: true, schedule_override_reason: 'Conflito autorizado pelo gestor', schedule_plan: [{ date: '2026-11-20', time: '09:00', duration_minutes: 60 }] }); });
    expect(state.rpc).toHaveBeenCalledWith('schedule_create_service_order_plan_with_override', expect.objectContaining({ p_order: expect.objectContaining({ number_reservation_id: id }) }));
  });
  it('não insere se a reserva estiver consumida e traduz o erro sem detalhes internos', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: 'OSN03', message: 'SQLSTATE service_order_number_reservations' } });
    const { result } = mount();
    await act(async () => { await expect(result.current.createServiceOrder.mutateAsync(payload)).rejects.toThrow('OS salva'); });
    expect(state.insert).not.toHaveBeenCalled();
    const description = state.toast.mock.calls[state.toast.mock.calls.length - 1]?.[0]?.description;
    expect(description).toContain('OS salva');
    expect(description).not.toMatch(/OSN03|SQLSTATE|service_order_number/);
  });
  it('não insere com resposta de reserva inválida ou pertencente a outro pedido', async () => {
    state.rpc.mockResolvedValue({ data: { reservation_id: 'other', order_number: 731 }, error: null });
    const { result } = mount();
    await act(async () => { await expect(result.current.createServiceOrder.mutateAsync(payload)).rejects.toThrow('confirmar o número'); });
    expect(state.insert).not.toHaveBeenCalled();
  });
});
