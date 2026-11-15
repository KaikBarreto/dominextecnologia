import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = new URL('../../supabase/migrations/20261114220000_pdv_receipt_stage_settings.sql', import.meta.url);
test('preferências por etapa preservam acesso exclusivo por RPC e gates no servidor', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.doesNotMatch(sql, /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\s+ON\s+(?:TABLE\s+)?public\.pdv_receipt_settings/i);
  assert.doesNotMatch(sql, /(?:DISABLE\s+ROW\s+LEVEL\s+SECURITY|NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY)/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pdv_get_receipt_settings_v3\(\) FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pdv_get_receipt_settings_v3\(\) TO authenticated,service_role/);
  const read = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.pdv_get_receipt_settings_v3'), sql.indexOf('CREATE OR REPLACE FUNCTION public.pdv_save_receipt_settings_v3'));
  for (const gate of ['auth.uid()', 'get_user_company_id', 'p.is_active', 'tenant_subscription_allows_access', 'company_has_module', 'pdv_has_explicit_action_permission_v2']) assert.ok(read.includes(gate), gate);
  assert.match(read, /WHERE company_id=v_company/);
  const write = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.pdv_save_receipt_settings_v3'), sql.indexOf('-- Clientes anteriores'));
  assert.match(write, /pdv_receipt_settings_context_v2\(\)/);
  assert.match(write, /fn:manage_pdv_settings/);
  assert.doesNotMatch(sql, /(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:pdv_orders|pdv_order_payments|financial_transactions|inventory_movements|pdv_order_receipt_snapshots)\b/i);
});
