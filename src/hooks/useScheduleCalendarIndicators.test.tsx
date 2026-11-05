import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc },
}));

import { useScheduleCalendarIndicators } from './useScheduleCalendarIndicators';

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useScheduleCalendarIndicators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envia todo o contexto à RPC e converte contagens do calendário', async () => {
    rpc.mockResolvedValue({
      data: [{
        schedule_date: '2028-04-12',
        has_contract_occurrence: true,
        has_service_order: true,
        contract_occurrence_matches_equipment: true,
        service_order_matches_equipment: false,
        contract_occurrence_count: 3,
        service_order_count: 2,
        contract_occurrence_equipment_count: 1,
        service_order_equipment_count: 0,
      }],
      error: null,
    });

    const { result } = renderHook(() => useScheduleCalendarIndicators({
      month: new Date(2028, 3, 15),
      customerId: 'cliente-1',
      equipmentIds: ['equipamento-2', 'equipamento-1'],
      excludeServiceOrderId: 'os-atual',
    }), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith('get_schedule_calendar_indicators', {
      p_start_date: '2028-03-26',
      p_end_date: '2028-05-06',
      p_customer_id: 'cliente-1',
      p_equipment_ids: ['equipamento-2', 'equipamento-1'],
      p_exclude_service_order_id: 'os-atual',
    });
    expect(result.current.data).toEqual([{
      date: '2028-04-12',
      hasContractOccurrence: true,
      hasServiceOrder: true,
      contractOccurrenceMatchesEquipment: true,
      serviceOrderMatchesEquipment: false,
      contractOccurrenceCount: 3,
      serviceOrderCount: 2,
      contractOccurrenceEquipmentCount: 1,
      serviceOrderEquipmentCount: 0,
    }]);
  });

  it('mantém um marcador seguro se a resposta vier da versão anterior da RPC', async () => {
    rpc.mockResolvedValue({
      data: [{
        schedule_date: '2028-04-12',
        has_contract_occurrence: true,
        has_service_order: false,
        contract_occurrence_matches_equipment: true,
        service_order_matches_equipment: false,
      }],
      error: null,
    });

    const { result } = renderHook(() => useScheduleCalendarIndicators({
      month: new Date(2028, 3, 15),
    }), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({
      contractOccurrenceCount: 1,
      contractOccurrenceEquipmentCount: 1,
      serviceOrderCount: 0,
      serviceOrderEquipmentCount: 0,
    });
  });

  it('expõe a falha para a interface e não consulta quando desabilitado', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'falha de rede' } });
    const { result } = renderHook(() => useScheduleCalendarIndicators({
      month: new Date(2028, 3, 15),
    }), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ message: 'falha de rede' });

    rpc.mockClear();
    const disabled = renderHook(() => useScheduleCalendarIndicators({
      month: new Date(2028, 3, 15),
      enabled: false,
    }), { wrapper: wrapper() });
    expect(disabled.result.current.fetchStatus).toBe('idle');
    expect(rpc).not.toHaveBeenCalled();
  });
});
