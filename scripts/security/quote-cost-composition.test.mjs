import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL(
  '../../supabase/migrations/20261106120000_quote_cost_composition_and_proposal_visibility.sql',
  import.meta.url,
), 'utf8');
const publicPayload = migration.split('CREATE OR REPLACE FUNCTION public.get_quote_public_payload')[1]
  .split('$function$;')[0];
const saveComposition = migration.split('CREATE OR REPLACE FUNCTION public.save_service_cost_composition_from_quote')[1]
  .split('$function$;')[0];

test('promoção de custo exige usuário, gestor, empresa e assinatura, sem bypass cross-tenant', () => {
  const authorization = saveComposition.slice(0, saveComposition.indexOf('SELECT COALESCE('));
  assert.match(authorization, /IF auth\.uid\(\) IS NULL THEN/);
  assert.match(authorization, /v_company_id IS NULL/);
  assert.match(authorization, /v_company_id IS DISTINCT FROM public\.get_user_company_id\(auth\.uid\(\)\)/);
  assert.match(authorization, /public\.can_manage_system\(auth\.uid\(\)\) IS NOT TRUE/);
  assert.match(authorization, /public\.tenant_subscription_allows_access\(v_company_id\) IS NOT TRUE/);
  assert.doesNotMatch(authorization, /public\.is_super_admin\(/);
  assert.match(authorization, /FROM public\.service_types st[\s\S]+?FOR UPDATE;/);
  assert.match(authorization, /RAISE EXCEPTION '[^']+' USING ERRCODE = '42501'/);
});

test('todos os vínculos de estoque e recursos, inclusive brindes, são validados antes da escrita', () => {
  const validation = saveComposition.slice(0, saveComposition.indexOf('SELECT COALESCE('));
  assert.match(validation, /jsonb_typeof\(COALESCE\(_resources, '\[\]'::jsonb\)\) IS DISTINCT FROM 'array'/);
  assert.match(validation, /jsonb_typeof\(COALESCE\(_supplies, '\[\]'::jsonb\)\) IS DISTINCT FROM 'array'/);
  assert.match(validation, /NOT EXISTS \([\s\S]+?FROM public\.inventory inventory[\s\S]+?inventory\.id = \(line->>'stockItemId'\)::uuid\s+AND inventory\.company_id = v_company_id/);
  assert.match(validation, /line->>'source' IN \('resource', 'gift'\)[\s\S]+?NOT EXISTS \([\s\S]+?FROM public\.cost_resources resource[\s\S]+?resource\.id = \(line->>'resourceId'\)::uuid\s+AND resource\.company_id = v_company_id/);
  assert.match(validation, /line->>'source' = 'resource'\s+AND NULLIF\(line->>'resourceId', ''\) IS NULL/);
  assert.match(validation, /RAISE EXCEPTION 'Recurso ou insumo não encontrado ou sem permissão\.'/);
  assert.doesNotMatch(validation, /(?:INSERT INTO|UPDATE public\.|DELETE FROM)/);
});

test('somente agregados autorizados entram na allowlist pública de itens', () => {
  const itemPayload = publicPayload.split('jsonb_strip_nulls(jsonb_build_object(')[1].split('))')[0];
  const keys = [...itemPayload.matchAll(/'([a-z_]+)'\s*,/g)].map(match => match[1]);
  assert.deepEqual(keys, [
    'id', 'position', 'item_type', 'description', 'details', 'quantity',
    'unit_price', 'total_price', 'unit_labor_cost', 'unit_materials_cost',
  ]);
  assert.match(itemPayload, /'unit_labor_cost', CASE WHEN v_show_labor THEN qi\.unit_labor_cost ELSE NULL END/);
  assert.match(itemPayload, /'unit_materials_cost', CASE WHEN v_show_inputs THEN qi\.unit_materials_cost ELSE NULL END/);
  assert.doesNotMatch(publicPayload, /qi\.cost_composition|qi\.unit_hourly_rate|qi\.unit_hours|qi\.unit_extras_cost|qi\.unit_total_cost|qi\.\*/);
  assert.match(publicPayload, /WHERE q\.token = _token/);
  assert.match(publicPayload, /WHERE c\.id = v_customer_id\s+AND c\.company_id = v_company_id/);
  for (const field of ['show_labor_cost_in_proposal', 'show_inputs_cost_in_proposal']) {
    assert.match(migration, new RegExp(`${field} boolean NOT NULL DEFAULT false`));
  }
});

test('leitura pública direta e EXECUTE implícito ficam revogados', () => {
  assert.match(migration, /REVOKE SELECT, UPDATE ON TABLE public\.quotes FROM PUBLIC, anon/);
  assert.match(migration, /REVOKE SELECT ON TABLE public\.quote_items FROM PUBLIC, anon/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_quote_public_payload\(text\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_quote_public_payload\(text\) TO anon, authenticated, service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.save_service_cost_composition_from_quote\(uuid, numeric, numeric, jsonb, jsonb\)\s+FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.save_service_cost_composition_from_quote\(uuid, numeric, numeric, jsonb, jsonb\)\s+TO authenticated, service_role/);
});
