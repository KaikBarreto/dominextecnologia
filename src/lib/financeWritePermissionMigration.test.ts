import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261113131500_fix_finance_write_permission_wrapper.sql',
  ),
  'utf8',
);

describe('migration de permissão de escrita financeira', () => {
  it('expõe somente um wrapper preso ao usuário autenticado', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.can_manage_finance_transactions_current_user\(\)/,
    );
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/auth\.uid\(\) IS NOT NULL/);
    expect(sql).not.toMatch(/can_manage_finance_transactions_current_user\([^)]*(p_user|user_id)/);
  });

  it('mantém a função privada indisponível e concede somente o wrapper', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.can_manage_finance_transactions_current_user\(\)[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.can_manage_finance_transactions_current_user\(\)[\s\S]*TO authenticated, service_role/,
    );
  });

  it('usa o wrapper em INSERT e UPDATE sem remover as travas do tenant', () => {
    expect(sql.match(/public\.can_manage_finance_transactions_current_user\(\)/g)).toHaveLength(6);
    expect(sql).toMatch(/FOR INSERT TO authenticated[\s\S]*WITH CHECK/);
    expect(sql).toMatch(/FOR UPDATE TO authenticated[\s\S]*USING[\s\S]*WITH CHECK/);
    expect(sql.match(/company_id = public\.get_user_company_id\(auth\.uid\(\)\)/g)).toHaveLength(3);
    expect(sql.match(/public\.tenant_subscription_allows_access\(company_id\)/g)).toHaveLength(3);
    expect(sql.match(/origin IS DISTINCT FROM 'pdv'/g)).toHaveLength(3);
  });
});
