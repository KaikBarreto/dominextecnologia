/**
 * Primitivas compartilhadas pela API publica Dominex.
 *
 * Este modulo nao acessa banco e nunca recebe/loga o header Authorization. Ele
 * concentra os limites e validacoes que precisam ser identicos nas duas edges.
 */

export const PUBLIC_API_MAX_BODY_BYTES = 64 * 1024;
export const PUBLIC_API_KEY_PREFIX = "dmx_live_";

export type JsonObject = Record<string, unknown>;

export class BodyTooLargeError extends Error {}

export function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOnlyKeys(
  value: JsonObject,
  allowed: readonly string[],
): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

export async function readJsonBody(
  req: Request,
  maxBytes = PUBLIC_API_MAX_BODY_BYTES,
): Promise<JsonObject> {
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new BodyTooLargeError();
  }

  if (!req.body) return {};
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  if (!text.trim()) return {};

  const parsed: unknown = JSON.parse(text);
  if (!isPlainObject(parsed)) throw new SyntaxError("JSON object required");
  return parsed;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/,
    "",
  );
}

export function randomPublicId(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(12)));
}

export function randomApiSecret(): string {
  // 32 bytes = 256 bits of entropy. Base64url without padding has 43 chars.
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export interface ParsedApiKey {
  publicId: string;
  secret: string;
}

export function parseApiKey(authorization: string | null): ParsedApiKey | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const raw = authorization.slice(7);
  const match = /^dmx_live_([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/.exec(raw);
  if (!match) return null;
  return { publicId: match[1], secret: match[2] };
}

export function publicApiPath(pathname: string): string {
  const functionMarker = "/public-api-v1";
  const functionIndex = pathname.indexOf(functionMarker);
  if (functionIndex >= 0) {
    const suffix = pathname.slice(functionIndex + functionMarker.length)
      .replace(/\/+$/, "");
    if (!suffix) return "/v1";
    return suffix === "/v1" || suffix.startsWith("/v1/")
      ? suffix
      : `/v1${suffix}`;
  }
  const v1Index = pathname.lastIndexOf("/v1/");
  if (v1Index >= 0) return pathname.slice(v1Index).replace(/\/+$/, "");
  if (pathname.endsWith("/v1")) return "/v1";
  return `/v1${pathname.startsWith("/") ? pathname : `/${pathname}`}`.replace(
    /\/+$/,
    "",
  );
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("Non-finite numbers are not valid JSON");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as JsonObject;
  return `{${
    Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    ).join(",")
  }}`;
}

export function requestIp(req: Request): string {
  // Estes headers sao sobrescritos pelo proxy/CDN em producao. Nunca confiar em
  // um header de IP vindo diretamente de um deployment sem proxy confiavel.
  const raw = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0] ??
    "unknown";
  return raw.trim().replace(/^\[|\]$/g, "").slice(0, 80);
}

export async function pseudonymizeIp(
  ip: string,
  pepper: string,
): Promise<string> {
  return await sha256Hex(`public-api-ip:v1:${pepper}:${ip}`);
}

function parseIpv4(value: string): bigint | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  let result = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    result = (result << 8n) | BigInt(octet);
  }
  return result;
}

function parseIpv6(value: string): bigint | null {
  let normalized = value.toLowerCase();
  const zone = normalized.indexOf("%");
  if (zone >= 0) normalized = normalized.slice(0, zone);

  // Converte IPv4 embutido (::ffff:192.0.2.1) em dois grupos hexadecimais.
  const lastColon = normalized.lastIndexOf(":");
  const tail = normalized.slice(lastColon + 1);
  if (tail.includes(".")) {
    const ipv4 = parseIpv4(tail);
    if (ipv4 === null) return null;
    const high = Number((ipv4 >> 16n) & 0xffffn).toString(16);
    const low = Number(ipv4 & 0xffffn).toString(16);
    normalized = `${normalized.slice(0, lastColon)}:${high}:${low}`;
  }

  if ((normalized.match(/::/g) ?? []).length > 1) return null;
  const [leftRaw, rightRaw] = normalized.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if (!normalized.includes("::") && left.length !== 8) return null;
  if (left.length + right.length > 8) return null;
  const groups = normalized.includes("::")
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  if (
    groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))
  ) {
    return null;
  }
  return groups.reduce((acc, part) => (acc << 16n) | BigInt(`0x${part}`), 0n);
}

function parsedIp(value: string): { bits: 32 | 128; value: bigint } | null {
  const v4 = parseIpv4(value);
  if (v4 !== null) return { bits: 32, value: v4 };
  const v6 = parseIpv6(value);
  return v6 === null ? null : { bits: 128, value: v6 };
}

export function isIpAllowed(ip: string, allowlist: unknown): boolean {
  if (!Array.isArray(allowlist) || allowlist.length === 0) return true;
  const candidate = parsedIp(ip);
  if (!candidate) return false;

  return allowlist.some((entry) => {
    if (typeof entry !== "string") return false;
    const [networkText, prefixText] = entry.trim().split("/");
    const network = parsedIp(networkText);
    if (!network || network.bits !== candidate.bits) return false;
    const prefix = prefixText === undefined ? network.bits : Number(prefixText);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > network.bits) {
      return false;
    }
    if (prefix === 0) return true;
    const shift = BigInt(network.bits - prefix);
    return (candidate.value >> shift) === (network.value >> shift);
  });
}

export function isValidIpOrCidr(entry: unknown): entry is string {
  if (typeof entry !== "string" || !entry.trim()) return false;
  const [networkText, prefixText, extra] = entry.trim().split("/");
  if (extra !== undefined) return false;
  const network = parsedIp(networkText);
  if (!network) return false;
  if (prefixText === undefined) return true;
  const prefix = Number(prefixText);
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= network.bits;
}

export function isIsoWithOffset(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value)
  ) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

export function normalizedDocument(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizedPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(trimmed)) return null;
  return trimmed;
}

export function publicApiHeaders(requestId: string): HeadersInit {
  return {
    "Cache-Control": "no-store, max-age=0",
    "X-Request-Id": requestId,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

export function apiJson(
  body: unknown,
  status: number,
  requestId: string,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...publicApiHeaders(requestId),
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

export function apiProblem(
  status: number,
  code: string,
  title: string,
  detail: string,
  requestId: string,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(
    JSON.stringify({
      type: `https://api.dominex.app/problems/${code.replaceAll("_", "-")}`,
      title,
      status,
      code,
      detail,
      request_id: requestId,
    }),
    {
      status,
      headers: {
        ...publicApiHeaders(requestId),
        "Content-Type": "application/problem+json; charset=utf-8",
        ...extraHeaders,
      },
    },
  );
}
