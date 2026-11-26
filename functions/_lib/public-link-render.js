// Head social dos links públicos de uma empresa (cobrança, portal, orçamento,
// formulário, ponto etc.). Sem isso o crawler do WhatsApp recebe o shell da SPA
// e mostra título, descrição e arte da Dominex num link que é do tenant.
//
// Régua (a mesma da OS pública, que também passa por `injectSocialHead`):
//   • White Label ativo + arte social composta → arte do tenant;
//   • demais casos → arte padrão da Dominex (decidido no banco, pela RPC);
//   • link que não resolve → nenhum og:image (nunca a marca de outro).
// O head NUNCA carrega PII: nada de nome do cliente final, valor ou status.

const DEFAULT_SITE_ORIGIN = 'https://www.dominex.app';

/**
 * Um registro por `p_kind` aceito pela RPC `get_public_link_social_meta`.
 * `noindex: false` preserva o robots do shell — o portal do contrato e a
 * validação de certificado são públicos de propósito.
 */
export const PUBLIC_LINK_KINDS = {
  pagar: {
    label: 'Pagamento',
    withCompany: (name) => `Link de pagamento seguro da ${name}.`,
    generic: 'Link de pagamento seguro.',
    noindex: true,
  },
  assinar: {
    label: 'Assinatura',
    withCompany: (name) => `Autorize sua assinatura com a ${name} de forma segura.`,
    generic: 'Autorize sua assinatura de forma segura.',
    noindex: true,
  },
  orcamento: {
    label: 'Orçamento',
    withCompany: (name) => `Veja os detalhes do orçamento enviado pela ${name}.`,
    generic: 'Veja os detalhes deste orçamento.',
    noindex: true,
  },
  proposta: {
    label: 'Proposta',
    withCompany: (name) => `Veja os detalhes da proposta enviada pela ${name}.`,
    generic: 'Veja os detalhes desta proposta.',
    noindex: true,
  },
  portal: {
    label: 'Portal do Cliente',
    withCompany: (name) => `Acompanhe serviços, equipamentos e documentos no portal da ${name}.`,
    generic: 'Acompanhe serviços, equipamentos e documentos.',
    noindex: true,
  },
  contrato: {
    label: 'Contrato',
    withCompany: (name) => `Acompanhe o contrato e os serviços realizados pela ${name}.`,
    generic: 'Acompanhe o contrato e os serviços realizados.',
    noindex: false,
  },
  certificado: {
    label: 'Validação de certificado',
    withCompany: (name) => `Confira a autenticidade deste certificado emitido pela ${name}.`,
    generic: 'Confira a autenticidade deste certificado.',
    noindex: false,
  },
  cadastro: {
    label: 'Cadastro',
    withCompany: (name) => `Preencha seus dados para ser atendido pela ${name}.`,
    generic: 'Preencha seus dados para ser atendido.',
    noindex: true,
  },
  ponto: {
    label: 'Ponto eletrônico',
    withCompany: (name) => `Registre seu ponto na ${name}.`,
    generic: 'Registre seu ponto.',
    noindex: true,
  },
  ponto_empresa: {
    label: 'Ponto eletrônico',
    withCompany: (name) => `Registre o ponto da equipe da ${name}.`,
    generic: 'Registre o ponto da equipe.',
    noindex: true,
  },
  ativar_ponto: {
    label: 'Cadastro facial',
    withCompany: (name) => `Ative o registro de ponto por reconhecimento facial na ${name}.`,
    generic: 'Ative o registro de ponto por reconhecimento facial.',
    noindex: true,
  },
  avaliacao: {
    label: 'Perfil comportamental',
    withCompany: (name) => `Responda à avaliação de perfil comportamental da ${name}.`,
    generic: 'Responda à avaliação de perfil comportamental.',
    noindex: true,
  },
};

export function resolveSupabase(env) {
  return {
    url: env?.VITE_SUPABASE_URL,
    key: env?.VITE_SUPABASE_PUBLISHABLE_KEY || env?.VITE_SUPABASE_ANON_KEY,
  };
}

