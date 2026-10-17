import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';

const root = new URL('../../', import.meta.url);
const openapiSource = await readFile(new URL('docs/api/openapi.v1.yaml', root), 'utf8');
const publicEdge = await readFile(new URL('supabase/functions/public-api-v1/index.ts', root), 'utf8');
const managerEdge = await readFile(new URL('supabase/functions/api-key-manager/index.ts', root), 'utf8');
const publicProxy = await readFile(new URL('api/public-v1.js', root), 'utf8');
const publicHelpers = await readFile(new URL('supabase/functions/_shared/public-api.ts', root), 'utf8');
const bookingMigration = await readFile(new URL('supabase/migrations/20261017122000_public_api_v1_booking_engine.sql', root), 'utf8');
const contract = parse(openapiSource);

test('OpenAPI v1 usa 3.1.1, HTTPS e autenticacao Bearer global', () => {
  assert.equal(contract.openapi, '3.1.1');
  assert.deepEqual(contract.servers, [{ url: 'https://api.dominex.app/v1', description: 'Producao' }]);
  assert.equal(contract.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.deepEqual(contract.security, [{ bearerAuth: [] }]);
});

test('OpenAPI documenta exatamente a superficie publica v1 aprovada', () => {
  assert.deepEqual(Object.keys(contract.paths).sort(), [
    '/availability',
    '/booking-resources',
    '/capabilities',
    '/customers/resolve',
    '/service-orders',
    '/service-orders/by-external-id/{external_id}',
    '/service-orders/{id}',
    '/service-types',
  ].sort());
  assert.equal(contract.paths['/service-orders'].post.parameters[0].$ref, '#/components/parameters/IdempotencyKey');
  assert.equal(contract.components.schemas.CreateServiceOrderRequest.additionalProperties, false);
});

test('handlers mantem limites, no-store, problem+json e ausencia de CORS publico', () => {
  const publicImplementation = `${publicEdge}\n${publicHelpers}`;
  for (const fragment of [
    'const GLOBAL_RATE_LIMIT = 60',
    'const AVAILABILITY_RATE_LIMIT = 30',
    'const MUTATION_RATE_LIMIT = 10',
    'application/problem+json',
    'Cache-Control',
    'Idempotency-Key',
  ]) assert.match(publicImplementation, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.doesNotMatch(publicImplementation, /Access-Control-Allow-Origin/i);
  assert.match(managerEdge, /fn:manage_api_keys/);
  assert.match(managerEdge, /key_issue[^\n]+5[^\n]+3_600/);
});

test('nenhuma edge registra segredo, Authorization ou corpo integral', () => {
  for (const source of [publicEdge, managerEdge]) {
    assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:authorization|secret_hash|api_key|rawBody|body\b)/i);
  }
});

test('override interno nao fica acessivel a service role nem a API publica', () => {
  assert.match(bookingMigration, /REVOKE ALL ON FUNCTION public\.schedule_create_service_order_with_override\(jsonb,\s*text,\s*jsonb,\s*uuid\[\]\) FROM PUBLIC, anon, service_role/i);
  assert.doesNotMatch(publicEdge, /schedule_create_service_order_with_override|schedule_book_service_order/i);
});

test('edge publica exige proxy autenticado e recebe IP apenas da borda confiavel', () => {
  assert.match(publicProxy, /PUBLIC_API_PROXY_SECRET/);
  assert.match(publicProxy, /x-vercel-forwarded-for/);
  assert.match(publicProxy, /X-Dominex-Client-Ip/);
  assert.match(publicEdge, /PUBLIC_API_PROXY_SECRET/);
  assert.match(publicEdge, /timingSafeEqual\(providedProxySecret, expectedProxySecret\)/);
  assert.doesNotMatch(publicEdge, /const ip = requestIp\(req\)/);
});
