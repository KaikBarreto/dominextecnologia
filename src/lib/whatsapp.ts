// Helper central das CTAs de WhatsApp da landing / páginas públicas de aquisição.
//
// Objetivo: montar a URL final do WhatsApp (wa.me) já com a ORIGEM do lead
// embutida na mensagem quando a pessoa chegou com `utm_source` na URL.
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

/**
 * Monta a mensagem final do WhatsApp.
 * - Com origem: "Oi, cheguei no *Site* do Dominex através do *Instagram* e gostaria de mais informações"
 * - Sem origem: usa `fallbackMessage` (a mensagem que a CTA já usava).
 * @param contextLabel rótulo do contexto de entrada em negrito (default "Site")
 */
export function buildWhatsAppMessage(
  fallbackMessage: string,
  contextLabel = "Site"
): string {
  const origin = getLeadOriginLabel();
  if (!origin) return fallbackMessage;
  return `Oi, cheguei no *${contextLabel}* do Dominex através do *${origin}* e gostaria de mais informações`;
}

/**
 * Monta a URL final wa.me já com a mensagem (com origem quando houver).
 * Faz encodeURIComponent na mensagem (acentos e `*` passam corretos).
 */
export function buildWhatsAppUrl(
  number: string,
  fallbackMessage: string,
  contextLabel = "Site"
): string {
  const message = buildWhatsAppMessage(fallbackMessage, contextLabel);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
