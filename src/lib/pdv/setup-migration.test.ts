import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261111120000_pdv_provisiona_caixa_ao_ativar_modulo.sql',
  'utf8',
);

describe('provisionamento inicial do PDV', () => {
  it('deriva a empresa da sessão na RPC pública e não aceita company_id do navegador', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.pdv_ensure_setup()');
    expect(migration).toContain('v_company_id := public.get_user_company_id(v_uid)');
    expect(migration).toContain('public.is_admin_or_gestor(v_uid)');
    expect(migration).not.toMatch(/pdv_ensure_setup\s*\(\s*p_company_id/i);
  });

  it('mantém a função interna fechada e expõe somente o wrapper autenticado', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.pdv_bootstrap_company(uuid) FROM PUBLIC, anon, authenticated',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.pdv_ensure_setup() TO authenticated, service_role',
    );
  });

  it('provisiona cofre e terminal de forma idempotente ao ativar o módulo', () => {
    expect(migration).toContain("cm.module_code = 'pdv'");
    expect(migration).toContain('ON CONFLICT (company_id) DO NOTHING');
    expect(migration).toContain('IF NOT EXISTS (\n    SELECT 1 FROM public.pdv_terminals');
    expect(migration).toContain('CREATE TRIGGER tg_company_modules_bootstrap_pdv');
  });
});
