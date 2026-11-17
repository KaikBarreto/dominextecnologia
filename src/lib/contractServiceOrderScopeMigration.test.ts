import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261117175000_contract_os_service_scope_consistency.sql',
  'utf8',
);

describe('migration — escopo de serviço das visitas contratuais', () => {
  it('espelha o serviço global em toda nova visita do contrato', () => {
    expect(migration).toContain('trg_seed_contract_service_order_service_scope');
    expect(migration).toMatch(/AFTER INSERT ON public\.service_orders/);
    expect(migration).toMatch(/NEW\.origin = 'contract'/);
    expect(migration).toContain('INSERT INTO public.service_order_service_types');
  });

  it('atribui o serviço contratual a cada equipamento novo', () => {
    expect(migration).toContain('trg_seed_contract_equipment_service_scope');
    expect(migration).toMatch(/AFTER INSERT ON public\.service_order_equipment/);
    expect(migration).toContain('INSERT INTO public.service_order_equipment_service_types');
  });

  it('autocura visitas antigas sem cruzar empresa ou contrato', () => {
    expect(migration).toMatch(/SELECT so\.id, so\.service_type_id, so\.company_id, 0/);
    expect(migration).toMatch(/JOIN public\.service_orders so ON so\.id = soe\.service_order_id/);
    expect(migration).toMatch(/JOIN public\.service_order_service_types sost/);
    expect(migration.match(/so\.origin = 'contract'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/so\.contract_id IS NOT NULL/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toMatch(/NOT EXISTS \(\s*SELECT 1\s*FROM public\.service_order_service_types current/s);
    expect(migration).toMatch(/NOT EXISTS \(\s*SELECT 1\s*FROM public\.service_order_equipment_service_types current/s);
    expect(migration).toContain('ON CONFLICT (service_order_id, equipment_id, service_type_id) DO NOTHING');
  });
});
