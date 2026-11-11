import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261108020000_inventory_security_archive_pagination.sql'),
  'utf8',
);
const inventoryHook = readFileSync(resolve(process.cwd(), 'src/hooks/useInventory.ts'), 'utf8');
const movementHook = readFileSync(resolve(process.cwd(), 'src/hooks/useInventoryMovements.ts'), 'utf8');

describe('fechamento P0 de segurança e escala do estoque', () => {
  it('remove writers legados e exige tenant, permissão e ACL nas RPCs públicas', () => {
    expect(migration).toContain('inventory_register_manual_movement_v3');
    expect(migration).toContain('inventory_receive_purchase_order_v3');
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.register_inventory_movement[\s\S]*FROM PUBLIC,anon,authenticated/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.receber_ordem_compra\(uuid,jsonb\) FROM PUBLIC,anon,authenticated/);
    expect(migration).toContain('public.can_access_stock(v_user,v_stock)');
    expect(migration).toContain("public.user_has_permission(p_user,'fn:manage_inventory')");
  });

  it('não oferece DELETE autenticado e preserva histórico por arquivamento', () => {
    expect(migration).not.toMatch(/CREATE POLICY inventory_[^\n]+[\s\S]{0,80}FOR DELETE/);
    expect(migration).toContain('inventory_set_archived_v3');
    expect(migration).toContain('inventory_guard_physical_delete_v3');
    expect(migration).toContain('inventory_archive_has_balance');
    expect(migration).toContain('inventory_archive_has_reservation');
    expect(inventoryHook).not.toContain(".from('inventory_movements')\n        .delete()");
    expect(inventoryHook).not.toContain(".from('inventory')\n        .delete()");
  });

  it('pagina catálogo, níveis e Kardex sem corte silencioso de mil linhas', () => {
    expect(inventoryHook).toContain('.range(offset, offset + INVENTORY_PAGE_SIZE - 1)');
    expect(inventoryHook).toContain(".order('id')");
    expect(movementHook).toContain('.range(offset, offset + MOVEMENT_PAGE_SIZE - 1)');
    expect(movementHook).toContain(".order('id', { ascending: false })");
    expect(movementHook).toContain('chunkIds');
  });
});
