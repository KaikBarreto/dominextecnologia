import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261105010000_planejamento_individual_visitas_contrato.sql'),
  'utf8',
);

describe('planejamento individual de visitas contratuais — migration', () => {
  it('carimba alterações de agenda no servidor e preserva a referência original', () => {
    expect(migration).toContain('guard_contract_visit_customization');
    expect(migration).toContain('NEW.schedule_plan IS DISTINCT FROM OLD.schedule_plan');
    expect(migration).toContain('COALESCE(OLD.contract_reference_date, OLD.scheduled_date)');
    expect(migration).toContain('NEW.contract_visit_customized_at := OLD.contract_visit_customized_at');
  });

  it('limpa os metadados ao desvincular a OS e impede cliente diferente do contrato', () => {
    expect(migration).toContain('IF NEW.contract_id IS NULL THEN');
    expect(migration).toContain('NEW.contract_reference_date := NULL');
    expect(migration).toContain('NEW.customer_id IS DISTINCT FROM v_contract_customer_id');
  });

  it('serializa regenerações e rejeita ids externos ou personalizados antes de excluir', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('so.contract_id = p_contract_id');
    expect(migration).toContain('so.company_id = v_company_id');
    expect(migration).toContain("so.origin = 'contract'");
    expect(migration).toContain('so.contract_visit_customized_at IS NULL');
    expect(migration).toContain('v_valid_delete_count <> v_requested_delete_count');
  });

  it('não confunde chamados do portal com visitas geradas pelo contrato', () => {
    expect(migration).toContain("IF NEW.origin IS DISTINCT FROM 'contract' THEN");
    expect(migration).toContain('Eles nao sao ocorrencias do cronograma');
  });

  it('não confia em cliente, origem, status ou autoria enviados pelo navegador', () => {
    expect(migration).toMatch(/v_company_id,\s+v_customer_id,/);
    expect(migration).toContain("'manutencao_preventiva'::public.os_type");
    expect(migration).toContain("'agendada'::public.os_status");
    expect(migration).toContain("'contract',");
    expect(migration).toContain('auth.uid()');
  });

  it('valida equipamentos, responsáveis, equipes, serviços e checklists no tenant', () => {
    for (const table of [
      'public.contract_items',
      'public.equipment',
      'public.profiles',
      'public.teams',
      'public.service_types',
      'public.form_templates',
      'public.contract_plan_activities',
    ]) {
      expect(migration).toContain(table);
    }
  });
});
