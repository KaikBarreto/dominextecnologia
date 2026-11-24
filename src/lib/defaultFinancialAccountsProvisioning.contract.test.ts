import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureDefaultFinancialAccounts } from '../../supabase/functions/_shared/default-financial-accounts';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('supabase/migrations/20261111180000_seed_default_financial_accounts.sql');
const permissionsMigration = read('supabase/migrations/20261111190000_reconcile_financial_account_permissions.sql');
const dependenciesMigration = read('supabase/migrations/20261111200000_normalize_finance_permission_dependencies.sql');
const reconciliationPermissionMigration = read('supabase/migrations/20261111201500_require_finance_permission_for_reconciliation.sql');
const helper = read('supabase/functions/_shared/default-financial-accounts.ts');

describe('provisionamento das contas financeiras iniciais', () => {
  it('garante Caixa e Conta Principal para toda empresa nova no banco', () => {
    expect(migration).toContain('AFTER INSERT ON public.companies');
    expect(migration).toContain('seed_default_financial_accounts_on_company_insert');
    expect(migration).toContain("(NEW.id, 'Caixa'");
    expect(migration).toContain("(NEW.id, 'Conta Principal'");
    expect(migration).toContain('account.company_id = NEW.id');
  });

  it('faz backfill somente de empresas sem nenhuma conta e verifica o resultado', () => {
    expect(migration).toContain('companies_without_accounts AS MATERIALIZED');
    expect(migration).toMatch(/WHERE NOT EXISTS[\s\S]*account\.company_id = company\.id/);
    expect(migration).toContain('Backfill financeiro incompleto');
    expect(migration).not.toMatch(/UPDATE\s+public\.financial_accounts/i);
  });

  it('não expõe a trigger function para tenants e usuários anônimos', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.seed_default_financial_accounts_on_company_insert\(\)[\s\S]*FROM PUBLIC, anon, authenticated;/,
    );
  });

  it('reconcilia uso das contas para usuários e cargos com acesso operacional', () => {
    expect(permissionsMigration).toContain('CREATE OR REPLACE FUNCTION public.can_use_bank_accounts');
    expect(permissionsMigration).toContain("up.permissions ? 'fn:manage_finance'");
    expect(permissionsMigration).toContain("up.permissions ? 'screen:finance'");
    expect(permissionsMigration).toMatch(/UPDATE public\.user_permissions[\s\S]*fn:use_bank_accounts/);
    expect(permissionsMigration).toMatch(/UPDATE public\.permission_presets[\s\S]*fn:use_bank_accounts/);
  });

  it('mantém dependências financeiras consistentes em usuários e cargos futuros', () => {
    expect(dependenciesMigration).toContain('normalize_finance_permission_dependencies');
    expect(dependenciesMigration).toContain("NEW.permissions ? 'fn:manage_finance'");
    expect(dependenciesMigration).toContain("NEW.permissions ? 'fn:manage_bank_accounts'");
    expect(dependenciesMigration).toContain("'[\"fn:use_bank_accounts\"]'::jsonb");
    expect(dependenciesMigration).toContain('ON public.user_permissions');
    expect(dependenciesMigration).toContain('ON public.permission_presets');
  });

  it('exige autorização financeira também nas RPCs privilegiadas de conciliação', () => {
    expect(reconciliationPermissionMigration).toContain('CREATE OR REPLACE FUNCTION public._reconcile_assert_write');
    expect(reconciliationPermissionMigration).toContain('public.is_admin_or_gestor(auth.uid())');
    expect(reconciliationPermissionMigration).toContain("public.pdv_has_explicit_action_permission_v2(auth.uid(), 'fn:manage_finance')");
    expect(reconciliationPermissionMigration).toMatch(
      /REVOKE ALL ON FUNCTION public\._reconcile_assert_write\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated;/,
    );
  });

  it.each(['create-company', 'self-register'])(
    '%s usa o fallback idempotente em vez de insert cego',
    (edgeName) => {
      const edge = read(`supabase/functions/${edgeName}/index.ts`);
      expect(edge).toContain("import { ensureDefaultFinancialAccounts } from '../_shared/default-financial-accounts.ts'");
      expect(edge).toContain('ensureDefaultFinancialAccounts(supabaseAdmin, company.id)');
    },
  );

  it('fallback consulta os tipos existentes antes de inserir somente os ausentes', () => {
    expect(helper).toContain(".select('type')");
    expect(helper).toContain(".eq('company_id', companyId)");
    expect(helper).toContain('!existingTypes.has(account.type)');
    expect(helper).toContain('if (missingAccounts.length === 0)');
  });

  it('fallback cria as duas contas quando o tenant está zerado', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
        insert: async (rows: Array<Record<string, unknown>>) => {
          inserted.push(...rows);
          return { error: null };
        },
      }),
    };

    const result = await ensureDefaultFinancialAccounts(client, 'company-a');

    expect(result).toEqual({ inserted: 2, error: null });
    expect(inserted).toEqual([
      expect.objectContaining({ company_id: 'company-a', name: 'Caixa', type: 'caixa' }),
      expect.objectContaining({ company_id: 'company-a', name: 'Conta Principal', type: 'banco' }),
    ]);
  });

  it('fallback não duplica Caixa e cria somente a conta bancária ausente', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ type: 'caixa' }], error: null }),
        }),
        insert: async (rows: Array<Record<string, unknown>>) => {
          inserted.push(...rows);
          return { error: null };
        },
      }),
    };

    const result = await ensureDefaultFinancialAccounts(client, 'company-b');

    expect(result).toEqual({ inserted: 1, error: null });
    expect(inserted).toEqual([
      expect.objectContaining({ company_id: 'company-b', name: 'Conta Principal', type: 'banco' }),
    ]);
  });
});
