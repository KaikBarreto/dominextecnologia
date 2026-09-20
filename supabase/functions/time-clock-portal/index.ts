// time-clock-portal — edge anon-safe do ponto por link público.
//
// Duas portas, um só servidor:
//   - link PESSOAL  /ponto/:slug            → identidade { slug }
//   - QUIOSQUE      /ponto/empresa/:kslug   → identidade { kiosk_slug, employee_id }
//
// Roda com SERVICE_ROLE. O front anônimo nunca lê employees/time_records direto
// (o RLS bloquearia) — tudo passa por aqui. No link pessoal resolve o
// funcionário SÓ pelo `ponto_slug` (+ `ponto_enabled=true`); no quiosque resolve
// a EMPRESA pelo `companies.ponto_kiosk_slug` e o funcionário pelo par
// (empresa do slug + employee_id), sempre com `ponto_enabled=true` e
// `is_active=true`. O body JAMAIS escolhe company_id, data ou fuso.
//
// PIN: quem tem PIN cadastrado (employee_ponto_pins) só recebe estado e só
// registra ponto depois de acertar. O gate roda DEPOIS do gate de módulo e ANTES
// de qualquer leitura de histórico ou escrita — vale nas duas portas. Quem NÃO
// tem PIN (hoje, todo mundo) passa reto pelo mesmo caminho de sempre.
//
// ⚠️ Aqui não existe RLS aplicável: service_role bypassa policy e o chamador é
// anônimo. Logo, **a allowlist do payload É o controle de acesso** — campo que
// não está na regra está PROIBIDO, mesmo que exista na tabela. Regra completa,
// campo a campo: docs/planos/2026-09-16-regra-exposicao-quiosque-ponto.md.
// Branding via allowlist explícita (NUNCA to_jsonb da linha inteira / select('*')).
//
// CORS: Origin "*" porque o link é aberto em qualquer device/origem (QR, etc).
// Access-Control-Allow-Headers inclui `apikey` + `x-client-info` (senão o
// preflight do browser falha — curl/server-side passariam, dando falso saudável).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  deriveDayStatus,
  looksLikeKioskBody,
  nextActionFrom,
  parsePontoIdentity,
  pinGateDecision,
  type PinVerdict,
  type PontoIdentity,
} from "../_shared/ponto-kiosk.ts";
import {
  calibrationAllowedKeys,
  faceMatchAllowedKeys,
  hasOnlyKeys,
  isValidFaceCalibrationPayload,
  isValidFaceMatchPayload,
} from "../_shared/face-biometrics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Anti-abuso ───────────────────────────────────────────────────────────────
//  1) Rate-limit por IP em memória do isolate (anti-rajada, efêmero — reset no
//     cold start; NÃO é o controle de integridade, só freia rajada).
//     TETO SUBIU DE 30 PRA 120/min POR CAUSA DO QUIOSQUE: num tablet fixo o time
//     inteiro bate pelo MESMO IP dentro do mesmo minuto (20 pessoas × ~3
//     requisições = 60, contando get_kiosk → get_state → register_punch e o
//     refetch da lista depois de cada batida). Com 30/min o quiosque se
//     autobloqueia às 8h, no pico do movimento — e mesmo sem quiosque 30 já
//     apertava quem bate pelo Wi-Fi compartilhado da empresa.
//  2) Teto persistente por FUNCIONÁRIO/dia contado em time_records (à prova de
//     reset de isolate). É por funcionário, nunca por slug do quiosque: senão a
//     20ª batida do dia travaria a empresa inteira.
//  3) Validação de `type` contra `next_action` recalculado server-side: por
//     construção já barra bater fora de ordem e duplicar a mesma ação.
//     ESTE é o controle de integridade real do ponto. O limite por IP mora na
//     memória do isolate, some no cold start e não é compartilhado entre
//     isolates — é um teto "mais ou menos" e nunca pode ser citado como razão
//     pra relaxar qualquer outra checagem.
const ipHits = new Map<string, { count: number; resetAt: number }>();
const IP_MAX = 120; // requests por janela
const IP_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_PUNCHES_PER_EMPLOYEE_PER_DAY = 20;
const MAX_REQUEST_BYTES = 5 * 1024 * 1024;
const MAX_FACE_CALIBRATION_BYTES = 96 * 1024;
const MAX_FACE_MATCH_BYTES = 96 * 1024;

class RequestTooLargeError extends Error {}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestTooLargeError();
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
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new RequestTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  if (!text) return {};
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

// ── Chaves de exposição (§10 da regra — trocar é UMA linha) ──────────────────
// Cargo do funcionário na lista PÚBLICA do quiosque. Padrão restritivo: NÃO sai.
// É dado de vínculo empregatício numa página sem login, aberta num tablet de
// balcão que cliente e visitante também enxergam. Some do payload sem prejuízo
// funcional. Ligar depende de decisão do CEO (§10.1).
const KIOSK_EXPOSE_POSITION: boolean = false;

// Gate do módulo `rh` no LINK PESSOAL. Desligado de propósito (divergência
// deliberada da §5.2, decidida depois do documento):
//   O módulo de RH na Dominex é `'rh'` e `'rh'` só entra nos planos maiores — o
//   plano `start` tem included_modules = ["basic"]. Ligar o gate no link pessoal
//   DERRUBA na primeira manhã o ponto de todo cliente que hoje usa o link e não
//   tem `rh` na assinatura, e ponto é registro de jornada (passivo trabalhista
//   pro cliente, não um erro de tela). A contagem de empresas afetadas está
//   sendo apurada em paralelo pelo 🗄️ Database e a decisão de ligar é do CEO
//   (§5.3/§10.3). O QUIOSQUE nasce gateado: é feature nova, ninguém depende.
const GATE_PERSONAL_LINK: boolean = false;

