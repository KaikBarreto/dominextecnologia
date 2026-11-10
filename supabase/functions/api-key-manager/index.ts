// deno-lint-ignore-file no-import-prefix
// Gestao interna de integracoes e chaves da API publica.
// Exige JWT Dominex e autorizacao estrita: admin ou fn:manage_api_keys presente
// em user_permissions. O fallback legado de permissoes nao participa deste gate.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  BodyTooLargeError,
  hasOnlyKeys,
  isPlainObject,
  isValidIpOrCidr,
  type JsonObject,
  pseudonymizeIp,
  randomApiSecret,
  randomPublicId,
  readJsonBody,
  requestIp,
  sha256Hex,
} from "../_shared/public-api.ts";

const ALLOWED_SCOPES = new Set([
  "catalogs:read",
  "availability:read",
  "customers:resolve",
  "service_orders:create",
  "service_orders:read",
  "crm_cards:read",
  "crm_cards:write",
]);
const DISTRIBUTION_MODES = new Set([
  "agent_selects",
  "round_robin",
  "unassigned",
]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INTEGRATIONS = 5;
const MAX_ACTIVE_KEYS = 2;
const KEY_VALIDITY_DAYS = 180;
const ROTATION_OVERLAP_DAYS = 7;

type SupabaseAdmin = SupabaseClient;
type ManagerContext = {
  admin: SupabaseAdmin;
  userClient: SupabaseAdmin;
  userId: string;
  companyId: string;
  requestId: string;
  ipHash: string;
};
type LocalRate = { count: number; resetAt: number };
const localRate = new Map<string, LocalRate>();

class ActionError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

function response(
  req: Request,
  body: unknown,
  status: number,
  requestId: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Request-Id": requestId,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function errorResponse(
  req: Request,
  error: ActionError,
  requestId: string,
): Response {
  const result = response(
    req,
    { error: error.message, code: error.code, request_id: requestId },
    error.status,
    requestId,
  );
  if (error.status === 429) {
    result.headers.set("Retry-After", String(error.retryAfter ?? 60));
  }
  return result;
}

function localAllow(
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const current = localRate.get(key);
  if (!current || now >= current.resetAt) {
    localRate.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  if (localRate.size > 5_000) {
    for (const [entryKey, entry] of localRate) {
      if (now >= entry.resetAt) localRate.delete(entryKey);
    }
  }
  return {
    allowed: current.count <= max,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token && !token.startsWith("dmx_live_") ? token : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function validScopes(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.length <= ALLOWED_SCOPES.size &&
    value.every((scope) =>
      typeof scope === "string" && ALLOWED_SCOPES.has(scope)
    ) &&
    new Set(value).size === value.length;
}

function validAllowlist(value: unknown): value is string[] {
  return value === undefined ||
    (Array.isArray(value) && value.length <= 20 &&
      value.every(isValidIpOrCidr));
}

function ensureUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new ActionError(422, "invalid_identifier", `${label} e invalido.`);
  }
  return value;
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 86_400_000).toISOString();
}

function firstRpcRow(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

async function consumePersistentRate(
  ctx: ManagerContext,
  route: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const { data, error } = await ctx.userClient.rpc(
    "api_key_manager_consume_rate_limit",
    {
      p_user_id: ctx.userId,
      p_ip_hash: ctx.ipHash,
      p_route: route,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    },
  );
  if (error) {
    console.error("[api-key-manager] rate_limit_rpc_failed", {
      code: error.code,
      requestId: ctx.requestId,
    });
    throw new ActionError(
      503,
      "rate_limit_unavailable",
      "Nao foi possivel validar o limite de requisicoes.",
    );
  }
  const result = firstRpcRow(data);
  if (!isPlainObject(result) || result.allowed !== true) {
    const resetAt = isPlainObject(result) && typeof result.reset_at === "string"
      ? Date.parse(result.reset_at)
      : NaN;
    const retryAfter = Number.isFinite(resetAt)
      ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
      : windowSeconds;
    throw new ActionError(
      429,
      "rate_limit_exceeded",
      "Limite de requisicoes excedido. Aguarde e tente novamente.",
      retryAfter,
    );
  }
}

async function authorize(
  req: Request,
  requestId: string,
): Promise<ManagerContext> {
  const token = bearerToken(req);
  if (!token) {
    throw new ActionError(401, "unauthorized", "Sessao invalida ou expirada.");
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new ActionError(
      503,
      "server_configuration",
      "Servico temporariamente indisponivel.",
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const userId = authData.user?.id;
  if (authError || !userId) {
    throw new ActionError(401, "unauthorized", "Sessao invalida ou expirada.");
  }

  const [
    { data: profile, error: profileError },
    { data: roles, error: roleError },
    { data: permission, error: permissionError },
  ] = await Promise.all([
    admin.from("profiles").select("company_id,is_active").eq("user_id", userId)
      .maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", userId),
    admin.from("user_permissions").select("permissions,is_active").eq(
      "user_id",
      userId,
    ).eq("is_active", true).maybeSingle(),
  ]);
  if (profileError || roleError || permissionError) {
    throw new ActionError(
      503,
      "authorization_unavailable",
      "Nao foi possivel validar sua permissao.",
    );
  }
  if (!profile?.company_id || profile.is_active === false) {
    throw new ActionError(403, "forbidden", "Usuario sem empresa ativa.");
  }
  const isAdmin = (roles ?? []).some((entry) =>
    entry.role === "admin" || entry.role === "super_admin"
  );
  const explicitPermissions = Array.isArray(permission?.permissions)
    ? permission.permissions
    : [];
  if (
    !isAdmin && !explicitPermissions.includes("*") &&
    !explicitPermissions.includes("fn:manage_api_keys")
  ) {
    throw new ActionError(
      403,
      "forbidden",
      "Voce nao tem permissao para gerenciar chaves de API.",
    );
  }

  const [
    { data: entitled, error: entitlementError },
    { data: flag, error: flagError },
  ] = await Promise.all([
    admin.rpc("tenant_subscription_allows_access", {
      _company_id: profile.company_id,
    }),
    admin.from("app_feature_flags").select("enabled,company_allowlist").eq(
      "key",
      "public_api_v1",
    ).maybeSingle(),
  ]);
  if (entitlementError) {
    throw new ActionError(
      503,
      "subscription_unavailable",
      "Nao foi possivel validar a assinatura da empresa.",
    );
  }
  if (entitled !== true) {
    throw new ActionError(
      403,
      "subscription_inactive",
      "A assinatura ou o trial da empresa nao esta vigente.",
    );
  }
  if (flagError) {
    throw new ActionError(
      503,
      "feature_unavailable",
      "Nao foi possivel validar a liberacao da API Publica.",
    );
  }
  if (
    !flag ||
    (flag.enabled !== true &&
      !asArray(flag.company_allowlist).includes(profile.company_id))
  ) {
    throw new ActionError(
      403,
      "feature_unavailable",
      "A API publica ainda nao esta habilitada para esta empresa.",
    );
  }

  const pepper = Deno.env.get("PUBLIC_API_AUDIT_PEPPER") ?? serviceRoleKey;
  return {
    admin,
    userClient,
    userId,
    companyId: profile.company_id,
    requestId,
    ipHash: await pseudonymizeIp(requestIp(req), pepper),
  };
}

async function ownedIntegration(ctx: ManagerContext, integrationId: string) {
  const { data, error } = await ctx.admin.from("public_api_integrations")
    .select("id,company_id,name,status,scopes,distribution_mode,ip_allowlist")
    .eq("id", integrationId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (error) {
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel consultar a integracao.",
    );
  }
  if (!data) {
    throw new ActionError(404, "not_found", "Integracao nao encontrada.");
  }
  return data;
}

async function replaceResources(
  ctx: ManagerContext,
  integrationId: string,
  resources: unknown,
): Promise<void> {
  if (resources === undefined) return;
  if (!Array.isArray(resources) || resources.length > 100) {
    throw new ActionError(
      422,
      "invalid_resources",
      "A lista de recursos e invalida.",
    );
  }
  const normalized = resources.map((resource) => {
    if (
      !isPlainObject(resource) || !hasOnlyKeys(resource, ["id", "type"]) ||
      !["user", "team"].includes(String(resource.type))
    ) {
      throw new ActionError(
        422,
        "invalid_resources",
        "Um recurso configurado e invalido.",
      );
    }
    return {
      integration_id: integrationId,
      resource_id: ensureUuid(resource.id, "Recurso"),
      resource_type: resource.type,
    };
  });
  const unique = new Set(
    normalized.map((entry) => `${entry.resource_type}:${entry.resource_id}`),
  );
  if (unique.size !== normalized.length) {
    throw new ActionError(
      422,
      "invalid_resources",
      "A lista de recursos contem duplicidades.",
    );
  }

  // Valida posse antes de gravar; UUID alheio e inexistente sao indistinguiveis.
  for (const resource of normalized) {
    if (resource.resource_type === "user") {
      const { data } = await ctx.admin.from("profiles").select("user_id").eq(
        "user_id",
        resource.resource_id,
      ).eq("company_id", ctx.companyId).eq("is_active", true).maybeSingle();
      if (!data) {
        throw new ActionError(
          404,
          "not_found",
          "Um recurso configurado nao foi encontrado.",
        );
      }
    } else {
      const { data } = await ctx.admin.from("teams").select("id").eq(
        "id",
        resource.resource_id,
      ).eq("company_id", ctx.companyId).eq("is_active", true).maybeSingle();
      if (!data) {
        throw new ActionError(
          404,
          "not_found",
          "Um recurso configurado nao foi encontrado.",
        );
      }
    }
  }

  const { error: deleteError } = await ctx.admin.from(
    "public_api_integration_resources",
  ).delete().eq("integration_id", integrationId);
  if (deleteError) {
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel atualizar os recursos.",
    );
  }
  if (normalized.length) {
    const { error: insertError } = await ctx.admin.from(
      "public_api_integration_resources",
    ).insert(normalized);
    if (insertError) {
      throw new ActionError(
        503,
        "temporarily_unavailable",
        "Nao foi possivel atualizar os recursos.",
      );
    }
  }
}

async function listState(ctx: ManagerContext): Promise<JsonObject> {
  const { data: integrations, error: integrationsError } = await ctx.admin
    .from("public_api_integrations")
    .select(
      "id,name,status,scopes,distribution_mode,ip_allowlist,created_at,updated_at",
    )
    .eq("company_id", ctx.companyId)
    .order("created_at", { ascending: false });
  if (integrationsError) {
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel carregar as integracoes.",
    );
  }
  const ids = (integrations ?? []).map((integration) => integration.id);

  const emptyResult = Promise.resolve({ data: [], error: null });
  const [
    keysResult,
    settingsResult,
    exceptionsResult,
    resourcesResult,
    usersResult,
    teamsResult,
    activityResult,
    timezoneResult,
  ] = await Promise.all([
    ids.length
      ? ctx.admin.from("public_api_keys").select(
        "id,integration_id,name,public_id,secret_last_four,created_at,valid_from,expires_at,last_used_at,revoked_at,rotated_from_key_id",
      ).in("integration_id", ids).order("created_at", { ascending: false })
      : emptyResult,
    ctx.admin.from("schedule_booking_settings").select(
      "weekly_hours,slot_interval_minutes,minimum_notice_minutes,booking_horizon_days,default_duration_minutes,updated_at",
    ).eq("company_id", ctx.companyId).maybeSingle(),
    ctx.admin.from("schedule_booking_exceptions").select(
      "id,starts_at,ends_at,is_available,reason,created_at",
    ).eq("company_id", ctx.companyId).gte("ends_at", new Date().toISOString())
      .order("starts_at").limit(200),
    ids.length
      ? ctx.admin.from("public_api_integration_resources").select(
        "integration_id,resource_type,resource_id",
      ).in("integration_id", ids)
      : emptyResult,
    ctx.admin.from("profiles").select("user_id,full_name").eq(
      "company_id",
      ctx.companyId,
    ).eq("is_active", true).order("full_name"),
    ctx.admin.from("teams").select("id,name").eq("company_id", ctx.companyId)
      .eq("is_active", true).order("name"),
    ids.length
      ? ctx.admin.from("public_api_request_audit").select(
        "integration_id,status_code,duration_ms,created_at",
      ).in("integration_id", ids).gte("created_at", addDays(new Date(), -30))
        .limit(2_000)
      : emptyResult,
    ctx.admin.from("company_settings").select("timezone").eq(
      "company_id",
      ctx.companyId,
    ).maybeSingle(),
  ]);
  const firstError = [
    keysResult.error,
    settingsResult.error,
    exceptionsResult.error,
    resourcesResult.error,
    usersResult.error,
    teamsResult.error,
    activityResult.error,
    timezoneResult.error,
  ].find(Boolean);
  if (firstError) {
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel carregar todas as configuracoes.",
    );
  }
  if (!timezoneResult.data?.timezone) {
    throw new ActionError(
      503,
      "timezone_unavailable",
      "Configure o fuso horario da empresa antes de habilitar agendamentos pela API.",
    );
  }

  const keysByIntegration = new Map<string, unknown[]>();
  for (const key of keysResult.data ?? []) {
    const list = keysByIntegration.get(key.integration_id) ?? [];
    list.push(key);
    keysByIntegration.set(key.integration_id, list);
  }
  const resourcesByIntegration = new Map<string, unknown[]>();
  for (const resource of resourcesResult.data ?? []) {
    const list = resourcesByIntegration.get(resource.integration_id) ?? [];
    list.push({ id: resource.resource_id, type: resource.resource_type });
    resourcesByIntegration.set(resource.integration_id, list);
  }
  const activityRows = activityResult.data ?? [];
  const activity = ids.map((integrationId) => {
    const rows = activityRows.filter((row) =>
      row.integration_id === integrationId
    );
    const durations = rows.map((row) => Number(row.duration_ms)).filter(
      Number.isFinite,
    ).sort((a, b) => a - b);
    return {
      integration_id: integrationId,
      requests_30d: rows.length,
      errors_30d: rows.filter((row) => Number(row.status_code) >= 400).length,
      p95_ms: durations.length
        ? durations[
          Math.min(durations.length - 1, Math.floor(durations.length * 0.95))
        ]
        : null,
    };
  });

  return {
    integrations: (integrations ?? []).map((integration) => ({
      ...integration,
      keys: keysByIntegration.get(integration.id) ?? [],
      resources: resourcesByIntegration.get(integration.id) ?? [],
    })),
    booking_settings: settingsResult.data ?? null,
    booking_exceptions: exceptionsResult.data ?? [],
    timezone: timezoneResult.data.timezone,
    resources: {
      users: (usersResult.data ?? []).map((user) => ({
        id: user.user_id,
        type: "user",
        name: user.full_name,
      })),
      teams: (teamsResult.data ?? []).map((team) => ({
        id: team.id,
        type: "team",
        name: team.name,
      })),
    },
    activity,
  };
}

async function createIntegration(
  ctx: ManagerContext,
  body: JsonObject,
): Promise<JsonObject> {
  if (
    !hasOnlyKeys(body, [
      "action",
      "name",
      "scopes",
      "distribution_mode",
      "ip_allowlist",
      "resources",
      "resource_ids",
    ])
  ) {
    throw new ActionError(
      400,
      "unknown_field",
      "A requisicao contem campos nao permitidos.",
    );
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 100) {
    throw new ActionError(
      422,
      "invalid_name",
      "O nome deve ter entre 2 e 100 caracteres.",
    );
  }
  if (!validScopes(body.scopes)) {
    throw new ActionError(
      422,
      "invalid_scopes",
      "Selecione ao menos um escopo valido.",
    );
  }
  if (
    typeof body.distribution_mode !== "string" ||
    !DISTRIBUTION_MODES.has(body.distribution_mode)
  ) {
    throw new ActionError(
      422,
      "invalid_distribution_mode",
      "O modo de distribuicao e invalido.",
    );
  }
  if (!validAllowlist(body.ip_allowlist)) {
    throw new ActionError(
      422,
      "invalid_ip_allowlist",
      "A allowlist de IP/CIDR e invalida.",
    );
  }
  const resources = body.resources ??
    (Array.isArray(body.resource_ids)
      ? body.resource_ids.map((id) => ({ id, type: "user" }))
      : undefined);
  if (
    body.distribution_mode !== "unassigned" &&
    (!Array.isArray(resources) || resources.length === 0)
  ) {
    throw new ActionError(
      422,
      "resource_pool_required",
      "Selecione ao menos um recurso para o modo de distribuicao escolhido.",
    );
  }
  const { count, error: countError } = await ctx.admin.from(
    "public_api_integrations",
  )
    .select("id", { count: "exact", head: true }).eq(
      "company_id",
      ctx.companyId,
    );
  if (countError) {
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel validar o limite de integracoes.",
    );
  }
  if ((count ?? 0) >= MAX_INTEGRATIONS) {
    throw new ActionError(
      409,
      "integration_limit",
      "A empresa ja possui o maximo de cinco integracoes.",
    );
  }

  const { data, error } = await ctx.admin.from("public_api_integrations")
    .insert({
      company_id: ctx.companyId,
      name,
      scopes: body.scopes,
      distribution_mode: body.distribution_mode,
      ip_allowlist: body.ip_allowlist ?? [],
      status: "active",
      created_by: ctx.userId,
    }).select(
      "id,name,status,scopes,distribution_mode,ip_allowlist,created_at,updated_at",
    ).single();
  if (error || !data) {
    if (error?.code === "23505" || error?.code === "23514") {
      throw new ActionError(
        409,
        "integration_limit",
        "Nao foi possivel criar outra integracao.",
      );
    }
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel criar a integracao.",
    );
  }
  try {
    await replaceResources(ctx, data.id, resources);
  } catch (error) {
    await ctx.admin.from("public_api_integrations").delete().eq("id", data.id)
      .eq("company_id", ctx.companyId);
    throw error;
  }
  return { integration: data };
}

