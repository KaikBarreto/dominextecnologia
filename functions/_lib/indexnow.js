const SITE_ORIGIN = 'https://www.dominex.app';
const INDEXNOW_KEY = '53ccafebd7a04ddfb0d2f7de790ada08';
const KEY_LOCATION = `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

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

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'www.dominex.app',
        key: INDEXNOW_KEY,
        keyLocation: KEY_LOCATION,
        urlList,
      }),
    });
    const accepted = response.status === 200 || response.status === 202;
    return {
      ok: accepted,
      status: accepted ? 202 : 502,
      body: accepted
        ? { accepted: true, submitted: urlList.length }
        : { error: 'indexnow_rejected', provider_status: response.status },
    };
  } catch {
    return { ok: false, status: 502, body: { error: 'indexnow_unavailable' } };
  }
}
