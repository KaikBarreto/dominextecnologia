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

import { MESSAGES } from "@/lib/i18n/messages";
import { DEFAULT_LOCALE, type LocaleCode } from "@/lib/i18n/locales";
import { localeFromPath, stripLocale } from "@/lib/i18n/paths";
import { resolveSlug } from "@/lib/i18n/slugRegistry";

const SESSION_KEY = "dominex_utm_params";

// utm_source cru → nome amigável exibido na mensagem.
const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  ig: "Instagram",
  chatgpt: "ChatGPT",
  openai: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  copilot: "Copilot",
  claude: "Claude",
  google: "Google",
  duckduckgo: "DuckDuckGo",
  yahoo: "Yahoo",
  ecosia: "Ecosia",
  facebook: "Facebook",
  fb: "Facebook",
  threads: "Threads",
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

/** Lê o utm_medium pelo mesmo caminho do utm_source (sessionStorage, fallback URL). */
function readUtmMedium(): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UtmParams;
      if (parsed.utm_medium) return parsed.utm_medium;
    }
  } catch {
    // ignora
  }
  try {
    if (typeof window !== "undefined") {
      const fromUrl = new URLSearchParams(window.location.search).get("utm_medium");
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

/**
 * Normaliza um utm_source cru pra uma chave de lookup estável, tolerando o
 * valor vir como HOST (e não como palavra solta) — é o caso real do ChatGPT,
 * que manda utm_source=chatgpt.com e não "chatgpt".
 *
 * Passos: tira protocolo/path, tira prefixo de redirecionador comum
 * (l./lm./m./out., tipo l.instagram.com, lm.facebook.com), tira "www.", e por
 * fim usa o primeiro rótulo do domínio como chave (google.com → google,
 * chatgpt.com → chatgpt). "youtu.be" tem alias dedicado porque o primeiro
 * rótulo ("youtu") não bate com a chave "youtube" já mapeada.
 */
function normalizeSourceKey(raw: string): string {
  let v = raw.trim().toLowerCase();
  if (!v) return v;

  v = v.replace(/^https?:\/\//, "");
  v = v.split(/[/?#]/)[0]; // só o host, sem path/query

  // prefixo de redirecionador (só remove se sobrar domínio de verdade depois)
  v = v.replace(/^(l|lm|m|out)\.(?=[^.]+\.)/, "");
  v = v.replace(/^www\./, "");

  const HOST_ALIASES: Record<string, string> = {
    "youtu.be": "youtube",
    "wa.me": "whatsapp",
  };
  if (HOST_ALIASES[v]) return HOST_ALIASES[v];

  if (v.includes(".")) {
    const label = v.split(".")[0];
    return label || v;
  }
  return v;
}

/**
 * utm_source cru → nome amigável pra MENSAGEM de WhatsApp ("...que achei no
 * *ChatGPT*"). Fora do mapa, capitaliza o valor original (não o normalizado)
 * — é só texto de copy, não precisa casar em catálogo nenhum.
 */
export function friendlyOriginLabel(rawSource: string): string {
  const trimmed = rawSource.trim();
  const key = normalizeSourceKey(trimmed);
  return SOURCE_LABELS[key] ?? capitalize(trimmed);
}

/** Origem amigável do visitante atual, ou null se não houver utm_source. */
export function getLeadOriginLabel(): string | null {
  const source = readUtmSource();
  return source ? friendlyOriginLabel(source) : null;
}

// ── Origem gravada em companies.origin (dado, não copy) ───────────────────────
//
// friendlyOriginLabel()/getLeadOriginLabel() acima alimentam a MENSAGEM de
// WhatsApp e podem devolver qualquer texto (é só copy: "achei no *Chatgpt*").
// resolveCompanyOriginKey() é outra coisa: o valor dela é uma CHAVE CANÔNICA
// ESTÁVEL (`company_origins.utm_key`), não o nome da origem. O nome exibido/
// gravado é resolvido depois, em runtime, contra o catálogo vindo da RPC
// `get_signup_origins()` — nunca hardcoded aqui. Hardcoded, se o CEO renomear
// uma origem no painel, o site continua gravando o nome antigo (a trigger do
// banco propaga o nome novo pro histórico, mas o client nunca manda o nome
// novo): foi assim que "Chatgpt.com" e "Site" sujos foram gravados em
// produção. Por isso as duas funções não compartilham resultado, só a leitura
// de UTM.

/**
 * Chave canônica de origem, estável mesmo que o nome da origem no catálogo
 * `company_origins` seja renomeado pelo painel admin. Bate 1:1 com
 * `company_origins.utm_key`.
 */
export type OriginUtmKey = 'paid' | 'search' | 'ai' | 'social' | 'video' | 'messaging' | 'other';

const PAID_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "paid",
  "paid_social",
  "display",
  "paidsearch",
]);

const PAID_SOURCE_HINTS = new Set([
  "google_ads",
  "googleads",
  "gads",
  "meta_ads",
  "fbads",
  "facebook_ads",
]);

/**
 * Chave canônica de origem a ser casada contra `company_origins.utm_key` (via
 * catálogo carregado em runtime, ex.: `get_signup_origins()`). Nunca o texto
 * cru da UTM, e nunca o NOME da origem — quem traduz chave → nome é o
 * catálogo.
 *
 * Ordem de resolução:
 *   1. Mídia paga ganha de tudo (utm_medium=cpc/ppc/paid/... ou utm_source de
 *      gerenciador de anúncio) → 'paid', de propósito: tráfego pago é
 *      atribuído pela UTM, não é "escolha" da pessoa no cadastro.
 *   2. utm_source normalizado mapeado pra um balde conhecido do catálogo.
 *   3. utm_source presente mas não reconhecido → 'other' (nunca o texto cru).
 *   4. Sem utm_source nenhum → null (sem sinal, sem origem).
 */
export function resolveCompanyOriginKey(): OriginUtmKey | null {
  const rawSource = readUtmSource();
  const rawMedium = readUtmMedium();

  const normalizedMedium = rawMedium?.trim().toLowerCase() ?? "";
  const normalizedSource = rawSource ? normalizeSourceKey(rawSource) : "";

  if (PAID_MEDIUMS.has(normalizedMedium) || PAID_SOURCE_HINTS.has(normalizedSource)) {
    return "paid";
  }

  if (!rawSource) return null;
  if (!normalizedSource) return "other";

  if (["google", "bing", "duckduckgo", "yahoo", "ecosia", "site"].includes(normalizedSource)) {
    return "search";
  }
  if (
    ["chatgpt", "openai", "perplexity", "gemini", "copilot", "claude"].includes(
      normalizedSource,
    )
  ) {
    return "ai";
  }
  if (["instagram", "ig", "facebook", "fb", "threads"].includes(normalizedSource)) {
    return "social";
  }
  if (["youtube", "yt"].includes(normalizedSource)) {
    return "video";
  }
  if (["whatsapp", "wa"].includes(normalizedSource)) {
    return "messaging";
  }

  return "other";
}

// ── Fragmento da mensagem, por LOCALE ─────────────────────────────────────────
//
// O fragmento reflete a PÁGINA atual e é montado por LOCALE + slug-aware:
//   • Genéricos (home, planos, blog, novidades): mapa fixo por locale.
//   • Segmento/módulo: resolvido pela KEY canônica (via resolveSlug) e o LABEL
//     traduzido do i18n (MESSAGES[locale].segmentLabels/moduleLabels), embrulhado
//     no template "sobre *X*" / "about *X*" do idioma. Assim /en/refrigeration-hvac-
//     software vira "about *Refrigeration & HVAC*", sem duplicar rótulos.
//
// Cada locale sem template próprio cai no pt-br (fonte). pt-br, en, es e fr têm
// templates nativos. Locale desconhecido futuro cai no pt-br via fallback.

interface FragmentPack {
  /** Fragmentos de páginas genéricas (chave estável, independente de idioma). */
  generic: {
    home: string;
    pricing: string;
    changelog: string;
    blog: string;
  };
  /** Fallback quando a página não é reconhecida. */
  fallback: string;
  /** Monta "sobre *X*" a partir do label já traduzido do segmento/módulo. */
  aboutTopic: (topicLabel: string) => string;
}

const FRAGMENTS: Record<LocaleCode, FragmentPack> = {
  "pt-br": {
    generic: {
      home: "pelo site",
      pricing: "pela página de planos",
      changelog: "pela página de novidades",
      blog: "pelo blog",
    },
    fallback: "pelo site",
    aboutTopic: (t) => `pela página sobre *${t}*`,
  },
  en: {
    generic: {
      home: "from the website",
      pricing: "from the pricing page",
      changelog: "from the changelog page",
      blog: "from the blog",
    },
    fallback: "from the website",
    aboutTopic: (t) => `from the *${t}* page`,
  },
  es: {
    generic: {
      home: "desde el sitio web",
      pricing: "desde la página de planes",
      changelog: "desde la página de novedades",
      blog: "desde el blog",
    },
    fallback: "desde el sitio web",
    aboutTopic: (t) => `desde la página sobre *${t}*`,
  },
  fr: {
    generic: {
      home: "depuis le site web",
      pricing: "depuis la page des tarifs",
      changelog: "depuis la page des nouveautés",
      blog: "depuis le blog",
    },
    fallback: "depuis le site web",
    aboutTopic: (t) => `depuis la page sur *${t}*`,
  },
};

/** Pacote de fragmentos do locale (com fallback pt-br caso o locale não exista). */
function fragmentPack(locale: LocaleCode): FragmentPack {
  return FRAGMENTS[locale] ?? FRAGMENTS[DEFAULT_LOCALE];
}

// ── Templates da mensagem completa, por LOCALE ────────────────────────────────

interface MessagePack {
  /** Sem origem (utm_source). */
  noOrigin: (fragment: string) => string;
  /** Com origem amigável. */
  withOrigin: (fragment: string, origin: string) => string;
}

const MESSAGE_TEMPLATES: Record<LocaleCode, MessagePack> = {
  "pt-br": {
    noOrigin: (f) => `Olá! Vim ${f} da Dominex e gostaria de saber mais sobre o sistema.`,
    withOrigin: (f, o) =>
      `Olá! Vim ${f} da Dominex, que achei no *${o}*, e gostaria de saber mais sobre o sistema.`,
  },
  en: {
    noOrigin: (f) => `Hi! I came ${f} and I'd like to learn more about Dominex.`,
    withOrigin: (f, o) =>
      `Hi! I came ${f}, which I found on *${o}*, and I'd like to learn more about Dominex.`,
  },
  es: {
    noOrigin: (f) =>
      `Hola, llegué ${f} de Dominex y me gustaría saber más sobre el sistema.`,
    withOrigin: (f, o) =>
      `Hola, llegué ${f} de Dominex, que encontré en *${o}*, y me gustaría saber más sobre el sistema.`,
  },
  fr: {
    noOrigin: (f) =>
      `Bonjour, je viens ${f} de Dominex et j'aimerais en savoir plus sur le système.`,
    withOrigin: (f, o) =>
      `Bonjour, je viens ${f} de Dominex, que j'ai trouvé sur *${o}*, et j'aimerais en savoir plus sur le système.`,
  },
};

/** Pacote de mensagem do locale (com fallback pt-br caso o locale não exista). */
function messagePack(locale: LocaleCode): MessagePack {
  return MESSAGE_TEMPLATES[locale] ?? MESSAGE_TEMPLATES[DEFAULT_LOCALE];
}

/** Normaliza o pathname: tira barra final (exceto a raiz "/"). */
function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "") || "/";
  }
  return pathname;
}