async function updateIntegration(
  ctx: ManagerContext,
  body: JsonObject,
): Promise<JsonObject> {
  if (
    !hasOnlyKeys(body, [
      "action",
      "integration_id",
      "name",
      "scopes",
      "distribution_mode",
      "ip_allowlist",
      "resources",
      "resource_ids",
      "status",
    ])
  ) {
    throw new ActionError(
      400,
      "unknown_field",
      "A requisicao contem campos nao permitidos.",
    );
  }
  const integrationId = ensureUuid(body.integration_id, "Integracao");
  const currentIntegration = await ownedIntegration(ctx, integrationId);
  const updates: JsonObject = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 100) {
      throw new ActionError(
        422,
        "invalid_name",
        "O nome deve ter entre 2 e 100 caracteres.",
      );
    }
    updates.name = name;
  }
  const resources = body.resources ??
    (Array.isArray(body.resource_ids)
      ? body.resource_ids.map((id) => ({ id, type: "user" }))
      : undefined);
  if (body.scopes !== undefined) {
    if (!validScopes(body.scopes)) {
      throw new ActionError(
        422,
        "invalid_scopes",
        "Selecione ao menos um escopo valido.",
      );
    }
    updates.scopes = body.scopes;
  }
  if (body.distribution_mode !== undefined) {
    if (
      typeof body.distribution_mode !== "string" ||
      !DISTRIBUTION_MODES.has(body.distribution_mode)
    ) {
      throw new ActionError(
        422,
        "invalid_distribution_mode",
        "O modo de distribuicao e invalido.",
      );
    }
    updates.distribution_mode = body.distribution_mode;
  }
  const resultingMode = typeof updates.distribution_mode === "string"
    ? updates.distribution_mode
    : currentIntegration.distribution_mode;
  if (
    resultingMode !== "unassigned" && Array.isArray(resources) &&
    resources.length === 0
  ) {
    throw new ActionError(
      422,
      "resource_pool_required",
      "Selecione ao menos um recurso para o modo de distribuicao escolhido.",
    );
  }
  if (
    resultingMode !== "unassigned" && resources === undefined &&
    currentIntegration.distribution_mode === "unassigned"
  ) {
    throw new ActionError(
      422,
      "resource_pool_required",
      "Selecione ao menos um recurso para o modo de distribuicao escolhido.",
    );
  }
  if (body.ip_allowlist !== undefined) {
    if (!validAllowlist(body.ip_allowlist)) {
      throw new ActionError(
        422,
        "invalid_ip_allowlist",
        "A allowlist de IP/CIDR e invalida.",
      );
    }
    updates.ip_allowlist = body.ip_allowlist;
  }
  if (body.status !== undefined) {
    if (!["active", "inactive"].includes(String(body.status))) {
      throw new ActionError(422, "invalid_status", "O status e invalido.");
    }
    updates.status = body.status;
  }
  let integration;
  if (Object.keys(updates).length) {
    updates.updated_at = new Date().toISOString();
    const { data, error } = await ctx.admin.from("public_api_integrations")
      .update(updates).eq("id", integrationId).eq("company_id", ctx.companyId)
      .select(
        "id,name,status,scopes,distribution_mode,ip_allowlist,created_at,updated_at",
      ).single();
    if (error || !data) {
      throw new ActionError(
        503,
        "temporarily_unavailable",
        "Nao foi possivel atualizar a integracao.",
      );
    }
    integration = data;
  } else integration = await ownedIntegration(ctx, integrationId);
  await replaceResources(ctx, integrationId, resources);
  return { integration };
}

