// deno-lint-ignore-file no-import-prefix
// API Publica Dominex v1 — exclusivamente server-to-server.
//
// A chave e a unica origem do tenant. Esta edge usa service_role, portanto toda
// leitura chama RPC service-role-only ou filtra explicitamente pela integracao.
// Nao ha CORS de proposito: uma chave secreta nao deve existir no navegador.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import {
  apiJson,
  apiProblem,
  BodyTooLargeError,
  canonicalJson,
  hasOnlyKeys,
  isIpAllowed,
  isIsoWithOffset,
  isPlainObject,
  type JsonObject,
  normalizedDocument,
  normalizedEmail,
  normalizedPhone,
  parseApiKey,
  pseudonymizeIp,
  publicApiPath,
  readJsonBody,
  sha256Hex,
} from "../_shared/public-api.ts";

const GLOBAL_RATE_LIMIT = 60;
const AVAILABILITY_RATE_LIMIT = 30;
const MUTATION_RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60;
const PREAUTH_IP_LIMIT = 180;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminClient = SupabaseClient;
type ApiIntegration = {
  id: string;
  company_id: string;
  name: string;
  scopes: string[];
  status: string;
  distribution_mode: "agent_selects" | "round_robin" | "unassigned";
  ip_allowlist: string[] | null;
};
type ApiKeyRow = {
  id: string;
  integration_id: string;
  public_id: string;
  secret_hash: string;
  valid_from: string;
  expires_at: string;
  revoked_at: string | null;
};
type ApiContext = {
  admin: AdminClient;
  integration: ApiIntegration;
  key: ApiKeyRow;
  requestId: string;
  ipHash: string;
  startedAt: number;
};

type PreauthEntry = { count: number; resetAt: number };
const preauthHits = new Map<string, PreauthEntry>();