/**
 * Resolve o fragmento da mensagem a partir do pathname atual (ou passado) + locale.
 * - Genéricos (home, planos, novidades, blog): mapa por locale.
 * - Segmento/módulo: resolve a KEY canônica (slug-aware, funciona sob /en/<slug-en>)
 *   e usa o label traduzido do i18n embrulhado em "sobre *X*"/"about *X*".
 * - Qualquer outro não reconhecido → fallback do locale.
 * O locale, se não informado, é derivado do próprio pathname.
 */
export function getPageContextFragment(pathname?: string, locale?: LocaleCode): string {
  let rawPath: string;
  try {
    rawPath = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  } catch {
    rawPath = "/";
  }
  rawPath = normalizePathname(rawPath);

  const loc = locale ?? localeFromPath(rawPath);
  const pack = fragmentPack(loc);

  // Path canônico pt-br (sem prefixo de idioma) pra casar genéricos e o slug.
  const base = stripLocale(rawPath);

  if (base === "/") return pack.generic.home;
  if (base === "/precos") return pack.generic.pricing;
  if (base === "/changelog") return pack.generic.changelog;
  if (base === "/blog" || base.startsWith("/blog/")) return pack.generic.blog;

  // Segmento/módulo: 1º segmento do path é o slug do idioma → resolve pra KEY.
  const slug = base.replace(/^\/+/, "").split("/")[0];
  if (slug) {
    const key = resolveSlug(slug, loc);
    if (key) {
      const msgs = MESSAGES[loc] ?? MESSAGES[DEFAULT_LOCALE];
      const label =
        (msgs.segmentLabels as Record<string, string>)[key] ??
        (msgs.moduleLabels as Record<string, string>)[key];
      if (label) return pack.aboutTopic(label);
    }
  }

  return pack.fallback;
}

