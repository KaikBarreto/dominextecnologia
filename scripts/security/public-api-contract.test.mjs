import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';

const root = new URL('../../', import.meta.url);
const openapiSource = await readFile(new URL('docs/api/openapi.v1.yaml', root), 'utf8');
const publicEdge = await readFile(new URL('supabase/functions/public-api-v1/index.ts', root), 'utf8');
const managerEdge = await readFile(new URL('supabase/functions/api-key-manager/index.ts', root), 'utf8');
const publicProxy = await readFile(new URL('api/public-v1.js', root), 'utf8');
const cloudflareGateway = await readFile(new URL('workers/public-api-gateway.js', root), 'utf8');
const generatedOpenApi = JSON.parse(await readFile(new URL('workers/openapi.v1.json', root), 'utf8'));
const publicHelpers = await readFile(new URL('supabase/functions/_shared/public-api.ts', root), 'utf8');
const docsContent = await readFile(new URL('src/pages/docs/docsContent.ts', root), 'utf8');
const publicReference = await readFile(new URL('public/docs/api/referencia.md', root), 'utf8');
const llmsDocumentation = await readFile(new URL('public/docs/llms.txt', root), 'utf8');
const bookingMigration = await readFile(new URL('supabase/migrations/20261017122000_public_api_v1_booking_engine.sql', root), 'utf8');
const multiDayBookingMigration = await readFile(new URL('supabase/migrations/20261019173000_os_multiplos_dias_na_agenda.sql', root), 'utf8');
const crmCardsMigration = await readFile(new URL('supabase/migrations/20261029120000_public_api_v1_crm_cards.sql', root), 'utf8');
const contract = parse(openapiSource);

test('OpenAPI servido pelo gateway e identico a fonte YAML canonica', () => {
  assert.deepEqual(generatedOpenApi, contract);
  assert.match(cloudflareGateway, /openapi\.v1\.json/);
});

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
    '/crm/cards',
    '/crm/cards/by-external-id/{external_id}',
    '/crm/cards/{id}',
    '/crm/pipelines',
    '/customers/resolve',
    '/service-orders',
    '/service-orders/by-external-id/{external_id}',
    '/service-orders/{id}',
    '/service-types',
  ].sort());
  assert.equal(contract.paths['/service-orders'].post.parameters[0].$ref, '#/components/parameters/IdempotencyKey');
  assert.equal(contract.components.schemas.CreateServiceOrderRequest.additionalProperties, false);
  assert.equal(contract.paths['/crm/cards'].post.parameters[0].$ref, '#/components/parameters/IdempotencyKey');
  assert.equal(contract.paths['/crm/cards/{id}'].patch.parameters[1].$ref, '#/components/parameters/IdempotencyKey');
  assert.equal(contract.components.schemas.CreateCrmCardRequest.additionalProperties, false);
  assert.equal(contract.components.schemas.CrmCardFields.additionalProperties, false);
  assert.equal(contract.components.schemas.UpdateCrmCardRequest.allOf[0].$ref, '#/components/schemas/CrmCardFields');
  assert.deepEqual(contract.components.schemas.CrmCard.properties.stage_id.type, ['string', 'null']);
  assert.ok(contract.components.schemas.Scope.enum.includes('crm_cards:read'));
  assert.ok(contract.components.schemas.Scope.enum.includes('crm_cards:write'));
});

