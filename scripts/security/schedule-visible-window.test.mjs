import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20261123120000_schedule_visible_window_v2.sql',
  import.meta.url,
);
const indexMigrationUrl = new URL(
  '../../supabase/migrations/20261118203000_schedule_visible_window_v1.sql',
  import.meta.url,
);
const hookUrl = new URL('../../src/hooks/useScheduleOrders.ts', import.meta.url);
const preferenceMigrationUrl = new URL(
  '../../supabase/migrations/20261118213000_user_preferences_schedule_display_mode.sql',
  import.meta.url,
);

test('RPC paginada da Agenda limita período, exige usuário e preserva RLS', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /SECURITY INVOKER/i);
  assert.match(sql, /auth\.uid\(\) IS NULL/i);
  assert.match(sql, /\(p_end_date - p_start_date\) > 62/i);
  assert.match(sql, /p_page_size > 1000/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.schedule_visible_entries_v2\([\s\S]*?FROM PUBLIC, anon/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.schedule_visible_entries_v2\([\s\S]*?TO authenticated/i);
  assert.doesNotMatch(sql, /SECURITY DEFINER/i);
});

test('RPC cobre janela principal, jornadas múltiplas e retomadas ativas', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /so\.scheduled_date BETWEEN p_start_date AND p_end_date/i);
  assert.match(sql, /jsonb_array_elements\(COALESCE\(so\.schedule_plan/i);
  assert.match(sql, /so\.resumed_at < \(p_end_date \+ 1\)::timestamp/i);
  assert.match(sql, /so\.entry_type IS DISTINCT FROM 'tarefa' OR so\.show_in_schedule/i);
});

test('índices da Agenda permanecem disponíveis para todos os caminhos', async () => {
  const sql = await readFile(indexMigrationUrl, 'utf8');

  assert.match(sql, /idx_service_orders_company_scheduled_date/i);
  assert.match(sql, /idx_service_orders_company_critical_schedule/i);
  assert.match(sql, /idx_service_orders_company_active_resumed/i);
  assert.match(sql, /idx_service_orders_company_multiday_window/i);
  assert.match(sql, /idx_service_orders_company_portal_open/i);
  assert.match(sql, /idx_credit_card_bills_company_open_due/i);
});

test('RPC usa cursor estável, payload explícito e agrega só a página corrente', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /WITH paged_orders AS MATERIALIZED/i);
  assert.match(sql, /p_after_scheduled_date/i);
  assert.match(sql, /so\.scheduled_time IS NULL/i);
  assert.match(sql, /LIMIT p_page_size/i);
  assert.match(sql, /JOIN paged_orders visible ON visible\.id = soa\.service_order_id/i);
  assert.match(sql, /to_jsonb\(payload\)/i);
  assert.doesNotMatch(sql, /to_jsonb\(so\)/i);
});

test('cliente pagina por cursor sem timeout rígido nem teto total de eventos', async () => {
  const source = await readFile(hookUrl, 'utf8');

  assert.match(source, /const SCHEDULE_PAGE_SIZE = 500/);
  assert.match(source, /rpc\('schedule_visible_entries_v2'/);
  assert.match(source, /p_after_id: cursor\?\.id \?\? null/);
  assert.match(source, /cursor = nextCursor/);
  assert.match(source, /if \(page\.length < SCHEDULE_PAGE_SIZE\) break/);
  assert.doesNotMatch(source, /withScheduleRequestTimeout|SCHEDULE_REQUEST_TIMEOUT_MS/);
  assert.doesNotMatch(source, /\.range\(/);
});

test('wrapper v1 compatível também percorre a v2 sem teto total', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.schedule_visible_entries_v1/i);
  assert.match(sql, /FROM public\.schedule_visible_entries_v2/i);
  assert.match(sql, /EXIT WHEN page_count < 500/i);
});

test('preferência da Agenda aceita calendário e lista por dispositivo', async () => {
  const sql = await readFile(preferenceMigrationUrl, 'utf8');

  assert.match(sql, /schedule_view_mode_mobile ~ '\^\(day\|week\|month\)\(::list\)\?\$'/);
  assert.match(sql, /schedule_view_mode_desktop ~ '\^\(day\|week\|month\)\(::list\)\?\$'/);
  assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY/i);
});