async function createKey(
  ctx: ManagerContext,
  body: JsonObject,
  rotatedFromKeyId: string | null = null,
): Promise<JsonObject> {
  const integrationId = ensureUuid(body.integration_id, "Integracao");
  const integration = await ownedIntegration(ctx, integrationId);
  if (integration.status !== "active") {
    throw new ActionError(
      409,
      "integration_inactive",
      "Ative a integracao antes de gerar uma chave.",
    );
  }
  const name = body.name === undefined
    ? null
    : typeof body.name === "string"
    ? body.name.trim()
    : "";
  if (name !== null && (name.length < 2 || name.length > 100)) {
    throw new ActionError(
      422,
      "invalid_name",
      "O nome da chave deve ter entre 2 e 100 caracteres.",
    );
  }
  const now = new Date();
  const { count, error: countError } = await ctx.admin.from("public_api_keys")
    .select("id", { count: "exact", head: true })
    .eq("integration_id", integrationId)
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString());
  if (countError) {
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel validar o limite de chaves.",
    );
  }
  if ((count ?? 0) >= MAX_ACTIVE_KEYS) {
    throw new ActionError(
      409,
      "key_limit",
      "A integracao ja possui duas chaves ativas.",
    );
  }

  const publicId = randomPublicId();
  const secret = randomApiSecret();
  const { data, error } = await ctx.admin.from("public_api_keys").insert({
    integration_id: integrationId,
    public_id: publicId,
    secret_hash: await sha256Hex(secret),
    secret_last_four: secret.slice(-4),
    name,
    created_by: ctx.userId,
    valid_from: now.toISOString(),
    expires_at: addDays(now, KEY_VALIDITY_DAYS),
    rotated_from_key_id: rotatedFromKeyId,
  }).select(
    "id,integration_id,name,public_id,secret_last_four,created_at,valid_from,expires_at,last_used_at,revoked_at,rotated_from_key_id",
  ).single();
  if (error || !data) {
    if (error?.code === "23505" || error?.code === "23514") {
      throw new ActionError(
        409,
        "key_limit",
        "Nao foi possivel gerar outra chave ativa.",
      );
    }
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel gerar a chave.",
    );
  }
  return { api_key: `dmx_live_${publicId}.${secret}`, key: data };
}

