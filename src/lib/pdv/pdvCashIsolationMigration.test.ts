import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261108015000_pdv_cash_operator_isolation.sql',
  'utf8',
);

describe('migration de isolamento entre Caixas', () => {
  it('não usa cirurgia textual como barreira de segurança', () => {
    expect(migration).not.toContain('pg_get_functiondef');
    expect(migration).not.toContain('replace(v_definition');
    expect(migration).toContain('pdv_cover_existing_order_core_015_v2');
    expect(migration).toContain('pdv_get_after_sale_workspace_core_015_v2');
  });

  it('amarra fila, pagamento e rascunho à abertura e ao Caixa exatos', () => {
    expect(migration).toContain('o.target_terminal_id=p_terminal_id');
    expect(migration).toContain('cs.id=p_cash_session_id');
    expect(migration).toContain('cs.terminal_id=p_terminal_id');
    expect(migration).toContain('p_cash_session_id uuid,p_terminal_id uuid,p_stock_id uuid');
    expect(migration).toContain("'fn:operate_other_pdv_cash'");
    expect(migration).toContain("p_preorder.status='edicao'");
  });

  it('revoga writers legados e filtra as opções sensíveis do pós-venda', () => {
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.pdv_settle_order');
    expect(migration).toContain("jsonb_set(v_result,'{cash_options}'");
    expect(migration).toContain('pdv_current_actor_can_access_session_v3(p_cash_session_id)');
    expect(migration).toContain("jsonb_set(v_result,'{can_manage_others}'");
  });

  it('remove policies pela coluna pública correta de pg_policies', () => {
    expect(migration).toContain('SELECT policyname,tablename FROM pg_policies');
    expect(migration).toContain('v_policy.policyname');
    expect(migration).not.toContain('SELECT polname,tablename FROM pg_policies');
  });
});
