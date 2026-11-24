const DEFAULT_TITLE = 'Portal do Contrato';
const DEFAULT_SOCIAL_IMAGE = 'https://www.dominex.app/images/og-social.jpg';

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

/** Injeta metadados públicos do tenant sem dados do cliente, endereço ou contrato. */
export function injectPublicContractPortalHead(shell, meta, canonicalUrl) {
  const companyName = String(meta?.company_name || '').trim();
  const whiteLabelEnabled = meta?.white_label_enabled === true;
  const title = companyName ? `${DEFAULT_TITLE} · ${companyName}` : DEFAULT_TITLE;
  const description = companyName
    ? `Acesse as informações compartilhadas pela ${companyName}.`
    : 'Acesse as informações compartilhadas neste portal.';
  const configuredImage = String(meta?.social_image_url || '').trim();
  const imageUrl = whiteLabelEnabled ? configuredImage : (companyName ? DEFAULT_SOCIAL_IMAGE : '');
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

export async function fetchPublicContractPortalMeta(env, token) {
  const supabase = resolveSupabase(env);
  if (!supabase.url || !supabase.key || !token) return null;

  try {
    const response = await fetch(
      `${supabase.url}/functions/v1/pmoc-portal-share?token=${encodeURIComponent(String(token))}`,
      {
        headers: {
          apikey: supabase.key,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );
    if (!response.ok) return null;
    const payload = await response.json();
    const tenant = payload?.tenant;
    if (!tenant || typeof tenant !== 'object') return null;
    return {
      company_name: tenant.name,
      white_label_enabled: tenant.white_label_enabled === true,
      social_image_url: tenant.social_image_url || tenant.logo_url || null,
      social_image_is_composed: tenant.social_image_is_composed === true,
    };
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

export async function renderPublicContractPortal({ env, request, token }) {
  try {
    const [shell, meta] = await Promise.all([
      fetchCloudflareShell(env, request),
      fetchPublicContractPortalMeta(env, token),
    ]);
    const requestedUrl = new URL(request.url);
    const canonicalUrl = `https://www.dominex.app${requestedUrl.pathname}`;
    const html = injectPublicContractPortalHead(shell, meta, canonicalUrl);

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
