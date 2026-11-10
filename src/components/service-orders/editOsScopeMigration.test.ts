import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20261104190000_edit_os_scope_movimenta_respostas_e_ordena.sql',
), 'utf8');

describe('migration de movimentação de checklist da OS', () => {
  it('mantém a assinatura pública da RPC e fecha execução anônima', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.edit_service_order_scope(');
    expect(migration).toContain('_service_order_id uuid');
    expect(migration).toContain('_items jsonb');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.edit_service_order_scope(uuid, jsonb) FROM PUBLIC, anon;');
  });

  it('move vínculo e respostas antes da limpeza de pares removidos', () => {
    const moveJunction = migration.indexOf('UPDATE public.service_order_equipment soe');
    const moveResponses = migration.indexOf('UPDATE public.form_responses fr');
    const deleteResponses = migration.indexOf('DELETE FROM public.form_responses fr');
    expect(moveJunction).toBeGreaterThan(0);
    expect(moveResponses).toBeGreaterThan(moveJunction);
    expect(deleteResponses).toBeGreaterThan(moveResponses);
  });

  it('valida tenant, cliente do equipamento e tenant do template', () => {
    expect(migration).toContain('e.company_id = v_os_company');
    expect(migration).toContain('e.customer_id = v_customer_id');
    expect(migration).toContain('ft.company_id = v_os_company');
  });
});
