import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261118220000_crm_quote_business_events.sql'),
  'utf8',
);

describe('migration de eventos de negócio do CRM', () => {
  it('vincula orçamento e oportunidade com validação de tenant e acesso', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id)');
    expect(sql).toContain('lead.company_id = NEW.company_id');
    expect(sql).toContain('public.can_access_lead(NEW.lead_id, auth.uid())');
    expect(sql).toContain('(lead_id IS NULL OR lead_id = p_lead_id)');
  });

  it('dispara quote.created sem cancelar o orçamento quando a automação falha', () => {
    expect(sql).toContain("'business_event'");
    expect(sql).toContain("'quote.created'");
    expect(sql).toContain("format('quote:%s:created', NEW.id)");
    expect(sql).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(sql).toContain('o orçamento recém-criado');
    expect(sql).toContain("IF p_trigger_type = 'business_event' THEN");
    expect(sql).toContain("SET status = 'failed'");
    expect(sql).toContain('CONTINUE;');
  });

  it('mantém idempotência por ação e suporta mais de uma tarefa na regra', () => {
    expect(sql).toContain('crm_automation_action_key');
    expect(sql).toContain("'_actionKey'");
    expect(sql).toContain("COALESCE(NULLIF(v_action->>'id', ''), v_action_position::text)");
    expect(sql).toContain('crm_normalize_automation_action_ids');
    expect(sql).toContain('v_id = ANY(v_seen)');
  });

  it('adota checklists automáticos legados antes de criar outro snapshot', () => {
    expect(sql).toContain("OR NULLIF(checklist->>'automation_action_key', '') IS NULL");
    expect(sql).toContain("v_existing, '{automation_action_key}'");
    expect(sql).toContain("id = NULLIF(v_existing->>'linked_task_id', '')::uuid");
  });

  it('normaliza os aliases de checklist sem descartar metadados', () => {
    expect(sql).toContain("'title', COALESCE(NULLIF(checklist->>'title', ''), checklist->>'name')");
    expect(sql).toContain("'name', COALESCE(NULLIF(checklist->>'name', ''), checklist->>'title')");
  });
});
