import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: rpcMock },
}));

import {
  bookServiceOrderSchedule,
  ScheduleConflictError,
} from './scheduleBooking';

describe('scheduleBooking', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: {}, error: null });
  });

  it('mantém mensagem PT-BR para a UI', () => {
    expect(new ScheduleConflictError().message).toContain('atendimento nesse horário');
  });

  it('converte o relógio do tenant e envia o contrato único da RPC', async () => {
    await bookServiceOrderSchedule({
      service_order_id: 'os-1',
      resource_type: 'technician',
      resource_id: 'tech-1',
      scheduled_date: '2026-10-16',
      scheduled_time: '08:30',
      duration_minutes: 90,
      timezone: 'America/Sao_Paulo',
    });

    expect(rpcMock).toHaveBeenCalledWith('schedule_book_service_order', {
      p_service_order_id: 'os-1',
      p_resource_type: 'technician',
      p_resource_id: 'tech-1',
      p_starts_at: '2026-10-16T11:30:00.000Z',
      p_ends_at: '2026-10-16T13:00:00.000Z',
      p_override_justification: null,
    });
  });

  it('bloqueia override sem justificativa suficiente antes de chamar a RPC', async () => {
    await expect(bookServiceOrderSchedule({
      service_order_id: 'os-1',
      resource_type: 'team',
      resource_id: 'team-1',
      scheduled_date: '2026-10-16',
      scheduled_time: '08:30',
      duration_minutes: 60,
      timezone: 'America/Sao_Paulo',
      schedule_override: true,
      schedule_override_reason: 'curta',
    })).rejects.toThrow('pelo menos 10 caracteres');

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('normaliza conflito da RPC para o erro de domínio em PT-BR', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'public_api_schedule_conflict' },
    });

    await expect(bookServiceOrderSchedule({
      service_order_id: 'os-1',
      resource_type: 'team',
      resource_id: 'team-1',
      scheduled_date: '2026-10-16',
      scheduled_time: '08:30',
      duration_minutes: 60,
      timezone: 'America/Sao_Paulo',
    })).rejects.toBeInstanceOf(ScheduleConflictError);
  });
});
