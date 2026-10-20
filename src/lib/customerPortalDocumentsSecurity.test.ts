import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261020120000_customer_portal_documents_and_invoices.sql'),
  'utf8',
);
const edge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/customer-portal-document-download/index.ts'),
  'utf8',
);

describe('documentos do Portal do Cliente — fronteiras de segurança', () => {
  it('faz as novas permissões sensíveis nascerem fechadas', () => {
    expect(migration).toContain("'invoices', false");
    expect(migration).toContain("'documents', false");
    expect(migration).toContain("COALESCE((p_permissions->>'invoices')::boolean, false)");
    expect(migration).toContain("COALESCE((p_permissions->>'documents')::boolean, false)");
  });

  it('filtra uploads pelo tenant, cliente e publicação individual', () => {
    expect(migration).toContain('cd.company_id = v_company_id');
    expect(migration).toContain('cd.customer_id = v_customer_id');
    expect(migration).toContain('cd.is_visible_in_portal');
  });

  it('só agrega anexo de contrato liberado e do mesmo cliente/tenant', () => {
    expect(migration).toContain('ct.company_id = v_company_id');
    expect(migration).toContain('ct.customer_id = v_customer_id');
    expect(migration).toContain('COALESCE(ct.portal_documents_released, false)');
  });

  it('não deixa anon chamar a implementação antiga sem o wrapper novo', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_portal_data_before_customer_documents\(text, text\)[\s\S]*FROM public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_portal_data\(p_token text\)[\s\S]*SELECT public\.get_portal_data\(p_token, NULL\)/,
    );
  });

  it('download exige que o item esteja no payload já liberado pelo portal', () => {
    expect(edge).toContain('item.id === documentId && item.source === source');
    expect(edge).toContain('if (!isReleased)');
    expect(edge).toContain('.eq("company_id", companyId)');
    expect(edge).toContain('.eq("customer_id", customerId)');
  });

  it('usa buckets privados e URL assinada curta sem devolver storage_path', () => {
    expect(edge).toContain('.createSignedUrl(');
    expect(edge).toContain('SIGNED_URL_TTL_SECONDS = 300');
    expect(edge).toContain('document.storage_path.startsWith(`${companyId}/${customerId}/`)');
    expect(edge).toContain('attachment.storage_path.startsWith(`${companyId}/${attachment.contract_id}/`)');
    expect(edge).not.toMatch(/json\([^\n]*storage_path/);
  });
});
