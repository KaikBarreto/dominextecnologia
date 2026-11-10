import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest } from './public-api-gateway.js';

const env = {
  PUBLIC_API_UPSTREAM: 'https://project.supabase.co/functions/v1/public-api-v1',
  PUBLIC_API_PROXY_SECRET: 'test-secret',
  DOCS_ORIGIN: 'https://www.dominex.app',
};

test('recusa preflight sem expor CORS', async () => {
  const response = await handleRequest(new Request('https://api.dominex.app/v1/capabilities', { method: 'OPTIONS' }), env);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, POST, PATCH');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
});

test('encaminha PATCH de card CRM com JSON e chave de idempotencia', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (input, init) => {
    upstreamRequest = new Request(input, init);
    return new Response(JSON.stringify({ id: '018f9c91-8c0c-7c15-a9c1-c6245482a333' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const response = await handleRequest(new Request(
      'https://api.dominex.app/v1/crm/cards/018f9c91-8c0c-7c15-a9c1-c6245482a333',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer dmx_live_public.secret',
          'Idempotency-Key': 'crm-update-event-42',
        },
        body: JSON.stringify({ title: 'Renovacao anual' }),
      },
    ), env);
    assert.equal(response.status, 200);
    assert.equal(upstreamRequest.method, 'PATCH');
    assert.equal(upstreamRequest.headers.get('idempotency-key'), 'crm-update-event-42');
    assert.deepEqual(await upstreamRequest.json(), { title: 'Renovacao anual' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('recusa corpo maior que 64 KiB antes do upstream', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response();
  };
  try {
    const response = await handleRequest(new Request('https://api.dominex.app/v1/service-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat((64 * 1024) + 1),
    }), env);
    assert.equal(response.status, 413);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('encaminha apenas headers permitidos e usa o IP confiavel da Cloudflare', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (input, init) => {
    upstreamRequest = new Request(input, init);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': 'upstream-id',
        'Set-Cookie': 'must-not-leak=true',
      },
    });
  };
  try {
    const response = await handleRequest(new Request('https://api.dominex.app/v1/capabilities?mode=full', {
      headers: {
        Authorization: 'Bearer dmx_live_public.secret',
        'CF-Connecting-IP': '203.0.113.10',
        Cookie: 'must-not-forward=true',
        'X-Dominex-Proxy-Authorization': 'attacker-value',
      },
    }), env);
    assert.equal(response.status, 200);
    assert.equal(upstreamRequest.url, `${env.PUBLIC_API_UPSTREAM}/v1/capabilities?mode=full`);
    assert.equal(upstreamRequest.headers.get('authorization'), 'Bearer dmx_live_public.secret');
    assert.equal(upstreamRequest.headers.get('x-dominex-client-ip'), '203.0.113.10');
    assert.equal(upstreamRequest.headers.get('x-dominex-proxy-authorization'), 'test-secret');
    assert.equal(upstreamRequest.headers.get('cookie'), null);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('redireciona a raiz e a documentacao para o site publico', async () => {
  for (const path of ['/', '/docs', '/v1/docs']) {
    const response = await handleRequest(new Request(`https://api.dominex.app${path}`), env);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), path === '/v1/docs'
      ? 'https://www.dominex.app/docs'
      : `https://www.dominex.app${path}`);
  }
});

test('serve o OpenAPI 3.1.1 empacotado sem depender do site', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('OpenAPI nao deve consultar upstream');
  };
  try {
    const response = await handleRequest(new Request('https://api.dominex.app/v1/openapi.json'), env);
    const document = await response.json();
    assert.equal(response.status, 200);
    assert.equal(document.openapi, '3.1.1');
    assert.equal(document.info.title, 'Dominex Public API');
    assert.match(response.headers.get('content-type'), /application\/vnd\.oai\.openapi\+json/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
