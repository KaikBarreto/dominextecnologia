import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const migration = await readFile(
  new URL('supabase/migrations/20261110130000_harden_duplicate_form_models.sql', root),
  'utf8',
);

const leadStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.duplicate_lead_capture_form');
const checklistStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.duplicate_form_template');
const auditStart = migration.indexOf('DO $audit$');
const leadRpc = migration.slice(leadStart, checklistStart);
const checklistRpc = migration.slice(checklistStart, auditStart);

test('hardening substitui as duas RPCs sem editar a migration ja publicada', () => {
  assert.ok(leadStart >= 0 && checklistStart > leadStart && auditStart > checklistStart);

  for (const rpc of [leadRpc, checklistRpc]) {
    assert.match(rpc, /SECURITY DEFINER/);
    assert.match(rpc, /SET search_path = public/);
    assert.match(rpc, /REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC/);
    assert.match(rpc, /REVOKE ALL ON FUNCTION[\s\S]+FROM anon/);
    assert.match(rpc, /REVOKE ALL ON FUNCTION[\s\S]+FROM service_role/);
    assert.match(rpc, /GRANT EXECUTE ON FUNCTION[\s\S]+TO authenticated/);
  }
});

test('limite de 200 caracteres considera o maior sufixo do lote', () => {
  for (const rpc of [leadRpc, checklistRpc]) {
    assert.match(rpc, /v_max_suffix\s*:=\s*CASE[\s\S]+format\('\s*\(%s\)'\s*,\s*p_copy_count\)/);
    assert.match(
      rpc,
      /char_length\(v_clean_name\)\s*\+\s*char_length\(v_max_suffix\)\s*>\s*200/,
    );
    assert.match(rpc, /USING ERRCODE = '22023'/);
  }
});

test('formulario materializa pai e perguntas no mesmo statement antes do lote', () => {
  assert.match(leadRpc, /SELECT\s+f AS source_row,[\s\S]+INTO v_snapshot\s+FROM public\.lead_capture_forms/);
  assert.match(leadRpc, /ARRAY\([\s\S]+FROM public\.public_form_questions[\s\S]+\) AS questions/);
  assert.match(leadRpc, /v_source := v_snapshot\.source_row/);
  assert.match(leadRpc, /v_questions := v_snapshot\.questions/);
  assert.match(leadRpc, /FROM unnest\(v_questions\) AS q/);
  assert.doesNotMatch(leadRpc, /FROM public\.public_form_questions q\s+WHERE q\.form_id = v_source\.id/);
});

test('checklist materializa pai, perguntas e vinculos no mesmo statement', () => {
  assert.match(checklistRpc, /SELECT\s+ft AS source_row,[\s\S]+INTO v_snapshot\s+FROM public\.form_templates/);
  assert.match(checklistRpc, /ARRAY\([\s\S]+FROM public\.form_questions[\s\S]+\) AS questions/);
  assert.match(checklistRpc, /ARRAY\([\s\S]+FROM public\.form_template_service_types[\s\S]+\) AS links/);
  assert.match(checklistRpc, /v_source := v_snapshot\.source_row/);
  assert.match(checklistRpc, /v_questions := v_snapshot\.questions/);
  assert.match(checklistRpc, /v_links := v_snapshot\.links/);
  assert.match(checklistRpc, /FROM unnest\(v_questions\) AS q/);
  assert.match(checklistRpc, /FROM unnest\(v_links\) AS link/);
  assert.doesNotMatch(checklistRpc, /FROM public\.form_questions q\s+WHERE q\.template_id = v_source\.id/);
  assert.doesNotMatch(
    checklistRpc,
    /FROM public\.form_template_service_types link\s+WHERE link\.template_id = v_source\.id/,
  );
});
