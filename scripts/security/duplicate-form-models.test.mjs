import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const migration = await readFile(
  new URL('supabase/migrations/20261110120000_duplicate_form_models.sql', root),
  'utf8',
);

const leadStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.duplicate_lead_capture_form');
const checklistStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.duplicate_form_template');
const auditStart = migration.indexOf('-- Travas de instalacao');
const leadRpc = migration.slice(leadStart, checklistStart);
const checklistRpc = migration.slice(checklistStart, auditStart);

test('duplicacao de modelos exige usuario, limita lote e nao fica publica', () => {
  assert.ok(leadStart >= 0 && checklistStart > leadStart && auditStart > checklistStart);

  for (const rpc of [leadRpc, checklistRpc]) {
    assert.match(rpc, /SECURITY DEFINER/);
    assert.match(rpc, /auth\.uid\(\)/);
    assert.match(rpc, /p_copy_count NOT BETWEEN 1 AND 20/);
    assert.match(rpc, /REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC/);
    assert.match(rpc, /REVOKE ALL ON FUNCTION[\s\S]+FROM anon/);
    assert.match(rpc, /GRANT EXECUTE ON FUNCTION[\s\S]+TO authenticated, service_role/);
  }
});

test('formulario duplicado recebe link novo e nasce sem publicacao ou historico', () => {
  assert.match(leadRpc, /f\.company_id = v_user_company/);
  assert.match(leadRpc, /public\.is_super_admin\(v_user_id\)/);
  assert.match(leadRpc, /INSERT INTO public\.lead_capture_forms/);
  assert.match(leadRpc, /false,\s*NULL,[\s\S]+0,[\s\S]+false,/);
  assert.match(leadRpc, /INSERT INTO public\.public_form_questions/);
  assert.doesNotMatch(leadRpc, /INSERT INTO public\.public_form_submissions/);
  assert.doesNotMatch(leadRpc, /INSERT INTO public\.lead_capture_submissions_log/);
});

test('checklist duplicado preserva perguntas e vinculos sem identidade PMOC', () => {
  assert.match(checklistRpc, /ft\.company_id = v_user_company[\s\S]+public\.can_manage_system\(v_user_id\)/);
  assert.match(checklistRpc, /INSERT INTO public\.form_questions/);
  assert.match(checklistRpc, /allow_multiple_photos,[\s\S]+require_camera_video/);
  assert.match(checklistRpc, /INSERT INTO public\.form_template_service_types/);
  assert.match(checklistRpc, /false,\s*NULL,\s*NULL\s*\)/);
  assert.doesNotMatch(checklistRpc, /INSERT INTO public\.form_responses/);
});
