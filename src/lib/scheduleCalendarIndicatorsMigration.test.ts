import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261105163000_aprimora_indicadores_agenda.sql'),
  'utf8',
);

describe('migration dos indicadores do calendário de agendamento', () => {
  it('preserva RLS, limita o período e não libera acesso anônimo', () => {
    expect(migration).toMatch(/SECURITY INVOKER/i);
    expect(migration).toMatch(/p_end_date - p_start_date > 62/i);
    expect(migration).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/i);
  });

  it('distingue visita gerada ou vinculada de chamado reativo e ignora tarefas e canceladas', () => {
    expect(migration).toMatch(/entry_type IS DISTINCT FROM 'tarefa'/i);
    expect(migration).toMatch(/status IS DISTINCT FROM 'cancelada'/i);
    expect(migration).toMatch(/contract_id IS NOT NULL[\s\S]*origin = 'contract'[\s\S]*contract_reference_date IS NOT NULL[\s\S]*contract_visit_customized_at IS NOT NULL/i);
    expect(migration).toMatch(/has_service_order/i);
  });

  it('conta múltiplos atendimentos sem duplicar a mesma OS no mesmo dia', () => {
    expect(migration).toMatch(/contract_occurrence_count integer/i);
    expect(migration).toMatch(/service_order_count integer/i);
    expect(migration.match(/count\(DISTINCT occupied_days\.id\)/gi)?.length).toBeGreaterThanOrEqual(6);
  });

  it('considera todas as jornadas de uma OS de múltiplos dias', () => {
    expect(migration.match(/jsonb_array_elements/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toMatch(/SELECT \(item->>'date'\)::date AS occupied_date/i);
  });

  it('ignora jornadas inválidas sem derrubar toda a consulta', () => {
    expect(migration).toMatch(/jsonb_typeof\(COALESCE\(so\.schedule_plan/i);
    expect(migration).toMatch(/WHERE \(item->>'date'\) ~ '\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$'/i);
  });

  it('aceita contexto de cliente e reconhece os equipamentos da OS', () => {
    expect(migration).toMatch(/p_customer_id uuid DEFAULT NULL/i);
    expect(migration).toMatch(/p_equipment_ids uuid\[\] DEFAULT NULL/i);
    expect(migration).toMatch(/candidate_orders\.customer_id = p_customer_id/i);
    expect(migration).toMatch(/FROM public\.service_order_equipment soe/i);
    expect(migration).toMatch(/soe\.equipment_id = ANY\(p_equipment_ids\)/i);
  });
});
