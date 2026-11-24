import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', file), 'utf8');
const stock = read('20261116030700_pdv_exchange_atomic_stock_reservation.sql');
const coupon = read('20261116030400_pdv_exchange_coupon_coverage.sql');
const base = read('20261107141000_pdv_after_sale_value_v2.sql');
const availability = read('20261107121500_pdv_w1b_reservas_disponibilidade.sql');

describe('troca reserva somente o estoque faltante', () => {
  it('compõe 304→307 no writer real e mantém replay antes de reserva/cupom/débito', () => {
    const couponBlock = coupon.split('DO $exchange_core$')[1].split('END $exchange_core$')[0];
    const original = /a:=\$a\$( {2}IF EXISTS\(SELECT 1 FROM public.pdv_order_items[\s\S]*?)\$a\$;\s*b:=\$b\$([\s\S]*?)\$b\$;/.exec(couponBlock)!;
    expect(original).not.toBeNull(); expect(base).toContain(original[1]);
    const withCoupon = base.replace(original[1], original[2]);
    const patch = stock.split('DO $exchange_reservation$')[1].split('END $exchange_reservation$')[0];
    const replacement = /a:=\$anchor\$([\s\S]*?)\$anchor\$;\s*b:=\$patch\$([\s\S]*?)\$patch\$;/.exec(patch)!;
    expect(replacement).not.toBeNull(); expect(withCoupon).toContain(replacement[1]);
    const body = withCoupon.replace(replacement[1], replacement[2]);
    const start = body.indexOf('CREATE OR REPLACE FUNCTION public.pdv_cover_exchange_order_v2');
    const claim = body.indexOf('pdv_claim_operation_request', start);
    const reserve = body.indexOf('pdv_ensure_exchange_order_stock_internal_v1', start);
    const consume = body.indexOf('pdv_consume_order_coupon_internal_v1', start);
    const debit = body.indexOf('INSERT INTO public.pdv_voucher_entries', start);
    expect(claim).toBeLessThan(reserve); expect(reserve).toBeLessThan(consume); expect(consume).toBeLessThan(debit);
    expect(body.slice(start, reserve)).toContain('p_expected_coupon_revision');
  });

  it('substitui somente o cálculo final de disponibilidade, preservando todo o guard público', () => {
    const start = availability.indexOf('CREATE OR REPLACE FUNCTION public.pdv_get_stock_availability_v2');
    const end = availability.indexOf('$function$;', start);
    const definition = availability.slice(start, end);
    const calculation = definition.indexOf('  SELECT COALESCE(sl.quantity, 0)');
    expect(calculation).toBeGreaterThan(0);
    const prefix = definition.slice(0, calculation);
    expect(prefix).toContain('pdv_stock_screen_denied'); expect(prefix).toContain('pdv_stock_acl_denied');
    expect(prefix).toContain('tenant_subscription_allows_access'); expect(prefix).toContain('profile.is_active IS TRUE');
    expect(stock).toContain('EXECUTE s');
    expect(stock).toContain('v_shortage:=LEAST(v_committed,GREATEST(v_shortage,v_committed-v_physical,0))');
    expect(stock).toContain('public.pdv_pair_availability_internal_v1(v_company_id,p_inventory_id,p_stock_id)');
  });

  it('agrega itens repetidos e usa o kernel para novas reservas sem mexer no físico', () => {
    expect(stock).toContain('GROUP BY i.inventory_id ORDER BY i.inventory_id');
    expect(stock).toContain('availability.available_quantity<pair.missing');
    expect(stock).toContain('pdv_reserve_stock_internal_v2(p_company_id,item.inventory_id,o.stock_id,item.id,NULL,missing');
    expect(stock).toContain('reserved_quantity=reserved_quantity+missing');
    expect(stock).not.toMatch(/UPDATE public\.(inventory|inventory_stock_levels)\b/);
    const ensure = stock.split('CREATE FUNCTION public.pdv_ensure_exchange_order_stock_internal_v1')[1].split('END $fn$;')[0];
    expect(ensure.indexOf('ORDER BY i.id FOR UPDATE OF i')).toBeLessThan(ensure.indexOf('FOR UPDATE OF st'));
    expect(ensure.indexOf('FOR UPDATE OF r')).toBeLessThan(ensure.indexOf('pdv_after_sale_context_v2'));
    expect(ensure).not.toContain('cost_price_snapshot=');
  });

  it('mantém os três helpers fechados para todas as roles da API', () => {
    expect(stock.match(/FROM PUBLIC,anon,authenticated,service_role/g)).toHaveLength(3);
    expect(stock).not.toMatch(/GRANT|set_config|current_setting/i);
  });
});
