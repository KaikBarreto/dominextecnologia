import {
  fetchCloudflareShell,
  injectSocialHead,
  resolveSupabase,
} from './public-link-render.js';

const DEFAULT_TITLE = 'Ordem de Serviço';

/** Injeta um head sem PII; cliente/endereco/descricao da OS nunca entram no preview. */
export function injectPublicOsHead(shell, meta, canonicalUrl) {
  const companyName = String(meta?.company_name || '').trim();
  const orderNumber = String(meta?.order_number || '').trim();
  const title = orderNumber
    ? `OS #${orderNumber}${companyName ? ` · ${companyName}` : ''}`
    : companyName
      ? `${DEFAULT_TITLE} · ${companyName}`
      : DEFAULT_TITLE;
  const description = companyName
    ? `Acompanhe o status e os detalhes desta ordem de serviço da ${companyName}.`
    : 'Acompanhe o status e os detalhes desta ordem de serviço.';

  // Mesma régua de head dos demais links públicos (public-link-render.js).
  return injectSocialHead(shell, {
    title,
    description,
    siteName: companyName || DEFAULT_TITLE,
    imageUrl: meta?.social_image_url,
    imageIsComposed: meta?.social_image_is_composed === true,
    noindex: true,
  }, canonicalUrl);
}

export async function fetchPublicOsMeta(env, reference) {
  const supabase = resolveSupabase(env);
  if (!supabase.url || !supabase.key || !reference) return null;

  try {
    const response = await fetch(`${supabase.url}/rest/v1/rpc/get_public_os_social_meta`, {
      method: 'POST',
      headers: {
        apikey: supabase.key,
        Authorization: `Bearer ${supabase.key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_reference: String(reference) }),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export async function renderPublicOs({ env, request, reference }) {
  try {
    const [shell, meta] = await Promise.all([
      fetchCloudflareShell(env, request),
      fetchPublicOsMeta(env, reference),
    ]);
    const requestedUrl = new URL(request.url);
    const canonicalUrl = `https://www.dominex.app${requestedUrl.pathname}`;
    const html = injectPublicOsHead(shell, meta, canonicalUrl);

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    });
  } catch {
    return new Response('Página temporariamente indisponível.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
