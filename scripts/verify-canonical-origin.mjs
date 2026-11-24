#!/usr/bin/env node

import assert from 'node:assert/strict';

const legacyOrigin = process.env.DOMINEX_LEGACY_ORIGIN ?? 'https://dominex.app';
const canonicalOrigin = process.env.DOMINEX_CANONICAL_ORIGIN ?? 'https://www.dominex.app';

async function fetchWithoutFollowing(url) {
  return fetch(url, {
    redirect: 'manual',
    headers: { 'User-Agent': 'Dominex canonical-origin verification' },
  });
}

const path = '/os-tecnico/verificacao-canonica?modo=cliente';
const legacyNavigation = await fetchWithoutFollowing(`${legacyOrigin}${path}`);
assert.ok(
  [301, 308].includes(legacyNavigation.status),
  `A navegação legada deveria redirecionar (recebeu ${legacyNavigation.status}).`,
);
assert.equal(
  legacyNavigation.headers.get('location'),
  `${canonicalOrigin}${path}`,
  'O redirect deve preservar rota e query no host canônico.',
);

const legacyWorker = await fetchWithoutFollowing(`${legacyOrigin}/sw.js`);
assert.equal(
  legacyWorker.status,
  200,
  `O sw.js legado não pode redirecionar (recebeu ${legacyWorker.status}).`,
);
assert.match(
  legacyWorker.headers.get('content-type') ?? '',
  /application\/javascript/i,
  'O sw.js legado deve ser JavaScript.',
);
assert.match(
  await legacyWorker.text(),
  /Atualizando seu acesso|registration\.unregister/,
  'O host legado deve entregar o worker de recuperação.',
);

const canonicalWorker = await fetchWithoutFollowing(`${canonicalOrigin}/sw.js`);
assert.equal(canonicalWorker.status, 200, 'O Workbox canônico deve continuar disponível.');
assert.match(
  canonicalWorker.headers.get('content-type') ?? '',
  /javascript/i,
  'O Workbox canônico deve continuar sendo JavaScript.',
);

console.log('Origem canônica validada: redirect preservado e dois Service Workers acessíveis.');
