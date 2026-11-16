export const CLICK_ID_KEYS = [
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "ttclid",
  "li_fat_id",
  "twclid",
  "sccid",
  "yclid",
  "epik",
] as const;
export const CAMPAIGN_KEYS = [
  "campaign_id",
  "adset_id",
  "adgroup_id",
  "ad_id",
  "creative_id",
  "placement",
  "network",
  "device",
  "matchtype",
  "keyword",
  "origem",
  "vendedor",
  "afiliado",
  "ref",
] as const;
export interface AcquisitionTouch {
  source: string;
  medium: string;
  campaign?: string;
  term?: string;
  content?: string;
  utm_id?: string;
  utm_source_platform?: string;
  utm_creative_format?: string;
  utm_marketing_tactic?: string;
  referrer_host?: string;
  page_path?: string;
  locale?: string;
  captured_at?: string;
  evidence?: string;
  click_ids?: Record<string, string>;
  parameters?: Record<string, string>;
}
export interface AcquisitionAttribution {
  first_touch: AcquisitionTouch;
  last_touch: AcquisitionTouch;
}
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const clean = (value: unknown, max = 200) =>
  typeof value === "string"
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max)
    : "";
function pick(raw: unknown, keys: readonly string[], max: number) {
  const input = record(raw);
  const output: Record<string, string> = {};
  if (input) {
    for (const key of keys) {
      const value = clean(input[key], max);
      if (value) output[key] = value;
    }
  }
  return Object.keys(output).length ? output : undefined;
}
export function sanitizeAcquisitionTouch(
  value: unknown,
): AcquisitionTouch | null {
  const raw = record(value);
  if (!raw) return null;
  const source = clean(raw.source), medium = clean(raw.medium, 100);
  if (!source || !medium) return null;
  const out: AcquisitionTouch = { source, medium };
  for (
    const key of [
      "campaign",
      "term",
      "content",
      "utm_id",
      "utm_source_platform",
      "utm_creative_format",
      "utm_marketing_tactic",
    ] as const
  ) {
    const v = clean(raw[key]);
    if (v) out[key] = v;
  }
  const host = clean(raw.referrer_host, 200).toLowerCase();
  if (/^[a-z0-9.-]+$/.test(host)) out.referrer_host = host;
  const path = clean(raw.page_path, 500).split(/[?#]/)[0];
  if (path.startsWith("/") && !path.startsWith("//")) out.page_path = path;
  const locale = clean(raw.locale, 10);
  if (/^[a-z]{2}(?:-[a-z]{2})?$/i.test(locale)) out.locale = locale;
  const date = clean(raw.captured_at, 40);
  if (date && Number.isFinite(Date.parse(date))) {
    out.captured_at = new Date(date).toISOString();
  }
  if (
    ["utm", "click_id", "referrer", "direct", "referral_link"].includes(
      String(raw.evidence),
    )
  ) out.evidence = String(raw.evidence);
  out.click_ids = pick(raw.click_ids, CLICK_ID_KEYS, 500);
  out.parameters = pick(raw.parameters, CAMPAIGN_KEYS, 200);
  return out;
}
export function sanitizeAcquisitionAttribution(
  value: unknown,
): AcquisitionAttribution | null {
  const raw = record(value);
  if (!raw) return null;
  const first = sanitizeAcquisitionTouch(raw.first_touch),
    last = sanitizeAcquisitionTouch(raw.last_touch);
  return first && last ? { first_touch: first, last_touch: last } : null;
}
