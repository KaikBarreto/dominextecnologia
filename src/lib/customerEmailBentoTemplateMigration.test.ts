import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261123154500_customer_email_bento_template.sql'),
  'utf8',
);

describe('modelo Bento grafite dos e-mails de cobrança', () => {
  it('adiciona o modelo ao constraint e à validação da RPC', () => {
    expect(migration).toContain("'premium_dark', 'bento_gray'");
    expect(migration).toContain('customer_email_settings_template_style_check');
    expect(migration).toContain("p_template_style NOT IN ('classic_light', 'brand_light', 'premium_dark', 'bento_gray')");
  });

  it('mantém a autorização e o gate do módulo Cobranças', () => {
    expect(migration).toContain('public.can_manage_system(v_user_id)');
    expect(migration).toContain("public.company_has_module(v_company_id, 'cobrancas')");
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.update_customer_email_settings');
  });
});