// Código do módulo de RH na Dominex. NÃO é `'funcionarios'` (esse é o nome no
// EcoSistema). RPC: company_has_module(p_company_id, p_module_code) — os
// parâmetros também divergem do Eco (`_company_id`/`_module_code`), copiar de lá
// dá "function does not exist" em runtime.
const RH_MODULE_CODE = "rh";

// TTL das signed URLs de foto. Lista do quiosque é mais curta de propósito: no
// link pessoal é UMA capability pra foto da PRÓPRIA pessoa; na lista são N
// capabilities pras fotos de TODO MUNDO, e cada signed URL é um portador
// (copiada, funciona fora do tablet até expirar). O tablet refaz a lista o dia
// inteiro, então 15 min não custa nada e corta a janela em 4x.
const PHOTO_TTL_PERSONAL_SECONDS = 3600;
const PHOTO_TTL_KIOSK_SECONDS = 900;

// Client service_role da edge. Fica numa factory (em vez de `createClient(...)`
// solto dentro do handler) só pra `EdgeClient` ser EXATAMENTE o tipo que os
// helpers recebem — senão `ReturnType<typeof createClient>` instancia os
// genéricos com os defaults e o `deno check` acusa incompatibilidade.
function createEdgeClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
type EdgeClient = ReturnType<typeof createEdgeClient>;

/** Funcionário resolvido pela identidade (link pessoal ou quiosque). */
type PontoEmployee = {
  id: string;
  name: string;
  position: string | null;
  photo_url: string | null;
  company_id: string;
};

/** Branding + regional da empresa, do jeito que o payload público entrega. */
type PontoBranding = {
  name: string | null;
  logo_url: string | null;
  white_label_enabled: boolean;
  white_label_primary_color: string | null;
  white_label_logo_url: string | null;
  white_label_icon_url: string | null;
  report_header_bg_color: string | null;
  report_header_text_color: string | null;
  report_header_logo_size: number | null;
  report_header_logo_type: string | null;
  report_header_show_logo_bg: boolean | null;
  report_header_logo_bg_color: string | null;
  report_status_bar_color: string | null;
  language: string;
  currency: string;
  timezone: string;
};

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

// Fuso padrão quando a empresa não configurou nada. Igual ao default do app
// logado (src/lib/i18n/regionalDefaults.ts), pra link público e tela logada
// nunca discordarem sobre qual dia é hoje.
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

// ── Dia canônico da batida ───────────────────────────────────────────────────
// "Hoje" NO FUSO DA EMPRESA (company_settings.timezone), em YYYY-MM-DD. É o DIA
// CANÔNICO da batida: o espelho de ponto, a folha e a lista do quiosque agrupam
// por ele.
//
// Antes isto era UTC-3 chumbado, o que só acerta quem está em Brasília. No
// projeto irmão o mesmo defeito fez um cliente de Mato Grosso do Sul (UTC-4)
// ver TODA batida uma hora adiantada e, perto da meia-noite, arquivar o
// registro no dia seguinte. O Brasil não tem horário de verão desde 2019, então
// para quem está em America/Sao_Paulo o resultado é idêntico ao de antes.
//
// `en-CA` é OBRIGATÓRIO, não é estilo: é o único locale que o
// toLocaleDateString formata exatamente como ISO YYYY-MM-DD. Remontar a data
// com getFullYear()/getMonth()/getDate() usaria o fuso do SERVIDOR e traria o
// defeito de volta por outro caminho.
//
// Fuso nulo, vazio ou só com espaços cai no padrão. Valor inválido (string que
// não é nome IANA) faz o `Intl` lançar RangeError, o que derrubaria o ponto da
// empresa inteira, por isso o try/catch também cai no padrão e loga só o fato,
// nunca o valor recebido nem o slug.
function todayInTz(timeZone: string | null | undefined): string {
  const tz = typeof timeZone === "string" && timeZone.trim()
    ? timeZone.trim()
    : DEFAULT_TIMEZONE;
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: tz });
  } catch {
    console.error(
      "[time-clock-portal] timezone invalido em company_settings, usando o padrao",
    );
    return new Date().toLocaleDateString("en-CA", {
      timeZone: DEFAULT_TIMEZONE,
    });
  }
}

// employees.photo_url aponta pro bucket PRIVADO `employee-photos`. Numa página
// anônima um <img> direto dá 403. Aqui (service_role) extraímos o PATH do
// storage da URL e geramos uma signed URL temporária pro avatar.
// Robusto a URLs públicas, /authenticated/ e /sign/ — sempre fica com o trecho
// depois de `employee-photos/`. Retorna null se não der pra derivar.
function employeePhotoPath(rawUrl: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const marker = "/employee-photos/";
  const idx = rawUrl.indexOf(marker);
  if (idx === -1) return null;
  let path = rawUrl.slice(idx + marker.length);
  const q = path.indexOf("?");
  if (q !== -1) path = path.slice(0, q);
  path = decodeURIComponent(path).replace(/^\/+/, "");
  return path || null;
}

