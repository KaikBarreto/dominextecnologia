import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const baseMigration = readSource(
  'supabase/migrations/20261016180000_financeiro_completo_na_base_exceto_excecao.sql',
);
const correction = readSource(
  'supabase/migrations/20261016235900_restaurar_cobrancas_como_addon_pago.sql',
);

describe('Financeiro na base com Cobranças como add-on', () => {
  it('mantém o Financeiro Avançado gratuito e restaura Cobranças a R$ 150', () => {
    expect(baseMigration).toMatch(/SET price = 0,[\s\S]*WHERE code = 'finance_advanced'/);
    expect(correction).toMatch(/price = 150,[\s\S]*WHERE code = 'cobrancas'/);
    expect(correction).toContain("type = 'addon'");
    expect(correction).toContain("included_modules = COALESCE(included_modules, '[]'::jsonb) - 'cobrancas'");
  });

  it('remove somente concessões automáticas posteriores à mudança incorreta', () => {
    expect(correction).toContain("company.subscription_plan = 'personalizado'");
    expect(correction).toContain("module.module_code = 'cobrancas'");
    expect(correction).toContain("module.activated_at >= TIMESTAMPTZ '2026-10-16 16:59:24+00'");
  });

  it('exige o módulo nas tabelas autenticadas de Cobranças e Assinaturas', () => {
    for (const table of [
      'tenant_payment_accounts',
      'tenant_charges',
      'tenant_subscriptions',
      'tenant_payment_webhook_events',
    ]) {
      expect(correction).toContain(`'${table}'`);
    }
    expect(correction).toContain('AS RESTRICTIVE FOR ALL TO authenticated');
    expect(correction).toContain("company_has_module(company_id, ''cobrancas'')");
  });

  it('não anuncia Cobranças dentro da descrição do módulo básico', () => {
    const description = correction.match(/SET description = '([^']+)'[\s\S]*WHERE code = 'basic'/)?.[1];
    expect(description).toContain('Financeiro Completo');
    expect(description).not.toContain('Cobranças');
  });

  it('mantém os gates de Cobranças e Assinaturas na interface e nas edges', () => {
    const uiSources = [
      'src/pages/Finance.tsx',
      'src/components/financial/FinanceRelatorio.tsx',
      'src/components/layout/SidebarMenuContent.tsx',
      'src/components/layout/MoreMenuDrawer.tsx',
    ].map(readSource).join('\n');
    const edgeSources = [
      'supabase/functions/tenant-asaas-create-charge/index.ts',
      'supabase/functions/tenant-asaas-create-subscription/index.ts',
      'supabase/functions/tenant-asaas-manage-subscription/index.ts',
    ].map(readSource).join('\n');

    expect(uiSources).toContain("hasModule('cobrancas')");
    expect(uiSources).toContain("moduleKey: 'cobrancas'");
    expect(edgeSources).toContain('authorizePaymentsManager(req)');
  });

  it.each(['self-register', 'create-company'] as const)(
    '%s provisiona Financeiro, mas não força Cobranças no Personalizado',
    (name) => {
      const source = readSource(`supabase/functions/${name}/index.ts`);
      const policy = name === 'self-register'
        ? source.match(/const FREE_BASE_MODULE_CODES\s*=\s*\[[\s\S]*?const REQUIRED_PERSONALIZED_MODULE_CODES[^;]+;/)?.[0] ?? ''
        : source.match(/const REQUIRED_PERSONALIZED_MODULE_CODES\s*=\s*\[[\s\S]*?\]/)?.[0] ?? '';
      expect(policy).toContain("'finance_advanced'");
      expect(policy).not.toContain("'cobrancas'");
    },
  );

  it('change-subscription-plan injeta Financeiro e cobra Cobranças somente se selecionado', () => {
    const source = readSource('supabase/functions/change-subscription-plan/index.ts');
    const freeBase = source.match(/const FREE_BASE_MODULES\s*=\s*\[[\s\S]*?\]/)?.[0] ?? '';
    expect(freeBase).toContain('"finance_advanced"');
    expect(freeBase).not.toContain('"cobrancas"');
  });
});
