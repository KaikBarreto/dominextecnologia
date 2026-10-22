import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261022220000_checkin_nao_revalida_reserva_da_agenda.sql',
  ),
  'utf8',
);

describe('gatilhos de reserva da agenda', () => {
  it('mantem INSERT sincronizado e separa o gatilho de UPDATE', () => {
    expect(migration).toMatch(
      /CREATE TRIGGER sync_service_order_booking_reservations_insert[\s\S]+?AFTER INSERT ON public\.service_orders/i,
    );
    expect(migration).toMatch(
      /CREATE TRIGGER sync_service_order_booking_reservations_update[\s\S]+?AFTER UPDATE OF[\s\S]+?status/i,
    );
  });

  it('nao reprocessa a reserva em transicoes operacionais sem mudanca de agenda', () => {
    for (const status of [
      'agendada',
      'pendente',
      'a_caminho',
      'em_andamento',
      'pausada',
    ]) {
      expect(migration).toContain(`'${status}'`);
    }

    for (const column of [
      'scheduled_date',
      'scheduled_time',
      'duration_minutes',
      'schedule_plan',
      'technician_id',
      'team_id',
      'entry_type',
      'company_id',
    ]) {
      expect(migration).toContain(
        `OLD.${column} IS NOT DISTINCT FROM NEW.${column}`,
      );
    }
  });

  it('continua executando a funcao que valida tenant e conflitos', () => {
    const calls = migration.match(
      /EXECUTE FUNCTION public\.schedule_sync_service_order_reservations\(\);/g,
    );
    expect(calls).toHaveLength(2);
  });
});