async function signEmployeePhoto(
  supabase: EdgeClient,
  rawUrl: string | null,
  ttlSeconds = PHOTO_TTL_PERSONAL_SECONDS,
): Promise<string | null> {
  const path = employeePhotoPath(rawUrl);
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from("employee-photos")
      .createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

// Assina as fotos da lista do quiosque em LOTE (1 round-trip em vez de N).
// A superfície de risco é a mesma de N chamadas individuais — o que a define é
// QUANTOS paths entram e por QUANTO TEMPO valem. Por isso o array de entrada tem
// que vir do array de employees JÁ FILTRADO por company_id: o Storage não conhece
// multi-tenancy, ele assina o path que receber, em silêncio.
// Item com erro vira null (fallback de iniciais); falha de foto não derruba a lista.
async function signEmployeePhotosBatch(
  supabase: EdgeClient,
  rawUrls: (string | null)[],
  ttlSeconds: number,
): Promise<(string | null)[]> {
  const paths = rawUrls.map((u) => employeePhotoPath(u));
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return paths.map(() => null);

  const signedByPath = new Map<string, string>();
  try {
    const { data, error } = await supabase.storage
      .from("employee-photos")
      .createSignedUrls(unique, ttlSeconds);
    if (error) {
      console.error(
        "[time-clock-portal] createSignedUrls error:",
        error.message,
      );
      return paths.map(() => null);
    }
    for (const item of data ?? []) {
      // Cada item traz `error` próprio: foto quebrada de uma pessoa não pode
      // derrubar a lista do time.
      if (item?.signedUrl && item?.path) {
        signedByPath.set(item.path as string, item.signedUrl as string);
      }
    }
  } catch {
    return paths.map(() => null);
  }

  return paths.map((p) => (p ? signedByPath.get(p) ?? null : null));
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

// Resposta do quiosque: `Cache-Control: no-store` sempre. É uma lista de pessoas
// com capabilities de foto dentro — proxy da rede da empresa ou cache de CDN não
// pode reter isso. Vale também pros erros.
//
// Shape de erro do QUIOSQUE (§5.2/§8): `error` é código de MÁQUINA (o hook liga
// `moduleInactive`) e `message` é a cópia PT-BR de fallback (a tela renderiza a
// string do i18n nos 4 idiomas). O link PESSOAL mantém o shape legado
// `{ error: "<texto PT-BR>" }` que a tela em produção já lê como texto.
function kioskError(code: string, message: string, status: number): Response {
  // Nenhum erro carrega branding, nome de empresa, contagem de funcionários nem
  // o slug recebido (§3.4/§8.4) — slug em mensagem acaba em log de proxy e em
  // print de tela.
  return jsonResponse({ error: code, message }, status, {
    "Cache-Control": "no-store",
  });
}

// 404 único do quiosque: slug inexistente, slug apagado, employee_id de outra
// empresa, UUID que não existe, pessoa arquivada e pessoa com ponto desligado
// devolvem EXATAMENTE este corpo. O quiosque não é oráculo de "esse UUID existe".
function kioskNotFound(): Response {
  return kioskError("invalid_link", "Link inválido ou desativado.", 404);
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
    // Sem revelar o teto nem o tempo restante.
    return jsonResponse(
      { error: "Muitas requisições. Aguarde um instante e tente novamente." },
      429,
    );
  }

  try {
    const supabase = createEdgeClient();

    const body: Record<string, unknown> = await readJsonBody(req).catch((error) => {
      if (error instanceof RequestTooLargeError) throw error;
      return {} as Record<string, unknown>;
    });
    const action = body?.action;

    // Gate de módulo `rh`, por requisição. Fail-closed: erro na RPC NÃO libera,
    // e null/undefined conta como negativo. Devolve null quando pode seguir.
    async function moduleGate(companyId: string): Promise<Response | null> {
      const { data, error } = await supabase.rpc("company_has_module", {
        p_company_id: companyId,
        p_module_code: RH_MODULE_CODE,
      });
      if (error) {
        // Nunca loga slug, PIN, selfie nem signed URL.
        console.error(
          "[time-clock-portal] company_has_module error:",
          error.message,
        );
        return kioskError("internal", "Erro interno. Tente novamente.", 500);
      }
      if (data !== true) {
        return kioskError(
          "module_inactive",
          "O módulo de Funcionários não está ativo para esta empresa. Fale com o responsável pelo sistema.",
          403,
        );
      }
      return null;
    }

    // ── get_kiosk ────────────────────────────────────────────────────────────
    // Lista do tablet da empresa. Não resolve funcionário nenhum (não há um) e
    // NUNCA devolve ponto_slug de ninguém: o quiosque identifica a pessoa pelo
    // par (kiosk_slug, employee_id). O corpo aceita EXATAMENTE `action` e
    // `kiosk_slug` — nada mais escolhe empresa, data, fuso ou filtro.
    if (action === "get_kiosk") {
      const kioskSlug = typeof body?.kiosk_slug === "string"
        ? body.kiosk_slug.trim()
        : "";
      if (!kioskSlug) {
        return kioskError("invalid_request", "Link inválido.", 400);
      }

      // `companies` é o registro COMERCIAL da Auctus sobre o cliente. Daqui só o
      // `id` atravessa, em memória: nenhum campo de `companies` entra no payload.
      const { data: kioskCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("ponto_kiosk_slug", kioskSlug)
        .maybeSingle();

      if (!kioskCompany) return kioskNotFound();

      // UMA única companyId por requisição, derivada só do slug, usada em TODAS
      // as consultas abaixo. Se o company_id do branding pudesse divergir do
      // company_id da lista, o tablet mostraria o time de uma empresa sob a
      // marca de outra (incidente 1.8.4, regra-lei nº2).
      const companyId = kioskCompany.id as string;

      // Gate ANTES de qualquer leitura de employees/time_records/company_settings.
      const gate = await moduleGate(companyId);
      if (gate) return gate;

      // Branding do quiosque: allowlist REDUZIDA (subconjunto da do get_state).
      // Em payload que lista o time inteiro, campo que a tela não lê é superfície
      // paga sem contrapartida — por isso ficam de fora report_header_bg_color,
      // report_header_text_color, report_status_bar_color, report_header_logo_size
      // e currency (auditados: nenhum é lido pela tela pública).
      // Fonte é company_settings (a marca que o CLIENTE configurou), nunca
      // `companies` (a marca que a Auctus cadastrou).
      const { data: cs } = await supabase
        .from("company_settings")
        .select(
          "name, logo_url, white_label_enabled, white_label_primary_color, white_label_logo_url, white_label_icon_url, report_header_logo_type, report_header_show_logo_bg, report_header_logo_bg_color, language, timezone",
        )
        .eq("company_id", companyId)
        .maybeSingle();

      const company = {
        name: cs?.name ?? "Empresa",
        logo_url: cs?.logo_url ?? null,
        white_label_enabled: cs?.white_label_enabled ?? false,
        white_label_primary_color: cs?.white_label_primary_color ?? null,
        white_label_logo_url: cs?.white_label_logo_url ?? null,
        white_label_icon_url: cs?.white_label_icon_url ?? null,
        report_header_logo_type: cs?.report_header_logo_type ?? null,
        report_header_show_logo_bg: cs?.report_header_show_logo_bg ?? null,
        report_header_logo_bg_color: cs?.report_header_logo_bg_color ?? null,
        language: (cs?.language as string | null) ?? "pt-br",
        // Fuso da empresa: manda no relógio e na data do cabeçalho do tablet
        // (tablet de quiosque com fuso desconfigurado é comum e ponto é
        // documento) E TAMBÉM no dia canônico da batida, logo abaixo.
        timezone: (cs?.timezone as string | null) ?? DEFAULT_TIMEZONE,
      };

      const { data: kioskSettings } = await supabase
        .from("time_settings")
        .select("kiosk_require_face")
        .eq("company_id", companyId)
        .maybeSingle();

      // ORDEM IMPORTA: o dia só pode ser calculado DEPOIS de company_settings,
      // porque quem decide qual dia é hoje é o fuso da empresa. Calcular antes
      // era o que chumbava UTC-3.
      const todayDate = todayInTz(company.timezone);

      // Quem aparece: empresa do slug + ponto habilitado + não arquivado.
      // `ponto_enabled=false` é o mesmo interruptor que desliga o link pessoal;
      // `is_active=false` não pode figurar numa lista pública da empresa (o link
      // PESSOAL continua sem esse filtro, comportamento de hoje preservado,
      // porque o arquivado ainda precisa fechar o próprio mês).
      // Select nominal: sem ponto_slug, sem public_short_code, sem `*`.
      const { data: employeesRows } = await supabase
        .from("employees")
        .select(
          KIOSK_EXPOSE_POSITION ? "id, name, position, photo_url" : "id, name, photo_url",
        )
        .eq("company_id", companyId)
        .eq("ponto_enabled", true)
        .eq("is_active", true)
        .order("name", { ascending: true });

      const employeeList = (employeesRows ?? []) as unknown as Array<
        { id: string; name: string; position?: string | null; photo_url: string | null }
      >;
      const employeeIds = employeeList.map((e) => e.id);

      // Batidas de hoje de TODO o time numa consulta só (sem N+1). Só
      // employee_id + type: o payload não carrega horário, endereço, selfie nem
      // id de registro — publicar isso seria publicar o horário e o lugar de
      // cada pessoa do time. Só o `status` agregado sai.
      const typesByEmployee = new Map<string, string[]>();
      let photos: (string | null)[] = [];
      if (employeeIds.length > 0) {
        const { data: dayRecords } = await supabase
          .from("time_records")
          .select("employee_id, type")
          .eq("company_id", companyId)
          .eq("date", todayDate)
          .in("employee_id", employeeIds);
        for (const r of dayRecords ?? []) {
          const id = r.employee_id as string;
          const list = typesByEmployee.get(id) ?? [];
          list.push(r.type as string);
          typesByEmployee.set(id, list);
        }

        // Lote derivado EXCLUSIVAMENTE do array já filtrado por company_id.
        photos = await signEmployeePhotosBatch(
          supabase,
          employeeList.map((e) => e.photo_url ?? null),
          PHOTO_TTL_KIOSK_SECONDS,
        );
      }

      // Lista vazia é 200 com `employees: []` (primeiro dia de uso é estado
      // legítimo, a tela mostra o EmptyState com a marca certa), nunca 404.
      return jsonResponse(
        {
          company,
          settings: {
            kiosk_require_face: kioskSettings?.kiosk_require_face === true,
          },
          employees: employeeList.map((e, i) => ({
            id: e.id,
            name: e.name,
            // Sempre signed URL curta, nunca o valor cru da coluna nem o path do
            // Storage. Sem foto (ou falha ao assinar) → null.
            photo_url: photos[i] ?? null,
            status: deriveDayStatus(typesByEmployee.get(e.id) ?? []),
            // A Dominex não tem employee_absences. A chave fica no contrato,
            // fixa em null, pra tela e hook nascerem com o formato final.
            absence_label: null,
            // `has_pin` fica FORA de propósito: o booleano na lista é um mapa de
            // quem está desprotegido, que é o alvo de quem quer bater ponto no
            // lugar de um colega. O fluxo não precisa dele.
            ...(KIOSK_EXPOSE_POSITION ? { position: e.position ?? null } : {}),
          })),
        },
        200,
        { "Cache-Control": "no-store" },
      );
    }

    // ── match_face (identificacao 1:N do quiosque) ─────────────────────────
    // O browser envia somente o embedding efemero. A RPC compara dentro do
    // tenant resolvido pelo slug e devolve uma prova opaca curta, nunca
    // templates nem scores. Indisponibilidade tecnica nunca bloqueia o fluxo
    // convencional; a UI decide se ambiguidade permite busca conforme a
    // configuracao do tenant.
    if (action === "match_face") {
      const kioskSlug = typeof body?.kiosk_slug === "string"
        ? body.kiosk_slug.trim()
        : "";
      const payloadBytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
      if (
        !kioskSlug ||
        payloadBytes > MAX_FACE_MATCH_BYTES ||
        !hasOnlyKeys(body, faceMatchAllowedKeys()) ||
        !isValidFaceMatchPayload(body)
      ) {
        return kioskError("invalid_request", "Leitura facial inválida.", 400);
      }

      const { data: kioskCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("ponto_kiosk_slug", kioskSlug)
        .maybeSingle();
      if (!kioskCompany) return kioskNotFound();

      const companyId = kioskCompany.id as string;
      const gate = await moduleGate(companyId);
      if (gate) return gate;

      const { data: match, error: matchError } = await supabase.rpc(
        "match_employee_face_for_kiosk",
        {
          p_company_id: companyId,
          p_model_version: body.model_version,
          p_embedding: body.embedding,
          p_quality_score: body.quality_score,
        },
      );

      if (matchError) {
        console.error(
          "[time-clock-portal] face match failed, sqlstate:",
          matchError.code ?? "unknown",
        );
        return jsonResponse(
          { status: "unavailable" },
          200,
          { "Cache-Control": "no-store" },
        );
      }

      const result = match && typeof match === "object"
        ? match as Record<string, unknown>
        : {};
      if (result.status === "rate_limited") {
        return jsonResponse(
          { error: "Muitas tentativas. Aguarde um instante." },
          429,
          { "Cache-Control": "no-store" },
        );
      }
      if (
        result.status === "matched" &&
        typeof result.employee_id === "string" &&
        typeof result.proof === "string" &&
        /^[0-9a-f]{64}$/.test(result.proof)
      ) {
        return jsonResponse(
          { status: "matched", employee_id: result.employee_id, proof: result.proof },
          200,
          { "Cache-Control": "no-store" },
        );
      }
      if (result.status === "ambiguous" && Array.isArray(result.candidate_ids)) {
        return jsonResponse(
          { status: "ambiguous", candidate_ids: result.candidate_ids.slice(0, 3) },
          200,
          { "Cache-Control": "no-store" },
        );
      }
      const status = result.status === "not_recognized"
        ? "not_recognized"
        : "unavailable";
      return jsonResponse({ status }, 200, { "Cache-Control": "no-store" });
    }

    // ── Identidade (link pessoal OU quiosque) ────────────────────────────────
    const identity: PontoIdentity | null = parsePontoIdentity(body ?? {});
    if (!identity) {
      // Body do quiosque torto (sem employee_id, ou com UUID inválido) recebe o
      // shape novo; o link pessoal mantém o 400 legado, byte a byte.
      return looksLikeKioskBody(body ?? {})
        ? kioskError("invalid_request", "Link inválido.", 400)
        : jsonResponse({ error: "Link inválido." }, 400);
    }

    const isKiosk = identity.kind === "kiosk";
    // 404 do caminho de batida: mesmo corpo pra tudo que "não achou".
    const notFound = () =>
      isKiosk
        ? kioskNotFound()
        : jsonResponse({ error: "Link inválido ou desativado." }, 404);

    let employee: PontoEmployee | null = null;

    if (identity.kind === "personal") {
      // Resolução ÚNICA e exclusiva pelo slug (precisa estar habilitado). Tudo
      // (companyId, employeeId) deriva daqui — o body NUNCA escolhe empresa/func.
      const { data } = await supabase
        .from("employees")
        .select("id, name, position, photo_url, company_id, ponto_enabled")
        .eq("ponto_slug", identity.slug)
        .eq("ponto_enabled", true)
        .maybeSingle();
      employee = (data as unknown as PontoEmployee | null) ?? null;
    } else {
      // Quiosque: a EMPRESA vem do slug do tablet e o funcionário PRECISA ser
      // daquela empresa, com ponto ativo e não arquivado. Nunca por ponto_slug.
      const { data: kioskCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("ponto_kiosk_slug", identity.kioskSlug)
        .maybeSingle();

      if (kioskCompany) {
        const { data } = await supabase
          .from("employees")
          .select("id, name, position, photo_url, company_id")
          .eq("id", identity.employeeId)
          .eq("company_id", kioskCompany.id)
          .eq("ponto_enabled", true)
          .eq("is_active", true)
          .maybeSingle();
        employee = (data as unknown as PontoEmployee | null) ?? null;
      }
    }

    if (!employee) return notFound();

    const companyId = employee.company_id as string;

    // Memo por requisição do branding (ver `loadBranding` mais abaixo). Mora
    // AQUI, e não junto da função, por duas razões: `let` não é hoisted (o gate
    // de PIN já chama `loadBranding` antes da declaração dela, apoiado no
    // hoisting de function declaration) e o fuso da empresa sai desta mesma
    // leitura, então o dia canônico não custa uma segunda ida ao banco.
    let brandingCache: PontoBranding | null = null;

    // Gate de módulo: ligado no quiosque (feature nova, ninguém depende) e atrás
    // de GATE_PERSONAL_LINK no link pessoal (ver o comentário da constante).
    if (isKiosk || GATE_PERSONAL_LINK) {
      const gate = await moduleGate(companyId);
      if (gate) return gate;
    }

    // ── Gate de PIN ──────────────────────────────────────────────────────────
    // Vale pras DUAS identidades (link pessoal e quiosque) e pras DUAS ações
    // (get_state e register_punch), porque roda ANTES de qualquer uma delas.
    // Sem PIN correto NÃO devolvemos histórico nem next_action, e não deixamos
    // registrar — num tablet compartilhado, tocar no crachá do colega não pode
    // dar acesso à jornada dele nem à batida em nome dele.
    //
    // POR QUE UMA CHAMADA SÓ RESOLVE TUDO: `verify_ponto_pin` devolve
    // ok=true + no_pin=true pra quem NÃO tem PIN cadastrado. Como hoje ninguém
    // tem PIN, 100% do tráfego atual cai nesse ramo e segue EXATAMENTE pelo
    // caminho de antes (mesmas queries, mesmo payload, mesmo status) — nenhum
    // usuário de produção percebe diferença.
    //
    // `p_pin` nulo NÃO conta tentativa errada na RPC (é "ainda não digitei"):
    // abrir o cartão de alguém no quiosque não pode queimar as 5 tentativas
    // dela. A RPC devolve pin_required nesse caso.
    //
    // Fail-closed: erro na RPC não libera (500). Vale o mesmo raciocínio do
    // moduleGate — gate que abre no erro não é gate. A tradução do veredito em
    // decisão mora em `pinGateDecision` (_shared/ponto-kiosk.ts), pura e legível.
    const pinInput = typeof body?.pin === "string" ? body.pin.trim() : "";
    const { data: pinData, error: pinRpcError } = await supabase.rpc(
      "verify_ponto_pin",
      { p_employee_id: employee.id, p_pin: pinInput || null },
    );
    if (pinRpcError) {
      // ⚠️ NUNCA logar o PIN, o slug, a selfie nem signed URL. Aqui sai só o
      // SQLSTATE (ex.: 42501 = grant faltando), que não descreve dado nenhum —
      // a mensagem crua da RPC poderia carregar valor de parâmetro.
      console.error(
        "[time-clock-portal] verify_ponto_pin failed, sqlstate:",
        pinRpcError.code ?? "unknown",
      );
      return isKiosk
        ? kioskError("internal", "Erro interno. Tente novamente.", 500)
        : jsonResponse({ error: "Erro interno. Tente novamente." }, 500);
    }

    const verdict = (pinData ?? null) as PinVerdict | null;
    const pinDecision = pinGateDecision(verdict, !!pinInput);
    if (pinDecision !== "pass") {
      // Cartão MÍNIMO da pessoa: só o que a tela precisa pra mostrar de quem é
      // o PIN que está sendo pedido. Nada de `id`, `company_id`, `ponto_slug`
      // nem `position` — mesma régua da lista do quiosque
      // (docs/planos/2026-09-16-regra-exposicao-quiosque-ponto.md).
      // TTL CURTO de propósito (o do quiosque, 15 min, e não a 1h do link
      // pessoal): esta capability de foto é entregue ANTES de o PIN ser aceito.
      async function pinEmployeeCard() {
        return {
          name: employee!.name,
          photo_url: await signEmployeePhoto(
            supabase,
            employee!.photo_url ?? null,
            PHOTO_TTL_KIOSK_SECONDS,
          ),
        };
      }

      // Travado por tentativas → 423. Reportado mesmo sem PIN digitado: quem
      // está travado precisa saber disso ao tocar no próprio crachá.
      if (pinDecision === "locked") {
        return jsonResponse(
          {
            error: "pin_locked",
            message:
              "PIN bloqueado por muitas tentativas. Aguarde alguns minutos e tente de novo.",
            locked_until: verdict?.locked_until ?? null,
            employee: await pinEmployeeCard(),
          },
          423,
          { "Cache-Control": "no-store" },
        );
      }

      // Digitou e errou → 401 com as tentativas que sobraram. Sem cartão nem
      // marca: a tela que recebe este erro JÁ está montada com os dois.
      if (pinDecision === "invalid") {
        return jsonResponse(
          {
            error: "pin_invalid",
            message: "PIN incorreto.",
            attempts_left: typeof verdict?.attempts_left === "number"
              ? verdict.attempts_left
              : 0,
          },
          401,
          { "Cache-Control": "no-store" },
        );
      }

      // Ainda não digitou, MAS a ação não é `get_state` → 401. O 200 abaixo é um
      // payload de ESTADO (cartão + marca); devolvê-lo pra `register_punch`
      // faria a tela achar que a batida deu certo (falha silenciosa). Acontece
      // quando o PIN é cadastrado no meio da sessão da tela.
      if (action !== "get_state") {
        return jsonResponse(
          {
            error: "pin_required",
            message: "Digite seu PIN para registrar o ponto.",
          },
          401,
          { "Cache-Control": "no-store" },
        );
      }

      // Ainda não digitou → 200 com o cartão da pessoa e a marca da empresa
      // (a tela de PIN é white-label e monta a marca do PAYLOAD, inline).
      // `settings`, `today` e `next_action` saem VAZIOS: sem PIN correto não
      // existe histórico nem próxima ação pra mostrar.
      return jsonResponse(
        {
          pin_required: true,
          employee: await pinEmployeeCard(),
          company: await loadBranding(),
          settings: null,
          today: [],
          next_action: null,
        },
        200,
        { "Cache-Control": "no-store" },
      );
    }

    // ── calibrate_face (Onda 2B, sem efeito sobre a batida) ────────────────
    // A identidade e o PIN ja foram validados acima. O embedding existe apenas
    // durante esta chamada; a RPC persiste somente distancias agregadas. Esta
    // resposta nunca informa se o funcionario tem cadastro, nem traz score.
    if (action === "calibrate_face") {
      const allowedKeys = calibrationAllowedKeys(identity.kind);
      const facePayloadBytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
      if (facePayloadBytes > MAX_FACE_CALIBRATION_BYTES) {
        return jsonResponse(
          { error: "Leitura facial muito grande." },
          413,
          { "Cache-Control": "no-store" },
        );
      }
      if (!hasOnlyKeys(body, allowedKeys) || !isValidFaceCalibrationPayload(body)) {
        return jsonResponse(
          { error: "Leitura facial inválida." },
          400,
          { "Cache-Control": "no-store" },
        );
      }

      const { data: calibration, error: calibrationError } = await supabase.rpc(
        "record_employee_face_calibration",
        {
          p_company_id: companyId,
          p_employee_id: employee.id,
          p_model_version: body.model_version,
          p_embedding: body.embedding,
          p_quality_score: body.quality_score,
        },
      );

      if (calibrationError) {
        console.error(
          "[time-clock-portal] face calibration failed, sqlstate:",
          calibrationError.code ?? "unknown",
        );
        return jsonResponse(
          { status: "unavailable" },
          200,
          { "Cache-Control": "no-store" },
        );
      }

      const calibrationStatus = calibration && typeof calibration === "object"
        ? (calibration as { status?: unknown }).status
        : null;
      if (calibrationStatus === "rate_limited") {
        return jsonResponse(
          { error: "Muitas tentativas. Aguarde um instante." },
          429,
          { "Cache-Control": "no-store" },
        );
      }

      // `unavailable` (inclusive sem template) e normalizado para `captured`.
      // Assim a rota publica nao vira um oraculo de quem tem biometria.
      return jsonResponse(
        { status: "captured" },
        200,
        { "Cache-Control": "no-store" },
      );
    }

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

    // ORDEM IMPORTA: o dia canônico depende do fuso da empresa, então ele é
    // resolvido só aqui, depois de o branding (que já traz o `timezone`) estar
    // disponível. Fica DEPOIS do gate de PIN de propósito: quem erra o PIN
    // continua sendo recusado sem nenhuma leitura extra.
    const todayDate = todayInTz((await loadBranding()).timezone);

    // Registros de hoje (no fuso da empresa) ordenados: base do next_action e
    // do teto por dia.
    // NÃO seleciona address: o link é compartilhável (anônimo) e a localização do
    // funcionário não pode vazar no payload público (LGPD). A batida continua
    // gravando lat/long/address no register_punch (evidência pro admin autenticado).
    const { data: todayRecords } = await supabase
      .from("time_records")
      .select("type, recorded_at")
      .eq("employee_id", employee.id)
      .eq("date", todayDate)
      .order("recorded_at", { ascending: true });

    const records = todayRecords ?? [];
    const nextAction = nextActionFrom(records.map((r) => r.type as string));

    // Branding white-label seguro: allowlist explícita de company_settings.
    // PROIBIDO to_jsonb(cs)/select('*') — só os campos de marca do header.
    // Inclui language/currency/timezone pra i18n do portal público.
    // (Esta é a allowlist do get_state, mais larga que a do quiosque. Podar os 5
    // campos mortos daqui é dívida registrada na §3.3 da regra: exige front e
    // edge subindo juntos, então não entra nesta release.)
    async function loadBranding(): Promise<PontoBranding> {
      // Memo: a mesma requisição pode precisar do branding pro payload E do
      // `timezone` pro dia canônico. Uma leitura só, nunca duas.
      if (brandingCache) return brandingCache;
      const { data: cs } = await supabase
        .from("company_settings")
        .select(
          "name, logo_url, white_label_enabled, white_label_primary_color, white_label_logo_url, white_label_icon_url, report_header_bg_color, report_header_text_color, report_header_logo_size, report_header_logo_type, report_header_show_logo_bg, report_header_logo_bg_color, report_status_bar_color, language, currency, timezone",
        )
        .eq("company_id", companyId)
        .maybeSingle();
      brandingCache = {
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
        // i18n do portal público: idioma/moeda/fuso da empresa.
        // COALESCE: fallback defensivo caso a coluna não exista ainda.
        language: (cs?.language as string | null) ?? "pt-br",
        currency: (cs?.currency as string | null) ?? "BRL",
        timezone: (cs?.timezone as string | null) ?? DEFAULT_TIMEZONE,
      };
      return brandingCache;
    }

    // ── get_state ────────────────────────────────────────────────────────────
    if (action === "get_state") {
      const company = await loadBranding();
      // Avatar do funcionário: o bucket employee-photos é privado, então
      // devolvemos uma signed URL (1h) que o front usa direto como <img src>.
      // Sem foto → null (front mostra fallback de iniciais).
      const signedPhotoUrl = await signEmployeePhoto(
        supabase,
        employee.photo_url ?? null,
        PHOTO_TTL_PERSONAL_SECONDS,
      );
      return jsonResponse({
        // Sem `id`: o front não usa e expor o employee_id num link público é
        // superfície de ataque desnecessária. Só dados de exibição do header.
        // (No quiosque o tablet JÁ tem o id — ele o mandou no body —, então
        // continuar sem devolvê-lo mantém o payload idêntico nas duas portas.)
        employee: {
          name: employee.name,
          position: employee.position ?? null,
          photo_url: signedPhotoUrl,
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
      const faceProof = typeof body?.face_proof === "string" &&
          /^[0-9a-f]{64}$/.test(body.face_proof)
        ? body.face_proof
        : null;

      // Anti-duplicado/corrida: o type precisa ser EXATAMENTE o next_action
      // recalculado server-side. Barra "bater entrada 2x" e qualquer ordem fora.
      if (!type || type !== nextAction) {
        return jsonResponse(
          { error: "Esta ação não está disponível agora. Recarregue a página e tente novamente." },
          409,
        );
      }

      // Teto duro por FUNCIONÁRIO/dia (persistente, contado nos registros da
      // pessoa resolvida — nunca por slug do quiosque). O fluxo normal nunca
      // passa de 4; este teto cobre cenários degenerados/abuso.
      if (records.length >= MAX_PUNCHES_PER_EMPLOYEE_PER_DAY) {
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

      // Sobe a foto (se houver) no bucket time-photos.
      // Path derivado server-side de companyId/employeeId — nunca da URL do cliente.
      //
      // ⚠️ `photo_url` guarda o PATH do Storage, NÃO uma URL.
      // O bucket `time-photos` virou PRIVADO na migration 20260418165057, então a
      // URL pública que este código gravava antes não abre mais — e a selfie é a
      // evidência jurídica da batida. Quem for LER isso tem que assinar o path
      // (createSignedUrl) em vez de usar o valor direto.
      // DISCRIMINADOR (evita migration de dados): valor ANTIGO começa com "http"
      // (URL pública morta, gravada até 1.24.x); valor NOVO é path puro
      // (`<companyId>/<employeeId>/<data>-<tipo>-<ts>.<ext>`). Um leitor futuro
      // decide pelo prefixo: `startsWith("http")` → parseia a URL pra extrair o
      // path; senão → é o path, assina direto no bucket `time-photos`.
      let photoPath: string | null = null;
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
          `${companyId}/${employee.id}/${todayDate}-${type}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("time-photos")
          .upload(path, bytes, { contentType, upsert: false });
        if (uploadError) {
          console.error("[time-clock-portal] upload error:", uploadError.message);
          return jsonResponse({ error: "Falha ao salvar a selfie." }, 500);
        }
        photoPath = path;
      }

      // A decisao facial vem exclusivamente da prova criada pelo servidor.
      // Campo forjado, prova expirada/repetida ou de outro funcionario apenas
      // cai para `face_match=false`; jamais bloqueia a batida convencional.
      let faceMatch = false;
      let faceScore: number | null = null;
      let faceModelVersion: string | null = null;
      if (faceProof) {
        const proofHash = await sha256Hex(faceProof);
        const { data: proofResult, error: proofError } = await supabase.rpc(
          "consume_employee_face_match_proof",
          {
            p_proof_hash: proofHash,
            p_company_id: companyId,
            p_employee_id: employee.id,
            p_expected_type: type,
          },
        );
        if (proofError) {
          console.error(
            "[time-clock-portal] face proof validation failed, sqlstate:",
            proofError.code ?? "unknown",
          );
        } else if (
          proofResult && typeof proofResult === "object" &&
          (proofResult as Record<string, unknown>).valid === true
        ) {
          const distance = (proofResult as Record<string, unknown>).distance;
          const modelVersion = (proofResult as Record<string, unknown>).model_version;
          faceMatch = true;
          faceScore = typeof distance === "number" && Number.isFinite(distance)
            ? distance
            : null;
          faceModelVersion = typeof modelVersion === "string" ? modelVersion : null;
        }
      }

      const recordedAt = new Date().toISOString();
      const { error: insertError } = await supabase
        .from("time_records")
        .insert({
          company_id: companyId,
          user_id: null,
          employee_id: employee.id,
          date: todayDate,
          type,
          recorded_at: recordedAt,
          latitude,
          longitude,
          address,
          photo_url: photoPath,
          device_info: deviceInfo,
          source: "link_publico",
          is_valid: true,
          face_match: faceMatch,
          face_score: faceScore,
          face_model_version: faceModelVersion,
        });

      if (insertError) {
        console.error("[time-clock-portal] insert error:", insertError.message);
        return jsonResponse({ error: "Falha ao registrar o ponto." }, 500);
      }

      // Recalcula o espelho do dia (best-effort — o registro já está gravado).
      const { error: rpcError } = await supabase.rpc("recompute_time_sheet", {
        p_company_id: companyId,
        p_employee_id: employee.id,
        p_date: todayDate,
      });
      if (rpcError) {
        console.error("[time-clock-portal] recompute error:", rpcError.message);
      }

      return jsonResponse({ success: true, type, recorded_at: recordedAt });
    }

    return jsonResponse({ error: "Ação desconhecida." }, 400);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return jsonResponse({ error: "Requisição muito grande." }, 413);
    }
    console.error("[time-clock-portal] unhandled error:", error);
    return jsonResponse({ error: "Erro interno. Tente novamente." }, 500);
  }
});
