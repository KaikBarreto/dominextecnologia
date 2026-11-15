import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLegacyServiceWorker,
  onRequestGet,
} from '../functions/sw.js/index.js';

test('entrega um Service Worker de resgate sem redirect no domínio legado', async () => {
  let nextCalled = false;
  const response = await onRequestGet({
    request: new Request('https://dominex.app/sw.js'),
    next: async () => {
      nextCalled = true;
      return new Response('não deveria chegar aqui');
    },
  });

  const source = await response.text();
  assert.equal(response.status, 200);
  assert.equal(nextCalled, false);
  assert.match(response.headers.get('content-type'), /application\/javascript/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('service-worker-allowed'), '/');
  assert.match(source, /https:\/\/www\.dominex\.app/);
  assert.match(source, /registration\.unregister/);
  assert.match(source, /client\.navigate/);
  assert.doesNotMatch(source, /Response\.redirect/);
  assert.doesNotThrow(() => new Function(source));

  const listeners = new Map();
  const fakeSelf = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    skipWaiting: async () => undefined,
    clients: {
      claim: async () => undefined,
      matchAll: async () => [],
    },
    location: { origin: 'https://dominex.app' },
  };
  const fakeCaches = {
    keys: async () => [],
    delete: async () => true,
  };
  new Function('self', 'caches', source)(fakeSelf, fakeCaches);

  let recoveryResponse;
  listeners.get('fetch')({
    request: { mode: 'navigate' },
    respondWith: (promise) => { recoveryResponse = promise; },
  });
  const recoveryHtml = await (await recoveryResponse).text();
  assert.match(recoveryHtml, /Atualizando seu acesso/);
  assert.match(recoveryHtml, /https:\/\/www\.dominex\.app/);
  assert.match(recoveryHtml, /navigator\.serviceWorker\.getRegistrations/);
});

test('preserva o Service Worker Workbox no domínio canônico', async () => {
  const expected = new Response('workbox gerado pelo Vite');
  let nextCalled = false;
  const response = await onRequestGet({
    request: new Request('https://www.dominex.app/sw.js'),
    next: async () => {
      nextCalled = true;
      return expected;
    },
  });

  assert.equal(nextCalled, true);
  assert.equal(response, expected);
});

test('fonte do resgate continua sendo JavaScript sintaticamente válido', () => {
  assert.doesNotThrow(() => new Function(buildLegacyServiceWorker()));
});
