// Helper central das CTAs de WhatsApp da landing / páginas públicas de aquisição.
//
// Objetivo: montar a URL final do WhatsApp (wa.me) com uma mensagem que reflete
// a PÁGINA ATUAL (pathname) + a ORIGEM do lead (utm_source quando houver).
//
// Mensagem montada no CLIQUE, então o pathname e a UTM lidos são os do momento
// do clique:
//   - Sem utm_source:  "Olá! Vim ${fragment} da Dominex e gostaria de saber mais sobre o sistema."
//   - Com utm_source:  "Olá! Vim ${fragment} da Dominex, que achei no *${origin}*, e gostaria de saber mais sobre o sistema."
// onde ${fragment} vem de getPageContextFragment(pathname) e ${origin} de
// getLeadOriginLabel() (Instagram, Google, etc).
//
// Fluxo da UTM:
//   1. captureUtmParams() roda cedo (mount da landing/páginas públicas) e
//      persiste os utm_* em sessionStorage — porque a UTM some quando a
//      pessoa navega.
//   2. buildWhatsAppUrl() lê a origem do sessionStorage OU da URL atual
//      (o que existir) e injeta na mensagem.

const SESSION_KEY = "dominex_utm_params";

// utm_source cru → nome amigável exibido na mensagem.
const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  ig: "Instagram",
  chatgpt: "ChatGPT",
  openai: "ChatGPT",
  google: "Google",
  facebook: "Facebook",
  fb: "Facebook",
  youtube: "YouTube",
  yt: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  bing: "Bing",
  whatsapp: "WhatsApp",
};

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/**
 * Captura os utm_* da URL atual e persiste em sessionStorage.
 * Idempotente: só sobrescreve se a URL atual realmente trouxer utm_source
 * (assim navegar pra outra seção sem UTM não apaga o que já foi capturado).
 * Chamar cedo, no mount da landing/páginas públicas.
 */
export function captureUtmParams(search?: string): void {
  try {
    const params = new URLSearchParams(
      search ?? (typeof window !== "undefined" ? window.location.search : "")
    );
    if (!params.get("utm_source")) return; // nada novo pra capturar

    const captured: UtmParams = {};
    UTM_KEYS.forEach((key) => {
      const val = params.get(key);
      if (val) captured[key] = val;
    });
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(captured));
  } catch {
    // sessionStorage indisponível (modo privado/SSR) — ignora silenciosamente.
  }
}

/** Lê o utm_source: sessionStorage primeiro, fallback pra URL atual. */
function readUtmSource(): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UtmParams;
      if (parsed.utm_source) return parsed.utm_source;
    }
  } catch {
    // ignora
  }
  try {
    if (typeof window !== "undefined") {
      const fromUrl = new URLSearchParams(window.location.search).get("utm_source");
      if (fromUrl) return fromUrl;
    }
  } catch {
    // ignora
  }
  return null;
}

/** Capitaliza a primeira letra (fallback p/ origem fora do mapa). */
function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** utm_source cru → nome amigável (ou capitalizado se fora do mapa). */
export function friendlyOriginLabel(rawSource: string): string {
  const key = rawSource.trim().toLowerCase();
  return SOURCE_LABELS[key] ?? capitalize(rawSource.trim());
}

/** Origem amigável do visitante atual, ou null se não houver utm_source. */
export function getLeadOriginLabel(): string | null {
  const source = readUtmSource();
  return source ? friendlyOriginLabel(source) : null;
}

// Pathname exato → fragmento da mensagem (em negrito o tópico quando faz sentido).
// Os paths batem com src/App.tsx (rotas de segmento, módulos e genéricas).
const PAGE_FRAGMENTS: Record<string, string> = {
  // Genéricos
  "/": "pelo site",
  "/precos": "pela página de planos",
  "/changelog": "pela página de novidades",

  // Segmentos (/sistema-para-*)
  "/sistema-para-refrigeracao": "pela página sobre *sistema pra refrigeração*",
  "/sistema-para-eletricistas": "pela página sobre *sistema pra eletricistas*",
  "/sistema-para-energia-solar": "pela página sobre *sistema pra energia solar*",
  "/sistema-para-provedores": "pela página sobre *sistema pra provedores*",
  "/sistema-para-cftv": "pela página sobre *sistema pra CFTV*",
  "/sistema-para-construcao-civil": "pela página sobre *sistema pra construção civil*",
  "/sistema-para-elevadores": "pela página sobre *sistema pra elevadores*",
  "/sistema-para-limpeza-conservacao": "pela página sobre *sistema pra limpeza e conservação*",
  "/sistema-para-dedetizacao": "pela página sobre *sistema pra dedetização*",

  // Módulos (aba Soluções)
  "/os-digital": "pela página sobre *OS Digital*",
  "/sistema-pmoc": "pela página sobre *PMOC*",
  "/sistema-crm": "pela página sobre *CRM*",
  "/controle-financeiro": "pela página sobre *Controle Financeiro*",
  "/ponto-e-folha": "pela página sobre *Ponto e Folha*",
  "/emissao-de-nfse": "pela página sobre *Emissão de NFS-e*",
  "/portal-do-cliente": "pela página sobre *Portal do Cliente*",
  "/controle-de-estoque": "pela página sobre *Controle de Estoque*",
  "/orcamentos-e-contratos": "pela página sobre *Orçamentos e Contratos*",
  "/rastreamento-de-equipes": "pela página sobre *Rastreamento de Equipes*",
  "/area-do-tecnico": "pela página sobre *Área do Técnico*",
};

const FRAGMENT_FALLBACK = "pelo site";

/** Normaliza o pathname: tira barra final (exceto a raiz "/"). */
function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "") || "/";
  }
  return pathname;
}

/**
 * Resolve o fragmento da mensagem a partir do pathname atual (ou passado).
 * - Match exato no mapa PAGE_FRAGMENTS.
 * - /blog e /blog/:slug → "pelo blog" (por prefixo).
 * - Qualquer outro não mapeado → "pelo site".
 */
export function getPageContextFragment(pathname?: string): string {
  let path: string;
  try {
    path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  } catch {
    path = "/";
  }
  path = normalizePathname(path);

  if (path === "/blog" || path.startsWith("/blog/")) return "pelo blog";

  return PAGE_FRAGMENTS[path] ?? FRAGMENT_FALLBACK;
}

/**
 * Monta a mensagem final do WhatsApp refletindo a página atual + a origem.
 * - Sem utm_source: "Olá! Vim ${fragment} da Dominex e gostaria de saber mais sobre o sistema."
 * - Com utm_source: "Olá! Vim ${fragment} da Dominex, que achei no *${origin}*, e gostaria de saber mais sobre o sistema."
 * @param fragmentOverride força o fragmento (default resolve pelo pathname atual).
 */
export function buildWhatsAppMessage(fragmentOverride?: string): string {
  const fragment = fragmentOverride ?? getPageContextFragment();
  const origin = getLeadOriginLabel();
  if (!origin) {
    return `Olá! Vim ${fragment} da Dominex e gostaria de saber mais sobre o sistema.`;
  }
  return `Olá! Vim ${fragment} da Dominex, que achei no *${origin}*, e gostaria de saber mais sobre o sistema.`;
}

/**
 * Monta a URL final wa.me já com a mensagem (página + origem).
 * Faz encodeURIComponent na mensagem (acentos e `*` passam corretos).
 */
export function buildWhatsAppUrl(number: string, fragmentOverride?: string): string {
  const message = buildWhatsAppMessage(fragmentOverride);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
