import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261107133000_inventory_identifiers_v2.sql'),
  'utf8',
);

describe('migration inventory identifiers v2', () => {
  it('fecha leitura direta e expoe somente RPCs projetadas', () => {
    expect(migration).toContain('ALTER TABLE public.inventory_identifiers FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.inventory_identifiers FROM PUBLIC, anon, authenticated, service_role');
    expect(migration).not.toMatch(/GRANT\s+SELECT\s+ON\s+(TABLE\s+)?public\.inventory_identifiers/i);
    expect(migration).toContain("'sale_price',v_row.sale_price");
    expect(migration).not.toContain("'cost_price',v_row");
  });

  it('gera interno apenas para unidade-base e deixa embalagem no save', () => {
    expect(migration).toContain('public.inventory_generate_internal_identifier_v2(\n  p_inventory_id uuid\n)');
    const generateBody = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.inventory_generate_internal_identifier_v2'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.inventory_save_identifier_v2'),
    );
    expect(generateBody).not.toContain('p_unit_factor');
    expect(generateBody).not.toContain('p_unit_label');
    expect(migration).toContain('p_unit_factor numeric DEFAULT 1');
  });

  it('tem codigo interno automatico, preflight de colisao e backfill legado', () => {
    expect(migration).toContain('CREATE TRIGGER trg_inventory_seed_identifiers_v2');
    expect(migration).toContain("'DX-'||upper(replace(NEW.id::text,'-',''))");
    expect(migration).toContain('code=inventory_identifier_backfill_collision');
    expect(migration).toContain("SELECT i.company_id,i.id,'sku'");
    expect(migration).toContain("SELECT i.company_id,i.id,'gtin'");
    expect(migration).toContain("SELECT i.company_id,i.id,'barcode'");
  });
});