async function rotateKey(
  ctx: ManagerContext,
  body: JsonObject,
): Promise<JsonObject> {
  const keyId = ensureUuid(body.key_id, "Chave");
  const { data: current, error } = await ctx.admin.from("public_api_keys")
    .select(
      "id,integration_id,name,expires_at,revoked_at,public_api_integrations!inner(company_id)",
    )
    .eq("id", keyId)
    .eq("public_api_integrations.company_id", ctx.companyId)
    .maybeSingle();
  if (error) {
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel consultar a chave.",
    );
  }
  if (
    !current || current.revoked_at ||
    Date.parse(current.expires_at) <= Date.now()
  ) throw new ActionError(404, "not_found", "Chave ativa nao encontrada.");
  const created = await createKey(ctx, {
    integration_id: current.integration_id,
    name: body.name ?? current.name,
  }, keyId);
  const overlapExpiry = addDays(new Date(), ROTATION_OVERLAP_DAYS);
  const newExpiry = Date.parse(current.expires_at) < Date.parse(overlapExpiry)
    ? current.expires_at
    : overlapExpiry;
  const { error: updateError } = await ctx.admin.from("public_api_keys").update(
    { expires_at: newExpiry },
  ).eq("id", keyId);
  if (updateError) {
    console.error("[api-key-manager] rotation_overlap_update_failed", {
      code: updateError.code,
      requestId: ctx.requestId,
    });
  }
  return created;
}

