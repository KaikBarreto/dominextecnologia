import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20261108019000_pdv_cash_purchase_context.sql',
  'utf8',
);

describe('compra direta vinculada ao Caixa v2', () => {
  it('mantem o fluxo de Estoque e fecha o core interno', () => {
    expect(sql).toContain('RENAME TO registrar_compra_material_direta_core_019');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.registrar_compra_material_direta_core_019[\s\S]*authenticated/);
    expect(sql).toMatch(/CREATE FUNCTION public\.registrar_compra_material_direta\([\s\S]*registrar_compra_material_direta_core_019/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.registrar_compra_material_direta\([\s\S]*authenticated,service_role/);
  });

  it('exige a abertura, o caixa, o estoque e a permissao nominal', () => {
    expect(sql).toContain('pdv_assert_cash_session_actor_v3');
    expect(sql).toContain('s.terminal_id=p_terminal_id');
    expect(sql).toContain('t.stock_id=p_stock_id');
    expect(sql).toContain('pdv_can_operate_other_cash_v2(v_uid)');
    expect(sql).not.toMatch(/pdv_registrar_compra_material_direta_v2[\s\S]*fn:edit_pdv_sales/);
    expect(sql).not.toMatch(/pdv_registrar_compra_material_direta_v2[\s\S]*is_admin_or_gestor/);
  });

  it('valida tamanho do payload antes de abrir os itens', () => {
    const required = sql.indexOf('PDV_CASH_PURCHASE_ITEMS_REQUIRED');
    const limit = sql.indexOf('PDV_CASH_PURCHASE_ITEMS_LIMIT');
    const recordset = sql.indexOf('FROM jsonb_to_recordset(p_items)');
    expect(required).toBeGreaterThan(0);
    expect(limit).toBeGreaterThan(required);
    expect(recordset).toBeGreaterThan(limit);
  });

  it('usa o mesmo total normalizado no financeiro e na custodia', () => {
    expect(sql).toContain('round(sum(round(x.quantity,4)*round(x.unit_price,2)),2)');
    expect(sql).toContain("'delta',-v_total");
    expect(sql).toContain("'cash_payment',-v_total,'compra_ordem'");
    expect(sql).toContain('v_financial_id');

    const quantity = 1.23456;
    const unitPrice = 9.876;
    const normalizedTotal = Math.round(
      (Math.round(quantity * 10_000) / 10_000)
      * (Math.round(unitPrice * 100) / 100)
      * 100,
    ) / 100;
    const rawTotal = Math.round(quantity * unitPrice * 100) / 100;
    expect(normalizedTotal).toBe(12.2);
    expect(rawTotal).toBe(12.19);
  });

  it('reusa a operacao canonica da porta de tesouraria sem criar outro financeiro', () => {
    expect(sql).toMatch(/pdv_claim_operation_request\([\s\S]*v_company,'cash\.event\.v2'[\s\S]*'operation','direct_purchase'/);
    expect(sql).not.toContain('pdv_record_cash_event_v2');
    expect(sql).not.toContain('INSERT INTO public.financial_transactions');
    expect(sql).not.toContain('pg_get_functiondef');
    expect(sql).toContain("v_financial_id:=(v_purchase->>'financial_transaction_id')::uuid");
  });

  it('conclui a chave somente depois de compra, vinculo e custodia', () => {
    const claim = sql.indexOf('pdv_claim_operation_request');
    const core = sql.indexOf('v_purchase:=public.registrar_compra_material_direta_core_019');
    const custody = sql.indexOf('INSERT INTO public.pdv_cash_custody_entries');
    const complete = sql.indexOf('pdv_complete_operation_request');
    expect(core).toBeGreaterThan(claim);
    expect(custody).toBeGreaterThan(core);
    expect(complete).toBeGreaterThan(custody);
  });
});
