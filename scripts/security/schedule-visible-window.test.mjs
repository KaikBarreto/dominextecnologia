import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20261118203000_schedule_visible_window_v1.sql',
  import.meta.url,
);
const hookUrl = new URL('../../src/hooks/useScheduleOrders.ts', import.meta.url);

test('RPC da Agenda limita período, exige usuário e preserva RLS', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /SECURITY INVOKER/i);
  assert.match(sql, /auth\.uid\(\) IS NULL/i);
  assert.match(sql, /\(p_end_date - p_start_date\) > 62/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.schedule_visible_entries_v1\(date, date\) FROM PUBLIC, anon/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.schedule_visible_entries_v1\(date, date\) TO authenticated/i);
  assert.doesNotMatch(sql, /SECURITY DEFINER/i);
});

test('RPC cobre jornadas múltiplas e retomadas sem abrir todo o histórico', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /jsonb_array_elements\(COALESCE\(multiday\.schedule_plan/i);
  assert.match(sql, /resumed\.resumed_at < \(p_end_date \+ 1\)::timestamp/i);
  assert.match(sql, /visible\.scheduled_date BETWEEN p_start_date AND p_end_date/i);
  assert.match(sql, /idx_service_orders_company_scheduled_date/i);
  assert.match(sql, /idx_service_orders_company_critical_schedule/i);
  assert.match(sql, /idx_service_orders_company_portal_open/i);
  assert.match(sql, /idx_credit_card_bills_company_open_due/i);
  assert.match(sql, /WITH candidate_ids AS MATERIALIZED/i);
});

test('cliente pagina a RPC e não perde eventos acima do limite de 1.000 linhas', async () => {
  const source = await readFile(hookUrl, 'utf8');

  assert.match(source, /const SCHEDULE_PAGE_SIZE = 1000/);
  assert.match(source, /\.range\(from, from \+ SCHEDULE_PAGE_SIZE - 1\)/);
  assert.match(source, /if \(page\.length < SCHEDULE_PAGE_SIZE\) break/);
});
