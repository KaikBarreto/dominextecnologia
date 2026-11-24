import {
  fetchPublicContractPortalMeta,
  injectPublicContractPortalHead,
} from '../functions/_lib/public-contract-portal-render.js';

export default async function handler(req, res) {
  const rawToken = Array.isArray(req.query?.token) ? req.query.token[0] : req.query?.token;
  const token = String(rawToken || '');
  const host = req.headers.host;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];

  try {
    const [shellResponse, meta] = await Promise.all([
      fetch(`${forwardedProto}://${host}/shell.html`),
      fetchPublicContractPortalMeta(process.env, token),
    ]);
    if (!shellResponse.ok) throw new Error(`shell.html indisponível (HTTP ${shellResponse.status})`);

    const shell = await shellResponse.text();
    const canonicalUrl = `https://www.dominex.app/contrato/unidade/${encodeURIComponent(token)}`;
    const html = injectPublicContractPortalHead(shell, meta, canonicalUrl);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.status(200).send(html);
  } catch {
    return res.status(503).send('Página temporariamente indisponível.');
  }
}
