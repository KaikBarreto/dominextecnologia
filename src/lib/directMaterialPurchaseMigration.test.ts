import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261017180000_compra_direta_estoque_financeiro.sql'),
  'utf8',
);

describe('compra direta integrada ao estoque e financeiro', () => {
  it('mantém a criação atômica e usa a porta canônica do estoque', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.registrar_compra_material_direta');
    expect(migration).toContain('PERFORM public.receber_ordem_compra(v_ordem.id, v_receipt_items)');
    expect(migration).toContain('INSERT INTO public.financial_transactions');
    expect(migration).toContain("'saida'");
  });

  it('calcula o total no servidor e protege retry idempotente', () => {
    expect(migration).toContain('round(sum(x.quantity * x.unit_price), 2)');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('client_request_id = p_client_request_id');
    expect(migration).toContain('request_hash IS DISTINCT FROM v_request_hash');
  });

  it('valida tenant, assinatura, ACL e permissões dos dois domínios', () => {
    expect(migration).toContain("up.permissions ? 'fn:manage_inventory'");
    expect(migration).toContain("up.permissions ? 'fn:manage_finance'");
    expect(migration).toContain('tenant_subscription_allows_access(v_company_id)');
    expect(migration).toContain('public.can_access_stock(v_user_id, p_stock_id)');
    expect(migration).toContain('s.company_id = v_company_id');
    expect(migration).toContain('a.company_id = v_company_id');
  });

  it('impede cartão de crédito e mutações avulsas da compra direta', () => {
    expect(migration).toContain("v_account.type = 'cartao'");
    expect(migration).toContain('guard_direct_purchase_immutable');
    expect(migration).toContain('guard_direct_purchase_child_immutable');
    expect(migration).toContain('guard_direct_purchase_financial_immutable');
    expect(migration).toContain('ON DELETE RESTRICT');
  });

  it('expõe relatório ponderado por material com tenant, permissão e ACL de local', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_material_purchase_report');
    expect(migration).toContain('sum(r.total) / (sum(r.quantity) FILTER (WHERE r.unit_price IS NOT NULL))');
    expect(migration).toContain("public.user_has_permission(v_user_id, 'screen:inventory')");
    expect(migration).toContain('priced_quantity');
    expect(migration).toContain('unpriced_quantity');
    expect(migration).toContain("'payment_method', r.payment_method");
    expect(migration).toContain('oi.quantity_received > 0');
    expect(migration).toContain('public.can_access_stock(v_user_id, c.stock_id)');
    expect(migration).toContain('ft.transaction_type = \'saida\'');
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_material_purchase_report\(date, date, uuid\[\], uuid\[\], uuid\[\], uuid\[\]\)[\s\S]*FROM PUBLIC, anon;/);
  });
});
