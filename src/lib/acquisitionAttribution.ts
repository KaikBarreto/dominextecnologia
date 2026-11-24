import {
  type AcquisitionAttribution,
  CAMPAIGN_KEYS,
  CLICK_ID_KEYS,
  sanitizeAcquisitionAttribution,
  sanitizeAcquisitionTouch,
} from "./acquisitionAttributionSchema";
const KEY = "dominex_acquisition_details_v1";
let lastCapturedUrl: string | null = null;
let referrerConsumed = false;
const WINDOW = 30 * 24 * 60 * 60 * 1000;
const UTM_FIELDS = {
  utm_campaign: "campaign",
  utm_term: "term",
  utm_content: "content",
  utm_id: "utm_id",
  utm_source_platform: "utm_source_platform",
  utm_creative_format: "utm_creative_format",
  utm_marketing_tactic: "utm_marketing_tactic",
} as const;
export function getAcquisitionAttribution(): AcquisitionAttribution | null {
  try {
    const parsed = sanitizeAcquisitionAttribution(
      JSON.parse(localStorage.getItem(KEY) || "null"),
    );
    if (!parsed?.first_touch.captured_at || !parsed.last_touch.captured_at) {
      return null;
    }
    const age = Date.now() - Date.parse(parsed.first_touch.captured_at);
    if (age < 0 || age > WINDOW) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function referrerSource(host: string) {
  if (
    /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/
      .test(host)
  ) return { source: host, medium: "ai_referral" };
  if (
    /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com)$/
      .test(host)
  ) return { source: host, medium: "organic" };
  return { source: host, medium: "referral" };
}
export function captureAcquisitionAttribution(search?: string): void {
  try {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    if (
      /^\/(?:admin|auth|login|reset-password|redefinir-senha|convite)(?:\/|$)/i
        .test(path)
    ) return;
    // Não transformar navegação autenticada do sistema em aquisição de um lead.
    if (Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k))) {
      return;
    }
    const captureUrl = path + "?" + (search ?? window.location.search);
    if (lastCapturedUrl === captureUrl) return;
    const params = new URLSearchParams(search ?? window.location.search);
    let host = "";
    try {
      const ref = new URL(referrerConsumed ? "" : document.referrer);
      if (
        ref.hostname.replace(/^www\./, "") !==
          location.hostname.replace(/^www\./, "")
      ) host = ref.hostname.replace(/^www\./, "").toLowerCase();
    } catch { /* sem referência */ }
    const clicks = Object.fromEntries(
      CLICK_ID_KEYS.filter((k) => params.get(k)).map((k) => [k, params.get(k)]),
    );
    const parameters = Object.fromEntries(
      CAMPAIGN_KEYS.filter((k) => params.get(k)).map((k) => [k, params.get(k)]),
    );
    const hasUtm = ["utm_source", "utm_medium", ...Object.keys(UTM_FIELDS)]
      .some((k) => !!params.get(k));
    const clickSource = ["gclid", "dclid", "gbraid", "wbraid"].some((k) =>
        clicks[k]
      )
      ? "google"
      : clicks.fbclid
      ? "facebook"
      : clicks.msclkid
      ? "bing"
      : clicks.ttclid
      ? "tiktok"
      : clicks.li_fat_id
      ? "linkedin"
      : clicks.twclid
      ? "x"
      : clicks.sccid
      ? "snapchat"
      : clicks.yclid
      ? "yandex"
      : clicks.epik
      ? "pinterest"
      : null;
    const existing = getAcquisitionAttribution();
    lastCapturedUrl = captureUrl;
    referrerConsumed = true;
    if (
      existing && !hasUtm && !clickSource && !Object.keys(parameters).length &&
      !host
    ) return;
    const inferred = host ? referrerSource(host) : null;
    const evidence = hasUtm
      ? "utm"
      : clickSource
      ? "click_id"
      : Object.keys(parameters).length
      ? "referral_link"
      : host
      ? "referrer"
      : "direct";
    const touch = sanitizeAcquisitionTouch({
      source: params.get("utm_source") || clickSource || params.get("origem") ||
        inferred?.source || (hasUtm ? "não informada" : "direct"),
      medium: params.get("utm_medium") ||
        (hasUtm || clickSource ? "não informado" : inferred?.medium || "none"),
      ...Object.fromEntries(
        Object.entries(UTM_FIELDS).map((
          [key, field],
        ) => [field, params.get(key)]),
      ),
      click_ids: clicks,
      parameters,
      referrer_host: host,
      page_path: path,
      locale: path.match(/^\/(en|es|fr)(?:\/|$)/)?.[1] || "pt-br",
      captured_at: new Date().toISOString(),
      evidence,
    });
    if (!touch) return;
    // Um mount repetido na mesma entrada não cria um novo contato artificial.
    const same = existing &&
      JSON.stringify({ ...existing.last_touch, captured_at: undefined }) ===
        JSON.stringify({ ...touch, captured_at: undefined });
    if (same) return;
    localStorage.setItem(
      KEY,
      JSON.stringify({
        first_touch: existing?.first_touch || touch,
        last_touch: touch,
      }),
    );
  } catch { /* captura best-effort não impede cadastro */ }
}
