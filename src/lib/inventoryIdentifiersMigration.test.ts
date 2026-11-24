import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261107133000_inventory_identifiers_v2.sql'),
  'utf8',
);
const managementMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261113140000_inventory_identifier_management_v2.sql'),
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

  it('lista e sincroniza codigos sem abrir a tabela ao navegador', () => {
    expect(managementMigration).toContain('public.inventory_list_identifiers_v2(p_inventory_id uuid)');
    expect(managementMigration).toContain('public.inventory_identifier_access_company_v2(false)');
    expect(managementMigration).toContain('inventory.id IN (SELECT public.get_accessible_inventory_ids())');
    expect(managementMigration).toContain('REVOKE ALL ON FUNCTION public.inventory_list_identifiers_v2(uuid)');
    expect(managementMigration).not.toMatch(/GRANT\s+SELECT\s+ON\s+(TABLE\s+)?public\.inventory_identifiers/i);
    expect(managementMigration).toContain('AFTER UPDATE OF sku, barcode, fiscal_gtin, unit ON public.inventory');
    expect(managementMigration).toContain('IS NOT DISTINCT FROM public.inventory_normalize_identifier_v2(NEW.fiscal_gtin)');
    expect(managementMigration).toMatch(/SET is_active = false,[\s\S]*?is_primary = true/);
    expect(managementMigration).toContain('code=inventory_identifier_collision');
  });

  it('fecha escrita de identificadores no mesmo escopo de locais da leitura', () => {
    const generateBody = managementMigration.slice(
      managementMigration.indexOf('CREATE OR REPLACE FUNCTION public.inventory_generate_internal_identifier_v2'),
      managementMigration.indexOf('CREATE OR REPLACE FUNCTION public.inventory_save_identifier_v2'),
    );
    const saveBody = managementMigration.slice(
      managementMigration.indexOf('CREATE OR REPLACE FUNCTION public.inventory_save_identifier_v2'),
      managementMigration.indexOf('CREATE OR REPLACE FUNCTION public.inventory_sync_primary_identifiers_v2'),
    );
    expect(generateBody).toContain('inventory.id IN (SELECT public.get_accessible_inventory_ids())');
    expect(saveBody).toContain('inventory.id IN (SELECT public.get_accessible_inventory_ids())');
    expect(saveBody).toContain('identifier.inventory_id = p_inventory_id');
  });
});
