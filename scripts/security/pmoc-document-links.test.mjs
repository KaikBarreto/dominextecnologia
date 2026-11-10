import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261107173500_link_os_pmoc_documents_to_attachments.sql', import.meta.url),
  'utf8',
);
const generator = readFileSync(
  new URL('../../supabase/functions/generate-os-pmoc-document/index.ts', import.meta.url),
  'utf8',
);
const equipmentHook = readFileSync(
  new URL('../../src/hooks/useEquipmentAttachments.ts', import.meta.url),
  'utf8',
);

test('documento PMOC usa vinculos privados sem copiar para buckets legados', () => {
  assert.match(migration, /CREATE TABLE public\.service_order_pmoc_document_links/);
  assert.match(migration, /num_nonnulls\(customer_id, equipment_id\) = 1/);
  assert.match(migration, /AFTER INSERT ON public\.service_order_pmoc_documents/);
  assert.match(migration, /ON CONFLICT DO NOTHING/g);
  assert.doesNotMatch(migration, /equipment-files|customer-documents/);
  assert.match(equipmentHook, /from\('pmoc-documents'\)\s*\.createSignedUrl/);
});

test('vinculos PMOC validam tenant, ordem e assinatura ativa', () => {
  assert.match(migration, /v_document_company_id IS DISTINCT FROM NEW\.company_id/);
  assert.match(migration, /NEW\.customer_id IS DISTINCT FROM v_order_customer_id/);
  assert.match(migration, /v_equipment_belongs_to_order/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /tenant_subscription_allows_access\(company_id\)/);
  assert.match(migration, /REVOKE ALL ON public\.service_order_pmoc_document_links FROM anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON public\.service_order_pmoc_document_links TO authenticated/);
});

test('gerador valida duracao e inclui data civil no nome do PDF', () => {
  assert.match(generator, /invalid_validity_months/);
  assert.match(generator, /requestedValidityMonths < 1 \|\| requestedValidityMonths > 60/);
  assert.match(generator, /readableFileDate\(generatedAt, timeZone\)/);
  assert.match(generator, /\$\{label\} - OS \$\{number\} - \$\{filenamePart\(customerName, "Cliente"\)\} -/);
});
