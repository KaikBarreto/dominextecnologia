import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', name), 'utf8');
const normal = read('20261108000000_pdv_counter_fulfillment_flow.sql');
const exchange = read('20261107141000_pdv_after_sale_value_v2.sql');
const target = read('20261116030900_pdv_exchange_explicit_target_cash.sql');
const patch = read('20261116031000_pdv_exchange_cashier_fulfillment.sql');
const start = normal.indexOf("  IF v_order.status='entregue' THEN");
const end = normal.indexOf('  v_result:=jsonb_build_object(', start);
const deliveryBlock = normal.slice(start, end);
const helperTemplate = /EXECUTE format\(\$helper_definition\$([\s\S]*?)\$helper_definition\$,delivery_block\)/.exec(patch)![1];
const helper = helperTemplate.replace('%s', deliveryBlock);

describe('troca e caixa compartilham retirada integral', () => {
  it('extrai o ramo real com kernel, FIFO e snapshot, sem fórmula alternativa', () => {
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    expect(deliveryBlock.match(/v_delivery:=public.pdv_complete_delivery_internal_v2\(/g)).toHaveLength(1);
    expect(deliveryBlock.match(/PERFORM public.pdv_apply_settlement_fifo_v2\(/g)).toHaveLength(1);
    expect(deliveryBlock.match(/v_snapshot_id:=public.pdv_capture_delivery_receipt_internal_v2\(/g)).toHaveLength(1);
    expect(helper).toContain(deliveryBlock);
    expect(helper).not.toMatch(/register_inventory_movement|SET quantity|SET amount/);
    expect(helper).not.toContain('screen:pdv_dispatch');
    expect(helper).not.toContain('fn:deliver_pdv_order');
  });

  it('preserva o formato do recebimento normal e seu recurso pdv_order', () => {
    const replacement = /replacement:=\$replacement\$([\s\S]*?)\$replacement\$/.exec(patch)![1];
    const changed = normal.slice(0, start) + replacement + normal.slice(end);
    expect(changed).toContain('public.pdv_cover_existing_order_base_v2(');
    expect(changed).toContain("IF v_fulfillment='dispatch' THEN RETURN v_result; END IF");
    expect(changed).toContain("'idempotent',COALESCE((v_result->>'idempotent')::boolean,false)");
    expect(changed).toContain("SET result=v_result,resource_type='pdv_order'");
    expect(changed.match(/v_delivery:=public.pdv_complete_cashier_fulfillment_internal_v1/g)).toHaveLength(1);
  });

  it('conclui a troca depois da entrega, preservando recurso e campos originais', () => {
    const block = patch.split('DO $exchange_cashier$')[1];
    const anchor = /anchor:=\$anchor\$([\s\S]*?)\$anchor\$/.exec(block)![1];
    const replacement = /replacement:=\$replacement\$([\s\S]*?)\$replacement\$/.exec(block)![1];
    expect(exchange).toContain(anchor);
    expect(target).toContain('public.pdv_cover_exchange_order_target_base_v2(');
    expect(target).toContain('after_sale.exchange.cover.v3');
    const changed = exchange.replace(anchor, replacement);
    const begin = changed.indexOf('CREATE OR REPLACE FUNCTION public.pdv_cover_exchange_order_v2(');
    const call = changed.indexOf('v_result:=v_result||public.pdv_complete_cashier_fulfillment_internal_v1', begin);
    expect(call).toBeGreaterThan(changed.indexOf("UPDATE public.pdv_orders SET status='liberado_retirada'", begin));
    expect(changed.slice(begin, call)).toContain("'new_order_id',v_order.id,'voucher_amount',v_voucher_amount");
    expect(changed.indexOf("pdv_complete_operation_request(v_claim.request_id,'pdv_exchange',v_exchange,v_result)", begin)).toBeGreaterThan(call);
    expect(replacement).toContain("IF v_order.fulfillment_mode_snapshot='cashier' THEN");
    expect(replacement).not.toContain('company_settings');
  });

  it('fecha o helper às roles da API e valida a origem canônica da solicitação', () => {
    expect(patch).toContain('FROM PUBLIC,anon,authenticated,service_role');
    expect(helper).toContain("v_request.operation_type='counter.cover.v2' AND v_request.status='completed'");
    expect(helper).toContain("v_request.operation_type='after_sale.exchange.cover.v3' AND v_request.status='pending'");
    expect(helper).toContain('x.operation_request_id=p_request_id AND x.new_order_id=p_order_id');
    expect(helper).not.toContain('UPDATE public.pdv_operation_requests');
    expect(helper).toContain('))) IS DISTINCT FROM TRUE THEN');
  });
});
