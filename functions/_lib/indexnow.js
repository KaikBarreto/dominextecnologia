const SITE_ORIGIN = 'https://www.dominex.app';
const INDEXNOW_KEY = '53ccafebd7a04ddfb0d2f7de790ada08';
const KEY_LOCATION = `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`;
// O protocolo distribui URLs entre os participantes. O endpoint agregador é a
// primeira opção; Bing funciona como fallback quando o egress do Worker é
// recusado pelo agregador.
const INDEXNOW_ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
];

export function normalizePublicBlogUrls(values) {
  const unique = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    try {
      const url = new URL(String(value), SITE_ORIGIN);
      const isBlogPost = /^\/(?:en\/|es\/|fr\/)?blog\/[^/]+\/?$/.test(url.pathname);
      if (url.origin === SITE_ORIGIN && isBlogPost) {
        url.search = '';
        url.hash = '';
        url.pathname = url.pathname.replace(/\/$/, '');
        unique.add(url.toString());
      }
    } catch {
      // Entrada pública inválida: ignora sem refletir conteúdo no retorno.
    }
    if (unique.size >= 100) break;
  }
  return [...unique];
}

export async function submitIndexNow(urls) {
  const urlList = normalizePublicBlogUrls(urls);
  if (urlList.length === 0) {
    return { ok: false, status: 400, body: { error: 'invalid_public_blog_urls' } };
  }

  const payload = JSON.stringify({
    host: 'www.dominex.app',
    key: INDEXNOW_KEY,
    keyLocation: KEY_LOCATION,
    urlList,
  });
  const providerStatuses = [];

  for (const endpoint of INDEXNOW_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: payload,
      });
      providerStatuses.push(response.status);
      if (response.status === 200 || response.status === 202) {
        return {
          ok: true,
          status: 202,
          body: { accepted: true, submitted: urlList.length },
        };
      }
    } catch {
      providerStatuses.push(0);
    }
  }

  return {
    ok: false,
    status: 503,
    body: { error: 'indexnow_unavailable', provider_statuses: providerStatuses },
  };
}
