import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const bootstrap = read('supabase/migrations/20261115100000_pdv_setup_without_rollout_changes.sql');
const patch = read('supabase/migrations/20261116190000_pdv_bootstrap_retail_stock.sql');

describe('setup da loja usa o mesmo estoque no catálogo e no caixa', () => {
  it('compõe duas âncoras únicas preservando o bootstrap e suas autorizações', () => {
    const start = bootstrap.indexOf('CREATE OR REPLACE FUNCTION public.pdv_bootstrap_company(');
    const end = bootstrap.indexOf('$function$;', bootstrap.indexOf('AS $function$', start));
    let body = bootstrap.slice(start, end);
    const pairs = [...patch.matchAll(/anchor:=\$anchor\$([\s\S]*?)\$anchor\$;\s*replacement:=\$replacement\$([\s\S]*?)\$replacement\$;/g)];
    expect(pairs).toHaveLength(2);
    for (const [, anchor, replacement] of pairs) {
      expect(body.split(anchor).length - 1).toBe(1);
      body = body.replace(anchor, replacement);
    }
    expect(body).toContain('PDV_BOOTSTRAP_RETAIL_STOCK_V1');
    expect(body).toContain('pdv_company_access_entitled_internal');
    expect(body).toContain("company_has_module(p_company_id, 'pdv')");
    expect(body).toContain("'pdv-treasury-company:'");
    expect(body.indexOf('ORDER BY stock.id FOR UPDATE OF stock')).toBeLessThan(body.indexOf('INSERT INTO public.pdv_terminals'));
    expect(body.indexOf("UPDATE public.stocks stock SET purpose='pdv'")).toBeGreaterThan(body.indexOf('GET DIAGNOSTICS v_terminals_repaired'));
  });
  it('classifica apenas vínculo ativo geral do mesmo tenant, sem tocar quantidades e ACL', () => {
    expect(patch).toContain('stock.company_id=p_company_id AND stock.customer_id IS NULL');
    expect(patch).toContain('terminal.company_id=p_company_id AND terminal.stock_id=stock.id AND terminal.is_active IS TRUE');
    expect(patch).not.toMatch(/UPDATE public\.(inventory|inventory_stock_levels|company_modules|app_feature_flags)|SET (quantity|is_default|customer_id)|\bGRANT\b|\bREVOKE\b/);
    expect(patch.match(/UPDATE public\.stocks stock SET purpose='pdv'/g)).toHaveLength(2);
  });
  it('repara lojas já configuradas somente com módulo e assinatura vigentes', () => {
    const repair = patch.split('DO $configured_retail_stocks$')[1];
    expect(repair).toContain('pdv_company_access_entitled_internal(stock.company_id) IS TRUE');
    expect(repair).not.toContain('public.tenant_subscription_allows_access(');
    expect(bootstrap).toContain("company.subscription_status = 'active'");
    expect(bootstrap).toContain("company.subscription_status = 'testing'");
    expect(repair).toContain("company_has_module(stock.company_id,'pdv') IS TRUE");
    expect(repair).toContain('terminal.company_id=stock.company_id AND terminal.stock_id=stock.id AND terminal.is_active IS TRUE');
    expect(repair).toContain('stock.customer_id IS NULL');
  });
  it('preserva a autorização operacional de OS sem excluir locais da loja', () => {
    const ui = read('src/components/service-orders/OsConsumeStockDialog.tsx');
    const selectable = ui.slice(ui.indexOf('const selectableStocks ='), ui.indexOf('const {\n    lines,'));
    expect(selectable).toContain('stock.customer_id == null'); expect(selectable).not.toContain('purpose');
    const os = read('supabase/migrations/20261107123000_pdv_w1b_consumidores_reserva.sql');
    const scope = os.slice(os.indexOf('-- material e local da MESMA empresa'), os.indexOf('-- material e local da MESMA empresa') + 1700);
    expect(scope).toContain('s.company_id = v_so.company_id');
    expect(scope).toContain('v_inv_customer IS DISTINCT FROM v_stock_customer');
    expect(scope).toContain('can_access_stock(v_uid, v_stock)'); expect(scope).not.toContain('purpose');
  });
});
