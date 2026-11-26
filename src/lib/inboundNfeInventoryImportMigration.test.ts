import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261126210000_inbound_nfe_inventory_import_guard.sql'),
  'utf8',
);

describe('trava de entrada de estoque por NF-e recebida', () => {
  it('serializa os dois fluxos pela mesma nota e rejeita uma segunda entrada', () => {
    expect(migration.match(/FROM public\.inbound_nfe[\s\S]{0,180}FOR UPDATE;/g)).toHaveLength(2);
    expect(migration).toContain('inbound_nfe_inventory_already_imported');
    expect(migration).toContain("inventory_import_source = 'xml'");
    expect(migration).toContain("inventory_import_source = COALESCE(inventory_import_source, 'purchase')");
  });

  it('preserva retry idempotente pela requisição de cada caminho', () => {
    expect(migration).toContain("v_note.inventory_import_source = 'xml'");
    expect(migration).toContain("v_note.inventory_import_source = 'purchase'");
    expect(migration).toContain('v_note.inventory_import_request_id = p_client_request_id');
    expect(migration).toContain('p_client_request_id');
  });

  it('movimenta o local escolhido e mantém compra, financeiro e estoque atômicos', () => {
    expect(migration).toContain('p_stock_id uuid');
    expect(migration).toContain('p_stock_id => p_stock_id');
    expect(migration).toContain('public.registrar_compra_material_direta(');
    expect(migration).toContain("financial_transaction_id = COALESCE(");
  });

  it('mantém custo dos itens e usa o vNF como total financeiro canônico', () => {
    expect(migration).toContain('p_financial_total numeric');
    expect(migration).toContain('round(p_financial_total, 2) IS DISTINCT FROM round(v_note.valor, 2)');
    expect(migration).toContain("'items_total', v_items_total");
    expect(migration).toContain("'acquisition_charges', round(p_financial_total, 2) - v_items_total");
    expect(migration).toMatch(/UPDATE public\.financial_transactions[\s\S]*SET amount = round\(p_financial_total, 2\)/);
    expect(migration).toMatch(/note\.financial_transaction_id = OLD\.id[\s\S]*round\(note\.valor, 2\) = round\(NEW\.amount, 2\)/);
    expect(migration).toContain('uq_inbound_nfe_financial_transaction');
    expect(migration).toContain('scale(r.unit_price) > 10');
    expect(migration).toMatch(/UPDATE public\.compra_ordem_itens purchase_item[\s\S]*SET unit_price = r\.unit_price/);
    expect(migration).toMatch(/UPDATE public\.inventory_movements movement[\s\S]*SET unit_cost = r\.unit_price/);
    expect(migration).toContain('sum(round(x.quantity, 4) * x.unit_price)');
    expect(migration).not.toContain('sum(round(x.quantity, 4) * round(x.unit_price, 2))');
  });

  it('fecha o legado e não expõe as funções para anônimos', () => {
    expect(migration).toContain('WITH previous AS');
    expect(migration).toContain('FROM public.nfe_imports imported');
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.import_inbound_nfe_inventory[\s\S]*FROM PUBLIC, anon;/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.registrar_compra_material_direta_from_inbound_nfe[\s\S]*FROM PUBLIC, anon;/);
  });

  it('aproveita somente dados fiscais estruturais válidos do XML', () => {
    expect(migration).toContain('fiscal_ncm text');
    expect(migration).toContain('fiscal_cest text');
    expect(migration).toContain('fiscal_gtin text');
    expect(migration).toContain('fiscal_origin text');
    expect(migration).toContain("btrim(r.fiscal_ncm) !~ '^[0-9]{8}$'");
    expect(migration).toContain('inbound_nfe_invalid_fiscal_data');
    expect(migration).not.toContain('fiscal_icms_code text');
    expect(migration).not.toContain('fiscal_icms_rate numeric');
  });

  it('preenche material novo e preserva classificação já revisada no existente', () => {
    expect(migration).toMatch(/INSERT INTO public\.inventory \([\s\S]*fiscal_ncm, fiscal_cest, fiscal_gtin, fiscal_origin/);
    expect(migration.match(/fiscal_ncm = COALESCE\(NULLIF\(btrim\(fiscal_ncm\), ''\), NULLIF\(btrim\(r\.fiscal_ncm\), ''\)\)/g)).toHaveLength(2);
    expect(migration).toContain('AND company_id = v_company_id');
    expect(migration).toContain('AND customer_id IS NULL');
    expect(migration).toContain('AND archived_at IS NULL');
  });
});
