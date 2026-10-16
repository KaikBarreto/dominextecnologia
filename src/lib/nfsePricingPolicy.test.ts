import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const migration = readSource(
  'supabase/migrations/20261017000000_nfse_preco_base_150.sql',
);

describe('preço comercial de Notas Fiscais', () => {
  it('fixa módulo e nível inicial em R$ 150 sem alterar os níveis superiores', () => {
    expect(migration).toMatch(/subscription_modules[\s\S]*SET price = 150[\s\S]*WHERE code = 'nfe'/);
    expect(migration).toMatch(/nfse_tiers[\s\S]*SET price = 150,[\s\S]*WHERE tier = 1/);
    expect(migration).not.toMatch(/WHERE tier IN \(2, 3, 4\)/);
  });

  it('reajusta a renovação somente do Personalizado com NFS-e nível 1', () => {
    expect(migration).toContain("company.subscription_plan = 'personalizado'");
    expect(migration).toContain('COALESCE(company.nfse_tier, 1) = 1');
    expect(migration).toContain("module.module_code = 'nfe'");
    expect(migration).toContain('subscription_value = company.subscription_value + v_delta');
    expect(migration).toContain('pending_subscription_value = company.pending_subscription_value + v_delta');
    expect(migration).not.toMatch(/SET custom_price\s*=/);
  });

  it('cadastro, teste, venda e afiliado calculam o Personalizado pelo catálogo', () => {
    const registration = readSource('supabase/functions/self-register/index.ts');
    expect(registration).toContain(".from('subscription_modules')");
    expect(registration).toContain('const personalizadoSum = personalizadoModules.reduce');

    const adminForm = readSource('src/components/admin/CompanyFormModal.tsx');
    const linkForm = readSource('src/components/admin/GenerateLinkModal.tsx');
    expect(adminForm).toContain('sumModulesPrice(allModules, selectedModules');
    expect(linkForm).toMatch(/sumModulesPrice\([\s\S]*?allModules,[\s\S]*?customModules/);
  });

  it('mudanças de plano usam catálogo e diferença real dos níveis no servidor', () => {
    const changePlan = readSource('supabase/functions/change-subscription-plan/index.ts');
    expect(changePlan).toContain('.from("subscription_modules")');
    expect(changePlan).toContain('.from("nfse_tiers")');
    expect(changePlan).toContain('targetMonthlyValue += (byTier.get(targetNfseTier) ?? 0) - (byTier.get(1) ?? 0)');
  });

  it('sincroniza a próxima renovação recorrente já existente na Asaas', () => {
    const webhook = readSource('supabase/functions/asaas-webhook/index.ts');
    expect(webhook).toContain('syncNfseBaseRepriceRenewal');
    expect(webhook).toContain('updatePendingPayments: true');
    expect(webhook).toContain('NFSE_BASE_REPRICE_REASON');
  });
});
