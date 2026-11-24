import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261116020000_catalog_model_favorites.sql', import.meta.url), 'utf8');

test('catalog favorites are own-row and require a real active membership in RLS and RPC', () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(migration, /p\.company_id = catalog_model_favorites\.company_id/);
  assert.match(migration, /p\.user_id = v_user_id AND p\.company_id = p_company_id AND p\.is_active IS TRUE/);
  assert.match(migration, /IF v_user_id IS NULL/);
  assert.match(migration, /FOR SHARE/);
  assert.doesNotMatch(migration, /is_super_admin|has_role/);
});

test('anonymous and direct authenticated mutations cannot bypass the CAS operation', () => {
  assert.match(migration, /REVOKE ALL ON public\.catalog_model_favorites FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON public\.catalog_model_favorites TO authenticated/);
  assert.doesNotMatch(migration, /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)\b/i);
  assert.match(migration, /SECURITY DEFINER SET search_path = pg_catalog, public/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.set_catalog_model_favorite[\s\S]*FROM PUBLIC, anon, authenticated/);
});

test('bounded global IDs and owner FKs coexist with curated IDs outside the database', () => {
  assert.match(migration, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(migration, /REFERENCES public\.companies\(id\) ON DELETE CASCADE/);
  assert.match(migration, /length\(model_id\) BETWEEN 1 AND 127/);
  assert.match(migration, /PRIMARY KEY \(user_id, company_id, model_id\)/);
  assert.doesNotMatch(migration, /REFERENCES public\.equipment_models/);
});

test('revision conflicts and tombstones prevent stale imports/replays from restoring removals', () => {
  assert.match(migration, /v_row\.last_operation_id = p_operation_id/);
  assert.match(migration, /v_row\.is_favorite IS DISTINCT FROM p_is_favorite/);
  assert.match(migration, /v_row\.revision <> p_expected_revision/);
  assert.match(migration, /RETURN QUERY SELECT false, v_row\.model_id, v_row\.is_favorite, v_row\.revision/);
  assert.match(migration, /revision = f\.revision \+ 1/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.doesNotMatch(migration, /DELETE FROM public\.catalog_model_favorites/);
});
