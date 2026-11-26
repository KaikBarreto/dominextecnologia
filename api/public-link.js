import {
  buildPublicLinkHead,
  fetchPublicLinkMeta,
  injectSocialHead,
  PUBLIC_LINK_KINDS,
} from '../functions/_lib/public-link-render.js';

// Paridade Vercel das Pages Functions dos links públicos (produção é Cloudflare
// Pages; aqui só os previews/espelhos). Mesma régua: functions/_lib/public-link-render.js.
export default async function handler(req, res) {
  const pick = (value) => String((Array.isArray(value) ? value[0] : value) || '');
  const kind = pick(req.query?.kind);
  const reference = pick(req.query?.ref);
  const pathname = pick(req.query?.path) || '/';
  const host = req.headers.host;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];

  try {
    const shellResponse = await fetch(`${forwardedProto}://${host}/shell.html`);
    if (!shellResponse.ok) throw new Error(`shell.html indisponível (HTTP ${shellResponse.status})`);
    const shell = await shellResponse.text();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');

    // Tipo desconhecido: entrega a SPA sem mexer no head.
    if (!PUBLIC_LINK_KINDS[kind]) return res.status(200).send(shell);

    const meta = await fetchPublicLinkMeta(process.env, kind, reference);
    const head = buildPublicLinkHead(kind, meta);
    const safePath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const html = injectSocialHead(shell, head, `https://www.dominex.app${safePath}`);

    if (head.noindex) res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.status(200).send(html);
  } catch {
    return res.status(503).send('Página temporariamente indisponível.');
  }
}
