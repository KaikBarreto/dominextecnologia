import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const migration = readSource(
  'supabase/migrations/20261016180000_financeiro_completo_na_base_exceto_excecao.sql',
);
const catalogCorrection = readSource(
  'supabase/migrations/20261016190000_corrigir_descricao_modulo_basico_financeiro.sql',
);

describe('Financeiro completo na base', () => {
  it('zera os entitlements financeiros e os inclui em todos os planos, exceto Exceção', () => {
    expect(migration).toContain("WHERE code = 'finance_advanced'");
    expect(migration).toMatch(/SET price = 0,[\s\S]*WHERE code = 'finance_advanced'/);
    expect(migration).toContain("WHERE code = 'cobrancas'");
    expect(migration).toContain("code IN ('start', 'avancado', 'master')");
    expect(migration).toContain("company.subscription_plan = 'personalizado'");
    expect(migration).toContain("company.subscription_plan = 'excecao'");
    expect(migration).toContain("included_modules = COALESCE(included_modules, '[]'::jsonb) - 'finance_advanced'");
    expect(migration).toContain("- 'cobrancas'");
  });

  it('mantém o Exceção bloqueado nas tabelas financeiras autenticadas', () => {
    for (const table of [
      'financial_transactions',
      'financial_accounts',
      'financial_categories',
      'cost_centers',
      'credit_card_bills',
      'tenant_payment_accounts',
      'tenant_charges',
      'tenant_subscriptions',
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain('AS RESTRICTIVE FOR ALL TO authenticated');
    expect(migration).toContain("company_plan_allows_product_area(company_id, ''finance'')");
  });

  it('descreve Cobranças na base sem anunciar Contratos/PMOC', () => {
    const description = catalogCorrection.match(/SET description = '([^']+)'/)?.[1];
    expect(description).toContain('Financeiro Completo com Cobranças');
    expect(description).not.toContain('Contratos/PMOC');
  });

  it('remove os gates legados de Financeiro Avançado da interface', () => {
    const sources = [
      'src/pages/Finance.tsx',
      'src/components/financial/FinanceRelatorio.tsx',
      'src/components/layout/SidebarMenuContent.tsx',
      'src/components/layout/MoreMenuDrawer.tsx',
    ].map(readSource).join('\n');

    expect(sources).not.toContain("hasModule('finance_advanced')");
    expect(sources).not.toContain("moduleKey: 'finance_advanced'");
  });

  it.each(['self-register', 'create-company'] as const)(
    '%s provisiona o entitlement gratuito no Personalizado',
    (name) => {
      const source = readSource(`supabase/functions/${name}/index.ts`);
      expect(source).toContain("'finance_advanced'");
      expect(source).toContain("'cobrancas'");
    },
  );
});
