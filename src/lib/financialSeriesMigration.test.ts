import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20261117235500_financial_series_scope_and_cross_context_smart_fill.sql',
  'utf8',
);

describe('migration de séries financeiras', () => {
  it('valida empresa, permissão e os três escopos', () => {
    expect(sql).toContain('public.can_manage_finance_transactions_current_user()');
    expect(sql).toContain('anchor.company_id IS DISTINCT FROM public.get_user_company_id(auth.uid())');
    expect(sql).toContain("p_scope NOT IN ('single','future','all_pending')");
    expect(sql).toContain('t.company_id=anchor.company_id');
  });

  it('edita somente pendentes e propaga conta, forma e centro de custo', () => {
    expect(sql).toContain('coalesce(t.is_paid,false)=false');
    expect(sql).toContain('coalesce(t.amount_received,0)=0');
    expect(sql).toContain("account_id=CASE WHEN p_values ? 'account_id'");
    expect(sql).toContain("payment_method=CASE WHEN p_values ? 'payment_method'");
    expect(sql).toContain("cost_center_id=CASE WHEN p_values ? 'cost_center_id'");
  });

  it('preserva pagas, vinculadas, anexadas e filhas na exclusão', () => {
    expect(sql).toContain('t.origin<>\'geral\'');
    expect(sql).toContain('t.bill_id IS NOT NULL');
    expect(sql).toContain('t.contract_id IS NOT NULL');
    expect(sql).toContain('public.financial_transaction_attachments');
    expect(sql).toContain('child.parent_transaction_id=t.id');
  });

  it('aprende com histórico da mesma empresa e devolve o padrão completo', () => {
    expect(sql).toContain('t.company_id=company');
    for (const field of [
      'category',
      'customer_id',
      'supplier_id',
      'cost_center_id',
      'account_id',
      'payment_method',
    ]) {
      expect(sql).toContain(field);
    }
    expect(sql).toContain("p_context NOT IN ('bill','movement')");
    expect(sql).toContain("length(regexp_replace(prefix,'[^[:alnum:]]','','g'))<3");
  });
});
