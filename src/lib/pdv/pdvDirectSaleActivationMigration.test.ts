import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261111133000_pdv_activate_v2_with_module.sql',
  'utf8',
);

describe('ativação canônica do Caixa v2', () => {
  it('acompanha assinatura e módulo PDV sem allowlist paralela', () => {
    const functionStart = migration.indexOf(
      'CREATE OR REPLACE FUNCTION public.pdv_direct_sale_v2_enabled_internal',
    );
    const functionEnd = migration.indexOf('$function$;', functionStart);
    const definition = migration.slice(functionStart, functionEnd);

    expect(definition).toContain('tenant_subscription_allows_access(p_company_id) IS TRUE');
    expect(definition).toContain("company_has_module(p_company_id, 'pdv') IS TRUE");
    expect(definition).not.toContain('app_feature_flags');
    expect(definition).not.toContain('company_allowlist');
  });

  it('mantém o helper interno fora das roles do navegador', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.pdv_direct_sale_v2_enabled_internal(uuid)',
    );
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.pdv_direct_sale_v2_enabled_internal(uuid)',
    );
    expect(migration).toContain('TO service_role');
  });
});
