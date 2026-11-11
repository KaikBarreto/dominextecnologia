import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const deliveredHistorySql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261107223030_pdv_dispatch_delivered_history_v2.sql'),
  'utf8',
);
const receiptIdentitySql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261107223100_pdv_receipt_company_identity_v2.sql'),
  'utf8',
);

describe('contrato de segurança dos ajustes finais do PDV', () => {
  it('lista pedidos entregues somente no tenant e nos estoques autorizados', () => {
    expect(deliveredHistorySql).toContain('SECURITY DEFINER');
    expect(deliveredHistorySql).toContain("pdv_counter_context_v2('screen:pdv_dispatch',NULL,true)");
    expect(deliveredHistorySql).toContain('order_row.company_id=v_context.company_id');
    expect(deliveredHistorySql).toContain('public.can_access_stock(v_context.user_id,order_row.stock_id)');
    expect(deliveredHistorySql).toContain("order_row.status='entregue'");
  });

  it('não oferece a consulta de entregues ao público ou ao anônimo', () => {
    expect(deliveredHistorySql).toContain(
      'REVOKE ALL ON FUNCTION public.pdv_list_delivered_orders_v2() FROM PUBLIC,anon',
    );
    expect(deliveredHistorySql).toContain(
      'GRANT EXECUTE ON FUNCTION public.pdv_list_delivered_orders_v2() TO authenticated,service_role',
    );
  });

  it('congela somente dados permitidos da empresa e protege o trigger do comprovante', () => {
    expect(receiptIdentitySql).toContain('settings.show_cnpj_in_documents IS NOT FALSE');
    expect(receiptIdentitySql).toContain('settings.show_address_in_documents IS NOT FALSE');
    expect(receiptIdentitySql).toContain('settings.show_phone_in_documents IS NOT FALSE');
    expect(receiptIdentitySql).toContain("WHERE company.id=NEW.company_id");
    expect(receiptIdentitySql).toContain(
      'REVOKE ALL ON FUNCTION public.pdv_enrich_order_receipt_company_v2() FROM PUBLIC,anon,authenticated',
    );
    expect(receiptIdentitySql).toContain(
      'GRANT EXECUTE ON FUNCTION public.pdv_enrich_order_receipt_company_v2() TO service_role',
    );
  });
});
