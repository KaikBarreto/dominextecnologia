import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261123140000_pdv_management_report_v1.sql', 'utf8');

describe('migration do relatório gerencial do PDV', () => {
  it('aplica autorização e estoque antes de agregar', () => {
    expect(migration).toContain('pdv_can_operate_other_cash_v2');
    expect(migration).toContain("fn:view_finance_totals");
    expect(migration).toContain("pdv_reports_context_v2('screen:pdv_reports',true)");
    expect(migration).toContain('public.can_access_stock');
    expect(migration.indexOf('current_facts AS MATERIALIZED')).toBeLessThan(migration.indexOf('current_totals AS'));
  });

  it('não multiplica pagamentos por quantidade de entregas e separa faltas/sobras', () => {
    expect(migration).toContain('SELECT DISTINCT order_id FROM current_facts');
    expect(migration).toContain("FILTER(WHERE session.difference<0)");
    expect(migration).toContain("FILTER(WHERE session.difference>0)");
  });

  it('mantém CMV desconhecido fail-closed', () => {
    expect(migration).toContain('WHEN bool_or(NOT cost_known) THEN NULL');
  });
});
