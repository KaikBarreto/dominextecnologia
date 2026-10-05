import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261005210000_align_commercial_catalog_pricing_and_customer_portal.sql',
  ),
  'utf8',
);

describe('alinhamento do catálogo comercial', () => {
  it('fixa o Módulo Básico em R$ 197', () => {
    expect(migration).toMatch(/'basic',[\s\S]*?197,[\s\S]*?ON CONFLICT \(code\) DO UPDATE[\s\S]*?SET price = EXCLUDED\.price/);
  });

  it('mantém o Portal do Cliente ativo e gratuito', () => {
    expect(migration).toMatch(/'customer_portal',[\s\S]*?\n\s*0,[\s\S]*?\n\s*true[\s\S]*?ON CONFLICT \(code\) DO UPDATE/);
  });

  it('inclui o portal nos planos prontos e materializa o grant por tenant no personalizado', () => {
    expect(migration).toContain("WHERE code IN ('start', 'avancado', 'master')");
    expect(migration).toContain("SELECT c.id, 'customer_portal', 1");
    expect(migration).toContain("WHERE c.subscription_plan = 'personalizado'");
    expect(migration).toContain('ON CONFLICT (company_id, module_code) DO NOTHING');
  });
});
