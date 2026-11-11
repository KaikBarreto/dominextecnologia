import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261111103000_pdv_cash_account_settings_v2.sql',
  'utf8',
);

describe('configuração segura da conta de dinheiro do PDV', () => {
  it('exige a tela e a ação explícita de configuração', () => {
    expect(migration).toContain("'screen:pdv_settings'");
    expect(migration).toContain("'fn:manage_pdv_settings'");
    expect(migration).toMatch(/pdv_get_cash_account_setting_v2[\s\S]*?'screen:pdv_settings',[\s\S]*?NULL/);
    expect(migration).toMatch(/pdv_save_cash_account_setting_v2[\s\S]*?'screen:pdv_settings',[\s\S]*?'fn:manage_pdv_settings'/);
  });

  it('lista e salva somente conta Caixa ativa da própria empresa', () => {
    expect(migration).toContain('account.company_id = v_context.company_id');
    expect(migration).toContain("account.type = 'caixa'");
    expect(migration).toContain('account.is_active IS TRUE');
    expect(migration).toContain('settings.company_id = v_context.company_id');
  });

  it('impede a troca enquanto houver qualquer caixa aberto', () => {
    expect(migration).toContain("session.status = 'aberta'");
    expect(migration).toContain('code=pdv_cash_account_open_session');
  });

  it('bloqueia alteração direta do campo para cliente autenticado', () => {
    expect(migration).toContain('pdv_guard_cash_account_setting_change');
    expect(migration).toContain("current_user <> 'authenticated'");
    expect(migration).toContain('app.pdv_cash_account_setting_change');
    expect(migration).toContain('code=pdv_cash_account_direct_change_denied');
    expect(migration).toMatch(/BEFORE UPDATE OF pdv_cash_account_id ON public\.company_settings/);
  });

  it('não publica as RPCs para anônimo ou PUBLIC', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.pdv_get_cash_account_setting_v2\(\)[\s\S]*FROM PUBLIC, anon/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.pdv_save_cash_account_setting_v2\(uuid\)[\s\S]*FROM PUBLIC, anon/);
  });
});
