import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261116192000_stock_location_management_security.sql'), 'utf8');
const fixture = readFileSync(resolve(process.cwd(), 'supabase/tests/stock_location_management_security.sql'), 'utf8');
const fn = (name: string) => sql.slice(sql.indexOf(`FUNCTION public.${name}(`)).split('$fn$;')[0];
describe('segurança da gestão de locais no banco', () => {
  it('exige gestão explícita e a mesma empresa em todas as escritas diretas', () => {
    for (const action of ['insert', 'update', 'delete']) {
      const policy = sql.slice(sql.indexOf(`CREATE POLICY stocks_${action}_own_company`)).split(';')[0];
      expect(policy).toContain('pdv_can_manage_stock_v3(company_id) IS TRUE');
      expect(policy).toContain('company_id=public.get_user_company_id(auth.uid())');
    }
    expect(fn('set_default_stock')).toContain('pdv_can_manage_stock_v3(company) IS DISTINCT FROM TRUE');
    expect(sql).not.toContain('has_full_permissions');
    const cleanup = fn('prevent_delete_protected_stock');
    expect(cleanup).toContain("AND auth.role()='service_role'");
    expect(cleanup).toContain('c.creation_idempotency_key IS NOT NULL');
    expect(cleanup).toContain('AND public.is_super_admin(auth.uid()) IS TRUE');
  });
  it('normaliza nomes, imobiliza escopo e resolve o primeiro geral fora da ACL', () => {
    const guard = fn('guard_stock_location_metadata_v1');
    expect(guard).toContain('NEW.name:=btrim(NEW.name)');
    expect(guard).toContain('NOT BETWEEN 2 AND 80');
    expect(guard).toContain('NEW.company_id IS DISTINCT FROM OLD.company_id');
    expect(guard).toContain('NEW.customer_id IS DISTINCT FROM OLD.customer_id');
    expect(guard).toContain("company_has_module(NEW.company_id,'pdv')");
    expect(guard).toContain('s.company_id=NEW.company_id AND s.customer_id IS NULL');
    expect(guard).not.toContain('can_access_stock');
    expect(guard).toContain('stock_purpose_in_use');
  });
  it('limita nomes gerais sem truncar o nome legado derivado do cliente', () => {
    const nameGuard = fn('guard_stock_location_metadata_v1').split("IF TG_OP='UPDATE'")[0];
    expect(nameGuard).toMatch(/IF NEW\.customer_id IS NULL THEN\s*NEW\.name:=btrim\(NEW\.name\);\s*IF NEW\.name IS NULL OR length\(NEW\.name\) NOT BETWEEN 2 AND 80 THEN/);
    expect(fixture).toContain("repeat('Cliente de prova ',7)");
    expect(fixture).toContain('public.create_customer_stock_item(long_customer');
    expect(fixture).toContain("name='Estoque — '||long_customer_name AND length(name)>80");
    expect(fixture).toContain('accessible.inventory_id=customer_inventory');
  });
  it('trava o local antes de checar saldo e toda referência inclusive cascade', () => {
    const deletion = fn('prevent_delete_protected_stock');
    expect(deletion.indexOf('FOR UPDATE')).toBeLessThan(deletion.indexOf('l.quantity<>0'));
    expect(deletion).toContain("fk.confrelid='public.stocks'::regclass");
    expect(deletion).toContain('OLD.is_default OR OLD.customer_id IS NOT NULL');
    expect(deletion).not.toContain('DELETE FROM');
    expect(deletion).toContain('stock_delete_in_use');
  });
  it('rejeita ACL vazia, inativa ou de outro tenant antes de apagar a restrição', () => {
    const acl = fn('set_stock_access');
    for (const validation of ['cardinality(requested_ids)=0', 'valid_ids IS DISTINCT FROM requested_ids', 'p.is_active IS TRUE', 'p.company_id=company']) {
      expect(acl.indexOf(validation)).toBeGreaterThan(0);
      expect(acl.indexOf(validation)).toBeLessThan(acl.indexOf('DELETE FROM public.stock_access'));
    }
    expect(fn('stock_can_manage_access_v1')).toContain('public.is_admin_or_gestor(auth.uid())');
    expect(fn('guard_stock_access_scope_v1')).toContain('s.id=NEW.stock_id AND s.company_id=NEW.company_id');
    expect(sql.match(/CREATE POLICY stock_access_(insert|update|delete)_admin_gestor/g)).toHaveLength(3);
  });
  it('mantém fixture rollback real com escritores autenticados e verificações negativas', () => {
    expect(fixture).toContain("EXECUTE 'SET LOCAL ROLE authenticated'");
    expect(fixture).toContain('ACL vazia abriu local');
    expect(fixture).toContain('DELETE apagou saldo por cascade');
    expect(fixture).toContain('Gestor PDV-only foi negado');
    expect(fixture).toContain('Operador editou local');
    expect(fixture.trim()).toMatch(/ROLLBACK;$/);
  });
});
