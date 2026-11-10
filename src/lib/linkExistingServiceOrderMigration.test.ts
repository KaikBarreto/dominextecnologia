import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261105023000_vincula_os_existente_ao_contrato.sql'),
  'utf8',
);

describe('vinculação de OS existente ao contrato — migration', () => {
  it('trava contrato, OS e tenant antes de vincular', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('public.get_user_company_id(v_uid)');
    expect(migration).toContain('public.can_manage_contracts(v_uid)');
    expect(migration).toContain("v_contract_status IS DISTINCT FROM 'active'");
  });

  it('exige o mesmo cliente e preserva os campos operacionais da OS', () => {
    expect(migration).toContain('v_order.customer_id IS DISTINCT FROM v_customer_id');
    expect(migration).toMatch(/UPDATE public\.service_orders\s+SET contract_id = p_contract_id,\s+contract_reference_date = p_reference_date,\s+contract_visit_customized_at = now\(\)/s);
    expect(migration).not.toMatch(/UPDATE public\.service_orders\s+SET[^;]*(scheduled_date|scheduled_time|status|origin)\s*=/s);
  });

  it('substitui somente placeholder automático vazio e protege execução real', () => {
    expect(migration).toContain("v_placeholder.status::text NOT IN ('agendada', 'pendente')");
    expect(migration).toContain('v_placeholder.contract_visit_customized_at IS NOT NULL');
    expect(migration).toContain('v_placeholder.check_in_time IS NOT NULL');
    expect(migration).toContain('public.form_responses');
    expect(migration).toContain('public.os_photos');
    expect(migration).toContain('public.service_order_materials');
    expect(migration).toContain("RAISE EXCEPTION 'contract_period_has_execution'");
  });

  it('não inventa competência e impede duplicidade entre visita gerada e vinculada', () => {
    expect(migration).toContain("RAISE EXCEPTION 'contract_period_not_found'");
    expect(migration).toContain("RAISE EXCEPTION 'contract_period_occupied'");
    expect(migration).toContain("NEW.origin = 'contract'");
    expect(migration).toContain('other.contract_visit_customized_at IS NOT NULL');
  });

  it('fecha execução pública e anônima da RPC privilegiada', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.link_service_order_to_contract(uuid, uuid, date) FROM PUBLIC, anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.link_service_order_to_contract(uuid, uuid, date) TO authenticated, service_role');
  });
});
