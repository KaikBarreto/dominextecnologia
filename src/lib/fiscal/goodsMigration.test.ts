import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261115011000_fiscal_goods_nfe_nfce_sources.sql'), 'utf8');

describe('migration fiscal de mercadorias', () => {
  it('mantém escrita de documentos restrita ao backend', () => {
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.nfe_documents FROM authenticated, anon');
    expect(sql).toContain('REVOKE ALL ON public.nfe_outbox FROM authenticated, anon');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('importa venda, compra do PDV e compra do estoque com filtro de tenant', () => {
    expect(sql).toContain("'pdv_sale'");
    expect(sql).toContain("'pdv_purchase'");
    expect(sql).toContain("'inventory_purchase'");
    expect(sql).toContain('public.get_user_company_id((SELECT auth.uid()))');
  });

  it('reserva número somente pelo service role', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.reserve_goods_fiscal_number(uuid, integer) FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.reserve_goods_fiscal_number(uuid, integer) TO service_role');
  });
});
