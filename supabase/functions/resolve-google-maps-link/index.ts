// resolve-google-maps-link
//
// Recebe um link do Google Maps de uma empresa e devolve o link de avaliação
// (writereview) pronto — SEM usar a Places API do Google (sem chave/billing).
//
// Como funciona: o "Feature ID" (par hexadecimal 0x...:0x...) embutido nas URLs
// do Maps codifica o place_id de forma reversível. O place_id "ChIJ..." é o
// base64url de uma mensagem protobuf com dois inteiros fixed64 (as duas metades
// do Feature ID). Calculamos localmente, sem chamar nenhuma API paga.
//
// Contrato:
//   POST { url: string } -> 200 { reviewUrl, placeId }
//   Erros (JSON):
//     401 { error: "unauthorized" }   — sem sessão
//     400 { error: "invalid_url" }    — não é link google maps / g.page
//     422 { error: "no_feature_id" }  — resolveu mas não achou o Feature ID
//     500 { error: "internal_error" } — falha inesperada
//
// Regra-lei 6: edge function privilegiada sempre valida Authorization.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function json(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

// ---------- base64url ----------
function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------- Feature ID -> place_id ----------
// place_id bytes = 0x0a 0x12 0x09 <partA: 8 bytes LE> 0x11 <partB: 8 bytes LE>
//   0x0a = campo 1, wire type 2 (length-delimited)
//   0x12 = comprimento 18
//     0x09 = campo 1, fixed64 -> partA (little-endian)
//     0x11 = campo 2, fixed64 -> partB (little-endian)
// O Feature ID na URL é escrito 0x<partA>:0x<partB>.
function writeLE64(v: bigint): number[] {
  const out: number[] = [];
  let x = v & ((1n << 64n) - 1n);
  for (let i = 0; i < 8; i++) {
    out.push(Number(x & 0xffn));
    x >>= 8n;
  }
  return out;
}

function featureIdToPlaceId(partA: bigint, partB: bigint): string {
  const bytes = new Uint8Array([
    0x0a,
    0x12,
    0x09,
    ...writeLE64(partA),
    0x11,
    ...writeLE64(partB),
  ]);
  return b64urlEncode(bytes);
}

// ---------- extração do Feature ID ----------
// Formas: !1s0x...:0x...  |  ftid=0x...:0x...  |  data=...!1s0x...:0x...
function extractFeatureId(url: string): { a: bigint; b: bigint } | null {
  const pair = url.match(/(?:!1s|ftid=)(0x[0-9a-fA-F]+):(0x[0-9a-fA-F]+)/);
  if (pair) {
    try {
      const a = BigInt(pair[1]);
      const b = BigInt(pair[2]);
      if (a > 0n && b > 0n) return { a, b };
    } catch {
      /* ignora */
    }
  }
  return null;
}

// ---------- resolução de links curtos ----------
function isShortLink(url: string): boolean {
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.page)/i.test(url);
}

function looksLikeMapsUrl(url: string): boolean {
  return /(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page)/i.test(
    url,
  );
}

async function expandShortLink(url: string): Promise<string> {
  let current = url;
  for (let i = 0; i < 5; i++) {
    let resp: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        resp = await fetch(current, {
          method: "GET",
          redirect: "manual",
          headers: { "User-Agent": BROWSER_UA },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      break;
    }
    const loc = resp.headers.get("location");
    // consome o corpo pra liberar a conexão
    try {
      await resp.body?.cancel();
    } catch {
      /* noop */
    }
    if (resp.status >= 300 && resp.status < 400 && loc) {
      current = loc.startsWith("http") ? loc : new URL(loc, current).toString();
      continue;
    }
    break;
  }
  return current;
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  // ---- Auth: sessão de usuário logado obrigatória (regra-lei 6)
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return json(req, { error: "unauthorized" }, 401);
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authed.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return json(req, { error: "unauthorized" }, 401);
    }

    // ---- Request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(req, { error: "invalid_url" }, 400);
    }
    const rawUrl = (body as { url?: unknown })?.url;
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return json(req, { error: "invalid_url" }, 400);
    }
    let url = rawUrl.trim();

    // Aceita URL sem esquema (colada da barra) -> prefixa https
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }
    if (!looksLikeMapsUrl(url)) {
      return json(req, { error: "invalid_url" }, 400);
    }

    // ---- Expande link curto se necessário
    let finalUrl = url;
    if (isShortLink(url)) {
      finalUrl = await expandShortLink(url);
    }

    // ---- Extrai Feature ID e monta o place_id
    const fid = extractFeatureId(finalUrl);
    if (!fid) {
      return json(req, { error: "no_feature_id" }, 422);
    }

    const placeId = featureIdToPlaceId(fid.a, fid.b);
    const reviewUrl = "https://search.google.com/local/writereview?placeid=" + placeId;

    return json(req, { reviewUrl, placeId }, 200);
  } catch (_e) {
    return json(req, { error: "internal_error" }, 500);
  }
});
