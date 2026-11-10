import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261107220000_pmoc_certificate_public_validation.sql', import.meta.url),
  'utf8',
);
const publicEdge = readFileSync(
  new URL('../../supabase/functions/validate-pmoc-certificate/index.ts', import.meta.url),
  'utf8',
);
const osGenerator = readFileSync(
  new URL('../../supabase/functions/generate-os-pmoc-document/index.ts', import.meta.url),
  'utf8',
);
const contractGenerator = readFileSync(
  new URL('../../supabase/functions/generate-pmoc-certificado-pdf/index.ts', import.meta.url),
  'utf8',
);

test('numeração PMOC é linear por empresa e reserva idempotente por conteúdo', () => {
  assert.match(migration, /UNIQUE \(company_id, certificate_number\)/);
  assert.match(migration, /UNIQUE \(company_id, source_kind, idempotency_key\)/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /last_number = c\.last_number \+ 1/);
  assert.match(migration, /'PMOC-' \|\| lpad\(v_number::text, 6, '0'\)/);
  assert.match(migration, /extensions\.gen_random_bytes\(12\)/);
  assert.match(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/g);
});

test('registro de validação permanece privado e a consulta pública é capability-only', () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration, /REVOKE ALL ON public\.pmoc_certificate_validations FROM anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_pmoc_certificate_validation/);
  assert.match(publicEdge, /TOKEN_RE = \/\^\[A-Za-z0-9_-/);
  assert.match(publicEdge, /\.eq\("validation_token", token\)/);
  assert.match(publicEdge, /\.eq\("status", "active"\)/);
  assert.match(publicEdge, /RATE_MAX = 40/);
  assert.doesNotMatch(publicEdge, /pdf_storage_path|service_order_document_id|contract_document_id/);
});

test('geradores reservam antes do PDF e só ativam após persistir o documento', () => {
  for (const generator of [osGenerator, contractGenerator]) {
    assert.match(generator, /reservePmocCertificateValidation/);
    assert.match(generator, /finalizePmocCertificateValidation/);
    assert.match(generator, /documento\.url_validacao/);
    assert.match(generator, /validationUrl/);
  }
});
