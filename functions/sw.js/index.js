const LEGACY_HOSTNAME = 'dominex.app';
const CANONICAL_ORIGIN = 'https://www.dominex.app';

/**
 * Service Worker mínimo de resgate para instalações antigas feitas no domínio
 * sem `www`. Ele não responde com redirect: o Safari rejeita respostas de
 * navegação redirecionadas por SW. Em vez disso, entrega uma página same-origin
 * que remove o registro/cache legado e só então navega para a origem canônica.
 */
export function buildLegacyServiceWorker() {
  return `
function recoveryHtml() {
  return \`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <meta name="robots" content="noindex,nofollow">
    <title>Atualizando acesso ao Dominex</title>
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0d0d;color:#fff;font-family:system-ui,sans-serif">
    <main style="max-width:32rem;padding:2rem;text-align:center">
      <h1 style="font-size:1.25rem">Atualizando seu acesso…</h1>
      <p style="color:#cbd5e1;line-height:1.5">Estamos normalizando o endereço do Dominex. Você será redirecionado automaticamente.</p>
      <a id="continue" href="https://www.dominex.app/" style="color:#fff">Continuar para o Dominex</a>
    </main>
    <script>
      (async function () {
        var target = ${JSON.stringify(CANONICAL_ORIGIN)} + location.pathname + location.search + location.hash;
        document.getElementById('continue').href = target;
        try {
          var registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(function (registration) { return registration.unregister(); }));
        } catch (_) {}
        try {
          var keys = await caches.keys();
          await Promise.all(keys.map(function (key) { return caches.delete(key); }));
        } catch (_) {}
        location.replace(target);
      })();
    <\/script>
  </body>
</html>\`;
}

self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (key) { return caches.delete(key); }));
    } catch (_) {}

    await self.clients.claim();
    var windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(windows.map(async function (client) {
      try {
        if (new URL(client.url).origin === self.location.origin && 'navigate' in client) {
          await client.navigate(client.url);
        }
      } catch (_) {}
    }));
  })());
});

self.addEventListener('fetch', function (event) {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(Promise.resolve(new Response(recoveryHtml(), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  })));
});
`;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  // No host canônico, mantém o sw.js gerado pelo Vite/Workbox.
  if (url.hostname !== LEGACY_HOSTNAME) return context.next();

  return new Response(buildLegacyServiceWorker(), {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Service-Worker-Allowed': '/',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
