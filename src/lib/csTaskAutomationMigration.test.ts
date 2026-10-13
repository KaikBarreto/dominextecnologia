import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261013173000_followups_trial_e_cs_maicon.sql',
  ),
  'utf8',
);

describe('automação de tarefas de trial e CS', () => {
  it('cria follow-up diário somente durante os primeiros 7 dias de trial ativo', () => {
    expect(migration).toContain('cs_criar_followups_trial_diarios');
    expect(migration).toContain("c.subscription_status = 'testing'");
    expect(migration).toContain('c.subscription_expires_at IS NOT NULL');
    expect(migration).toContain('LEAST(GREATEST(COALESCE(c.trial_days, 7), 1), 7)');
    expect(migration).toContain('CROSS JOIN LATERAL generate_series');
    expect(migration).toContain("'trial:daily:%s:%s'");
    expect(migration).toContain('p_company_id IS NULL OR c.id = p_company_id');
    expect(migration).toContain('AFTER INSERT ON public.companies');
    expect(migration).not.toContain("'trial-followups-diarios'");
  });

  it('resolve o Maicon por fonte canônica sem UUID congelado', () => {
    expect(migration).toContain("lower(u.email) = 'maicon@dominex.app'");
    expect(migration).toContain("public.has_admin_permission(u.id, 'admin_crm')");
    expect(migration).toContain('SELECT public._cs_checkup_responsavel();');
    expect(migration).not.toContain('Paula');
    expect(migration).not.toContain('RAISE EXCEPTION');
  });

  it('mantém a cadência D+2 a D+30 e suas pendências com o Maicon', () => {
    expect(migration).toContain("automation_key LIKE 'cs:first-month:%'");
    expect(migration).toContain("status <> 'resolvido'::public.admin_task_status");
    expect(migration).toContain('IF v_maicon IS NOT NULL THEN');
    expect(migration).not.toContain("DELETE FROM public.admin_tasks");
  });

  it('substitui o semanal por uma revisão a cada 14 dias sem sobreposição', () => {
    expect(migration).toContain("cron.unschedule('cs-checkup-semanal')");
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.cs_criar_checkup_semanal');
    expect(migration).toContain('v_ultimo_dia + 14');
    expect(migration).toContain("'cs-checkup-quinzenal'");
    expect(migration).toContain("automation_key LIKE 'cs:groups:%'");
    expect(migration).toContain("p.type = 'primeira_venda'");
    expect(migration).toContain("interval '1 month'");
    expect(migration).toContain('sem_clientes_com_mais_de_um_mes');
  });

  it('restringe as RPCs de automação ao service role', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.cs_criar_followups_trial_diarios\(boolean, uuid, date\)[\s\S]*?FROM PUBLIC, anon, authenticated;[\s\S]*?GRANT EXECUTE[\s\S]*?TO service_role;/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.cs_criar_checkup_quinzenal\(boolean, date\)[\s\S]*?FROM PUBLIC, anon, authenticated;[\s\S]*?GRANT EXECUTE[\s\S]*?TO service_role;/,
    );
  });
});