/**
 * Monta a mensagem final do WhatsApp refletindo a página atual + a origem, no
 * idioma informado (default = derivado do pathname atual).
 * - Sem utm_source: template `noOrigin` do locale.
 * - Com utm_source: template `withOrigin` do locale (com a origem amigável).
 * @param fragmentOverride força o fragmento (default resolve pelo pathname/locale).
 * @param locale idioma da mensagem (default = derivado do pathname atual).
 */
export function buildWhatsAppMessage(fragmentOverride?: string, locale?: LocaleCode): string {
  const loc = locale ?? localeFromPath(
    typeof window !== "undefined" ? window.location.pathname : "/",
  );
  const fragment = fragmentOverride ?? getPageContextFragment(undefined, loc);
  const origin = getLeadOriginLabel();
  const pack = messagePack(loc);
  return origin ? pack.withOrigin(fragment, origin) : pack.noOrigin(fragment);
}

/**
 * Monta a URL final wa.me já com a mensagem (página + origem), no idioma dado.
 * Faz encodeURIComponent na mensagem (acentos e `*` passam corretos).
 */
export function buildWhatsAppUrl(
  number: string,
  fragmentOverride?: string,
  locale?: LocaleCode,
): string {
  const message = buildWhatsAppMessage(fragmentOverride, locale);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
