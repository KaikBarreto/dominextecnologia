import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261113003000_reverter_aprovacao_orcamento.sql'),
  'utf8',
);

describe('reversão segura da aprovação de orçamento — migration', () => {
  it('isola tenant, assinatura e usuário ativo dentro da RPC privilegiada', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('public.get_user_company_id(v_uid)');
    expect(migration).toContain('public.is_user_active(v_uid)');
    expect(migration).toContain('public.tenant_subscription_allows_access(v_quote.company_id)');
    expect(migration).toContain("'not_found'");
  });

  it('serializa a transição e aceita retry idempotente', () => {
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain("IF v_quote.status = 'enviado'");
    expect(migration).toContain("set_config('app.revert_quote_approval', 'allowed', true)");
    expect(migration).toMatch(/SET status = 'enviado'[\s\S]+AND status = 'aprovado'/);
  });

  it('impede que um update direto contorne as travas da RPC', () => {
    expect(migration).toContain('CREATE TRIGGER trg_guard_quote_approval_revert');
    expect(migration).toContain("OLD.status = 'aprovado' AND NEW.status = 'enviado'");
    expect(migration).toContain("current_setting('app.revert_quote_approval', true) = 'allowed'");
    expect(migration).toContain('pg_trigger_depth() > 1');
  });

  it('bloqueia OS, financeiro e cobrança viva antes de reabrir', () => {
    expect(migration).toContain('v_quote.financial_generated_at IS NOT NULL');
    expect(migration).toContain('v_quote.financial_transaction_id IS NOT NULL');
    expect(migration).toContain('v_quote.converted_to_os_id IS NOT NULL');
    expect(migration).toContain('so.quote_id = v_quote.id');
    expect(migration).toContain("tc.source_type = 'quote'");
    for (const status of ['CANCELLED', 'CANCELED', 'REFUNDED', 'CHARGEBACK']) {
      expect(migration).toContain(`'${status}'`);
    }
  });

  it('não expõe a RPC para acesso anônimo', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.revert_quote_approval(uuid) FROM PUBLIC, anon',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.revert_quote_approval(uuid) TO authenticated, service_role',
    );
  });
});
