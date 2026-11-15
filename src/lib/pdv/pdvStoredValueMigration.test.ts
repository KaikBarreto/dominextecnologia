import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261113130000_pdv_stored_value_installments.sql'),
  'utf8',
);
const directSaleBase = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261107134000_pdv_direct_sale_v2.sql'),
  'utf8',
);
const counterBase = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261107137000_pdv_counter_dispatch_v2.sql'),
  'utf8',
);

describe('pagamentos por saldo, voucher e fiado parcelado', () => {
  it('mantém todas as âncoras do patch financeiro no contrato anterior', () => {
    [
      '  v_receivable_id uuid;',
      "'method','amount','change_amount','account_id','due_date'",
      "'due_date', NULLIF(payment->>'due_date','')::date",
      "'dinheiro','pix','transferencia','debito','credito','fiado'",
      "OR (payment->>'method' <> 'fiado' AND payment->>'due_date' IS NOT NULL)",
      "GROUP BY payment->>'method'",
      "payment->>'method' IN ('dinheiro','pix','transferencia')",
      "v_account_id := NULLIF(v_payment->>'account_id','')::uuid;",
    ].forEach((anchor) => expect(directSaleBase).toContain(anchor));
    [
      'v_receivable_id uuid; v_method text; v_amount numeric(14,2); v_due_date date;',
      'jsonb_array_length(p_payments)>6',
      "'method','amount','account_id','due_date'",
      "'due_date',NULLIF(payment->>'due_date','')::date",
      "'dinheiro','pix','transferencia','debito','credito','fiado'",
      "OR (payment->>'method'<>'fiado' AND payment->>'due_date' IS NOT NULL)",
      "GROUP BY payment->>'method' HAVING count(*)>1",
      "v_account_id:=NULLIF(v_payment->>'account_id','')::uuid;",
    ].forEach((anchor) => expect(counterBase).toContain(anchor));
  });

  it('filtra cliente, voucher e fornecedor pela empresa da sessão', () => {
    expect(migration).toContain('customer.company_id=v_context.company_id');
    expect(migration).toContain('voucher.company_id=v_context.company_id');
    expect(migration).toContain('supplier.company_id=v_context.company_id');
    expect(migration).toContain('v_voucher.customer_id IS DISTINCT FROM p_customer_id');
    expect(migration).toContain('v_voucher.customer_id IS DISTINCT FROM v_order.customer_id');
    expect(migration).toContain('p_return_id=>voucher.source_commercial_return_id');
    expect(migration).toContain('p_return_id=>v_voucher.source_commercial_return_id');
  });

  it('recalcula saldo no servidor e bloqueia valor insuficiente', () => {
    expect(migration).toContain("pdv_party_available_credit_v2(v_company,''customer'',p_customer_id)<v_amount");
    expect(migration).toContain("pdv_party_available_credit_v2(v_context.company_id,''customer'',v_order.customer_id)<v_amount");
    expect(migration).toContain("pdv_party_available_credit_v2(\n       v_context.company_id,'supplier',p_supplier_id\n     )<v_total");
    expect(migration).toContain('code=pdv_direct_sale_customer_balance_insufficient');
    expect(migration).toContain('code=pdv_counter_customer_balance_insufficient');
    expect(migration).toContain('code=pdv_supplier_credit_insufficient');
  });

  it('trava o cliente antes de conferir saldo na venda direta', () => {
    const lock = migration.indexOf('PDV_DIRECT_STORED_VALUE_CUSTOMER_LOCK_V3');
    const tenantLock = migration.indexOf(
      'customer.id=p_customer_id AND customer.company_id=v_company',
      lock,
    );
    const forUpdate = migration.indexOf('customer.is_deleted IS FALSE FOR UPDATE', tenantLock);
    const balanceCheck = migration.indexOf(
      "pdv_party_available_credit_v2(v_company,''customer'',p_customer_id)<v_amount",
      lock,
    );
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(tenantLock).toBeGreaterThan(lock);
    expect(forUpdate).toBeGreaterThan(tenantLock);
    expect(balanceCheck).toBeGreaterThan(forUpdate);
  });

  it('aceita várias parcelas de fiado sem liberar métodos duplicados', () => {
    expect(migration).toContain("HAVING count(*) > 1 AND payment->>''method'' <> ''fiado''");
    expect(migration).toContain("HAVING count(*)>1 AND payment->>''method''<>''fiado''");
    expect(migration).toContain('jsonb_array_length(p_payments)>30');
  });

  it('mantém retry idempotente e livro de saldo append-only', () => {
    expect(migration).toContain("'purchase.supplier_credit.v3',p_client_request_id::text");
    expect(migration).toContain("RETURN v_claim.stored_result||jsonb_build_object('idempotent',true)");
    expect(migration).toContain('operation_request_id,created_by');
    expect(migration).toContain("entry_kind,amount,occurred_on");
    expect(migration).not.toMatch(/UPDATE\s+public\.pdv_party_credit_entries/i);
  });

  it('mantém compra e consumo do adiantamento na mesma transação', () => {
    const start = migration.indexOf(
      'CREATE OR REPLACE FUNCTION public.pdv_register_direct_purchase_supplier_credit_v3',
    );
    const end = migration.indexOf('END $fn$;', start);
    const wrapper = migration.slice(start, end);
    const purchase = wrapper.indexOf('v_purchase:=public.');
    const claim = wrapper.indexOf("'purchase.supplier_credit.v3'");
    const insufficient = wrapper.indexOf('code=pdv_supplier_credit_insufficient');
    const application = wrapper.indexOf('INSERT INTO public.pdv_party_credit_entries');
    const complete = wrapper.indexOf('pdv_complete_operation_request');
    expect(purchase).toBeGreaterThanOrEqual(0);
    expect(claim).toBeGreaterThan(purchase);
    expect(insufficient).toBeGreaterThan(claim);
    expect(application).toBeGreaterThan(insufficient);
    expect(complete).toBeGreaterThan(application);
    expect(wrapper).not.toContain('EXCEPTION WHEN');
  });

  it('não abre os livros financeiros para leitura direta no navegador', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.pdv_get_customer_payment_options_v3(uuid) FROM PUBLIC,anon;',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.pdv_get_supplier_payment_option_v3(uuid) FROM PUBLIC,anon;',
    );
  });
  it('mantém saldo vinculado pelo livro sem violar o papel exclusivo de fiado', () => {
    // Regressão: a constraint W1A reserva receivable_transaction_id ao fiado;
    // a obrigação do saldo já é identificada pelo lançamento append-only.
    const roles = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261107130500_pdv_w1a_recebiveis_v2.sql'), 'utf8');
    expect(roles).toContain("coverage_kind <> 'receivable' AND receivable_transaction_id IS NULL");
    expect(migration).not.toContain('v_receivable_id,v_value_entry_id,now(),now()');
    expect(migration.match(/NULL,v_value_entry_id,now\(\),now\(\)/g)).toHaveLength(2);
    expect(migration).toContain('target_financial_transaction_id,operation_request_id,created_by');
  });

  it('expande o snapshot de unidade que a venda direta já exige', () => {
    const repair = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261113125000_pdv_direct_sale_unit_factor_snapshot.sql'), 'utf8');
    expect(directSaleBase).toContain('order_discount_allocated_v2,unit_factor_snapshot');
    expect(repair).toContain('ALTER TABLE public.pdv_order_items');
    expect(repair).toContain('ADD COLUMN IF NOT EXISTS unit_factor_snapshot numeric NOT NULL DEFAULT 1');
    expect(repair).toContain('unit_factor_snapshot>0');
    expect(repair).toContain("'nan','infinity','-infinity'");
    expect(repair).not.toMatch(/(?:GRANT|REVOKE|CREATE POLICY)/i);
  });

});