function allowPreauthIp(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const current = preauthHits.get(ip);
  if (!current || now >= current.resetAt) {
    preauthHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  if (preauthHits.size > 5_000) {
    for (const [key, entry] of preauthHits) {
      if (now >= entry.resetAt) preauthHits.delete(key);
    }
  }
  return {
    allowed: current.count <= PREAUTH_IP_LIMIT,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

function routeName(method: string, path: string): string {
  if (method === "GET" && path === "/v1/capabilities") return "capabilities";
  if (method === "GET" && path === "/v1/service-types") return "service_types";
  if (method === "GET" && path === "/v1/booking-resources") {
    return "booking_resources";
  }
  if (method === "GET" && path === "/v1/availability") return "availability";
  if (method === "POST" && path === "/v1/customers/resolve") {
    return "customers_resolve";
  }
  if (method === "POST" && path === "/v1/service-orders") {
    return "service_orders_create";
  }
  if (method === "GET" && path === "/v1/crm/pipelines") {
    return "crm_pipelines_list";
  }
  if (method === "GET" && path === "/v1/crm/cards") {
    return "crm_cards_list";
  }
  if (method === "POST" && path === "/v1/crm/cards") {
    return "crm_cards_create";
  }
  if (
    method === "GET" && path.startsWith("/v1/crm/cards/by-external-id/")
  ) {
    return "crm_cards_get_external";
  }
  if (method === "GET" && path.startsWith("/v1/crm/cards/")) {
    return "crm_cards_get";
  }
  if (method === "PATCH" && path.startsWith("/v1/crm/cards/")) {
    return "crm_cards_update";
  }
  if (
    method === "GET" && path.startsWith("/v1/service-orders/by-external-id/")
  ) {
    return "service_orders_get_external";
  }
  if (method === "GET" && path.startsWith("/v1/service-orders/")) {
    return "service_orders_get";
  }
  return "not_found";
}

function logRequestCompleted(
  requestId: string,
  route: string,
  response: Response,
  startedAt: number,
  integrationId?: string,
): Response {
  console.info("[public-api-v1] request_completed", {
    requestId,
    route,
    integrationId: integrationId ?? null,
    status: response.status,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
  });
  return response;
}

function requiredScope(route: string): string | null {
  if (route === "service_types" || route === "booking_resources") {
    return "catalogs:read";
  }
  if (route === "availability") return "availability:read";
  if (route === "customers_resolve") return "customers:resolve";
  if (route === "service_orders_create") return "service_orders:create";
  if (
    route === "service_orders_get" || route === "service_orders_get_external"
  ) {
    return "service_orders:read";
  }
  if (
    route === "crm_pipelines_list" || route === "crm_cards_list" ||
    route === "crm_cards_get" || route === "crm_cards_get_external"
  ) {
    return "crm_cards:read";
  }
  if (route === "crm_cards_create" || route === "crm_cards_update") {
    return "crm_cards:write";
  }
  return null;
}

function firstRpcRow(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function asRpcProblem(data: unknown, requestId: string): Response | null {
  const value = firstRpcRow(data);
  if (
    !isPlainObject(value) || value.ok !== false || !isPlainObject(value.error)
  ) return null;
  const status = typeof value.error.status === "number"
    ? value.error.status
    : 422;
  const code = typeof value.error.code === "string"
    ? value.error.code
    : "validation_error";
  const title = typeof value.error.title === "string"
    ? value.error.title
    : "Requisicao invalida";
  const detail = typeof value.error.detail === "string"
    ? value.error.detail
    : "A requisicao nao pode ser processada.";
  return apiProblem(status, code, title, detail, requestId);
}

function rpcFailure(
  error: { code?: string; message?: string },
  requestId: string,
): Response {
  // A exclusion constraint e a ultima barreira contra duas reservas que
  // venceram a checagem de disponibilidade ao mesmo tempo. Esse caso e um
  // conflito de agenda esperado, nao uma indisponibilidade do servico.
  if (error.code === "23P01") {
    return apiProblem(
      409,
      "schedule_conflict",
      "Conflito de agendamento",
      "O responsavel nao esta disponivel nesse horario.",
      requestId,
    );
  }
  const knownCodes: Record<string, [number, string, string]> = {
    schedule_conflict: [
      409,
      "Conflito de agendamento",
      "O responsavel nao esta disponivel nesse horario.",
    ],
    idempotency_conflict: [
      409,
      "Conflito de idempotencia",
      "A chave de idempotencia ja foi usada com outro conteudo.",
    ],
    external_id_conflict: [
      409,
      "Referencia externa em uso",
      "O external_id informado ja esta vinculado a outro recurso.",
    ],
    ambiguous_customer: [
      409,
      "Cliente ambiguo",
      "Mais de um cliente corresponde aos identificadores informados.",
    ],
    not_found: [
      404,
      "Recurso nao encontrado",
      "O recurso informado nao existe.",
    ],
    invalid_resource: [
      404,
      "Recurso nao encontrado",
      "O recurso informado nao existe.",
    ],
    invalid_stage: [
      404,
      "Etapa nao encontrada",
      "A etapa informada nao existe em um funil comercial deste tenant.",
    ],
    invalid_customer: [
      404,
      "Cliente nao encontrado",
      "O cliente informado nao existe neste tenant.",
    ],
    invalid_cursor: [
      400,
      "Cursor invalido",
      "Use o next_cursor retornado pela API.",
    ],
    request_in_progress: [
      409,
      "Requisicao em processamento",
      "Aguarde a tentativa original e repita com a mesma chave.",
    ],
    subscription_unavailable: [
      503,
      "Servico indisponivel",
      "Nao foi possivel validar a assinatura do tenant.",
    ],
  };
  const normalized = String(error.message ?? "").toLowerCase();
  for (const [code, [status, title, detail]] of Object.entries(knownCodes)) {
    if (normalized.includes(code)) {
      return apiProblem(status, code, title, detail, requestId);
    }
  }
  if (["22023", "22P02", "23514"].includes(String(error.code ?? ""))) {
    return apiProblem(
      422,
      "validation_error",
      "Dados invalidos",
      "Revise os campos enviados e tente novamente.",
      requestId,
    );
  }
  console.error("[public-api-v1] rpc_failed", {
    code: error.code ?? "unknown",
    requestId,
  });
  return apiProblem(
    503,
    "temporarily_unavailable",
    "Servico indisponivel",
    "Tente novamente em instantes.",
    requestId,
  );
}

async function consumeRateLimit(
  ctx: ApiContext,
  route: string,
  limit: number,
): Promise<Response | null> {
  const { data, error } = await ctx.admin.rpc("public_api_consume_rate_limit", {
    p_key_id: ctx.key.id,
    p_route: route,
    p_limit: limit,
    p_window_seconds: RATE_WINDOW_SECONDS,
  });
  if (error) return rpcFailure(error, ctx.requestId);
  const result = firstRpcRow(data);
  if (!isPlainObject(result)) {
    return apiProblem(
      503,
      "rate_limit_unavailable",
      "Servico indisponivel",
      "Nao foi possivel validar o limite de requisicoes.",
      ctx.requestId,
    );
  }
  if (result.allowed !== true) {
    const resetAt = typeof result.reset_at === "string"
      ? Date.parse(result.reset_at)
      : NaN;
    const retryAfter = typeof result.retry_after === "number"
      ? Math.max(1, Math.ceil(result.retry_after))
      : Number.isFinite(resetAt)
      ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
      : RATE_WINDOW_SECONDS;
    return apiProblem(
      429,
      "rate_limit_exceeded",
      "Limite de requisicoes excedido",
      "Aguarde antes de tentar novamente.",
      ctx.requestId,
      { "Retry-After": String(retryAfter) },
    );
  }
  return null;
}

async function audit(
  ctx: ApiContext,
  route: string,
  endpoint: string,
  method: string,
  response: Response,
): Promise<void> {
  let errorCode: string | null = null;
  if (response.status >= 400) {
    try {
      const parsed = await response.clone().json();
      errorCode = isPlainObject(parsed) && typeof parsed.code === "string"
        ? parsed.code
        : null;
    } catch {
      errorCode = null;
    }
  }
  const auditRoute = route === "availability"
    ? "availability"
    : method !== "GET"
    ? "mutation"
    : "general";
  const { error } = await ctx.admin.rpc("public_api_insert_request_audit", {
    p_request_id: ctx.requestId,
    p_integration_id: ctx.integration.id,
    p_key_id: ctx.key.id,
    p_route: auditRoute,
    p_method: method,
    p_status_code: response.status,
    p_duration_ms: Math.max(0, Math.round(performance.now() - ctx.startedAt)),
    p_error_code: errorCode,
    p_ip_hash: ctx.ipHash,
    p_endpoint: endpoint,
  });
  if (error) {
    console.error("[public-api-v1] audit_failed", {
      code: error.code,
      requestId: ctx.requestId,
    });
  }
}

async function authenticate(
  req: Request,
  admin: AdminClient,
  requestId: string,
  startedAt: number,
  ip: string,
): Promise<ApiContext | Response> {
  const parsed = parseApiKey(req.headers.get("authorization"));
  if (!parsed) {
    return apiProblem(
      401,
      "invalid_api_key",
      "Nao autorizado",
      "Informe uma chave de API valida.",
      requestId,
    );
  }

  const { data: key, error: keyError } = await admin
    .from("public_api_keys")
    .select(
      "id,integration_id,public_id,secret_hash,valid_from,expires_at,revoked_at",
    )
    .eq("public_id", parsed.publicId)
    .maybeSingle();
  const presentedHash = await sha256Hex(parsed.secret);
  if (keyError) {
    console.error("[public-api-v1] key_lookup_failed", {
      code: keyError.code,
      requestId,
    });
    return apiProblem(
      503,
      "authentication_unavailable",
      "Servico indisponivel",
      "Nao foi possivel validar a credencial.",
      requestId,
    );
  }
  if (!key || !timingSafeEqual(presentedHash, String(key.secret_hash ?? ""))) {
    return apiProblem(
      401,
      "invalid_api_key",
      "Nao autorizado",
      "Informe uma chave de API valida.",
      requestId,
    );
  }

  const now = Date.now();
  if (
    key.revoked_at || Date.parse(key.valid_from) > now ||
    Date.parse(key.expires_at) <= now
  ) {
    return apiProblem(
      401,
      "invalid_api_key",
      "Nao autorizado",
      "Informe uma chave de API valida.",
      requestId,
    );
  }

  const { data: integration, error: integrationError } = await admin
    .from("public_api_integrations")
    .select("id,company_id,name,scopes,status,distribution_mode,ip_allowlist")
    .eq("id", key.integration_id)
    .maybeSingle();
  if (integrationError) {
    console.error("[public-api-v1] integration_lookup_failed", {
      code: integrationError.code,
      requestId,
    });
    return apiProblem(
      503,
      "authentication_unavailable",
      "Servico indisponivel",
      "Nao foi possivel validar a credencial.",
      requestId,
    );
  }
  if (!integration || integration.status !== "active") {
    return apiProblem(
      401,
      "invalid_api_key",
      "Nao autorizado",
      "Informe uma chave de API valida.",
      requestId,
    );
  }

  if (!isIpAllowed(ip, integration.ip_allowlist)) {
    return apiProblem(
      403,
      "ip_not_allowed",
      "Acesso negado",
      "O endereco de origem nao esta autorizado.",
      requestId,
    );
  }

  const { data: flag, error: flagError } = await admin
    .from("app_feature_flags")
    .select("enabled,company_allowlist")
    .eq("key", "public_api_v1")
    .maybeSingle();
  if (
    flagError || !flag ||
    (flag.enabled !== true &&
      !(flag.company_allowlist ?? []).includes(integration.company_id))
  ) {
    return apiProblem(
      503,
      "api_unavailable",
      "API temporariamente indisponivel",
      "A API publica nao esta habilitada para este tenant.",
      requestId,
    );
  }

  const { data: entitled, error: entitlementError } = await admin.rpc(
    "tenant_subscription_allows_access",
    { _company_id: integration.company_id },
  );
  if (entitlementError) {
    console.error("[public-api-v1] entitlement_lookup_failed", {
      code: entitlementError.code,
      requestId,
    });
    return apiProblem(
      503,
      "subscription_unavailable",
      "Servico indisponivel",
      "Nao foi possivel validar a assinatura do tenant.",
      requestId,
    );
  }
  if (entitled !== true) {
    return apiProblem(
      403,
      "subscription_inactive",
      "Acesso suspenso",
      "A assinatura ou o trial do tenant nao esta vigente.",
      requestId,
    );
  }

  const pepper = Deno.env.get("PUBLIC_API_AUDIT_PEPPER") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "unavailable";
  return {
    admin,
    integration: integration as ApiIntegration,
    key: key as ApiKeyRow,
    requestId,
    ipHash: await pseudonymizeIp(ip, pepper),
    startedAt,
  };
}

function uuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function validateAvailability(
  url: URL,
  requestId: string,
): JsonObject | Response {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const duration = Number(url.searchParams.get("duration_minutes"));
  const serviceTypeRaw = url.searchParams.get("service_type_id");
  const resourceRaw = url.searchParams.get("resource_id");
  if (
    !isIsoWithOffset(from) || !isIsoWithOffset(to) ||
    Date.parse(to) <= Date.parse(from)
  ) {
    return apiProblem(
      400,
      "invalid_datetime_range",
      "Periodo invalido",
      "Informe from e to em ISO 8601 com offset e em ordem crescente.",
      requestId,
    );
  }
  if ((Date.parse(to) - Date.parse(from)) > 31 * 24 * 60 * 60 * 1000) {
    return apiProblem(
      422,
      "range_too_large",
      "Periodo muito longo",
      "A consulta de disponibilidade aceita no maximo 31 dias.",
      requestId,
    );
  }
  if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
    return apiProblem(
      422,
      "invalid_duration",
      "Duracao invalida",
      "duration_minutes deve estar entre 15 e 480.",
      requestId,
    );
  }
  if (serviceTypeRaw && !uuidOrNull(serviceTypeRaw)) {
    return apiProblem(
      400,
      "invalid_service_type",
      "Servico invalido",
      "service_type_id deve ser um UUID valido.",
      requestId,
    );
  }
  if (resourceRaw && !uuidOrNull(resourceRaw)) {
    return apiProblem(
      400,
      "invalid_resource",
      "Recurso invalido",
      "resource_id deve ser um UUID valido.",
      requestId,
    );
  }
  return {
    from,
    to,
    duration_minutes: duration,
    service_type_id: serviceTypeRaw,
    resource_id: resourceRaw,
  };
}

function validateCustomerResolve(
  body: JsonObject,
  requestId: string,
): JsonObject | Response {
  if (!hasOnlyKeys(body, ["external_id", "document", "phone", "email"])) {
    return apiProblem(
      400,
      "unknown_field",
      "Campo nao permitido",
      "A requisicao contem campos nao suportados.",
      requestId,
    );
  }
  const result: JsonObject = {};
  if (body.external_id !== undefined) {
    if (
      typeof body.external_id !== "string" || !body.external_id.trim() ||
      body.external_id.length > 200
    ) {
      return apiProblem(
        422,
        "invalid_external_id",
        "Referencia invalida",
        "external_id deve ter entre 1 e 200 caracteres.",
        requestId,
      );
    }
    result.external_id = body.external_id.trim();
  }
  if (body.document !== undefined) {
    if (typeof body.document !== "string") {
      return apiProblem(
        422,
        "invalid_document",
        "Documento invalido",
        "document deve ser texto.",
        requestId,
      );
    }
    const document = normalizedDocument(body.document);
    if (![11, 14].includes(document.length)) {
      return apiProblem(
        422,
        "invalid_document",
        "Documento invalido",
        "Informe um CPF ou CNPJ valido.",
        requestId,
      );
    }
    result.document = document;
  }
  if (body.phone !== undefined) {
    if (typeof body.phone !== "string") {
      return apiProblem(
        422,
        "invalid_phone",
        "Telefone invalido",
        "phone deve usar o formato E.164.",
        requestId,
      );
    }
    const phone = normalizedPhone(body.phone);
    if (!phone) {
      return apiProblem(
        422,
        "invalid_phone",
        "Telefone invalido",
        "phone deve usar o formato E.164.",
        requestId,
      );
    }
    result.phone = phone;
  }
  if (body.email !== undefined) {
    if (
      typeof body.email !== "string" || body.email.length > 254 ||
      !body.email.includes("@")
    ) {
      return apiProblem(
        422,
        "invalid_email",
        "E-mail invalido",
        "Informe um e-mail valido.",
        requestId,
      );
    }
    result.email = normalizedEmail(body.email);
  }
  if (Object.keys(result).length === 0) {
    return apiProblem(
      422,
      "missing_customer_identifier",
      "Identificador obrigatorio",
      "Informe external_id, document, phone ou email.",
      requestId,
    );
  }
  return result;
}

function validateCreateOrder(
  body: JsonObject,
  requestId: string,
): JsonObject | Response {
  const topKeys = [
    "external_id",
    "customer",
    "service_type_id",
    "os_type",
    "description",
    "scheduled_at",
    "duration_minutes",
    "resource",
    "service_address",
  ] as const;
  if (!hasOnlyKeys(body, topKeys)) {
    return apiProblem(
      400,
      "unknown_field",
      "Campo nao permitido",
      "A requisicao contem campos nao suportados.",
      requestId,
    );
  }
  if (
    !isPlainObject(body.customer) ||
    !hasOnlyKeys(body.customer, [
      "id",
      "external_id",
      "name",
      "phone",
      "document",
      "email",
    ])
  ) {
    return apiProblem(
      422,
      "invalid_customer",
      "Cliente invalido",
      "Informe os dados permitidos de customer.",
      requestId,
    );
  }
  const customer = body.customer;
  if (customer.id !== undefined && !uuidOrNull(customer.id)) {
    return apiProblem(
      422,
      "invalid_customer",
      "Cliente invalido",
      "customer.id deve ser UUID.",
      requestId,
    );
  }
  if (
    customer.external_id !== undefined &&
    (typeof customer.external_id !== "string" || !customer.external_id.trim() ||
      customer.external_id.length > 200)
  ) {
    return apiProblem(
      422,
      "invalid_customer",
      "Cliente invalido",
      "customer.external_id e invalido.",
      requestId,
    );
  }
  if (
    customer.name !== undefined &&
    (typeof customer.name !== "string" || !customer.name.trim() ||
      customer.name.length > 200)
  ) {
    return apiProblem(
      422,
      "invalid_customer",
      "Cliente invalido",
      "customer.name e invalido.",
      requestId,
    );
  }
  if (!customer.id && !customer.external_id && !customer.name) {
    return apiProblem(
      422,
      "invalid_customer",
      "Cliente invalido",
      "Informe customer.id, customer.external_id ou dados para um novo cliente.",
      requestId,
    );
  }
  if (
    !customer.id && !customer.external_id && customer.name && !customer.phone &&
    !customer.document && !customer.email
  ) {
    return apiProblem(
      422,
      "missing_customer_identifier",
      "Identificador obrigatorio",
      "Novo cliente exige telefone, documento, e-mail ou external_id.",
      requestId,
    );
  }
  if (
    customer.phone !== undefined &&
    (typeof customer.phone !== "string" || !normalizedPhone(customer.phone))
  ) {
    return apiProblem(
      422,
      "invalid_phone",
      "Telefone invalido",
      "customer.phone deve usar E.164.",
      requestId,
    );
  }
  if (
    customer.document !== undefined &&
    (typeof customer.document !== "string" ||
      ![11, 14].includes(normalizedDocument(customer.document).length))
  ) {
    return apiProblem(
      422,
      "invalid_document",
      "Documento invalido",
      "customer.document deve ser CPF ou CNPJ.",
      requestId,
    );
  }
  if (
    customer.email !== undefined &&
    (typeof customer.email !== "string" || customer.email.length > 254 ||
      !customer.email.includes("@"))
  ) {
    return apiProblem(
      422,
      "invalid_email",
      "E-mail invalido",
      "customer.email e invalido.",
      requestId,
    );
  }
  if (
    typeof body.description !== "string" || !body.description.trim() ||
    body.description.length > 4_000
  ) {
    return apiProblem(
      422,
      "invalid_description",
      "Descricao invalida",
      "description e obrigatoria e aceita ate 4000 caracteres.",
      requestId,
    );
  }
  if (!isIsoWithOffset(body.scheduled_at)) {
    return apiProblem(
      422,
      "invalid_scheduled_at",
      "Horario invalido",
      "scheduled_at deve ser ISO 8601 com offset.",
      requestId,
    );
  }
  if (
    !Number.isInteger(body.duration_minutes) ||
    Number(body.duration_minutes) < 15 || Number(body.duration_minutes) > 480
  ) {
    return apiProblem(
      422,
      "invalid_duration",
      "Duracao invalida",
      "duration_minutes deve estar entre 15 e 480.",
      requestId,
    );
  }
  const validTypes = [
    "manutencao_preventiva",
    "manutencao_corretiva",
    "instalacao",
    "visita_tecnica",
  ];
  if (typeof body.os_type !== "string" || !validTypes.includes(body.os_type)) {
    return apiProblem(
      422,
      "invalid_os_type",
      "Tipo de OS invalido",
      "os_type nao e suportado.",
      requestId,
    );
  }
  if (
    body.external_id !== undefined &&
    (typeof body.external_id !== "string" || !body.external_id.trim() ||
      body.external_id.length > 200 ||
      body.external_id.startsWith("__internal__:"))
  ) {
    return apiProblem(
      422,
      "invalid_external_id",
      "Referencia invalida",
      "external_id deve ter entre 1 e 200 caracteres.",
      requestId,
    );
  }
  if (body.service_type_id !== undefined && !uuidOrNull(body.service_type_id)) {
    return apiProblem(
      422,
      "invalid_service_type",
      "Servico invalido",
      "service_type_id deve ser UUID.",
      requestId,
    );
  }
  if (body.resource !== undefined) {
    if (
      !isPlainObject(body.resource) ||
      !hasOnlyKeys(body.resource, ["id", "type"]) ||
      !uuidOrNull(body.resource.id) ||
      !["user", "team"].includes(String(body.resource.type))
    ) {
      return apiProblem(
        422,
        "invalid_resource",
        "Recurso invalido",
        "resource deve conter id e type validos.",
        requestId,
      );
    }
  }
  if (body.service_address !== undefined) {
    const allowedAddress = [
      "line1",
      "number",
      "neighborhood",
      "city",
      "state",
      "postal_code",
    ];
    if (
      !isPlainObject(body.service_address) ||
      !hasOnlyKeys(body.service_address, allowedAddress)
    ) {
      return apiProblem(
        422,
        "invalid_service_address",
        "Endereco invalido",
        "service_address contem campos invalidos.",
        requestId,
      );
    }
    const addressLimits: Record<string, number> = {
      line1: 300,
      number: 30,
      neighborhood: 100,
      city: 100,
      state: 100,
      postal_code: 30,
    };
    for (const [field, limit] of Object.entries(addressLimits)) {
      const value = body.service_address[field];
      if (
        value !== undefined &&
        (typeof value !== "string" || value.length > limit)
      ) {
        return apiProblem(
          422,
          "invalid_service_address",
          "Endereco invalido",
          `service_address.${field} e invalido.`,
          requestId,
        );
      }
    }
  }

  const normalized = structuredClone(body);
  const normalizedCustomer = (normalized as JsonObject).customer as JsonObject;
  if (typeof normalizedCustomer.phone === "string") {
    normalizedCustomer.phone = normalizedPhone(normalizedCustomer.phone);
  }
  if (typeof normalizedCustomer.document === "string") {
    normalizedCustomer.document = normalizedDocument(
      normalizedCustomer.document,
    );
  }
  if (typeof normalizedCustomer.email === "string") {
    normalizedCustomer.email = normalizedEmail(normalizedCustomer.email);
  }
  return normalized as JsonObject;
}

function validDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function validateCrmCardPayload(
  body: JsonObject,
  mode: "create" | "update",
  requestId: string,
): JsonObject | Response {
  const writable = [
    "title",
    "stage_id",
    "customer_id",
    "value",
    "probability",
    "source",
    "expected_close_date",
    "notes",
  ] as const;
  const allowed = mode === "create" ? ["external_id", ...writable] : writable;
  if (!hasOnlyKeys(body, allowed)) {
    return apiProblem(
      400,
      "unknown_field",
      "Campo nao permitido",
      "A requisicao contem campos nao suportados.",
      requestId,
    );
  }
  if (mode === "update" && Object.keys(body).length === 0) {
    return apiProblem(
      422,
      "empty_update",
      "Atualizacao vazia",
      "Informe ao menos um campo para atualizar.",
      requestId,
    );
  }
  if (mode === "create" && body.external_id !== undefined) {
    if (
      typeof body.external_id !== "string" || !body.external_id.trim() ||
      body.external_id.length > 200 ||
      body.external_id.startsWith("__internal__:")
    ) {
      return apiProblem(
        422,
        "invalid_external_id",
        "Referencia invalida",
        "external_id deve ter entre 1 e 200 caracteres.",
        requestId,
      );
    }
  }
  if (
    (mode === "create" || body.title !== undefined) &&
    (typeof body.title !== "string" || !body.title.trim() ||
      body.title.length > 200)
  ) {
    return apiProblem(
      422,
      "invalid_title",
      "Titulo invalido",
      "title e obrigatorio e aceita ate 200 caracteres.",
      requestId,
    );
  }
  if (
    (mode === "create" || body.stage_id !== undefined) &&
    !uuidOrNull(body.stage_id)
  ) {
    return apiProblem(
      422,
      "invalid_stage",
      "Etapa invalida",
      "stage_id deve ser um UUID de etapa comercial valido.",
      requestId,
    );
  }
  if (
    body.customer_id !== undefined && body.customer_id !== null &&
    !uuidOrNull(body.customer_id)
  ) {
    return apiProblem(
      422,
      "invalid_customer",
      "Cliente invalido",
      "customer_id deve ser um UUID valido ou null.",
      requestId,
    );
  }
  if (
    body.value !== undefined && body.value !== null &&
    (typeof body.value !== "number" || !Number.isFinite(body.value) ||
      body.value < 0 || body.value > 99_999_999.99)
  ) {
    return apiProblem(
      422,
      "invalid_value",
      "Valor invalido",
      "value deve ser um numero nao negativo dentro do limite aceito.",
      requestId,
    );
  }
  if (
    body.probability !== undefined && body.probability !== null &&
    (!Number.isInteger(body.probability) || Number(body.probability) < 0 ||
      Number(body.probability) > 100)
  ) {
    return apiProblem(
      422,
      "invalid_probability",
      "Probabilidade invalida",
      "probability deve ser um inteiro entre 0 e 100.",
      requestId,
    );
  }
  for (const [field, max] of [["source", 200], ["notes", 10_000]] as const) {
    const value = body[field];
    if (
      value !== undefined && value !== null &&
      (typeof value !== "string" || value.length > max)
    ) {
      return apiProblem(
        422,
        `invalid_${field}`,
        "Campo invalido",
        `${field} deve ser texto com ate ${max} caracteres ou null.`,
        requestId,
      );
    }
  }
  if (
    body.expected_close_date !== undefined &&
    body.expected_close_date !== null &&
    !validDateOnly(body.expected_close_date)
  ) {
    return apiProblem(
      422,
      "invalid_expected_close_date",
      "Data invalida",
      "expected_close_date deve usar o formato YYYY-MM-DD ou null.",
      requestId,
    );
  }

  const normalized = structuredClone(body);
  if (typeof normalized.title === "string") {
    normalized.title = normalized.title.trim();
  }
  if (typeof normalized.external_id === "string") {
    normalized.external_id = normalized.external_id.trim();
  }
  return normalized;
}

function validateCrmCardList(
  url: URL,
  requestId: string,
): JsonObject | Response {
  const allowed = new Set([
    "limit",
    "cursor",
    "pipeline_id",
    "stage_id",
    "updated_since",
  ]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) {
    return apiProblem(
      400,
      "unknown_query_parameter",
      "Parametro nao permitido",
      "A consulta contem parametros nao suportados.",
      requestId,
    );
  }
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  const cursor = url.searchParams.get("cursor");
  const pipelineId = url.searchParams.get("pipeline_id");
  const stageId = url.searchParams.get("stage_id");
  const updatedSince = url.searchParams.get("updated_since");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return apiProblem(
      422,
      "invalid_limit",
      "Limite invalido",
      "limit deve ser um inteiro entre 1 e 100.",
      requestId,
    );
  }
  if (cursor !== null && (!cursor || cursor.length > 500)) {
    return apiProblem(
      422,
      "invalid_cursor",
      "Cursor invalido",
      "Use o next_cursor retornado pela API.",
      requestId,
    );
  }
  if (pipelineId !== null && !uuidOrNull(pipelineId)) {
    return apiProblem(
      422,
      "invalid_pipeline",
      "Funil invalido",
      "pipeline_id deve ser UUID.",
      requestId,
    );
  }
  if (stageId !== null && !uuidOrNull(stageId)) {
    return apiProblem(
      422,
      "invalid_stage",
      "Etapa invalida",
      "stage_id deve ser UUID.",
      requestId,
    );
  }
  if (updatedSince !== null && !isIsoWithOffset(updatedSince)) {
    return apiProblem(
      422,
      "invalid_updated_since",
      "Data invalida",
      "updated_since deve ser ISO 8601 com offset.",
      requestId,
    );
  }
  return {
    limit,
    cursor,
    pipeline_id: pipelineId,
    stage_id: stageId,
    updated_since: updatedSince,
  };
}

function idempotencyKeyOrProblem(
  req: Request,
  requestId: string,
): string | Response {
  const value = req.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(value)) {
    return apiProblem(
      400,
      "invalid_idempotency_key",
      "Chave de idempotencia invalida",
      "Envie Idempotency-Key com 8 a 200 caracteres seguros.",
      requestId,
    );
  }
  return value;
}

async function readApiJson(
  req: Request,
  requestId: string,
): Promise<JsonObject | Response> {
  try {
    return await readJsonBody(req);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return apiProblem(
        413,
        "payload_too_large",
        "Requisicao muito grande",
        "O corpo excede 64 KiB.",
        requestId,
      );
    }
    return apiProblem(
      400,
      "invalid_json",
      "JSON invalido",
      "Envie um objeto JSON valido.",
      requestId,
    );
  }
}

