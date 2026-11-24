import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkWhatsappNumbers,
  EVOLUTION_WEBHOOK_CONFIG_VERSION,
  EvolutionApiError,
  EvolutionConfigError,
  humanGapSeconds,
  markMessagesAsRead,
  sendPresence,
  sendText,
  setInstanceWebhook,
  typingDelayMs,
} from "../_shared/evolution-client.ts";
import {
  formatWhatsappEquipmentNames,
  listWhatsappTemplateTokens,
  renderWhatsappTemplate,
  resolveWhatsappCompanyValues,
  resolveWhatsappTemplate,
  sanitizeWhatsappTextValue,
} from "../_shared/whatsapp-message-templates.ts";

const WARMUP_DAILY_CAP = [20, 30, 40, 60, 80, 100, 120, 150, 180, 220, 260, 300, 350, 400];
const MAX_PER_HOUR = 60;
const MAX_PER_DAY = 400;
const MAX_PER_RECIPIENT_24H = 5;
const MAX_BILLING_PER_RECIPIENT_24H = 1;
const MAX_ATTEMPTS = 5;
/** Validade do cache de "esse telefone tem WhatsApp?" (whatsapp_number_checks). */
const NUMBER_CHECK_TTL_DAYS = 90;

type Job = {
  id: string;
  company_id: string;
  connection_id: string;
  provider: "evolution_qr" | "meta_cloud";
  customer_id: string | null;
  event_key: string;
  source_type: "service_order" | "tenant_charge";
  source_id: string;
  attempts: number;
  recipient_kind?: "customer_primary" | "customer_contact" | null;
  customer_contact_id?: string | null;
  recipient_route_id?: string | null;
};

type SettingsData = { automation_preferences: unknown };
type RegionalSettingsData = {
  country_code: string;
  timezone: string | null;
  document?: string | null;
  phone?: string | null;
};
type CustomerData = { name: string };
type CustomerContactData = {
  id: string;
  customer_id: string;
  name: string;
  phone: string | null;
};
type CompanyData = { name: string; cnpj?: string | null; phone?: string | null };
type CompanyValues = ReturnType<typeof resolveWhatsappCompanyValues>;
type WebhookConnection = {
  id: string;
  company_id: string;
  instance_name: string | null;
  webhook_config_version: string | null;
};

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) result |= left[i] ^ right[i];
  return result === 0;
}

/**
 * Mantém instâncias já conectadas na versão atual do webhook mesmo quando não
 * há jobs na fila. O cron chama o worker a cada minuto, então uma publicação
 * de confirmação de entrega não precisa esperar a próxima mensagem para ficar
 * ativa — nem exige disparar uma mensagem artificial para o cliente.
 */
