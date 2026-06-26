// time-clock-portal — edge anon-safe do ponto por link público (/ponto/:slug).
//
// Roda com SERVICE_ROLE. O front anônimo nunca lê employees/time_records direto
// (o RLS bloquearia) — tudo passa por aqui. Resolve o funcionário SÓ pelo
// `ponto_slug` (+ `ponto_enabled=true`); jamais aceita company_id/employee_id do
// body. Branding via allowlist explícita (NUNCA to_jsonb da linha inteira).
//
// CORS: Origin "*" porque o link é aberto em qualquer device/origem (QR, etc).
// Access-Control-Allow-Headers inclui `apikey` + `x-client-info` (senão o
// preflight do browser falha — curl/server-side passariam, dando falso saudável).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PUNCH_ORDER = ["clock_in", "break_start", "break_end", "clock_out"] as const;
type PunchType = (typeof PUNCH_ORDER)[number];

// ── Anti-abuso ───────────────────────────────────────────────────────────────
//  1) Rate-limit por IP em memória do isolate (anti-rajada, efêmero — reset no
//     cold start; NÃO é o controle de integridade, só freia rajada).
//  2) Teto persistente por slug/dia contado em time_records (à prova de reset).
//  3) Validação de `type` contra `next_action` recalculado server-side: por
//     construção já barra bater fora de ordem e duplicar a mesma ação.
const ipHits = new Map<string, { count: number; resetAt: number }>();
const IP_MAX = 30; // requests por janela
const IP_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_PUNCHES_PER_SLUG_PER_DAY = 20;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= IP_MAX;
}