async function routeRequest(
  req: Request,
  url: URL,
  route: string,
  ctx: ApiContext,
): Promise<Response> {
  if (route === "capabilities") {
    const [
      { data: settings, error: settingsError },
      { data: companySettings, error: timezoneError },
    ] = await Promise.all([
      ctx.admin.from("schedule_booking_settings")
        .select(
          "slot_interval_minutes,minimum_notice_minutes,booking_horizon_days,default_duration_minutes,weekly_hours",
        )
        .eq("company_id", ctx.integration.company_id)
        .maybeSingle(),
      ctx.admin.from("company_settings").select("timezone").eq(
        "company_id",
        ctx.integration.company_id,
      ).maybeSingle(),
    ]);
    if (settingsError || timezoneError || !companySettings?.timezone) {
      return apiProblem(
        503,
        "temporarily_unavailable",
        "Servico indisponivel",
        "Nao foi possivel carregar as capacidades.",
        ctx.requestId,
      );
    }
    return apiJson(
      {
        version: "v1",
        timezone: companySettings.timezone,
        scopes: ctx.integration.scopes,
        distribution_mode: ctx.integration.distribution_mode,
        schedule_configured: Boolean(settings),
        limits: {
          requests_per_minute: GLOBAL_RATE_LIMIT,
          availability_per_minute: AVAILABILITY_RATE_LIMIT,
          mutations_per_minute: MUTATION_RATE_LIMIT,
          max_body_bytes: 65_536,
          max_availability_days: 31,
          max_availability_options: 50,
        },
        booking: settings ?? null,
      },
      200,
      ctx.requestId,
    );
  }

  if (route === "service_types") {
    const { data, error } = await ctx.admin.from("service_types")
      .select("id,name,description,requires_equipment")
      .eq("company_id", ctx.integration.company_id)
      .eq("is_active", true)
      .order("name");
    if (error) return rpcFailure(error, ctx.requestId);
    return apiJson({ data: data ?? [] }, 200, ctx.requestId);
  }

  if (route === "booking_resources") {
    if (ctx.integration.distribution_mode !== "agent_selects") {
      return apiProblem(
        404,
        "not_found",
        "Recurso nao encontrado",
        "Este endpoint nao esta disponivel para o modo configurado.",
        ctx.requestId,
      );
    }
    const { data, error } = await ctx.admin.rpc(
      "public_api_get_booking_resources",
      {
        p_integration_id: ctx.integration.id,
      },
    );
    if (error) return rpcFailure(error, ctx.requestId);
    const problem = asRpcProblem(data, ctx.requestId);
    return problem ?? apiJson(firstRpcRow(data), 200, ctx.requestId);
  }

  if (route === "availability") {
    const params = validateAvailability(url, ctx.requestId);
    if (params instanceof Response) return params;
    const { data, error } = await ctx.admin.rpc("public_api_get_availability", {
      p_integration_id: ctx.integration.id,
      p_from: params.from,
      p_to: params.to,
      p_duration_minutes: params.duration_minutes,
      p_service_type_id: params.service_type_id,
      p_resource_id: params.resource_id,
    });
    if (error) return rpcFailure(error, ctx.requestId);
    const problem = asRpcProblem(data, ctx.requestId);
    return problem ?? apiJson(firstRpcRow(data), 200, ctx.requestId);
  }

  if (route === "customers_resolve") {
    let body: JsonObject;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return apiProblem(
          413,
          "payload_too_large",
          "Requisicao muito grande",
          "O corpo excede 64 KiB.",
          ctx.requestId,
        );
      }
      return apiProblem(
        400,
        "invalid_json",
        "JSON invalido",
        "Envie um objeto JSON valido.",
        ctx.requestId,
      );
    }
    const payload = validateCustomerResolve(body, ctx.requestId);
    if (payload instanceof Response) return payload;
    const { data, error } = await ctx.admin.rpc("public_api_resolve_customer", {
      p_integration_id: ctx.integration.id,
      p_payload: payload,
    });
    if (error) return rpcFailure(error, ctx.requestId);
    const problem = asRpcProblem(data, ctx.requestId);
    return problem ?? apiJson(firstRpcRow(data), 200, ctx.requestId);
  }

  if (route === "service_orders_create") {
    const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(idempotencyKey)) {
      return apiProblem(
        400,
        "invalid_idempotency_key",
        "Chave de idempotencia invalida",
        "Envie Idempotency-Key com 8 a 200 caracteres seguros.",
        ctx.requestId,
      );
    }
    let body: JsonObject;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return apiProblem(
          413,
          "payload_too_large",
          "Requisicao muito grande",
          "O corpo excede 64 KiB.",
          ctx.requestId,
        );
      }
      return apiProblem(
        400,
        "invalid_json",
        "JSON invalido",
        "Envie um objeto JSON valido.",
        ctx.requestId,
      );
    }
    const payload = validateCreateOrder(body, ctx.requestId);
    if (payload instanceof Response) return payload;
    if (
      ctx.integration.distribution_mode === "agent_selects" &&
      !isPlainObject(payload.resource)
    ) {
      return apiProblem(
        422,
        "resource_required",
        "Responsavel obrigatorio",
        "Informe resource no modo agent_selects.",
        ctx.requestId,
      );
    }
    if (
      ctx.integration.distribution_mode !== "agent_selects" &&
      payload.resource !== undefined
    ) {
      return apiProblem(
        422,
        "resource_not_allowed",
        "Responsavel nao permitido",
        "O responsavel e definido pelo modo de distribuicao configurado.",
        ctx.requestId,
      );
    }
    const requestHash = await sha256Hex(canonicalJson(payload));
    const { data, error } = await ctx.admin.rpc(
      "public_api_create_service_order",
      {
        p_integration_id: ctx.integration.id,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
        p_payload: payload,
      },
    );
    if (error) return rpcFailure(error, ctx.requestId);
    const problem = asRpcProblem(data, ctx.requestId);
    if (problem) return problem;
    const result = firstRpcRow(data);
    const replay = isPlainObject(result) && result.idempotent_replay === true;
    return apiJson(result, replay ? 200 : 201, ctx.requestId, {
      Location: isPlainObject(result) && typeof result.id === "string"
        ? `/v1/service-orders/${result.id}`
        : "/v1/service-orders",
    });
  }

  if (route === "crm_pipelines_list") {
    const { data, error } = await ctx.admin.rpc(
      "public_api_get_crm_pipelines",
      { p_integration_id: ctx.integration.id },
    );
    if (error) return rpcFailure(error, ctx.requestId);
    const problem = asRpcProblem(data, ctx.requestId);
    return problem ?? apiJson(firstRpcRow(data), 200, ctx.requestId);
  }

  if (route === "crm_cards_list") {
    const params = validateCrmCardList(url, ctx.requestId);
    if (params instanceof Response) return params;
    const { data, error } = await ctx.admin.rpc(
      "public_api_list_crm_cards",
      {
        p_integration_id: ctx.integration.id,
        p_limit: params.limit,
        p_cursor: params.cursor,
        p_pipeline_id: params.pipeline_id,
        p_stage_id: params.stage_id,
        p_updated_since: params.updated_since,
      },
    );
    if (error) return rpcFailure(error, ctx.requestId);
    const problem = asRpcProblem(data, ctx.requestId);
    return problem ?? apiJson(firstRpcRow(data), 200, ctx.requestId);
  }

  if (route === "crm_cards_create") {
    const idempotencyKey = idempotencyKeyOrProblem(req, ctx.requestId);
    if (idempotencyKey instanceof Response) return idempotencyKey;
    const body = await readApiJson(req, ctx.requestId);
    if (body instanceof Response) return body;
    const payload = validateCrmCardPayload(body, "create", ctx.requestId);
    if (payload instanceof Response) return payload;
    const requestHash = await sha256Hex(canonicalJson(payload));
    const { data, error } = await ctx.admin.rpc(
      "public_api_create_crm_card",
      {
        p_integration_id: ctx.integration.id,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
        p_payload: payload,
      },
    );
    if (error) return rpcFailure(error, ctx.requestId);
    const problem = asRpcProblem(data, ctx.requestId);
    if (problem) return problem;
    const result = firstRpcRow(data);
    const replay = isPlainObject(result) && result.idempotent_replay === true;
    return apiJson(result, replay ? 200 : 201, ctx.requestId, {
      Location: isPlainObject(result) && typeof result.id === "string"
        ? `/v1/crm/cards/${result.id}`
        : "/v1/crm/cards",
    });
  }

  if (
    route === "crm_cards_get" || route === "crm_cards_get_external" ||
    route === "crm_cards_update"
  ) {
    const byExternal = route === "crm_cards_get_external";
    const prefix = byExternal
      ? "/v1/crm/cards/by-external-id/"
      : "/v1/crm/cards/";
    let identifier: string;
    try {
      identifier = decodeURIComponent(
        publicApiPath(url.pathname).slice(prefix.length),
      );
    } catch {
      return apiProblem(
        400,
        "invalid_identifier",
        "Identificador invalido",
        "O identificador nao e valido.",
        ctx.requestId,
      );
    }
    if (
      !identifier || identifier.length > 200 ||
      (!byExternal && !UUID_RE.test(identifier))
    ) {
      return apiProblem(
        400,
        "invalid_identifier",
        "Identificador invalido",
        "O identificador nao e valido.",
        ctx.requestId,
      );
    }

    if (route === "crm_cards_update") {
      const idempotencyKey = idempotencyKeyOrProblem(req, ctx.requestId);
      if (idempotencyKey instanceof Response) return idempotencyKey;
      const body = await readApiJson(req, ctx.requestId);
      if (body instanceof Response) return body;
      const payload = validateCrmCardPayload(body, "update", ctx.requestId);
      if (payload instanceof Response) return payload;
      const requestHash = await sha256Hex(canonicalJson(payload));
      const { data, error } = await ctx.admin.rpc(
        "public_api_update_crm_card",
        {
          p_integration_id: ctx.integration.id,
          p_card_id: identifier,
          p_idempotency_key: idempotencyKey,
          p_request_hash: requestHash,
          p_payload: payload,
        },
      );
      if (error) return rpcFailure(error, ctx.requestId);
      const problem = asRpcProblem(data, ctx.requestId);
      return problem ?? apiJson(firstRpcRow(data), 200, ctx.requestId);
    }

    const { data, error } = await ctx.admin.rpc("public_api_get_crm_card", {
      p_integration_id: ctx.integration.id,
      p_card_id: byExternal ? null : identifier,
      p_external_id: byExternal ? identifier : null,
    });
    if (error) return rpcFailure(error, ctx.requestId);
    const problem = asRpcProblem(data, ctx.requestId);
    return problem ?? apiJson(firstRpcRow(data), 200, ctx.requestId);
  }

  if (
    route === "service_orders_get" || route === "service_orders_get_external"
  ) {
    const prefix = route === "service_orders_get_external"
      ? "/v1/service-orders/by-external-id/"
      : "/v1/service-orders/";
    let identifier: string;
    try {
      identifier = decodeURIComponent(
        publicApiPath(url.pathname).slice(prefix.length),
      );
    } catch {
      return apiProblem(
        400,
        "invalid_identifier",
        "Identificador invalido",
        "O identificador nao e valido.",
        ctx.requestId,
      );
    }
    if (
      !identifier || identifier.length > 200 ||
      (route === "service_orders_get" && !UUID_RE.test(identifier))
    ) {
      return apiProblem(
        400,
        "invalid_identifier",
        "Identificador invalido",
        "O identificador nao e valido.",
        ctx.requestId,
      );
    }
    const { data, error } = await ctx.admin.rpc(
      "public_api_get_service_order",
      {
        p_integration_id: ctx.integration.id,
        p_service_order_id: route === "service_orders_get" ? identifier : null,
        p_external_id: route === "service_orders_get_external"
          ? identifier
          : null,
      },
    );
    if (error) return rpcFailure(error, ctx.requestId);
    const problem = asRpcProblem(data, ctx.requestId);
    return problem ?? apiJson(firstRpcRow(data), 200, ctx.requestId);
  }

  return apiProblem(
    404,
    "not_found",
    "Endpoint nao encontrado",
    "Confira o metodo e o caminho da requisicao.",
    ctx.requestId,
  );
}