async function revokeKey(
  ctx: ManagerContext,
  body: JsonObject,
): Promise<JsonObject> {
  const keyId = ensureUuid(body.key_id, "Chave");
  const { data, error } = await ctx.admin.from("public_api_keys")
    .select("id,public_api_integrations!inner(company_id)")
    .eq("id", keyId)
    .eq("public_api_integrations.company_id", ctx.companyId)
    .maybeSingle();
  if (error) {
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel consultar a chave.",
    );
  }
  if (!data) throw new ActionError(404, "not_found", "Chave nao encontrada.");
  const { error: updateError } = await ctx.admin.from("public_api_keys").update(
    { revoked_at: new Date().toISOString(), revoked_by: ctx.userId },
  ).eq("id", keyId);
  if (updateError) {
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel revogar a chave.",
    );
  }
  return { success: true };
}

function validateWeeklyHours(value: unknown): JsonObject {
  if (!isPlainObject(value) || JSON.stringify(value).length > 16_384) {
    throw new ActionError(
      422,
      "invalid_weekly_hours",
      "O expediente semanal e invalido.",
    );
  }
  for (const [day, intervals] of Object.entries(value)) {
    if (
      !/^[0-6]$/.test(day) || !Array.isArray(intervals) || intervals.length > 4
    ) {
      throw new ActionError(
        422,
        "invalid_weekly_hours",
        "O expediente semanal e invalido.",
      );
    }
    for (const interval of intervals) {
      if (
        !Array.isArray(interval) || interval.length !== 2 ||
        typeof interval[0] !== "string" || typeof interval[1] !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(interval[0]) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(interval[1]) ||
        interval[0] >= interval[1]
      ) {
        throw new ActionError(
          422,
          "invalid_weekly_hours",
          "Um intervalo do expediente e invalido.",
        );
      }
    }
  }
  return value;
}

