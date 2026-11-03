import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261102193000_inventory_abc_report.sql'),
  'utf8',
);

describe('contrato de segurança da Curva ABC', () => {
  it('isola tenant, assinatura, permissão e ACL dos locais', () => {
    expect(sql).toContain('get_user_company_id(v_user_id)');
    expect(sql).toContain('tenant_subscription_allows_access(v_company_id)');
    expect(sql).toContain("user_has_permission(v_user_id, 'screen:inventory')");
    expect(sql).toContain('can_access_stock(v_user_id, s.id)');
    expect(sql).toContain('i.company_id = v_company_id');
    expect(sql).toContain('m.company_id = v_company_id');
    expect(sql).toContain('o.company_id = v_company_id');
  });

  it('não expõe a RPC para público ou anônimo', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_inventory_abc_report(date, date, uuid[]) FROM PUBLIC, anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_inventory_abc_report(date, date, uuid[]) TO authenticated, service_role');
  });

  it('mantém vendas PDV fora do consumo e aplica desconto global à receita', () => {
    expect(sql).toContain("LIKE 'Venda no PDV, pedido nº %'");
    expect(sql).toContain('o.total / o.subtotal');
    expect(sql).toContain('COALESCE(o.paid_at, o.created_at)::date');
  });
});
