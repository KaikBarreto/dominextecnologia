import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../supabase/migrations/20261123171000_fiscal_inventory_ledger.sql', import.meta.url);
const edgeUrl = new URL('../../supabase/functions/fiscal-goods-document/index.ts', import.meta.url);
const [migration, edge] = await Promise.all([
  readFile(migrationUrl, 'utf8'),
  readFile(edgeUrl, 'utf8'),
]);

test('ledger fiscal é append-only, idempotente e isolado por empresa/local', () => {
  assert.match(migration, /UNIQUE \(company_id, document_model, document_id, item_key, source_event\)/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.fiscal_inventory_movements FROM authenticated, anon/);
  assert.match(migration, /company_id = public\.get_user_company_id/);
  assert.match(migration, /public\.can_access_stock/);
  assert.match(migration, /inventory\.company_id = p_company_id/);
  assert.match(migration, /public\.inventory_movements m[\s\S]*m\.customer_id IS NULL/);
  assert.match(migration, /ON CONFLICT \(company_id, document_model, document_id, item_key, source_event\) DO NOTHING/);
});

test('somente autorização cria movimento e cancelamento cria estorno', () => {
  assert.match(migration, /IF NEW\.status = 'authorized'/);
  assert.match(migration, /IF NEW\.status = 'cancelled'/);
  assert.match(migration, /'cancelled', direction,\s+-quantity/);
  assert.doesNotMatch(migration, /NEW\.status = 'contingency'/);
});

test('saldo inicial entra na posição e no histórico sem apagar movimentos', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.fiscal_inventory_opening_balances/);
  assert.match(migration, /quantity_delta numeric NOT NULL/);
  assert.match(migration, /UNION ALL\s+SELECT o\.id, o\.effective_at/);
  assert.match(migration, /'opening'::text/);
});

test('kardex calcula saldo antes e depois antes de filtrar a página', () => {
  const movementsRpc = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.fiscal_inventory_movements_report'),
    migration.indexOf('REVOKE ALL ON FUNCTION public.fiscal_inventory_movements_report'),
  );
  const eventsToLedger = movementsRpc.slice(
    movementsRpc.indexOf('WITH events AS ('),
    movementsRpc.indexOf('), ledger AS ('),
  );
  const filtered = movementsRpc.slice(movementsRpc.indexOf('), filtered AS ('));

  assert.match(migration, /DROP FUNCTION IF EXISTS public\.fiscal_inventory_movements_report\([\s\S]*timestamptz, timestamptz/);
  assert.match(migration, /sum\(e\.quantity\) OVER \([\s\S]*PARTITION BY e\.stock_id, e\.inventory_id/);
  assert.match(migration, /ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW/);
  assert.match(migration, /e\.balance_after - e\.quantity, e\.balance_after/);
  assert.match(migration, /ledger AS \([\s\S]*filtered AS \(/);
  assert.doesNotMatch(eventsToLedger, /p_models|p_query/);
  assert.match(filtered, /p_models IS NULL OR e\.document_model = 0 OR e\.document_model::integer = ANY\(p_models\)/);
  assert.match(filtered, /coalesce\(btrim\(p_query\), ''\) = ''/);
});

test('edge valida local fiscal e origem importada antes de salvar', () => {
  assert.match(edge, /async function assertFiscalStock/);
  assert.match(edge, /\.eq\('company_id', auth\.companyId\)/);
  assert.match(edge, /auth\.supabase\.rpc\('can_access_stock'/);
  assert.match(edge, /inheritedStockId !== draft\.stockId/);
  assert.match(edge, /await assertFiscalStock\(auth, draft\)/);
});
