import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261117180000_customer_portal_equipment_order_history.sql',
  'utf8',
);

describe('migration — histórico de OS por equipamento no portal', () => {
  it('preserva o equipamento principal e inclui o escopo múltiplo', () => {
    expect(migration).toContain("NULLIF(item->>'equipment_id', '')::uuid");
    expect(migration).toContain('FROM public.service_order_equipment soe');
    expect(migration).toContain("'equipment_ids'");
  });

  it('limita os vínculos aos equipamentos já autorizados no payload', () => {
    expect(migration).toContain("COALESCE(v_payload->'equipment', '[]'::jsonb)");
    expect(migration).toMatch(/equipment_item->>'id'[\s\S]*scope\.equipment_id/);
  });

  it('mantém a implementação interna fora do alcance direto do portal anônimo', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_portal_data_before_equipment_order_scope\(text, text\)[\s\S]*FROM public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_portal_data_before_customer_documents\(text, text\)[\s\S]*FROM public, anon, authenticated/,
    );
  });
});