export function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeText(value) {
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

/**
 * Troca o head de marketing da Dominex pelo head do link público.
 *
 * @param {string} shell           index.html limpo do build (shell.html)
 * @param {object} head
 * @param {string} head.title
 * @param {string} head.description
 * @param {string} head.siteName   og:site_name e base do alt da imagem
 * @param {string} [head.imageUrl] vazio → nenhum og:image
 * @param {boolean} [head.imageIsComposed] arte 1200x630 gerada pelo sistema
 * @param {boolean} [head.noindex=true]
 * @param {string} canonicalUrl
 */
export function injectSocialHead(shell, head, canonicalUrl) {
  const title = String(head?.title || '').trim();
  const description = String(head?.description || '').trim();
  const siteName = String(head?.siteName || '').trim() || title;
  const imageUrl = String(head?.imageUrl || '').trim();
  const hasComposedImage = head?.imageIsComposed === true;
  const composedImageType = /\.png(?:$|\?)/i.test(imageUrl) ? 'image/png' : 'image/jpeg';
  const noindex = head?.noindex !== false;

  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']alternate["']\s+hreflang=["'][^"']*["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '');
  if (noindex) html = html.replace(/<meta\s+name=["']robots["'][^>]*>/gi, '');
  html = stripJsonLd(html);

  const imageMeta = imageUrl
    ? `
    <meta property="og:image" content="${escapeAttr(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeAttr(imageUrl)}" />
    <meta property="og:image:alt" content="Imagem de compartilhamento de ${escapeAttr(siteName)}" />${hasComposedImage ? `\n    <meta property="og:image:type" content="${composedImageType}" />\n    <meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />` : ''}
    <meta name="twitter:image" content="${escapeAttr(imageUrl)}" />`
    : '';

  const robotsMeta = noindex
    ? '\n    <meta name="robots" content="noindex, nofollow, noarchive" />'
    : '';

  const headHtml = `
    <title>${escapeText(title)}</title>
    <meta name="description" content="${escapeAttr(description)}" />${robotsMeta}
    <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeAttr(canonicalUrl)}" />
    <meta property="og:title" content="${escapeAttr(title)}" />
    <meta property="og:description" content="${escapeAttr(description)}" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:site_name" content="${escapeAttr(siteName)}" />${imageMeta}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(title)}" />
    <meta name="twitter:description" content="${escapeAttr(description)}" />
  `;

  return html.replace('</head>', `${headHtml}</head>`);
}

/** Monta título/descrição do link a partir do tipo e do retorno da RPC. */
export function buildPublicLinkHead(kind, meta) {
  const config = PUBLIC_LINK_KINDS[kind];
  if (!config) return null;

  const companyName = String(meta?.company_name || '').trim();
  return {
    title: companyName ? `${config.label} · ${companyName}` : config.label,
    description: companyName ? config.withCompany(companyName) : config.generic,
    siteName: companyName || config.label,
    imageUrl: String(meta?.social_image_url || '').trim(),
    imageIsComposed: meta?.social_image_is_composed === true,
    noindex: config.noindex,
  };
}

export function injectPublicLinkHead(shell, kind, meta, canonicalUrl) {
  const head = buildPublicLinkHead(kind, meta);
  return head ? injectSocialHead(shell, head, canonicalUrl) : shell;
}

export async function fetchPublicLinkMeta(env, kind, reference) {
  const supabase = resolveSupabase(env);
  if (!supabase.url || !supabase.key || !reference || !PUBLIC_LINK_KINDS[kind]) return null;

  try {
    const response = await fetch(`${supabase.url}/rest/v1/rpc/get_public_link_social_meta`, {
      method: 'POST',
      headers: {
        apikey: supabase.key,
        Authorization: `Bearer ${supabase.key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_kind: kind, p_reference: String(reference) }),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export async function fetchCloudflareShell(env, request) {
  const shellUrl = new URL('/shell.html', request.url);
  const response = env?.ASSETS?.fetch
    ? await env.ASSETS.fetch(shellUrl)
    : await fetch(shellUrl.toString());
  if (!response.ok) throw new Error(`shell.html indisponível (HTTP ${response.status})`);
  return response.text();
}

/**
 * Handler das Pages Functions dos links públicos.
 *
 * Estas rotas carregam checkout, portal e ponto: se o head social falhar, a
 * página TEM que abrir mesmo assim. Por isso qualquer erro devolve a requisição
 * ao roteamento normal do Pages (`next`), que entrega a SPA como antes.
 */
export function createPublicLinkHandler(kind, paramName) {
  return async function onRequest(context) {
    const { env, request, params, next } = context;
    if (request.method !== 'GET' && request.method !== 'HEAD') return next();

    try {
      const raw = params?.[paramName];
      const reference = Array.isArray(raw) ? raw.join('/') : String(raw || '');
      const [shell, meta] = await Promise.all([
        fetchCloudflareShell(env, request),
        fetchPublicLinkMeta(env, kind, reference),
      ]);
      const requestedUrl = new URL(request.url);
      const canonicalUrl = `${DEFAULT_SITE_ORIGIN}${requestedUrl.pathname}`;
      const head = buildPublicLinkHead(kind, meta);
      const html = injectSocialHead(shell, head, canonicalUrl);

      const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      };
      if (head.noindex) headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive';

      return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers });
    } catch {
      return next();
    }
  };
}
