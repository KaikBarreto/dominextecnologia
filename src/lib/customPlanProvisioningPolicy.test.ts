import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const edgeSource = (name: 'self-register' | 'create-company') =>
  readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), 'utf8');

describe('provisionamento do plano personalizado', () => {
  it.each(['self-register', 'create-company'] as const)(
    '%s força todos os recursos-base sem confiar no payload',
    (name) => {
      const source = edgeSource(name);

      for (const code of ['basic', 'customer_portal', 'pricing_advanced', 'video_questions']) {
        expect(source).toContain(`'${code}'`);
      }
      expect(source).toContain('...REQUIRED_PERSONALIZED_MODULE_CODES');
      expect(source).toContain(".from('subscription_modules')");
      expect(source).toContain(".eq('is_active', true)");
      expect(source).toContain('missingRequired');
    },
  );

  it('self-register calcula o valor com os preços dos módulos ativos validados', () => {
    const source = edgeSource('self-register');

    expect(source).toContain(".select('code, price')");
    expect(source).toContain('const personalizadoSum = personalizadoModules.reduce');
    expect(source).toContain('const planPrice = isPersonalizado ? personalizadoSum : planDefaults.price');
    expect(source).toContain('Catálogo incompleto para plano personalizado');
    expect(source).toContain("if (module.code === 'basic') return price <= 0");
    expect(source).toContain('FREE_BASE_MODULE_CODES.some((code) => code === module.code)');
    expect(source).toContain('if (module.code === EXTRA_USER_MODULE_CODE) return price <= 0');
    expect(source).toContain('personalizedUsers - CUSTOM_PLAN_INCLUDED_USERS');
    expect(source).toContain('personalizedExtraUsers * personalizadoExtraUserPrice');
    expect(source).toContain('Preços inválidos no catálogo do plano personalizado');
    expect(source).toContain('status: 503');
  });

  it('self-register usa 7 dias como teste padrão e 5 usuários como base', () => {
    const source = edgeSource('self-register');

    expect(source).toContain('const CUSTOM_PLAN_INCLUDED_USERS = 5');
    expect(source).toContain('const trialDays = trialDaysOverride || 7');
    expect(source).toContain('trial_days: isSale ? 0 : (trialDaysOverride || 7)');
  });

  it('create-company só injeta obrigatórios no Personalizado e preserva planos prontos', () => {
    const source = edgeSource('create-company');

    expect(source).toContain('const moduleCodesToValidate = isPersonalizado');
    expect(source).toContain('? [...new Set([...REQUIRED_PERSONALIZED_MODULE_CODES, ...requestedModuleCodes])]');
    expect(source).toContain(': requestedModuleCodes');
  });

  it.each(['self-register', 'create-company'] as const)(
    '%s desfaz a empresa se os módulos do Personalizado não forem gravados',
    (name) => {
      const source = edgeSource(name);
      const modulesFailure = source.indexOf('Falha ao gravar');

      expect(modulesFailure).toBeGreaterThan(-1);
      expect(source.slice(modulesFailure, modulesFailure + 900)).toContain(".from('companies').delete().eq('id', company.id)");
    },
  );
});