test('documentacao humana e para agentes acompanha a superficie CRM', () => {
  for (const fragment of [
    '/crm/pipelines',
    '/crm/cards',
    '/crm/cards/{id}',
    '/crm/cards/by-external-id/{external_id}',
    'crm_cards:read',
    'crm_cards:write',
  ]) {
    for (const source of [docsContent, publicReference, llmsDocumentation]) {
      assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
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
  assert.match(managerEdge, /crm_cards:read/);
  assert.match(managerEdge, /crm_cards:write/);
});

test('RPCs do CRM derivam tenant e escopo no servidor e excluem funis de projeto', () => {
  for (const scope of ['crm_cards:read', 'crm_cards:write']) {
    assert.match(crmCardsMigration, new RegExp(`public_api_assert_integration\\([\\s\\S]{0,120}'${scope.replace(':', '\\:')}'`));
  }
  assert.match(crmCardsMigration, /project_id IS NULL/g);
  assert.match(crmCardsMigration, /public_api_idempotency/);
  assert.match(crmCardsMigration, /public-api-idempotency:/);
  assert.match(crmCardsMigration, /idx_leads_company_updated_id[\s\S]+company_id, updated_at DESC, id DESC/);
  assert.match(crmCardsMigration, /LEFT JOIN public\.crm_stages s/);
  assert.match(crmCardsMigration, /interaction_type, description, created_by[\s\S]+mudanca_estagio/);
  assert.doesNotMatch(crmCardsMigration, /GRANT EXECUTE[^;]+TO (?:PUBLIC|anon|authenticated)/i);
  for (const rpc of [
    'public_api_get_crm_pipelines',
    'public_api_list_crm_cards',
    'public_api_get_crm_card',
    'public_api_create_crm_card',
    'public_api_update_crm_card',
  ]) {
    assert.match(crmCardsMigration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}[^;]+TO service_role`, 'i'));
  }

  const createRpc = crmCardsMigration.slice(
    crmCardsMigration.indexOf('CREATE OR REPLACE FUNCTION public.public_api_create_crm_card'),
    crmCardsMigration.indexOf('CREATE OR REPLACE FUNCTION public.public_api_update_crm_card'),
  );
  const updateRpc = crmCardsMigration.slice(
    crmCardsMigration.indexOf('CREATE OR REPLACE FUNCTION public.public_api_update_crm_card'),
  );
  assert.ok(createRpc.indexOf('FROM public.public_api_idempotency') < createRpc.indexOf('FROM public.crm_stages'));
  assert.ok(updateRpc.indexOf('FROM public.public_api_idempotency') < updateRpc.indexOf('FROM public.leads l'));
});

test('nenhuma edge registra segredo, Authorization ou corpo integral', () => {
  for (const source of [publicEdge, managerEdge]) {
    assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:authorization|secret_hash|api_key|rawBody|body\b)/i);
  }
});

test('override interno nao fica acessivel a service role nem a API publica', () => {
  assert.match(bookingMigration, /REVOKE ALL ON FUNCTION public\.schedule_create_service_order_with_override\(jsonb,\s*text,\s*jsonb,\s*uuid\[\]\) FROM PUBLIC, anon, service_role/i);
  assert.match(multiDayBookingMigration, /REVOKE ALL ON FUNCTION public\.schedule_book_service_order_plan\(uuid,\s*text,\s*uuid,\s*timestamptz,\s*jsonb,\s*text\)\s+FROM PUBLIC, anon, service_role/i);
  assert.match(multiDayBookingMigration, /REVOKE ALL ON FUNCTION public\.schedule_create_service_order_plan_with_override\(jsonb,\s*text,\s*jsonb,\s*uuid\[\]\)\s+FROM PUBLIC, anon, service_role/i);
  assert.doesNotMatch(publicEdge, /schedule_create_service_order_with_override|schedule_book_service_order/i);
});

test('edge publica exige proxy autenticado e recebe IP apenas da borda confiavel', () => {
  const gateways = `${publicProxy}\n${cloudflareGateway}`;
  assert.match(gateways, /PUBLIC_API_PROXY_SECRET/);
  assert.match(publicProxy, /x-vercel-forwarded-for/);
  assert.match(cloudflareGateway, /cf-connecting-ip/);
  assert.match(gateways, /X-Dominex-Client-Ip/);
  assert.match(gateways, /GET, POST, PATCH/);
  assert.match(publicEdge, /PUBLIC_API_PROXY_SECRET/);
  assert.match(publicEdge, /timingSafeEqual\(providedProxySecret, expectedProxySecret\)/);
  assert.doesNotMatch(publicEdge, /const ip = requestIp\(req\)/);
});
