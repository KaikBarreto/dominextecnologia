const DEFAULT_TITLE = 'Ordem de Serviço';

function resolveSupabase(env) {
  return {
    url: env.VITE_SUPABASE_URL,
    key: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY,
  };
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripJsonLd(html) {
  return html.replace(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
    '',
  );
}

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
  const imageUrl = String(meta?.social_image_url || '').trim();
  const hasComposedImage = meta?.social_image_is_composed === true;
  const composedImageType = /\.png(?:$|\?)/i.test(imageUrl) ? 'image/png' : 'image/jpeg';

  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']alternate["']\s+hreflang=["'][^"']*["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']robots["'][^>]*>/gi, '');
  html = stripJsonLd(html);

  const imageMeta = imageUrl
    ? `
    <meta property="og:image" content="${escapeAttr(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeAttr(imageUrl)}" />
    <meta property="og:image:alt" content="Imagem de compartilhamento de ${escapeAttr(companyName || DEFAULT_TITLE)}" />${hasComposedImage ? `\n    <meta property="og:image:type" content="${composedImageType}" />\n    <meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />` : ''}
    <meta name="twitter:image" content="${escapeAttr(imageUrl)}" />`
    : '';

  const head = `
    <title>${escapeText(title)}</title>
    <meta name="description" content="${escapeAttr(description)}" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeAttr(canonicalUrl)}" />
    <meta property="og:title" content="${escapeAttr(title)}" />
    <meta property="og:description" content="${escapeAttr(description)}" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:site_name" content="${escapeAttr(companyName || DEFAULT_TITLE)}" />${imageMeta}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(title)}" />
    <meta name="twitter:description" content="${escapeAttr(description)}" />
  `;

  return html.replace('</head>', `${head}</head>`);
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

async function fetchCloudflareShell(env, request) {
  const shellUrl = new URL('/shell.html', request.url);
  const response = env?.ASSETS?.fetch
    ? await env.ASSETS.fetch(shellUrl)
    : await fetch(shellUrl.toString());
  if (!response.ok) throw new Error(`shell.html indisponível (HTTP ${response.status})`);
  return response.text();
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
