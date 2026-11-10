import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261106174500_crm_regras_automacoes.sql'), 'utf8');

describe('migration de automações do CRM', () => {
  it('nasce pausada e respeita empresa e ACL de funil', () => {
    expect(sql).toContain('enabled boolean NOT NULL DEFAULT false');
    expect(sql).toContain('public.get_user_company_id(auth.uid())');
    expect(sql).toContain('public.can_access_pipeline(pipeline_id, auth.uid())');
  });
  it('tem idempotência, lock e limite de recursão', () => {
    expect(sql).toContain('UNIQUE (company_id, rule_id, lead_id, event_key)');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('p_depth >= 30');
    expect(sql).toContain('IF v_card_moved THEN RETURN v_executed; END IF');
  });
  it('usa a mesma tarefa da Agenda e sincroniza nos dois sentidos', () => {
    expect(sql).toContain("entry_type = 'tarefa'");
    expect(sql).toContain('show_in_schedule');
    expect(sql).toContain('crm_sync_checklist_tasks_trigger');
    expect(sql).toContain('crm_sync_task_checklist_and_automations_trigger');
  });
  it('implementa as sete ações do Revalor', () => {
    for (const action of ['create_task', 'apply_checklist', 'set_due', 'assign_user', 'add_label', 'move_card', 'copy_card']) expect(sql).toContain(`'${action}'`);
  });
  it('permite validar constraints sem expor a execução interna', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.crm_automation_actions_valid(jsonb) TO authenticated, service_role');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.crm_stage_requirements_valid(jsonb) TO authenticated, service_role');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.crm_run_automation_event(uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated');
  });
});