// "Hoje" no fuso BRT (UTC-3 fixo, regra-lei de timezone do projeto): pega o agora
// em UTC, subtrai 3h e formata YYYY-MM-DD. Evita off-by-one ao agrupar por dia.
function todayBRT(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

function nextActionFrom(types: Set<string>): PunchType | null {
  for (const t of PUNCH_ORDER) {
    if (!types.has(t)) return t;
  }
  return null; // dia fechado
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Decodifica data URL ou base64 puro em bytes. Retorna null se inválido.
function decodeBase64Image(input: string): Uint8Array | null {
  try {
    const comma = input.indexOf(",");
    const raw = input.startsWith("data:") && comma !== -1
      ? input.slice(comma + 1)
      : input;
    const binary = atob(raw.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

type ImageType = "jpeg" | "png" | "webp";

const IMAGE_META: Record<ImageType, { ext: string; contentType: string }> = {
  jpeg: { ext: "jpg", contentType: "image/jpeg" },
  png: { ext: "png", contentType: "image/png" },
  webp: { ext: "webp", contentType: "image/webp" },
};

// Detecta o tipo real pelos magic bytes: JPEG (FF D8 FF), PNG (89 50 4E 47),
// WebP (RIFF....WEBP). Retorna null pra qualquer outra coisa (payload não-imagem).
// Fonte única da verdade pra validação E pra escolha de extensão/content-type.
function detectImageType(b: Uint8Array): ImageType | null {
  if (b.length < 12) return null;
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  // WebP: "RIFF" .... "WEBP"
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkIpRateLimit(clientIp)) {
    return jsonResponse(
      { error: "Muitas requisições. Aguarde um instante e tente novamente." },
      429,
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";

    if (!slug) {
      return jsonResponse({ error: "Link inválido." }, 400);
    }

    // Resolução ÚNICA e exclusiva pelo slug (precisa estar habilitado). Tudo
    // (companyId, employeeId) deriva daqui — o body NUNCA escolhe empresa/func.
    const { data: employee } = await supabase
      .from("employees")
      .select("id, name, position, photo_url, company_id, ponto_enabled")
      .eq("ponto_slug", slug)
      .eq("ponto_enabled", true)
      .maybeSingle();

    if (!employee) {
      return jsonResponse({ error: "Link inválido ou desativado." }, 404);
    }

    const companyId = employee.company_id as string;
    const dateBRT = todayBRT();

    // Settings da company (defaults se não houver linha). Cliente NÃO escolhe.
    const { data: settingsRow } = await supabase
      .from("time_settings")
      .select("require_selfie, require_geolocation")
      .eq("company_id", companyId)
      .maybeSingle();

    const settings = {
      require_selfie: settingsRow?.require_selfie ?? true,
      require_geolocation: settingsRow?.require_geolocation ?? true,
    };

    // Registros de hoje (BRT) ordenados — base do next_action e do teto/dia.
    // NÃO seleciona address: o link é compartilhável (anônimo) e a localização do
    // funcionário não pode vazar no payload público (LGPD). A batida continua
    // gravando lat/long/address no register_punch (evidência pro admin autenticado).
    const { data: todayRecords } = await supabase
      .from("time_records")
      .select("type, recorded_at")
      .eq("employee_id", employee.id)
      .eq("date", dateBRT)
      .order("recorded_at", { ascending: true });

    const records = todayRecords ?? [];
    const typesToday = new Set(records.map((r) => r.type as string));
    const nextAction = nextActionFrom(typesToday);

    // Branding white-label seguro: allowlist explícita de company_settings.
    // PROIBIDO to_jsonb(cs)/select('*') — só os campos de marca do header.
    async function loadBranding() {
      const { data: cs } = await supabase
        .from("company_settings")
        .select(
          "name, logo_url, white_label_enabled, white_label_primary_color, white_label_logo_url, white_label_icon_url, report_header_bg_color, report_header_text_color, report_header_logo_size, report_header_logo_type, report_header_show_logo_bg, report_header_logo_bg_color, report_status_bar_color",
        )
        .eq("company_id", companyId)
        .maybeSingle();
      return {
        name: cs?.name ?? null,
        logo_url: cs?.logo_url ?? null,
        white_label_enabled: cs?.white_label_enabled ?? false,
        white_label_primary_color: cs?.white_label_primary_color ?? null,
        white_label_logo_url: cs?.white_label_logo_url ?? null,
        white_label_icon_url: cs?.white_label_icon_url ?? null,
        report_header_bg_color: cs?.report_header_bg_color ?? null,
        report_header_text_color: cs?.report_header_text_color ?? null,
        report_header_logo_size: cs?.report_header_logo_size ?? null,
        report_header_logo_type: cs?.report_header_logo_type ?? null,
        report_header_show_logo_bg: cs?.report_header_show_logo_bg ?? null,
        report_header_logo_bg_color: cs?.report_header_logo_bg_color ?? null,
        report_status_bar_color: cs?.report_status_bar_color ?? null,
      };
    }

    // ── get_state ────────────────────────────────────────────────────────────
    if (action === "get_state") {
      const company = await loadBranding();
      return jsonResponse({
        // Sem `id`: o front não usa e expor o employee_id num link público é
        // superfície de ataque desnecessária. Só dados de exibição do header.
        employee: {
          name: employee.name,
          position: employee.position ?? null,
          photo_url: employee.photo_url ?? null,
        },
        company,
        settings,
        // Só tipo + horário da batida. Sem `address` (privacidade — ver acima).
        today: records.map((r) => ({
          type: r.type,
          recorded_at: r.recorded_at,
        })),
        next_action: nextAction,
      });
    }

    // ── register_punch ───────────────────────────────────────────────────────
    if (action === "register_punch") {
      const type = body?.type as string;
      const latitude = typeof body?.latitude === "number" ? body.latitude : null;
      const longitude = typeof body?.longitude === "number" ? body.longitude : null;
      const address = typeof body?.address === "string" ? body.address : null;
      const photoBase64 =
        typeof body?.photo_base64 === "string" ? body.photo_base64 : null;
      const deviceInfo = body?.device_info ?? null;

      // Anti-duplicado/corrida: o type precisa ser EXATAMENTE o next_action
      // recalculado server-side. Barra "bater entrada 2x" e qualquer ordem fora.
      if (!type || type !== nextAction) {
        return jsonResponse(
          { error: "Esta ação não está disponível agora. Recarregue a página e tente novamente." },
          409,
        );
      }

      // Teto duro por slug/dia (persistente). O fluxo normal nunca passa de 4;
      // este teto cobre cenários degenerados/abuso.
      if (records.length >= MAX_PUNCHES_PER_SLUG_PER_DAY) {
        return jsonResponse(
          { error: "Limite de registros do dia atingido." },
          429,
        );
      }

      // Exigências configuráveis (vêm de time_settings, não do cliente).
      if (settings.require_selfie && !photoBase64) {
        return jsonResponse({ error: "A selfie é obrigatória." }, 400);
      }
      if (
        settings.require_geolocation &&
        (latitude === null || longitude === null)
      ) {
        return jsonResponse({ error: "A localização é obrigatória." }, 400);
      }

      // Sobe a foto (se houver) no bucket time-photos (padrão Dominex: photo_url).
      // Path derivado server-side de companyId/employeeId — nunca da URL do cliente.
      let photoUrl: string | null = null;
      if (photoBase64) {
        const bytes = decodeBase64Image(photoBase64);
        if (!bytes) {
          return jsonResponse({ error: "Selfie inválida." }, 400);
        }
        // Teto de tamanho (anti-DoS): o client comprime a selfie antes de mandar,
        // então 3MB é folga. Acima disso, recusa antes de tocar o Storage.
        const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // 3MB
        if (bytes.length > MAX_PHOTO_BYTES) {
          return jsonResponse({ error: "Selfie muito grande." }, 413);
        }
        // Magic bytes: aceita só JPEG / PNG / WebP. O client sempre manda imagem;
        // qualquer outra coisa é payload malicioso. O tipo detectado também
        // define a extensão e o content-type reais (selfie agora vem em WebP).
        const imageType = detectImageType(bytes);
        if (!imageType) {
          return jsonResponse({ error: "Selfie inválida." }, 400);
        }
        const { ext, contentType } = IMAGE_META[imageType];
        const path =
          `${companyId}/${employee.id}/${dateBRT}-${type}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("time-photos")
          .upload(path, bytes, { contentType, upsert: false });
        if (uploadError) {
          console.error("[time-clock-portal] upload error:", uploadError.message);
          return jsonResponse({ error: "Falha ao salvar a selfie." }, 500);
        }
        const { data: urlData } = supabase.storage
          .from("time-photos")
          .getPublicUrl(path);
        photoUrl = urlData.publicUrl;
      }

      const recordedAt = new Date().toISOString();
      const { error: insertError } = await supabase
        .from("time_records")
        .insert({
          company_id: companyId,
          user_id: null,
          employee_id: employee.id,
          date: dateBRT,
          type,
          recorded_at: recordedAt,
          latitude,
          longitude,
          address,
          photo_url: photoUrl,
          device_info: deviceInfo,
          source: "link_publico",
          is_valid: true,
        });

      if (insertError) {
        console.error("[time-clock-portal] insert error:", insertError.message);
        return jsonResponse({ error: "Falha ao registrar o ponto." }, 500);
      }

      // Recalcula o espelho do dia (best-effort — o registro já está gravado).
      const { error: rpcError } = await supabase.rpc("recompute_time_sheet", {
        p_company_id: companyId,
        p_employee_id: employee.id,
        p_date: dateBRT,
      });
      if (rpcError) {
        console.error("[time-clock-portal] recompute error:", rpcError.message);
      }

      return jsonResponse({ success: true, type, recorded_at: recordedAt });
    }

    return jsonResponse({ error: "Ação desconhecida." }, 400);
  } catch (error) {
    console.error("[time-clock-portal] unhandled error:", error);
    return jsonResponse({ error: "Erro interno. Tente novamente." }, 500);
  }
});