async function reconcileWebhookConfigs(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select("id, company_id, instance_name, webhook_config_version")
    .eq("provider", "evolution_qr")
    .eq("status", "connected");
  if (error) {
    console.error("[whatsapp-send-worker] webhook reconciliation query failed", {
      message: error.message,
    });
    return 0;
  }

  const pending = ((data ?? []) as WebhookConnection[]).filter((connection) =>
    connection.instance_name &&
    connection.webhook_config_version !== EVOLUTION_WEBHOOK_CONFIG_VERSION
  );
  if (!pending.length) return 0;

  const webhookUrl = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/whatsapp-webhook`;
  const webhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ?? "";
  const settled = await Promise.allSettled(pending.map(async (connection) => {
    await setInstanceWebhook(connection.instance_name!, webhookUrl, webhookSecret);
    const { error: updateError } = await supabase
      .from("whatsapp_connections")
      .update({ webhook_config_version: EVOLUTION_WEBHOOK_CONFIG_VERSION })
      .eq("id", connection.id)
      .eq("company_id", connection.company_id);
    if (updateError) throw updateError;
  }));

  let configured = 0;
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      configured += 1;
      return;
    }
    console.error("[whatsapp-send-worker] webhook reconciliation failed", {
      connection_id: pending[index].id,
      message: String(result.reason),
    });
  });
  return configured;
}

type CountryPhoneRule = {
  dialCode: string;
  nationalMin: number;
  nationalMax: number;
  stripTrunkZero: boolean;
};

// Mesma allowlist regional exposta pela aplicacao. Os limites sao usados para
// distinguir um numero nacional de um E.164 ja persistido sem o sinal de "+".
const COUNTRY_PHONE_RULES: Readonly<Record<string, CountryPhoneRule>> = {
  BR: { dialCode: "55", nationalMin: 10, nationalMax: 11, stripTrunkZero: true },
  CV: { dialCode: "238", nationalMin: 7, nationalMax: 7, stripTrunkZero: false },
  PT: { dialCode: "351", nationalMin: 9, nationalMax: 9, stripTrunkZero: false },
  AO: { dialCode: "244", nationalMin: 9, nationalMax: 9, stripTrunkZero: false },
  MZ: { dialCode: "258", nationalMin: 9, nationalMax: 9, stripTrunkZero: false },
  ST: { dialCode: "239", nationalMin: 7, nationalMax: 7, stripTrunkZero: false },
  GW: { dialCode: "245", nationalMin: 7, nationalMax: 7, stripTrunkZero: false },
  TL: { dialCode: "670", nationalMin: 7, nationalMax: 8, stripTrunkZero: false },
  US: { dialCode: "1", nationalMin: 10, nationalMax: 10, stripTrunkZero: false },
  GB: { dialCode: "44", nationalMin: 9, nationalMax: 10, stripTrunkZero: true },
  CA: { dialCode: "1", nationalMin: 10, nationalMax: 10, stripTrunkZero: false },
  AU: { dialCode: "61", nationalMin: 9, nationalMax: 9, stripTrunkZero: true },
  ES: { dialCode: "34", nationalMin: 9, nationalMax: 9, stripTrunkZero: false },
  MX: { dialCode: "52", nationalMin: 10, nationalMax: 10, stripTrunkZero: false },
  AR: { dialCode: "54", nationalMin: 10, nationalMax: 11, stripTrunkZero: true },
  CL: { dialCode: "56", nationalMin: 9, nationalMax: 9, stripTrunkZero: false },
  CO: { dialCode: "57", nationalMin: 10, nationalMax: 10, stripTrunkZero: false },
  PE: { dialCode: "51", nationalMin: 9, nationalMax: 9, stripTrunkZero: false },
  UY: { dialCode: "598", nationalMin: 8, nationalMax: 8, stripTrunkZero: false },
  PY: { dialCode: "595", nationalMin: 9, nationalMax: 9, stripTrunkZero: true },
  BO: { dialCode: "591", nationalMin: 8, nationalMax: 8, stripTrunkZero: false },
  FR: { dialCode: "33", nationalMin: 9, nationalMax: 9, stripTrunkZero: true },
  BE: { dialCode: "32", nationalMin: 9, nationalMax: 9, stripTrunkZero: true },
  CH: { dialCode: "41", nationalMin: 9, nationalMax: 9, stripTrunkZero: true },
  DE: { dialCode: "49", nationalMin: 5, nationalMax: 11, stripTrunkZero: true },
  IT: { dialCode: "39", nationalMin: 6, nationalMax: 11, stripTrunkZero: false },
  JP: { dialCode: "81", nationalMin: 9, nationalMax: 10, stripTrunkZero: true },
};

export function normalizePhone(
  raw: string | null | undefined,
  countryCode: string,
): string | null {
  const value = raw?.trim();
  if (!value) return null;

  const international = value.startsWith("+") || value.startsWith("00");
  let digits = value.replace(/\D/g, "");
  if (value.startsWith("00")) digits = digits.slice(2);
  if (international) return digits.length >= 8 && digits.length <= 15 ? digits : null;

  const rule = COUNTRY_PHONE_RULES[countryCode.trim().toUpperCase()];
  if (!rule) return null;

  const e164NationalLength = digits.startsWith(rule.dialCode)
    ? digits.length - rule.dialCode.length
    : -1;
  if (e164NationalLength >= rule.nationalMin && e164NationalLength <= rule.nationalMax) {
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  if (rule.stripTrunkZero) digits = digits.replace(/^0/, "");
  if (digits.length < rule.nationalMin || digits.length > rule.nationalMax) return null;

  const normalized = `${rule.dialCode}${digits}`;
  return normalized.length >= 8 && normalized.length <= 15 ? normalized : null;
}

function money(value: number | string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function dateBr(value: string | null): string {
  if (!value) return "não informado";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function pref<T>(record: unknown, path: string[], fallback: T): T {
  let value: unknown = record;
  for (const key of path) {
    value = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)[key]
      : undefined;
  }
  return value === undefined ? fallback : value as T;
}

function pickStyle(value: unknown): "objective" | "cordial" | "detailed" {
  if (value === "objective" || value === "cordial" || value === "detailed") return value;
  const styles = ["objective", "cordial", "detailed"] as const;
  return styles[Math.floor(Math.random() * styles.length)];
}

type RecipientRouteValidation = "valid" | "inactive" | "error";
type FinalDispatchValidation =
  | { status: "valid" }
  | { status: "skip"; code: string; message: string }
  | { status: "defer"; code: string; message: string };

function recipientKind(job: Job): "customer_primary" | "customer_contact" {
  return job.recipient_kind === "customer_contact" ? "customer_contact" : "customer_primary";
}

function recipientCategory(eventKey: string): "service_order" | "billing" | null {
  if (eventKey.startsWith("os.")) return "service_order";
  if (eventKey.startsWith("billing.")) return "billing";
  return null;
}

/**
 * Revalida a selecao atual do destinatario. O worker usa service_role, entao
 * os filtros de company/customer/contact sao uma barreira obrigatoria, nao
 * apenas uma otimizacao de consulta.
 */
async function validateRecipientRoute(
  supabase: SupabaseClient,
  job: Job,
): Promise<RecipientRouteValidation> {
  const category = recipientCategory(job.event_key);
  if (!category || !job.customer_id) return "inactive";

  const { data: route, error: routeError } = await supabase
    .from("customer_whatsapp_routes")
    .select("id, enabled")
    .eq("company_id", job.company_id)
    .eq("customer_id", job.customer_id)
    .eq("category", category)
    .maybeSingle();
  if (routeError) return "error";

  // Compatibilidade: sem configuracao explicita, apenas o telefone principal
  // segue autorizado. Contato adicional nunca ganha fallback implicito.
  if (!route) return recipientKind(job) === "customer_primary" ? "valid" : "inactive";
  if (route.enabled !== true) return "inactive";

  let assignment = supabase
    .from("customer_whatsapp_route_recipients")
    .select("id")
    .eq("route_id", route.id)
    .eq("recipient_kind", recipientKind(job));
  assignment = recipientKind(job) === "customer_primary"
    ? assignment.is("customer_contact_id", null)
    : assignment.eq("customer_contact_id", job.customer_contact_id ?? "");
  const { data, error } = await assignment.maybeSingle();
  if (error) return "error";
  return data ? "valid" : "inactive";
}

/**
 * Rele as fontes mutáveis depois da cadência humana e imediatamente antes do
 * marco durável de despacho. Um snapshot obtido no início do job não autoriza
 * enviar para telefone antigo, assinatura bloqueada, cliente removido ou
 * cobrança já paga.
 */
async function validateFinalDispatchState(
  supabase: SupabaseClient,
  job: Job,
  phone: string,
  countryCode: string,
): Promise<FinalDispatchValidation> {
  const contactQuery = recipientKind(job) === "customer_contact" && job.customer_contact_id && job.customer_id
    ? supabase.from("customer_contacts")
      .select("id, customer_id, phone")
      .eq("id", job.customer_contact_id)
      .eq("customer_id", job.customer_id)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const sourceQuery = job.source_type === "tenant_charge"
    ? supabase.from("tenant_charges")
      .select("id, customer_id, status")
      .eq("id", job.source_id)
      .eq("company_id", job.company_id)
      .maybeSingle()
    : supabase.from("service_orders")
      .select("id, customer_id, status")
      .eq("id", job.source_id)
      .eq("company_id", job.company_id)
      .maybeSingle();

  const [entitlement, moduleResult, customerResult, contactResult, settingsResult, connectionResult, sourceResult] =
    await Promise.all([
      supabase.rpc("tenant_subscription_allows_access", { _company_id: job.company_id }),
      supabase.rpc("company_has_module", { p_company_id: job.company_id, p_module_code: "whatsapp" }),
      job.customer_id
        ? supabase.from("customers")
          .select("id, company_id, phone, celular, whatsapp_notifications_enabled, is_deleted")
          .eq("id", job.customer_id)
          .eq("company_id", job.company_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      contactQuery,
      supabase.from("company_whatsapp_settings")
        .select("enabled, active_connection_id")
        .eq("company_id", job.company_id)
        .maybeSingle(),
      supabase.from("whatsapp_connections")
        .select("id, status")
        .eq("id", job.connection_id)
        .eq("company_id", job.company_id)
        .maybeSingle(),
      sourceQuery,
    ]);

  const readError = [
    entitlement.error,
    moduleResult.error,
    customerResult.error,
    contactResult.error,
    settingsResult.error,
    connectionResult.error,
    sourceResult.error,
  ].find(Boolean);
  if (readError) {
    console.error("[whatsapp-send-worker] final dispatch query failed", {
      job_id: job.id,
      message: readError.message,
    });
    return {
      status: "defer",
      code: "final_validation_unavailable",
      message: "Não foi possível confirmar novamente os dados do envio.",
    };
  }

  if (entitlement.data !== true) {
    return { status: "skip", code: "subscription_inactive", message: "A assinatura da empresa não permite este envio." };
  }
  if (moduleResult.data !== true) {
    return { status: "skip", code: "module_inactive", message: "Módulo de WhatsApp inativo." };
  }
  if (!settingsResult.data?.enabled || settingsResult.data.active_connection_id !== job.connection_id) {
    return { status: "skip", code: "automation_changed", message: "A automação ou a conexão ativa mudou antes do envio." };
  }
  if (!connectionResult.data || connectionResult.data.status !== "connected") {
    return { status: "defer", code: "connection_unavailable", message: "A conexão ficou indisponível antes do envio." };
  }

  const currentCustomer = customerResult.data;
  if (!currentCustomer || currentCustomer.is_deleted === true) {
    return { status: "skip", code: "customer_unavailable", message: "O cliente vinculado ao envio não está mais disponível." };
  }
  if (currentCustomer.whatsapp_notifications_enabled !== true) {
    return { status: "skip", code: "customer_opt_out", message: "O cliente não autorizou mensagens pelo WhatsApp." };
  }

  const currentContact = contactResult.data;
  if (recipientKind(job) === "customer_contact" && !currentContact) {
    return { status: "skip", code: "recipient_unavailable", message: "O contato destinatário não está mais disponível." };
  }
  const currentRawPhone = recipientKind(job) === "customer_contact"
    ? currentContact?.phone
    : currentCustomer.celular?.trim() || currentCustomer.phone;
  const currentPhone = normalizePhone(currentRawPhone, countryCode);
  if (!currentPhone) {
    return { status: "skip", code: "invalid_phone", message: "Destinatário sem WhatsApp válido cadastrado." };
  }
  if (currentPhone !== phone) {
    return { status: "skip", code: "recipient_phone_changed", message: "O telefone do destinatário mudou antes do envio." };
  }

  const routeValidation = await validateRecipientRoute(supabase, job);
  if (routeValidation === "error") {
    return { status: "defer", code: "recipient_route_unavailable", message: "Não foi possível confirmar novamente o destinatário configurado." };
  }
  if (routeValidation !== "valid") {
    return { status: "skip", code: "recipient_route_changed", message: "O destinatário não está mais configurado para esta mensagem." };
  }

  const { data: optedOut, error: optedOutError } = await supabase
    .from("whatsapp_opt_outs")
    .select("phone")
    .eq("company_id", job.company_id)
    .eq("phone", currentPhone)
    .maybeSingle();
  if (optedOutError) {
    return { status: "defer", code: "opt_out_check_unavailable", message: "Não foi possível confirmar novamente a autorização do destinatário." };
  }
  if (optedOut) {
    return { status: "skip", code: "customer_opt_out", message: "O destinatário pediu para parar os envios." };
  }

  const source = sourceResult.data;
  if (!source || source.customer_id !== job.customer_id) {
    return { status: "skip", code: "source_unavailable", message: "A origem da mensagem não está mais disponível para este cliente." };
  }
  if (job.source_type === "tenant_charge" && !["PENDING", "OVERDUE"].includes(String(source.status))) {
    return { status: "skip", code: "source_obsolete", message: "A cobrança já não está pendente." };
  }
  if (job.event_key === "os.criada") {
    // O aviso de abertura só faz sentido enquanto a OS ainda está por
    // acontecer. Se já foi cancelada, ou o técnico já saiu/atendeu, os outros
    // avisos contam a história e este chegaria atrasado.
    if (!["agendada", "pendente"].includes(String(source.status))) {
      return { status: "skip", code: "source_obsolete", message: "A ordem de serviço mudou de situação antes do aviso de abertura." };
    }
  } else if (job.source_type === "service_order" && job.event_key !== "os.scheduled_reminder") {
    const expectedStatus: Record<string, string> = {
      "os.a_caminho": "a_caminho",
      "os.em_andamento": "em_andamento",
      "os.concluida": "concluida",
    };
    const expected = expectedStatus[job.event_key];
    if (!expected || String(source.status) !== expected) {
      return { status: "skip", code: "source_obsolete", message: "O estado da ordem de serviço mudou antes do envio." };
    }
  }

  return { status: "valid" };
}

/** Evita uma segunda copia quando dois cadastros resolvem para o mesmo numero. */
async function alreadySentToPhoneForSource(
  supabase: SupabaseClient,
  job: Job,
  phone: string,
): Promise<boolean> {
  const { data: relatedJobs, error: jobsError } = await supabase
    .from("whatsapp_send_jobs")
    .select("id")
    .eq("company_id", job.company_id)
    .eq("event_key", job.event_key)
    .eq("source_type", job.source_type)
    .eq("source_id", job.source_id)
    .neq("id", job.id)
    .in("status", ["sent", "delivered", "read"]);
  if (jobsError) throw jobsError;
  const jobIds = (relatedJobs ?? []).map((item) => item.id);
  if (!jobIds.length) return false;

  const { data: duplicate, error: eventError } = await supabase
    .from("whatsapp_events")
    .select("id")
    .eq("company_id", job.company_id)
    .eq("phone", phone)
    .in("job_id", jobIds)
    .in("status", ["enviado", "entregue", "lido"])
    .limit(1)
    .maybeSingle();
  if (eventError) throw eventError;
  return Boolean(duplicate);
}

async function recordEvent(
  supabase: SupabaseClient,
  job: Job,
  values: Record<string, unknown>,
) {
  const recipientValues = {
    recipient_kind: recipientKind(job),
    customer_contact_id: job.customer_contact_id ?? null,
    recipient_route_id: job.recipient_route_id ?? null,
  };
  const { data: existing } = await supabase
    .from("whatsapp_events")
    .select("id")
    .eq("company_id", job.company_id)
    .eq("job_id", job.id)
    .maybeSingle();
  if (existing) {
    await supabase.from("whatsapp_events")
      .update({ ...recipientValues, ...values })
      .eq("id", existing.id)
      .eq("company_id", job.company_id);
    return;
  }
  await supabase.from("whatsapp_events").insert({
    company_id: job.company_id,
    job_id: job.id,
    connection_id: job.connection_id,
    provider: job.provider,
    trigger: job.event_key,
    os_id: job.source_type === "service_order" ? job.source_id : null,
    ...recipientValues,
    ...values,
  });
}

async function skipJob(supabase: SupabaseClient, job: Job, code: string, message: string, phone?: string | null) {
  const { data: skipped } = await supabase.from("whatsapp_send_jobs").update({
    status: "skipped", locked_at: null, last_error_code: code, last_error: message,
  })
    .eq("id", job.id)
    .eq("company_id", job.company_id)
    .eq("status", "processing")
    .select("id")
    .maybeSingle();
  // Uma alteracao concorrente pode ter cancelado o job depois do claim. Nesse
  // caso preservamos o estado mais novo e nao criamos um evento de "ignorado"
  // para um processamento que ja nao nos pertence.
  if (!skipped) return;
  await recordEvent(supabase, job, { status: "ignorado", phone: phone ?? null, error: message, sent_at: new Date().toISOString() });
}

/**
 * TENTATIVA de verdade: usar SÓ quando houve chamada real ao provedor e ela
 * falhou. Mantém o `attempts = attempts + 1` que o `whatsapp_claim_send_jobs`
 * aplicou no claim, então conta contra o `MAX_ATTEMPTS`.
 */
async function retryJob(supabase: SupabaseClient, job: Job, code: string, message: string, delaySeconds: number) {
  await supabase.from("whatsapp_send_jobs").update({
    status: "retry",
    locked_at: null,
    dispatch_started_at: null,
    last_error_code: code,
    last_error: message,
    next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
  })
    .eq("id", job.id)
    .eq("company_id", job.company_id)
    .eq("status", "processing");
}

async function failJob(
  supabase: SupabaseClient,
  job: Job,
  code: string,
  message: string,
  phone?: string | null,
): Promise<boolean> {
  const { data: failed, error } = await supabase.from("whatsapp_send_jobs").update({
    status: "failed",
    locked_at: null,
    last_error_code: code,
    last_error: message,
  })
    .eq("id", job.id)
    .eq("company_id", job.company_id)
    .eq("status", "processing")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[whatsapp-send-worker] fail job update failed", {
      job_id: job.id,
      code,
      message: error.message,
    });
    return false;
  }
  // Cancelamento/reagendamento concorrente ganha da falha local. Nao cria
  // auditoria de erro para um processamento que ja nao pertence ao worker.
  if (!failed) return false;
  await recordEvent(supabase, job, {
    phone: phone ?? null,
    status: "erro",
    error: message,
    sent_at: new Date().toISOString(),
  });
  return true;
}

/**
 * DEFERIMENTO: usar quando o job é adiado SEM nenhuma chamada ao provedor
 * (automação pausada, conexão fora do ar, limite de volume, aquecimento).
 *
 * Por que não dá pra reusar `retryJob` aqui: o `whatsapp_claim_send_jobs` faz
 * `attempts = attempts + 1` em TODO claim. Adiar via `retryJob` mantinha esse
 * incremento e, com `MAX_ATTEMPTS = 5`, um aviso legítimo morria só por ter
 * sido adiado 5 vezes — sem nunca ter sido tentado. A RPC devolve `attempts`
 * ao valor anterior e incrementa `defers`, que é a contagem certa.
 */
async function deferJob(
  supabase: SupabaseClient,
  job: Job,
  code: string,
  message: string,
  nextAttemptAt: Date,
) {
  const { error } = await supabase.rpc("whatsapp_defer_send_job", {
    p_job_id: job.id,
    p_company_id: job.company_id,
    p_code: code,
    p_message: message,
    p_next_attempt_at: nextAttemptAt.toISOString(),
  });
  if (!error) return;
  // Se a RPC falhar, o job NÃO pode ficar preso em `processing` até a
  // recuperação de órfão (10 min): libera o lock no caminho antigo. Nesse
  // fallback a tentativa fica queimada, que é o menor dos dois males.
  console.error("[whatsapp-send-worker] defer failed", { code, message: error.message });
  await supabase.from("whatsapp_send_jobs").update({
    status: "retry",
    locked_at: null,
    last_error_code: code,
    last_error: message,
    next_attempt_at: nextAttemptAt.toISOString(),
  })
    .eq("id", job.id)
    .eq("company_id", job.company_id)
    .eq("status", "processing");
}

/**
 * Instante de reagendamento de um deferimento por VOLUME (hora / dia /
 * aquecimento): o MAIOR entre o atraso fixo que já existia e a próxima
 * abertura da janela de envio do tenant.
 *
 * Reagendar pra um instante que a janela vai recusar não faz sentido — o
 * `whatsapp_claim_send_jobs` tem a janela no predicado, então o job só
 * voltaria a dormir. Falha da RPC NUNCA derruba o job: cai no atraso fixo.
 */
async function volumeDeferAt(
  supabase: SupabaseClient,
  job: Job,
  delaySeconds: number,
): Promise<Date> {
  const fallback = new Date(Date.now() + delaySeconds * 1000);
  try {
    // `p_event_key` escolhe QUAL janela: aviso de OS segue a janela larga da
    // operação (o cliente chamou o técnico e está esperando); lembrete de
    // cobrança segue a janela comercial restrita. São duas, de propósito.
    const { data, error } = await supabase.rpc("whatsapp_next_window_opening", {
      p_company_id: job.company_id,
      p_connection_id: job.connection_id,
      p_event_key: job.event_key,
    });
    if (error || !data) return fallback;
    const opening = new Date(String(data));
    if (Number.isNaN(opening.getTime())) return fallback;
    return opening > fallback ? opening : fallback;
  } catch {
    return fallback;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sorteia um intervalo em ms a partir de uma faixa em segundos. */
function randomMs(minSeconds: number, maxSeconds: number): number {
  return Math.round((minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000);
}

/**
 * Hora local da empresa (0–23). A edge roda em UTC, então a conversão usa o
 * fuso IANA salvo no tenant, sem deslocamento fixo.
 */
function companyHour(timezone: string | null, at: Date = new Date()): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "numeric",
      hour12: false,
    }).format(at);
    const hour = Number(formatted.replace(/\D/g, ""));
    // `hour12: false` devolve "24" pra meia-noite em alguns runtimes.
    if (Number.isFinite(hour)) return hour % 24;
  } catch {
    // Runtime sem base de fuso: não vale derrubar um envio por causa da hora.
  }
  return at.getUTCHours();
}

export function isDeliveryUnknownStatus(status: number): boolean {
  return status === 0 || status === 408 || status >= 500;
}

async function sentCount(
  supabase: SupabaseClient,
  job: Job,
  since: string,
  phone?: string,
): Promise<number> {
  let query = supabase
    .from("whatsapp_events")
    .select("id", { count: "exact", head: true })
    .eq("company_id", job.company_id)
    .eq("connection_id", job.connection_id)
    .in("status", ["enviado", "entregue", "lido"])
    .gte("sent_at", since);
  if (phone) query = query.eq("phone", phone);
  const { count, error } = await query;
  if (error) throw new Error(`Não foi possível consultar o volume de envios: ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Comportamento humano (onda 3): validação de número, leitura e presença.
// ---------------------------------------------------------------------------

/**
 * Confirma que o telefone existe no WhatsApp antes de gastar um envio.
 * Disparar pra número inexistente é a assinatura clássica de lista comprada —
 * um dos sinais de spam mais fortes que existe, e dos que mais derrubam número.
 *
 * Resultado cacheado por 90 dias em `whatsapp_number_checks`.
 *
 * Devolve `false` SÓ quando a verificação respondeu que o número não existe.
 * Erro de rede/API devolve `true` (segue o envio) e NÃO grava cache: falha de
 * verificação não pode transformar um aviso legítimo em aviso perdido.
 */
async function hasWhatsapp(
  supabase: SupabaseClient,
  job: Job,
  instanceName: string,
  phone: string,
): Promise<boolean> {
  const { data: cached } = await supabase
    .from("whatsapp_number_checks")
    .select("exists_on_whatsapp, checked_at")
    .eq("company_id", job.company_id)
    .eq("phone", phone)
    .maybeSingle();
  if (cached?.checked_at) {
    const ageMs = Date.now() - new Date(cached.checked_at).getTime();
    if (ageMs >= 0 && ageMs < NUMBER_CHECK_TTL_DAYS * 86400000) {
      return cached.exists_on_whatsapp !== false;
    }
  }

  try {
    const results = await checkWhatsappNumbers(instanceName, [phone]);
    const match = results.find((item) => item.number.replace(/\D/g, "").endsWith(phone)) ??
      (results.length === 1 ? results[0] : undefined);
    // Resposta que não traz o número consultado: não bloqueia e não cacheia.
    if (!match) return true;
    await supabase.from("whatsapp_number_checks").upsert({
      company_id: job.company_id,
      phone,
      exists_on_whatsapp: match.exists,
      checked_at: new Date().toISOString(),
    }, { onConflict: "company_id,phone" });
    return match.exists;
  } catch (error) {
    console.warn("[whatsapp-send-worker] verificação de número indisponível", {
      message: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

/**
 * Abre a conversa e marca como lida antes de responder (opt-in, default
 * DESLIGADO): o número é o WhatsApp real da empresa, que uma pessoa de carne e
 * osso também usa no celular — marcar como lida apaga o aviso de não-lida dela.
 *
 * Fluxo humano completo: abriu → leu → esperou → começou a digitar. Por isso a
 * espera de 1–3 s no fim.
 *
 * Tudo dentro de try/catch: isso é enfeite de comportamento, nunca requisito.
 * Falha aqui jamais cancela o envio.
 */
async function markConversationRead(
  supabase: SupabaseClient,
  job: Job,
  instanceName: string,
  phone: string,
): Promise<void> {
  try {
    const { data: keys } = await supabase
      .from("whatsapp_inbound_keys")
      .select("id, message_id, remote_jid")
      .eq("company_id", job.company_id)
      .eq("phone", phone)
      .is("read_at", null)
      .order("received_at", { ascending: false })
      .limit(10);
    if (!keys?.length) return;

    await markMessagesAsRead(
      instanceName,
      keys.map((key) => ({ id: key.message_id, remoteJid: key.remote_jid, fromMe: false })),
    );
    await supabase
      .from("whatsapp_inbound_keys")
      .update({ read_at: new Date().toISOString() })
      .eq("company_id", job.company_id)
      .in("id", keys.map((key) => key.id));

    // Ninguém abre a conversa e começa a digitar no mesmo instante.
    await sleep(randomMs(1, 3));
  } catch (error) {
    console.warn("[whatsapp-send-worker] leitura da conversa ignorada", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * "Fechou o app": presença `unavailable` 4–12 s depois do envio.
 *
 * Chamada DEPOIS de o job já estar gravado como `sent` e o evento como
 * `enviado`. A ordem é deliberada: estado consistente primeiro, enfeite
 * depois — nenhum timeout de presença pode fazer um envio bem-sucedido
 * parecer falha. Em `EdgeRuntime.waitUntil` quando disponível, pra não segurar
 * a resposta do worker; função garantidamente não lança.
 */
async function goodbyePresence(instanceName: string, phone: string): Promise<void> {
  const task = async () => {
    try {
      await sleep(randomMs(4, 12));
      await sendPresence(instanceName, phone, "unavailable");
    } catch {
      // Silencioso de propósito: comportamento, não envio.
    }
  };
  try {
    const runtime = (globalThis as {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (typeof runtime?.waitUntil === "function") {
      runtime.waitUntil(task());
      return;
    }
    await task();
  } catch {
    // Silencioso de propósito.
  }
}

async function loadOsEquipmentNames(
  supabase: SupabaseClient,
  job: Job,
  legacyEquipmentId: string | null,
): Promise<string> {
  const { data: links, error: linksError } = await supabase
    .from("service_order_equipment")
    .select("equipment_id, equipment_position")
    .eq("service_order_id", job.source_id)
    .order("equipment_position", { ascending: true });
  if (linksError) throw new Error(`Não foi possível consultar os equipamentos da OS: ${linksError.message}`);

  const ids: string[] = [];
  for (const link of links ?? []) {
    if (link.equipment_id && !ids.includes(link.equipment_id)) ids.push(link.equipment_id);
  }
  if (legacyEquipmentId && !ids.includes(legacyEquipmentId)) ids.push(legacyEquipmentId);
  if (ids.length === 0) return "";

  const { data: equipments, error: equipmentError } = await supabase
    .from("equipment")
    .select("id, name")
    .eq("company_id", job.company_id)
    .in("id", ids);
  if (equipmentError) throw new Error(`Não foi possível consultar os equipamentos da OS: ${equipmentError.message}`);

  const nameById = new Map((equipments ?? []).map((row) => [row.id as string, String(row.name ?? "")]));
  return formatWhatsappEquipmentNames(ids.map((id) => nameById.get(id) ?? ""));
}

// Os TEXTOS dos avisos vivem em `_shared/whatsapp-message-templates.ts`, o mesmo
// arquivo que a tela usa na prévia e no editor. Aqui só se buscam os dados da OS
// ou da cobrança e se entregam os valores das variáveis.
async function buildOsMessage(
  supabase: SupabaseClient,
  job: Job,
  settings: SettingsData,
  customer: CustomerData,
  companyValues: CompanyValues,
  recipientName: string,
) {
  const { data: os, error: osError } = await supabase
    .from("service_orders")
    .select("id, company_id, order_number, public_short_code, technician_id, service_type_id, equipment_id, scheduled_date, scheduled_time, schedule_plan")
    .eq("id", job.source_id)
    .eq("company_id", job.company_id)
    .maybeSingle();
  if (osError) throw new Error(`Não foi possível consultar a OS: ${osError.message}`);
  if (!os) return null;

  const key = job.event_key.split(".")[1] ?? "";
  const template = resolveWhatsappTemplate({
    domain: "os",
    event: key,
    choice: pref(settings.automation_preferences, ["os", "events", key, "template"], "automatic"),
    customText: pref<unknown>(settings.automation_preferences, ["os", "events", key, "customText"], null),
    automaticStyle: pickStyle("automatic"),
    options: { includeOsLink: pref(settings.automation_preferences, ["os", "includeLink"], true) },
  });
  if (!template) return null;

  // Só consulta o que o texto realmente usa.
  const tokens = listWhatsappTemplateTokens(template);
  const [technicianResult, serviceResult, equipmentNames] = await Promise.all([
    tokens.includes("os.tecnico") && os.technician_id
      ? supabase.from("profiles").select("full_name").eq("user_id", os.technician_id).eq("company_id", job.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    tokens.includes("os.servico") && os.service_type_id
      ? supabase.from("service_types").select("name").eq("id", os.service_type_id).eq("company_id", job.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    tokens.includes("os.equipamentos")
      ? loadOsEquipmentNames(supabase, job, os.equipment_id ?? null)
      : Promise.resolve(""),
  ]);
  const auxiliaryError = technicianResult.error || serviceResult.error;
  if (auxiliaryError) {
    throw new Error(`Não foi possível consultar os detalhes da OS: ${auxiliaryError.message}`);
  }

  const firstJourney = Array.isArray(os.schedule_plan) && os.schedule_plan.length > 0
    ? os.schedule_plan[0] as Record<string, unknown>
    : null;
  const scheduledDate = typeof firstJourney?.date === "string" ? firstJourney.date : os.scheduled_date;
  const scheduledTime = typeof firstJourney?.time === "string" ? firstJourney.time : os.scheduled_time;
  const visitDate = scheduledDate ? dateBr(scheduledDate) : null;
  const visitTime = scheduledTime ? String(scheduledTime).slice(0, 5) : null;
  const segment = os.public_short_code || os.id;

  return renderWhatsappTemplate(template, {
    "destinatario.nome": sanitizeWhatsappTextValue(recipientName) || customer.name,
    "cliente.nome": customer.name,
    ...companyValues,
    "aviso.cliente": recipientKind(job) === "customer_contact" ? customer.name || "cliente" : null,
    "os.numero": os.order_number ? `#${os.order_number}` : null,
    "os.agendamento": visitDate ? (visitTime ? `${visitDate}, às ${visitTime}` : visitDate) : null,
    "os.data": visitDate,
    "os.horario": visitTime,
    "os.servico": serviceResult.data?.name ?? null,
    "os.tecnico": technicianResult.data?.full_name ?? null,
    "os.equipamentos": equipmentNames,
    "os.link": `https://www.dominex.app/os-tecnico/${segment}?modo=cliente`,
  });
}

async function buildBillingMessage(
  supabase: SupabaseClient,
  job: Job,
  settings: SettingsData,
  customer: CustomerData,
  companyValues: CompanyValues,
  recipientName: string,
) {
  const { data: charge, error: chargeError } = await supabase
    .from("tenant_charges")
    .select("id, company_id, value, due_date, public_short_code, status")
    .eq("id", job.source_id)
    .eq("company_id", job.company_id)
    .maybeSingle();
  if (chargeError) throw new Error(`Não foi possível consultar a cobrança: ${chargeError.message}`);
  if (!charge || !["PENDING", "OVERDUE"].includes(charge.status)) return null;

  const key = job.event_key.split(".")[1] ?? "";
  const template = resolveWhatsappTemplate({
    domain: "billing",
    event: key,
    choice: pref(settings.automation_preferences, ["billing", "events", key, "template"], "automatic"),
    customText: pref<unknown>(settings.automation_preferences, ["billing", "events", key, "customText"], null),
    automaticStyle: pickStyle("automatic"),
    options: {
      includeAmount: pref(settings.automation_preferences, ["billing", "includeAmount"], true),
      includePaymentLink: pref(settings.automation_preferences, ["billing", "includePaymentLink"], true),
    },
  });
  if (!template) return null;

  return renderWhatsappTemplate(template, {
    "destinatario.nome": sanitizeWhatsappTextValue(recipientName) || customer.name,
    "cliente.nome": customer.name,
    ...companyValues,
    "aviso.cliente": recipientKind(job) === "customer_contact" ? customer.name || "cliente" : null,
    "cobranca.valor": money(charge.value),
    "cobranca.vencimento": charge.due_date ? dateBr(charge.due_date) : null,
    "cobranca.link": charge.public_short_code
      ? `https://www.dominex.app/pagar/${charge.public_short_code}`
      : null,
    "cobranca.dias_antes": pref(settings.automation_preferences, ["billing", "daysBeforeDue"], 3),
    "cobranca.dias_depois": pref(settings.automation_preferences, ["billing", "daysAfterDue"], 2),
  });
}

async function validateScheduledReminderBeforeSend(
  supabase: SupabaseClient,
  job: Job,
  phone: string,
): Promise<boolean> {
  if (job.event_key !== "os.scheduled_reminder") return true;

  const { data: validation, error: validationError } = await supabase.rpc(
    "whatsapp_validate_scheduled_os_reminder",
    { p_job_id: job.id, p_company_id: job.company_id, p_phone: phone },
  );
  if (validationError) {
    await deferJob(
      supabase,
      job,
      "scheduled_reminder_validation_unavailable",
      "Não foi possível confirmar novamente o agendamento da OS.",
      new Date(Date.now() + 300 * 1000),
    );
    return false;
  }
  if (validation !== "valid") {
    const reason = validation === "appointment_passed"
      ? "O horário agendado da visita já passou."
      : "O agendamento ou a configuração do lembrete mudou antes do envio.";
    await skipJob(supabase, job, `scheduled_reminder_${validation ?? "obsolete"}`, reason, phone);
    return false;
  }
  return true;
}

async function beginSendJobDispatch(
  supabase: SupabaseClient,
  job: Job,
  phone: string,
): Promise<boolean> {
  const { data: result, error } = await supabase.rpc(
    "whatsapp_begin_send_job_dispatch",
    { p_job_id: job.id, p_company_id: job.company_id, p_phone: phone },
  );
  if (error) {
    // A resposta pode ter se perdido depois do commit. Nao transformamos em
    // retry: a recuperacao de orfao decide pelo marker persistido no banco.
    console.error("[whatsapp-send-worker] dispatch marker unavailable", {
      job_id: job.id,
      message: error.message,
    });
    return false;
  }
  if (result === "ready") return true;

  // `job_unavailable` tambem cobre marker ja persistido por outra execucao.
  // Nessa situacao nao podemos converter `processing` em `skipped`: o provedor
  // pode estar sendo chamado agora, ou a resposta do primeiro begin pode ter
  // se perdido. Preservar job+marker deixa a recuperacao classificar o envio
  // como delivery_unknown sem risco de duplicar ou apagar a ambiguidade.
  if (result === "job_unavailable" || typeof result !== "string") {
    console.warn("[whatsapp-send-worker] dispatch already unavailable", {
      job_id: job.id,
      result: result ?? null,
    });
    return false;
  }

  const scheduled = job.event_key === "os.scheduled_reminder";
  const reason = result === "appointment_passed"
    ? "O horário agendado da visita já passou."
    : scheduled
    ? "O agendamento ou a configuração do lembrete mudou antes do envio."
    : "O job deixou de estar disponível antes do envio.";
  await skipJob(
    supabase,
    job,
    scheduled ? `scheduled_reminder_${result ?? "obsolete"}` : `dispatch_${result ?? "obsolete"}`,
    reason,
    phone,
  );
  return false;
}

async function processJob(supabase: SupabaseClient, job: Job) {
  const [
    connectionResult,
    settingsResult,
    customerResult,
    contactResult,
    companyResult,
    moduleResult,
    regionalSettingsResult,
  ] = await Promise.all([
    supabase.from("whatsapp_connections").select("*").eq("id", job.connection_id).eq("company_id", job.company_id).maybeSingle(),
    supabase.from("company_whatsapp_settings").select("*").eq("company_id", job.company_id).maybeSingle(),
    job.customer_id
      ? supabase.from("customers").select("id, company_id, name, phone, celular, whatsapp_notifications_enabled, is_deleted").eq("id", job.customer_id).eq("company_id", job.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    recipientKind(job) === "customer_contact" && job.customer_contact_id && job.customer_id
      ? supabase.from("customer_contacts")
        .select("id, customer_id, name, phone")
        .eq("id", job.customer_contact_id)
        .eq("customer_id", job.customer_id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("companies").select("name, cnpj, phone").eq("id", job.company_id).maybeSingle(),
    supabase.rpc("company_has_module", { p_company_id: job.company_id, p_module_code: "whatsapp" }),
    supabase.from("company_settings").select("country_code, timezone, document, phone").eq("company_id", job.company_id).maybeSingle(),
  ]);

  const initialReadError = [
    connectionResult.error,
    settingsResult.error,
    customerResult.error,
    contactResult.error,
    companyResult.error,
    moduleResult.error,
    regionalSettingsResult.error,
  ].find(Boolean);
  if (initialReadError) {
    console.error("[whatsapp-send-worker] initial data query failed", {
      job_id: job.id,
      message: initialReadError.message,
    });
    return deferJob(
      supabase,
      job,
      "initial_data_unavailable",
      "Não foi possível confirmar os dados necessários para o envio.",
      new Date(Date.now() + 300 * 1000),
    );
  }

  const connection = connectionResult.data;
  const settings = settingsResult.data;
  const customer = customerResult.data;
  const contact = contactResult.data as CustomerContactData | null;
  const company = companyResult.data;
  const regionalSettings = regionalSettingsResult.data as RegionalSettingsData | null;

  if (moduleResult.data !== true) return skipJob(supabase, job, "module_inactive", "Módulo de WhatsApp inativo.");
  // Daqui até o `sendText` nenhum caminho de adiamento chamou o provedor: são
  // todos DEFERIMENTOS (deferJob), não tentativas (retryJob).
  if (!settings?.enabled) {
    return deferJob(
      supabase, job, "automation_paused", "As automações de WhatsApp estão pausadas.",
      new Date(Date.now() + 300 * 1000),
    );
  }
  if (!connection || connection.status !== "connected") {
    return deferJob(
      supabase, job, "connection_unavailable", "A conexão está indisponível.",
      new Date(Date.now() + 300 * 1000),
    );
  }
  if (job.provider !== "evolution_qr") {
    return deferJob(
      supabase,
      job,
      "provider_not_implemented",
      "O provedor configurado ainda não está disponível para este envio.",
      new Date(Date.now() + 3600 * 1000),
    );
  }
  if (!connection.instance_name) {
    return skipJob(supabase, job, "invalid_connection", "A conexão QR Code não possui uma instância válida.");
  }

  // Reaplica a assinatura de eventos uma vez por versão. Assim uma instância
  // existente passa a confirmar entrega/leitura sem exigir novo QR Code.
  if (connection.webhook_config_version !== EVOLUTION_WEBHOOK_CONFIG_VERSION) {
    const webhookUrl = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/whatsapp-webhook`;
    const webhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ?? "";
    try {
      await setInstanceWebhook(connection.instance_name, webhookUrl, webhookSecret);
      const { error: webhookVersionError } = await supabase
        .from("whatsapp_connections")
        .update({ webhook_config_version: EVOLUTION_WEBHOOK_CONFIG_VERSION })
        .eq("id", job.connection_id)
        .eq("company_id", job.company_id);
      if (webhookVersionError) throw webhookVersionError;
    } catch (error) {
      return deferJob(
        supabase,
        job,
        "webhook_configuration_failed",
        `Não foi possível configurar as confirmações de entrega: ${
          error instanceof Error ? error.message : String(error)
        }`.slice(0, 500),
        new Date(Date.now() + 300 * 1000),
      );
    }
  }
  if (!customer || customer.is_deleted === true) {
    return skipJob(supabase, job, "customer_unavailable", "O cliente vinculado ao envio não foi encontrado.");
  }
  if (!customer.whatsapp_notifications_enabled) {
    return skipJob(supabase, job, "customer_opt_out", "O cliente não autorizou mensagens pelo WhatsApp.");
  }
  if (recipientKind(job) === "customer_contact" && !contact) {
    return skipJob(supabase, job, "recipient_unavailable", "O contato destinatário não está mais disponível.");
  }

  const routeValidation = await validateRecipientRoute(supabase, job);
  if (routeValidation === "error") {
    return deferJob(
      supabase,
      job,
      "recipient_route_unavailable",
      "Não foi possível confirmar o destinatário configurado.",
      new Date(Date.now() + 300 * 1000),
    );
  }
  if (routeValidation !== "valid") {
    return skipJob(supabase, job, "recipient_route_changed", "O destinatário não está mais configurado para esta mensagem.");
  }
  if (!regionalSettings?.country_code) {
    return deferJob(
      supabase,
      job,
      "country_settings_unavailable",
      "Não foi possível confirmar o país usado para validar o telefone.",
      new Date(Date.now() + 300 * 1000),
    );
  }
  if (!COUNTRY_PHONE_RULES[regionalSettings.country_code.trim().toUpperCase()]) {
    return deferJob(
      supabase,
      job,
      "country_not_supported",
      "O país configurado ainda não é compatível com os envios pelo WhatsApp.",
      new Date(Date.now() + 3600 * 1000),
    );
  }
  const rawPhone = recipientKind(job) === "customer_contact"
    ? contact?.phone
    : customer.celular?.trim() || customer.phone;
  const recipientName = recipientKind(job) === "customer_contact"
    ? contact?.name ?? customer.name
    : customer.name;
  const phone = normalizePhone(rawPhone, regionalSettings.country_code);
  if (!phone) return skipJob(supabase, job, "invalid_phone", "Destinatário sem WhatsApp válido cadastrado.");

  const { data: optedOut, error: optedOutError } = await supabase
    .from("whatsapp_opt_outs").select("phone").eq("company_id", job.company_id).eq("phone", phone).maybeSingle();
  if (optedOutError) {
    return deferJob(
      supabase,
      job,
      "opt_out_check_unavailable",
      "Não foi possível confirmar a autorização do cliente para este envio.",
      new Date(Date.now() + 300 * 1000),
    );
  }
  if (optedOut) return skipJob(supabase, job, "customer_opt_out", "O destinatário pediu para parar os envios.", phone);

  try {
    if (await alreadySentToPhoneForSource(supabase, job, phone)) {
      return skipJob(
        supabase,
        job,
        "duplicate_recipient",
        "Este número já recebeu esta mensagem.",
        phone,
      );
    }
  } catch (error) {
    console.error("[whatsapp-send-worker] duplicate recipient query failed", {
      job_id: job.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return deferJob(
      supabase,
      job,
      "duplicate_check_unavailable",
      "Não foi possível confirmar se este destinatário já recebeu a mensagem.",
      new Date(Date.now() + 300 * 1000),
    );
  }

  const { data: canSend, error: quotaError } = await supabase.rpc("whatsapp_can_send", { p_company_id: job.company_id });
  if (quotaError) {
    return deferJob(
      supabase,
      job,
      "quota_check_unavailable",
      "Não foi possível conferir o limite mensal do módulo.",
      new Date(Date.now() + 300 * 1000),
    );
  }
  if (canSend !== true) return skipJob(supabase, job, "monthly_quota", "Limite mensal do módulo atingido.", phone);

  // Antes de qualquer limite de volume: o número existe mesmo no WhatsApp?
  // Número inexistente é descartado (skip), não adiado — reagendar não faz o
  // telefone passar a ter WhatsApp.
  if (!(await hasWhatsapp(supabase, job, connection.instance_name, phone))) {
    return skipJob(supabase, job, "number_not_on_whatsapp", "Esse número não tem WhatsApp.", phone);
  }

  const now = Date.now();
  let hourCount: number;
  let dayCount: number;
  let recipientCount: number;
  try {
    [hourCount, dayCount, recipientCount] = await Promise.all([
      sentCount(supabase, job, new Date(now - 60 * 60 * 1000).toISOString()),
      sentCount(supabase, job, new Date(now - 24 * 60 * 60 * 1000).toISOString()),
      sentCount(supabase, job, new Date(now - 24 * 60 * 60 * 1000).toISOString(), phone),
    ]);
  } catch (error) {
    console.error("[whatsapp-send-worker] volume query failed", {
      job_id: job.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return deferJob(
      supabase,
      job,
      "volume_check_unavailable",
      "Não foi possível conferir os limites de volume do envio.",
      new Date(now + 300 * 1000),
    );
  }
  // Limites de volume: adiados pra MAIOR entre o atraso de hoje e a próxima
  // abertura da janela de envio (volumeDeferAt).
  if (hourCount >= MAX_PER_HOUR) {
    return deferJob(
      supabase, job, "hourly_limit", "Limite de 60 mensagens por hora atingido.",
      await volumeDeferAt(supabase, job, 3600),
    );
  }
  if (dayCount >= MAX_PER_DAY) {
    return deferJob(
      supabase, job, "daily_limit", "Limite de 400 mensagens em 24 horas atingido.",
      await volumeDeferAt(supabase, job, 43200),
    );
  }
  // Destinatário: o atraso é sobre a conversa daquele telefone, não sobre o
  // volume da conexão — a janela não altera essa conta.
  if (recipientCount >= MAX_PER_RECIPIENT_24H) {
    return deferJob(
      supabase, job, "recipient_limit", "Limite de 5 mensagens ao destinatário em 24 horas atingido.",
      new Date(now + 86400 * 1000),
    );
  }

  // Cobrança é lembrete não solicitado naquele instante, diferente dos avisos
  // transacionais de OS. Limita só `billing.*` a uma por destinatário em uma
  // janela móvel de 24h; os demais jobs ficam adiados, nunca descartados. Na
  // próxima tentativa `buildBillingMessage` relê a cobrança e ignora se paga.
  if (job.source_type === "tenant_charge") {
    const { data: latestBilling, error: latestBillingError } = await supabase
      .from("whatsapp_events")
      .select("sent_at")
      .eq("company_id", job.company_id)
      .eq("phone", phone)
      .like("trigger", "billing.%")
      .in("status", ["enviado", "entregue", "lido"])
      .order("sent_at", { ascending: false })
      .limit(MAX_BILLING_PER_RECIPIENT_24H)
      .maybeSingle();
    if (latestBillingError) {
      return deferJob(
        supabase,
        job,
        "billing_limit_unavailable",
        "Não foi possível conferir o limite diário de cobrança.",
        new Date(now + 300 * 1000),
      );
    }
    if (latestBilling?.sent_at) {
      const nextBillingAtMs = new Date(latestBilling.sent_at).getTime() + 86400 * 1000;
      if (Number.isFinite(nextBillingAtMs) && nextBillingAtMs > now) {
        const delaySeconds = Math.max(60, Math.ceil((nextBillingAtMs - now) / 1000));
        return deferJob(
          supabase,
          job,
          "billing_recipient_limit",
          "Já foi enviada uma cobrança a este destinatário nas últimas 24 horas.",
          await volumeDeferAt(supabase, job, delaySeconds),
        );
      }
    }
  }

  // Base do aquecimento é warmup_started_at, NÃO connected_at: connected_at é
  // reescrito a cada reconexão (celular descarregou, app caiu, QR escaneado de
  // novo) e usá-lo aqui fazia um número maduro — mandando 400/dia há meses —
  // despencar pra 20/dia por duas semanas numa reconexão banal, sem nenhum
  // ganho de segurança (reconectar no mesmo IP/número não apaga reputação
  // nenhuma). warmup_started_at só reinicia quando IP ou número de fato mudam
  // (gravado em whatsapp-connect/whatsapp-webhook e pelas RPCs de proxy).
  //
  // INVERSÃO DELIBERADA do default: antes, `connected_at` ausente pulava o
  // teto inteiro (sem aquecimento nenhum). Isso é o lado errado do erro — na
  // dúvida sobre a reputação de um número, o certo é mandar POUCO, não mandar
  // muito. Por isso `warmup_started_at` ausente é tratado como DIA 0 (teto de
  // 20/dia), o lado conservador, em vez de "sem teto".
  {
    const warmupStartedAt = connection.warmup_started_at
      ? new Date(connection.warmup_started_at).getTime()
      : now;
    const daysAlive = Math.max(0, Math.floor((now - warmupStartedAt) / 86400000));
    if (daysAlive < WARMUP_DAILY_CAP.length && dayCount >= WARMUP_DAILY_CAP[daysAlive]) {
      return deferJob(
        supabase, job, "warmup_limit", "Limite diário de aquecimento do número atingido.",
        await volumeDeferAt(supabase, job, 43200),
      );
    }
  }

  const companyValues = resolveWhatsappCompanyValues({
    name: company?.name,
    cnpj: (company as CompanyData | null)?.cnpj,
    phone: (company as CompanyData | null)?.phone,
    settingsDocument: regionalSettings?.document,
    settingsPhone: regionalSettings?.phone,
  });
  let text: string | null;
  try {
    if (job.source_type === "service_order") {
      text = await buildOsMessage(supabase, job, settings, customer, companyValues, recipientName);
    } else {
      // O nome identifica o remetente antes do link de pagamento. Sem ele, não
      // enviamos uma cobrança genérica que possa parecer fraude ao cliente.
      if (!company?.name?.trim()) {
        return deferJob(
          supabase,
          job,
          "company_name_unavailable",
          "O nome da empresa está indisponível para montar a mensagem.",
          new Date(Date.now() + 300 * 1000),
        );
      }
      text = await buildBillingMessage(supabase, job, settings, customer, companyValues, recipientName);
    }
  } catch (error) {
    console.error("[whatsapp-send-worker] source query failed", {
      job_id: job.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return deferJob(
      supabase,
      job,
      "source_check_unavailable",
      "Não foi possível confirmar os dados da mensagem.",
      new Date(Date.now() + 300 * 1000),
    );
  }
  if (!text) return skipJob(supabase, job, "source_unavailable", "A origem não existe mais ou a cobrança já foi paga.", phone);

  // O cron fotografa primeira jornada + timing no job. Rele tudo no banco no
  // ultimo instante antes de qualquer efeito visivel (marcar leitura/presenca)
  // e do provedor: reagendamento, cancelamento, mudanca de cliente/configuracao
  // ou visita que ja passou tornam o job obsoleto.
  if (!(await validateScheduledReminderBeforeSend(supabase, job, phone))) return;

  const prefs = settings.automation_preferences;

  // Opt-in, default desligado. Antes da presença: a pessoa lê a conversa e só
  // depois aparece como disponível e começa a digitar.
  // `pref<boolean>` explícito: sem o parâmetro de tipo, T é inferido como o
  // literal `false` e a comparação com `true` vira erro de tipo.
  if (pref<boolean>(prefs, ["humanBehavior", "markAsReadBeforeReply"], false) === true) {
    await markConversationRead(supabase, job, connection.instance_name, phone);
  }

  let providerCallStarted = false;
  try {
    // "Abriu o app". Enfeite de comportamento: silencioso, nunca bloqueia.
    try {
      await sendPresence(connection.instance_name, phone, "available");
    } catch {
      // Presença não é parte do envio.
    }

    const delayMs = pref<boolean>(prefs, ["humanBehavior", "simulateTyping"], true) === false
      ? undefined
      : typingDelayMs(text);

    // A digitacao e simulada localmente em todos os eventos. Assim a barreira
    // final roda DEPOIS da espera humana, e o provedor nunca recebe um delay
    // durante o qual telefone, opt-out, assinatura ou origem poderiam mudar.
    if (delayMs !== undefined) {
      try {
        await sendPresence(connection.instance_name, phone, "composing");
      } catch {
        // Presenca nao e parte do envio.
      }
      await sleep(delayMs);
      try {
        await sendPresence(connection.instance_name, phone, "paused");
      } catch {
        // Presenca nao e parte do envio.
      }
    }

    // Ultima barreira antes do provedor: rele todas as fontes mutaveis, nao so
    // rota/opt-out. A autorizacao obtida no inicio do job pode ter expirado.
    const finalValidation = await validateFinalDispatchState(
      supabase,
      job,
      phone,
      regionalSettings.country_code,
    );
    if (finalValidation.status === "defer") {
      await deferJob(
        supabase,
        job,
        finalValidation.code,
        finalValidation.message,
        new Date(Date.now() + 300 * 1000),
      );
      await goodbyePresence(connection.instance_name, phone);
      return;
    }
    if (finalValidation.status === "skip") {
      await skipJob(
        supabase,
        job,
        finalValidation.code,
        finalValidation.message,
        phone,
      );
      await goodbyePresence(connection.instance_name, phone);
      return;
    }

    // O marco duravel vale para TODO evento. Depois dele, crash/timeout nunca
    // transforma entrega ambigua em retry automatico.
    if (!(await beginSendJobDispatch(supabase, job, phone))) {
      await goodbyePresence(connection.instance_name, phone);
      return;
    }

    providerCallStarted = true;
    const sent = await sendText(
      connection.instance_name,
      phone,
      text,
    );
    const sentAt = new Date().toISOString();
    // Cadência humana (log-normal + pausa longa ocasional + curva horária) em
    // vez de intervalo uniforme, que é assinatura estatística de máquina.
    const gapSeconds = humanGapSeconds(companyHour(regionalSettings.timezone));
    const nextSendAt = new Date(Date.now() + gapSeconds * 1000).toISOString();
    const { data: finalized, error: finalizeError } = await supabase.rpc(
      "whatsapp_finalize_send_job",
      {
        p_job_id: job.id,
        p_company_id: job.company_id,
        p_phone: phone,
        p_provider_message_id: sent.id,
        p_sent_at: sentAt,
        p_next_send_at: nextSendAt,
      },
    );
    if (finalizeError || finalized !== true) {
      // O provedor ja aceitou. Manter processing+marker impede duplicidade;
      // a recuperacao classifica delivery_unknown se o commit nao ocorreu.
      console.error("[whatsapp-send-worker] send finalization unavailable", {
        job_id: job.id,
        message: finalizeError?.message ?? "finalization_rejected",
      });
      await goodbyePresence(connection.instance_name, phone);
      return;
    }
    // Só AGORA, com job=sent, evento=enviado e a conexão já reagendada: nenhum
    // timeout da presença final pode fazer um envio bem-sucedido parecer falha.
    await goodbyePresence(connection.instance_name, phone);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof EvolutionApiError ? error.status : 0;
    const deliveryUnknown = providerCallStarted &&
      !(error instanceof EvolutionConfigError) &&
      isDeliveryUnknownStatus(status);
    const failures = (connection.consecutive_failures ?? 0) + 1;
    const mustPause = status === 401 || status === 403 || failures >= 3;
    await supabase.from("whatsapp_connections").update({
      status: status === 403 ? "banned" : mustPause ? "attention" : "connected",
      consecutive_failures: failures,
      last_error: message.slice(0, 500),
      last_seen_at: new Date().toISOString(),
    }).eq("id", job.connection_id).eq("company_id", job.company_id);
    if (deliveryUnknown) {
      // Rede/timeout/5xx nao provam rejeicao. O provedor pode ter aceitado e a
      // resposta ter se perdido; repetir automaticamente criaria duplicidade.
      await failJob(supabase, job, "delivery_unknown", message.slice(0, 500), phone);
    } else if (mustPause || job.attempts >= MAX_ATTEMPTS) {
      await failJob(
        supabase,
        job,
        status === 403 ? "possible_ban" : "send_failed",
        message.slice(0, 500),
        phone,
      );
    } else {
      // So repetimos quando uma resposta HTTP definitiva (4xx) prova que o
      // provedor nao aceitou a mensagem. Configuracao local tambem falha antes
      // de qualquer request e pode ser tentada novamente apos correcao.
      await retryJob(supabase, job, "send_failed", message.slice(0, 500), Math.min(3600, 30 * (2 ** job.attempts)));
    }
    await goodbyePresence(connection.instance_name, phone);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método não suportado.", { status: 405 });
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const provided = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !provided || !timingSafeEqual(secret, provided)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const webhooksConfigured = await reconcileWebhookConfigs(supabase);
  const { data: jobs, error } = await supabase.rpc("whatsapp_claim_send_jobs", { p_limit: 20, p_orphan_minutes: 10 });
  if (error) {
    console.error("[whatsapp-send-worker] claim failed", { message: error.message });
    return new Response(JSON.stringify({ error: "claim_failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const settled = await Promise.allSettled(((jobs ?? []) as Job[]).map((job) => processJob(supabase, job)));
  for (const result of settled) {
    if (result.status === "rejected") console.error("[whatsapp-send-worker] job failed", { message: String(result.reason) });
  }
  return new Response(JSON.stringify({
    ok: true,
    claimed: jobs?.length ?? 0,
    webhooks_configured: webhooksConfigured,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});
