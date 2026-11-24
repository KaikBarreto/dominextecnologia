/* global self, caches, clients */

// Recupera instalações antigas registradas no domínio sem www. Esse domínio
// não deve manter um PWA próprio: ele existe apenas para encaminhar o usuário
// ao host canônico sem deixar um service worker antigo preso entre origens.
(function guardLegacyOrigin() {
  if (self.location.hostname !== 'dominex.app') return;

  self.addEventListener('install', function installLegacyGuard() {
    self.skipWaiting();
  });

  self.addEventListener('activate', function activateLegacyGuard(event) {
    event.waitUntil((async function recoverLegacyOrigin() {
      try {
        var keys = await caches.keys();
        await Promise.allSettled(keys.map(function removeCache(key) {
          return caches.delete(key);
        }));
      } catch (_) {
        // A navegação canônica continua mesmo se o CacheStorage estiver negado.
      }

      try {
        await clients.claim();
        var windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        await Promise.allSettled(windows.map(function moveClient(client) {
          var current = new URL(client.url);
          var target = 'https://www.dominex.app' + current.pathname + current.search + current.hash;
          return client.navigate(target);
        }));
      } catch (_) {
        // A próxima abertura executa a recuperação inline do index.html.
      }

      try {
        await self.registration.unregister();
      } catch (_) {
        // Best effort: nunca impede a ativação do worker de recuperação.
      }
    })());
  });
})();
