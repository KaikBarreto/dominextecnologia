import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261113143000_fix_finance_admin_read_after_insert.sql',
  ),
  'utf8',
);

describe('migration de leitura após criar lançamento financeiro', () => {
  it('mantém tenant e assinatura como pré-condições da leitura', () => {
    const helperStart = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.can_read_financial_transaction_row_current_user_v4',
    );
    const policyStart = sql.indexOf(
      'DROP POLICY IF EXISTS "Scoped financial transaction reads v3"',
    );
    const helper = sql.slice(helperStart, policyStart);
    const tenantGate = helper.indexOf(
      'public.get_user_company_id(v_user_id) IS DISTINCT FROM p_company_id',
    );
    const subscriptionGate = helper.indexOf(
      'public.tenant_subscription_allows_access(p_company_id) IS DISTINCT FROM TRUE',
    );
    const adminGate = helper.indexOf('public.is_admin_or_gestor(v_user_id)');

    expect(helperStart).toBeGreaterThan(-1);
    expect(policyStart).toBeGreaterThan(helperStart);
    expect(tenantGate).toBeGreaterThan(-1);
    expect(subscriptionGate).toBeGreaterThan(-1);
    expect(adminGate).toBeGreaterThan(subscriptionGate);
  });

  it('permite que admin e gestor leiam de volta o lançamento recém-criado', () => {
    expect(sql).toMatch(
      /IF public\.is_super_admin\(v_user_id\)[\s\S]*OR public\.is_admin_or_gestor\(v_user_id\)[\s\S]*THEN\s+RETURN TRUE/,
    );
  });

  it('preserva os gates de Financeiro e o isolamento do PDV para os demais usuários', () => {
    expect(sql).toMatch(/v_transaction\.origin IS DISTINCT FROM 'pdv'/);
    expect(sql).toMatch(/public\.user_has_permission\(p_user_id, 'screen:finance'\)/);
    expect(sql).toMatch(/'fn:view_finance_totals'/);
    expect(sql).toMatch(/public\.pdv_can_access_cash_session_v3/);
    expect(sql).toMatch(/public\.pdv_order_payments/);
  });

  it('avalia a própria linha na policy sem reler a transação durante RETURNING', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.can_read_financial_transaction_row_current_user_v4\([\s\S]*p_origin text,[\s\S]*p_pdv_cash_session_id uuid/,
    );
    expect(sql).toMatch(
      /CREATE POLICY "Scoped financial transaction reads v3"[\s\S]*public\.can_read_financial_transaction_row_current_user_v4\([\s\S]*company_id,[\s\S]*id,[\s\S]*origin,[\s\S]*pdv_cash_session_id/,
    );
  });

  it('permite ler o retorno para todos os perfis que podem gerenciar o financeiro', () => {
    expect(sql).toMatch(/'fn:manage_finance'/);
    expect(sql).toMatch(/'fn:view_finance_totals'/);
    expect(sql).toMatch(/'screen:finance'/);
  });

  it('mantém o helper de identidade arbitrária privado e expõe só o wrapper preso ao auth.uid', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.pdv_can_read_financial_transaction_v3\(uuid, uuid, uuid\)[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.can_read_financial_transaction_row_current_user_v4\([\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.can_read_financial_transaction_row_current_user_v4\([\s\S]*TO authenticated, service_role/,
    );
    expect(sql).toMatch(/v_user_id uuid := auth\.uid\(\)/);
  });
});
