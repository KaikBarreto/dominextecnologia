import { fetchPublicOsMeta, injectPublicOsHead } from '../functions/_lib/public-os-render.js';

export default async function handler(req, res) {
  const rawId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
  const reference = String(rawId || '');
  const host = req.headers.host;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];

  try {
    const [shellResponse, meta] = await Promise.all([
      fetch(`${forwardedProto}://${host}/shell.html`),
      fetchPublicOsMeta(process.env, reference),
    ]);
    if (!shellResponse.ok) throw new Error(`shell.html indisponível (HTTP ${shellResponse.status})`);

    const shell = await shellResponse.text();
    const canonicalUrl = `https://www.dominex.app/os-tecnico/${encodeURIComponent(reference)}`;
    const html = injectPublicOsHead(shell, meta, canonicalUrl);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.status(200).send(html);
  } catch {
    return res.status(503).send('Página temporariamente indisponível.');
  }
}