async function saveBookingSettings(
  ctx: ManagerContext,
  body: JsonObject,
): Promise<JsonObject> {
  if (
    !isPlainObject(body.settings) ||
    !hasOnlyKeys(body.settings, [
      "weekly_hours",
      "slot_interval_minutes",
      "minimum_notice_minutes",
      "booking_horizon_days",
      "default_duration_minutes",
    ])
  ) {
    throw new ActionError(
      422,
      "invalid_booking_settings",
      "As configuracoes de agenda sao invalidas.",
    );
  }
  const settings = body.settings;
  const slot = Number(settings.slot_interval_minutes);
  const notice = Number(settings.minimum_notice_minutes);
  const horizon = Number(settings.booking_horizon_days);
  const duration = Number(settings.default_duration_minutes);
  if (
    !Number.isInteger(slot) || slot < 5 || slot > 240 ||
    !Number.isInteger(notice) || notice < 0 || notice > 43_200 ||
    !Number.isInteger(horizon) || horizon < 1 || horizon > 365 ||
    !Number.isInteger(duration) || duration < 15 || duration > 480
  ) {
    throw new ActionError(
      422,
      "invalid_booking_settings",
      "Revise os intervalos e limites de agendamento.",
    );
  }
  const { data, error } = await ctx.admin.from("schedule_booking_settings")
    .upsert({
      company_id: ctx.companyId,
      weekly_hours: validateWeeklyHours(settings.weekly_hours),
      slot_interval_minutes: slot,
      minimum_notice_minutes: notice,
      booking_horizon_days: horizon,
      default_duration_minutes: duration,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id" }).select(
      "weekly_hours,slot_interval_minutes,minimum_notice_minutes,booking_horizon_days,default_duration_minutes,updated_at",
    ).single();
  if (error || !data) {
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel salvar as configuracoes de agenda.",
    );
  }
  return { booking_settings: data };
}

