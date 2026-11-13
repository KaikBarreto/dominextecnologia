import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261113170000_salesperson_commission_uses_paid_amount.sql',
  ),
  'utf8',
);

describe('comissão de vendedor — valor pago como fonte canônica', () => {
  it('a RPC manual calcula e persiste a comissão sobre p_amount', () => {
    expect(migration).toContain('v_commission_base  := p_amount;');
    expect(migration).toMatch(
      /v_company\.origin,\s+v_commission_base,\s+p_amount,\s+v_total_commission,/,
    );
    expect(migration).not.toContain(
      'v_commission_base  := COALESCE(NULLIF(v_subscription_value, 0), p_amount);',
    );
  });

  it('preserva os guardrails financeiros e de autorização da RPC', () => {
    expect(migration).toContain("public.has_role(auth.uid(), 'super_admin'::app_role)");
    expect(migration).toContain(
      "public.has_admin_permission(auth.uid(), 'admin_empresas')",
    );
    expect(migration).toContain('AND v_affiliate_id IS NULL');
    expect(migration).toContain(
      "COALESCE(v_company.subscription_status, '') <> 'active'",
    );
    expect(migration).toContain('REVOKE ALL ON FUNCTION');
  });

  it('o reparo histórico só roda com a venda antiga e o pagamento de 150 confirmados', () => {
    expect(migration).toContain("lower(trim(c.name)) = lower('Carlos & Arruda Refrigeração')");
    expect(migration).toContain('p.amount = 150.00');
    expect(migration).toContain('ss.amount = 297.00');
    expect(migration).toContain('ss.paid_amount = 297.00');
    expect(migration).toContain('ss.commission_amount = 297.00');
    expect(migration).toContain("p.type IN ('primeira_venda', 'first_sale')");
  });
});
