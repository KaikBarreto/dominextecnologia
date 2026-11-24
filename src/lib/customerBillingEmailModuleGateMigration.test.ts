import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261123143000_customer_billing_email_engine.sql'),
  'utf8',
);

describe('gate de módulo do motor de e-mails de cobrança', () => {
  it('impede ativação sem Cobranças e retorna erro de domínio', () => {
    expect(migration).toContain("company_has_module(v_company_id, 'cobrancas')");
    expect(migration).toContain('code=customer_email_billing_module_required');
  });

  it('bloqueia enfileiramento, lembretes e claim sem Cobranças', () => {
    expect(migration).toContain("company_has_module(tc.company_id, 'cobrancas') IS TRUE");
    expect(migration).toContain("company_has_module(s.company_id, 'cobrancas') IS TRUE");
    expect(migration).toContain("company_has_module(d.company_id, 'cobrancas') IS NOT TRUE");
    expect(migration).toContain("last_error_code = 'billing_module_inactive'");
  });
});