async function saveBookingExceptions(
  ctx: ManagerContext,
  body: JsonObject,
): Promise<JsonObject> {
  if (!Array.isArray(body.exceptions) || body.exceptions.length > 200) {
    throw new ActionError(
      422,
      "invalid_exceptions",
      "A lista de excecoes e invalida.",
    );
  }
  const rows = body.exceptions.map((exception) => {
    if (
      !isPlainObject(exception) ||
      !hasOnlyKeys(exception, [
        "id",
        "starts_at",
        "ends_at",
        "is_available",
        "reason",
      ])
    ) {
      throw new ActionError(
        422,
        "invalid_exceptions",
        "Uma excecao e invalida.",
      );
    }
    const startsAt = typeof exception.starts_at === "string"
      ? Date.parse(exception.starts_at)
      : NaN;
    const endsAt = typeof exception.ends_at === "string"
      ? Date.parse(exception.ends_at)
      : NaN;
    if (
      !Number.isFinite(startsAt) || !Number.isFinite(endsAt) ||
      endsAt <= startsAt || endsAt - startsAt > 366 * 86_400_000
    ) {
      throw new ActionError(
        422,
        "invalid_exceptions",
        "O periodo de uma excecao e invalido.",
      );
    }
    if (
      exception.reason !== undefined &&
      (typeof exception.reason !== "string" || exception.reason.length > 500)
    ) {
      throw new ActionError(
        422,
        "invalid_exceptions",
        "O motivo de uma excecao e invalido.",
      );
    }
    return {
      ...(exception.id ? { id: ensureUuid(exception.id, "Excecao") } : {}),
      company_id: ctx.companyId,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      is_available: exception.is_available === true,
      reason: exception.reason ?? null,
      created_by: ctx.userId,
    };
  });
  // O payload representa a configuracao completa. A exclusao e escopada pelo tenant.
  const keepIds = rows.flatMap((row) => "id" in row ? [row.id] : []);
  if (keepIds.length) {
    const { data: ownedRows, error: ownershipError } = await ctx.admin
      .from("schedule_booking_exceptions")
      .select("id")
      .eq("company_id", ctx.companyId)
      .in("id", keepIds);
    if (ownershipError) {
      throw new ActionError(
        503,
        "temporarily_unavailable",
        "Nao foi possivel validar as excecoes.",
      );
    }
    if ((ownedRows ?? []).length !== keepIds.length) {
      // UUID inexistente e UUID de outro tenant sao deliberadamente iguais.
      throw new ActionError(
        404,
        "not_found",
        "Uma excecao informada nao foi encontrada.",
      );
    }
  }
  let deleteQuery = ctx.admin.from("schedule_booking_exceptions").delete().eq(
    "company_id",
    ctx.companyId,
  );
  if (keepIds.length) {
    deleteQuery = deleteQuery.not("id", "in", `(${keepIds.join(",")})`);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    throw new ActionError(
      503,
      "temporarily_unavailable",
      "Nao foi possivel atualizar as excecoes.",
    );
  }
  if (rows.length) {
    const { error: upsertError } = await ctx.admin.from(
      "schedule_booking_exceptions",
    ).upsert(rows);
    if (upsertError) {
      throw new ActionError(
        503,
        "temporarily_unavailable",
        "Nao foi possivel atualizar as excecoes.",
      );
    }
  }
  return { booking_exceptions: rows };
}

