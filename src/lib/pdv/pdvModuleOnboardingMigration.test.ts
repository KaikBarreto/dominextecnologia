import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261113110000_pdv_module_onboarding_and_advanced_features.sql',
  'utf8',
);

function definition(name: string) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = migration.indexOf('$function$;', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe('onboarding e recursos avancados do PDV pelo modulo', () => {
  it('deriva o entitlement no servidor e o setup publico usa somente a empresa da sessao', () => {
    const setup = definition('pdv_ensure_setup()');
    expect(setup).toContain('get_user_company_id(v_uid)');
    expect(setup).toContain('is_admin_or_gestor(v_uid)');
    expect(setup).toContain('tenant_subscription_allows_access(v_company_id)');
    expect(setup).toContain("company_has_module(v_company_id, 'pdv')");
    expect(setup).not.toContain('p_company_id');
  });

  it('nunca cria terminal sem estoque geral e pede novo preparo depois do cadastro', () => {
    const bootstrap = definition('pdv_bootstrap_company(p_company_id uuid)');
    expect(bootstrap).toContain('stock.customer_id IS NULL');
    expect(bootstrap).toContain("'needs_stock', true");
    expect(bootstrap.indexOf("'needs_stock', true")).toBeLessThan(
      bootstrap.indexOf('INSERT INTO public.pdv_terminals'),
    );
    expect(migration).not.toContain('CREATE TRIGGER tg_stocks_bootstrap_pdv_entitlement');
  });

  it('o trigger de estoque apenas repara terminal preexistente', () => {
    const repair = definition('tg_repair_pdv_terminal_on_general_stock()');
    expect(repair).toContain('UPDATE public.pdv_terminals');
    expect(repair).toContain('terminal.stock_id IS NULL');
    expect(repair).toContain('NEW.customer_id IS NOT NULL');
    expect(repair).toContain('ORDER BY stock.is_default DESC');
    expect(repair).toContain('SET stock_id = v_target_stock_id');
    expect(repair).not.toContain('SET stock_id = NEW.id');
    expect(repair).not.toContain('INSERT INTO');
    expect(repair).not.toContain('pdv_bootstrap_company');
    expect(repair).not.toContain('financial_accounts');
    expect(migration).toContain('CREATE TRIGGER tg_stocks_repair_pdv_terminal');
  });

  it('nao troca a conta configurada enquanto existir caixa aberto legado ou v2', () => {
    const bootstrap = definition('pdv_bootstrap_company(p_company_id uuid)');
    const openCashGuard = bootstrap.indexOf("session.status = 'aberta'");
    const createCashAccount = bootstrap.indexOf('INSERT INTO public.financial_accounts');
    const updateConfiguredAccount = bootstrap.indexOf('UPDATE public.company_settings');

    expect(bootstrap).toContain("'pdv-treasury-company:' || p_company_id::text");
    expect(bootstrap).toContain("'pdv-cofre:' || p_company_id::text");
    expect(bootstrap).toContain('account.id = v_current_account_id');
    expect(bootstrap).toContain('account.company_id = p_company_id');
    expect(bootstrap).toContain('IF v_has_open_cash THEN');
    expect(bootstrap).toContain("'cash_account_deferred', true");
    expect(bootstrap).not.toContain('session.contract_version');
    expect(openCashGuard).toBeGreaterThanOrEqual(0);
    expect(openCashGuard).toBeLessThan(createCashAccount);
    expect(openCashGuard).toBeLessThan(updateConfiguredAccount);
  });

  it('provisiona automaticamente apenas contratacao explicita', () => {
    expect(migration).not.toContain('CREATE TRIGGER tg_companies_bootstrap_pdv_entitlement');
    expect(migration).toContain("module.module_code = 'pdv'");
    expect(migration).toContain('Trial e plano incluso permanecem');
  });

  it.each([
    'pdv_party_accounts_v2_enabled_internal(p_company_id uuid)',
    'pdv_returns_v2_enabled_internal(p_company_id uuid)',
    'pdv_after_sale_v2_enabled_internal(p_company_id uuid)',
  ])('%s acompanha assinatura e modulo sem allowlist', (name) => {
    const gate = definition(name);
    expect(gate).toContain('pdv_company_access_entitled_internal(p_company_id) IS TRUE');
    expect(gate).toContain("company_has_module(p_company_id, 'pdv') IS TRUE");
    expect(gate).not.toContain('app_feature_flags');
    expect(gate).not.toContain('company_allowlist');
  });

  it('mantem helpers e triggers fora das roles do navegador', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.pdv_company_access_entitled_internal\(uuid\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.tg_repair_pdv_terminal_on_general_stock\(\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.pdv_party_accounts_v2_enabled_internal\(uuid\),[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/,
    );
  });
});
