import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261113120000_fix_generate_os_form_template_uuid.sql'),
  'utf8',
);

describe('geração manual de OS a partir de orçamento — migration', () => {
  it('tipa como UUID o fallback de equipamento sem checklist', () => {
    expect(migration).toMatch(
      /INSERT INTO public\.service_order_equipment[\s\S]+SELECT DISTINCT v_order\.id, d\.equipment_id, NULL::uuid/,
    );
  });

  it('preserva autorização, tenant e idempotência da RPC privilegiada', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("public.user_has_permission(v_user_id, 'fn:create_os')");
    expect(migration).toContain('q.company_id = public.get_user_company_id(v_user_id)');
    expect(migration).toContain('public.tenant_subscription_allows_access(q.company_id)');
    expect(migration).toContain('IF v_quote.converted_to_os_id IS NOT NULL THEN');
    expect(migration).toContain('FOR UPDATE');
  });

  it('continua indisponível para acesso público e anônimo', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.generate_service_order_from_quote(uuid, jsonb) FROM PUBLIC, anon;',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.generate_service_order_from_quote(uuid, jsonb) TO authenticated;',
    );
  });
});