async function executeAction(
  ctx: ManagerContext,
  body: JsonObject,
): Promise<JsonObject> {
  const action = body.action;
  if (typeof action !== "string") {
    throw new ActionError(400, "invalid_action", "Informe uma acao valida.");
  }
  await consumePersistentRate(ctx, "general", 60, 60);
  if (action !== "list") await consumePersistentRate(ctx, "mutation", 10, 60);
  if (["create_key", "rotate_key", "create", "rotate"].includes(action)) {
    await consumePersistentRate(ctx, "key_issue", 5, 3_600);
  }
  switch (action) {
    case "list":
      return await listState(ctx);
    case "create_integration":
      return await createIntegration(ctx, body);
    case "update_integration":
      return await updateIntegration(ctx, body);
    case "create_key":
    case "create":
      return await createKey(ctx, body);
    case "rotate_key":
    case "rotate":
      return await rotateKey(ctx, body);
    case "revoke_key":
    case "revoke":
      return await revokeKey(ctx, body);
    case "save_booking_settings":
      return await saveBookingSettings(ctx, body);
    case "save_booking_exceptions":
      return await saveBookingExceptions(ctx, body);
    default:
      throw new ActionError(400, "invalid_action", "Acao nao suportada.");
  }
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") {
    return response(
      req,
      {
        error: "Metodo nao permitido.",
        code: "method_not_allowed",
        request_id: requestId,
      },
      405,
      requestId,
    );
  }
  if (
    !req.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) {
    return errorResponse(
      req,
      new ActionError(
        400,
        "invalid_content_type",
        "Use Content-Type: application/json.",
      ),
      requestId,
    );
  }
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 65_536) {
    return errorResponse(
      req,
      new ActionError(413, "payload_too_large", "O corpo excede 64 KiB."),
      requestId,
    );
  }

  const preauth = localAllow(`ip:${requestIp(req)}`, 120, 60_000);
  if (!preauth.allowed) {
    return new Response(
      JSON.stringify({
        error: "Limite de requisicoes excedido.",
        code: "rate_limit_exceeded",
        request_id: requestId,
      }),
      {
        status: 429,
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Retry-After": String(preauth.retryAfter),
          "X-Request-Id": requestId,
        },
      },
    );
  }

  try {
    const ctx = await authorize(req, requestId);
    const perUser = localAllow(`user:${ctx.userId}`, 60, 60_000);
    if (!perUser.allowed) {
      throw new ActionError(
        429,
        "rate_limit_exceeded",
        "Limite de requisicoes excedido. Aguarde e tente novamente.",
        perUser.retryAfter,
      );
    }
    const body = await readJsonBody(req);
    return response(req, await executeAction(ctx, body), 200, requestId);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return errorResponse(
        req,
        new ActionError(413, "payload_too_large", "O corpo excede 64 KiB."),
        requestId,
      );
    }
    if (error instanceof SyntaxError) {
      return errorResponse(
        req,
        new ActionError(400, "invalid_json", "Envie um objeto JSON valido."),
        requestId,
      );
    }
    if (error instanceof ActionError) {
      return errorResponse(req, error, requestId);
    }
    console.error("[api-key-manager] unhandled_error", {
      requestId,
      name: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(
      req,
      new ActionError(
        500,
        "internal_error",
        "Erro interno. Tente novamente em instantes.",
      ),
      requestId,
    );
  }
});
