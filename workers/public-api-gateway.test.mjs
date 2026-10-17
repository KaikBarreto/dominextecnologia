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
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
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