Deno.serve(async (req) => {
  const startedAt = performance.now();
  const forwardedRequestId = req.headers.get("x-request-id") ?? "";
  const requestId = UUID_RE.test(forwardedRequestId)
    ? forwardedRequestId
    : crypto.randomUUID();
  const method = req.method.toUpperCase();
  const url = new URL(req.url);
  const path = publicApiPath(url.pathname);
  const route = routeName(method, path);

  // O dominio publico e a unica fronteira de entrada suportada. Um segredo
  // dedicado autentica o proxy e impede que a URL da edge contorne a origem do
  // IP usada pela allowlist. Ausencia ou divergencia sempre falha fechado.
  const expectedProxySecret = Deno.env.get("PUBLIC_API_PROXY_SECRET");
  const providedProxySecret =
    req.headers.get("x-dominex-proxy-authorization") ?? "";
  if (
    !expectedProxySecret ||
    !timingSafeEqual(providedProxySecret, expectedProxySecret)
  ) {
    return logRequestCompleted(
      requestId,
      route,
      apiProblem(
        404,
        "not_found",
        "Recurso nao encontrado",
        "O recurso informado nao existe.",
        requestId,
      ),
      startedAt,
    );
  }

  // Sem resposta CORS inclusive para preflight: esta API e server-to-server.
  if (method === "OPTIONS") {
    return logRequestCompleted(
      requestId,
      route,
      apiProblem(
        405,
        "method_not_allowed",
        "Metodo nao permitido",
        "A API publica nao aceita chamadas de navegador.",
        requestId,
        { Allow: "GET, POST, PATCH" },
      ),
      startedAt,
    );
  }
  if (!["GET", "POST", "PATCH"].includes(method)) {
    return logRequestCompleted(
      requestId,
      route,
      apiProblem(
        405,
        "method_not_allowed",
        "Metodo nao permitido",
        "Use um dos metodos documentados.",
        requestId,
        { Allow: "GET, POST, PATCH" },
      ),
      startedAt,
    );
  }
  if (
    method !== "GET" &&
    !req.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) {
    return logRequestCompleted(
      requestId,
      route,
      apiProblem(
        400,
        "invalid_content_type",
        "Conteudo invalido",
        "Use Content-Type: application/json.",
        requestId,
      ),
      startedAt,
    );
  }
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 65_536) {
    return logRequestCompleted(
      requestId,
      route,
      apiProblem(
        413,
        "payload_too_large",
        "Requisicao muito grande",
        "O corpo excede 64 KiB.",
        requestId,
      ),
      startedAt,
    );
  }

  const ip = (req.headers.get("x-dominex-client-ip") ?? "unknown").trim().slice(
    0,
    80,
  );
  const preauth = allowPreauthIp(ip);
  if (!preauth.allowed) {
    return logRequestCompleted(
      requestId,
      route,
      apiProblem(
        429,
        "rate_limit_exceeded",
        "Limite de requisicoes excedido",
        "Aguarde antes de tentar novamente.",
        requestId,
        { "Retry-After": String(preauth.retryAfter) },
      ),
      startedAt,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[public-api-v1] missing_server_configuration", {
      requestId,
    });
    return logRequestCompleted(
      requestId,
      route,
      apiProblem(
        503,
        "temporarily_unavailable",
        "Servico indisponivel",
        "Tente novamente em instantes.",
        requestId,
      ),
      startedAt,
    );
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authenticated = await authenticate(
    req,
    admin,
    requestId,
    startedAt,
    ip,
  );
  if (authenticated instanceof Response) {
    return logRequestCompleted(requestId, route, authenticated, startedAt);
  }
  const ctx = authenticated;

  let response = await consumeRateLimit(ctx, "general", GLOBAL_RATE_LIMIT);
  if (!response && route === "availability") {
    response = await consumeRateLimit(
      ctx,
      "availability",
      AVAILABILITY_RATE_LIMIT,
    );
  }
  if (!response && method !== "GET") {
    response = await consumeRateLimit(ctx, "mutation", MUTATION_RATE_LIMIT);
  }
  if (!response) {
    const scope = requiredScope(route);
    if (scope && !ctx.integration.scopes.includes(scope)) {
      response = apiProblem(
        403,
        "insufficient_scope",
        "Escopo insuficiente",
        `A chave exige o escopo ${scope}.`,
        requestId,
      );
    }
  }
  if (!response) response = await routeRequest(req, url, route, ctx);

  // Last-used e auditoria sao best-effort: nunca mudam o resultado de negocio.
  await Promise.all([
    admin.from("public_api_keys").update({
      last_used_at: new Date().toISOString(),
    }).eq("id", ctx.key.id),
    audit(ctx, route, path, method, response),
  ]);
  return logRequestCompleted(
    requestId,
    route,
    response,
    startedAt,
    ctx.integration.id,
  );
});
