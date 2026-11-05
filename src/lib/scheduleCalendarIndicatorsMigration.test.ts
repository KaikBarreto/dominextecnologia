import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261105123000_indicadores_agenda_no_calendario.sql'),
  'utf8',
);

describe('migration dos indicadores do calendário de agendamento', () => {
  it('preserva RLS, limita o período e não libera acesso anônimo', () => {
    expect(migration).toMatch(/SECURITY INVOKER/i);
    expect(migration).toMatch(/p_end_date - p_start_date > 62/i);
    expect(migration).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/i);
  });

  it('distingue visita contratual de OS e ignora tarefas e canceladas', () => {
    expect(migration).toMatch(/entry_type IS DISTINCT FROM 'tarefa'/i);
    expect(migration).toMatch(/status IS DISTINCT FROM 'cancelada'/i);
    expect(migration).toMatch(/contract_id IS NOT NULL[\s\S]*origin = 'contract'/i);
    expect(migration).toMatch(/has_service_order/i);
  });

  it('considera todas as jornadas de uma OS de múltiplos dias', () => {
    expect(migration.match(/jsonb_array_elements/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toMatch(/slot\.item->>'date'/i);
  });

  it('aceita contexto de cliente e reconhece os equipamentos da OS', () => {
    expect(migration).toMatch(/p_customer_id uuid DEFAULT NULL/i);
    expect(migration).toMatch(/p_equipment_ids uuid\[\] DEFAULT NULL/i);
    expect(migration).toMatch(/candidate_orders\.customer_id = p_customer_id/i);
    expect(migration).toMatch(/FROM public\.service_order_equipment soe/i);
    expect(migration).toMatch(/soe\.equipment_id = ANY\(p_equipment_ids\)/i);
  });
});
