// Guarda do cache de assets do service worker (`dominex-build-assets`).
//
// O Cloudflare Pages responde 200 + index.html para QUALQUER caminho que não
// existe, inclusive `/assets/<chunk antigo>.js` depois de um deploy. O
// CacheFirst aceitava esse 200 e guardava o HTML por 30 dias como se fosse o
// chunk: dali em diante a tela quebrava direto do cache, sem tocar na rede, até
// a aba receber o shell novo (incidente KGIE, 2026-11-28).
//
// Duas travas:
//   - cacheWillUpdate: HTML ou resposta de erro nunca entra no cache.
//   - cachedResponseWillBeUsed: entrada HTML já guardada por versão anterior é
//     ignorada, e a estratégia volta à rede.
//
// ATENÇÃO: o Workbox (generateSW) copia cada função para dentro do sw.js via
// `toString()`. Elas precisam ser arrow functions AUTOSSUFICIENTES — nada de
// helper, constante ou import de fora do corpo da função.
export const buildAssetCacheGuard = {
  cacheWillUpdate: async ({ response }: { response?: Response | null }) =>
    response
    && response.status === 200
    && !(response.headers.get("content-type") || "").toLowerCase().includes("text/html")
      ? response
      : null,
  cachedResponseWillBeUsed: async ({ cachedResponse }: { cachedResponse?: Response | null }) =>
    cachedResponse
    && !(cachedResponse.headers.get("content-type") || "").toLowerCase().includes("text/html")
      ? cachedResponse
      : null,
};
