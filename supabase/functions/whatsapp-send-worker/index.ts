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
};

type SettingsData = { automation_preferences: unknown };
type RegionalSettingsData = { country_code: string; timezone: string | null };
type CustomerData = { name: string };
type CompanyData = { name: string };
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

function whatsappPlainText(value: string | null | undefined, fallback: string): string {
  const sanitized = (value ?? "")
    .replace(/[\r\n*_~`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || fallback;
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

async function recordEvent(
  supabase: SupabaseClient,
  job: Job,
  values: Record<string, unknown>,
) {
  const { data: existing } = await supabase
    .from("whatsapp_events")
    .select("id")
    .eq("job_id", job.id)
    .maybeSingle();
  if (existing) {
    await supabase.from("whatsapp_events").update(values).eq("id", existing.id);
    return;
  }
  await supabase.from("whatsapp_events").insert({
    company_id: job.company_id,
    job_id: job.id,
    connection_id: job.connection_id,
    provider: job.provider,
    trigger: job.event_key,
    os_id: job.source_type === "service_order" ? job.source_id : null,
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

async function buildOsMessage(supabase: SupabaseClient, job: Job, settings: SettingsData, customer: CustomerData) {
  const { data: os, error: osError } = await supabase
    .from("service_orders")
    .select("id, company_id, order_number, public_short_code, technician_id, service_type_id, scheduled_date, scheduled_time, schedule_plan")
    .eq("id", job.source_id)
    .eq("company_id", job.company_id)
    .maybeSingle();
  if (osError) throw new Error(`Não foi possível consultar a OS: ${osError.message}`);
  if (!os) return null;

  const [technicianResult, serviceResult] = await Promise.all([
    os.technician_id
      ? supabase.from("profiles").select("full_name").eq("user_id", os.technician_id).eq("company_id", job.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    os.service_type_id
      ? supabase.from("service_types").select("name").eq("id", os.service_type_id).eq("company_id", job.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const auxiliaryError = technicianResult.error || serviceResult.error;
  if (auxiliaryError) {
    throw new Error(`Não foi possível consultar os detalhes da OS: ${auxiliaryError.message}`);
  }
  const key = job.event_key.split(".")[1] as "scheduled_reminder" | "a_caminho" | "em_andamento" | "concluida";
  const style = pickStyle(pref(settings.automation_preferences, ["os", "events", key, "template"], "automatic"));
  const technician = technicianResult.data?.full_name ?? "nosso técnico";
  const service = serviceResult.data?.name ?? "seu atendimento";
  const order = os.order_number ? `#${os.order_number}` : "";
  const firstJourney = Array.isArray(os.schedule_plan) && os.schedule_plan.length > 0
    ? os.schedule_plan[0] as Record<string, unknown>
    : null;
  const scheduledDate = typeof firstJourney?.date === "string" ? firstJourney.date : os.scheduled_date;
  const scheduledTime = typeof firstJourney?.time === "string" ? firstJourney.time : os.scheduled_time;
  const reminderDate = dateBr(scheduledDate);
  const reminderTime = scheduledTime ? String(scheduledTime).slice(0, 5) : "horário não informado";
  const actions = {
    scheduled_reminder: {
      objective: `Lembrete: sua visita da OS ${order} está agendada para ${reminderDate}, às ${reminderTime}.`,
      cordial: `Passando para lembrar que sua visita da OS ${order} está agendada para ${reminderDate}, às ${reminderTime}.`,
      detailed: `Sua visita para ${service}, referente à OS ${order}, está agendada para ${reminderDate}, às ${reminderTime}.`,
    },
    a_caminho: {
      objective: `O técnico ${technician} está a caminho para atender a OS ${order}.`,
      cordial: `Boas notícias: o técnico ${technician} já está a caminho para atender você na OS ${order}.`,
      detailed: `O técnico ${technician} iniciou o deslocamento para o serviço de ${service}, referente à OS ${order}.`,
    },
    em_andamento: {
      objective: `O atendimento da OS ${order} foi iniciado.`,
      cordial: `Seu atendimento começou. O técnico ${technician} já está realizando o serviço da OS ${order}.`,
      detailed: `O técnico ${technician} iniciou o serviço de ${service}, referente à OS ${order}.`,
    },
    concluida: {
      objective: `A OS ${order} foi concluída.`,
      cordial: "Seu atendimento foi concluído com sucesso. Agradecemos pela confiança na nossa equipe!",
      detailed: `O serviço de ${service}, referente à OS ${order}, foi concluído pelo técnico ${technician}.`,
    },
  }[key];
  if (!actions) return null;

  const lines = [`Olá, ${customer.name}!`, "", actions[style]];
  if (pref(settings.automation_preferences, ["os", "includeLink"], true)) {
    const segment = os.public_short_code || os.id;
    lines.push("", `*Acompanhe a OS:* https://dominex.app/os-tecnico/${segment}?modo=cliente`);
  }
  return lines.join("\n");
}

async function buildBillingMessage(
  supabase: SupabaseClient,
  job: Job,
  settings: SettingsData,
  customer: CustomerData,
  company: CompanyData,
) {
  const { data: charge, error: chargeError } = await supabase
    .from("tenant_charges")
    .select("id, company_id, value, due_date, public_short_code, status")
    .eq("id", job.source_id)
    .eq("company_id", job.company_id)
    .maybeSingle();
  if (chargeError) throw new Error(`Não foi possível consultar a cobrança: ${chargeError.message}`);
  if (!charge || !["PENDING", "OVERDUE"].includes(charge.status)) return null;

  const key = job.event_key.split(".")[1] as "created" | "before_due" | "due_today" | "after_due";
  const style = pickStyle(pref(settings.automation_preferences, ["billing", "events", key, "template"], "automatic"));
  const before = pref(settings.automation_preferences, ["billing", "daysBeforeDue"], 3);
  const after = pref(settings.automation_preferences, ["billing", "daysAfterDue"], 2);
  const companyName = `*${whatsappPlainText(company.name, "Sua empresa")}*`;
  const openings = {
    created: {
      objective: `Você recebeu uma nova cobrança da ${companyName}.`,
      cordial: `Passando para avisar que você recebeu uma nova cobrança da ${companyName}.`,
      detailed: `Uma nova cobrança da ${companyName} foi gerada para você.`,
    },
    before_due: {
      objective: `Uma cobrança da ${companyName} vence em ${before} dias.`,
      cordial: `A ${companyName} lembra que sua cobrança vence em ${before} dias.`,
      detailed: `Você possui uma cobrança da ${companyName} com vencimento em ${before} dias.`,
    },
    due_today: {
      objective: `Uma cobrança da ${companyName} vence hoje.`,
      cordial: `A ${companyName} lembra que sua cobrança vence hoje.`,
      detailed: `Você possui uma cobrança da ${companyName} com vencimento hoje.`,
    },
    after_due: {
      objective: `Uma cobrança da ${companyName} venceu há ${after} dias.`,
      cordial: `A ${companyName} lembra que sua cobrança venceu há ${after} dias.`,
      detailed: `Você possui uma cobrança da ${companyName} vencida há ${after} dias.`,
    },
  }[key];
  if (!openings) return null;

  const details = [
    pref(settings.automation_preferences, ["billing", "includeAmount"], true) ? `*Valor:* ${money(charge.value)}` : null,
    `*Vencimento:* ${dateBr(charge.due_date)}`,
    pref(settings.automation_preferences, ["billing", "includePaymentLink"], true) && charge.public_short_code
      ? `*Pagar agora:* https://dominex.app/pagar/${charge.public_short_code}`
      : null,
  ].filter(Boolean);
  return [
    `Olá, ${customer.name}!`,
    "",
    openings[style],
    "",
    ...details,
    "",
    "Se você já realizou o pagamento, desconsidere esta mensagem.",
    "",
    "Em caso de dúvida, fale com a nossa equipe por aqui.",
  ].join("\n");
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

async function beginScheduledReminderDispatch(
  supabase: SupabaseClient,
  job: Job,
  phone: string,
): Promise<boolean> {
  if (job.event_key !== "os.scheduled_reminder") return true;

  const { data: result, error } = await supabase.rpc(
    "whatsapp_begin_scheduled_os_dispatch",
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

  const reason = result === "appointment_passed"
    ? "O horário agendado da visita já passou."
    : "O agendamento ou a configuração do lembrete mudou antes do envio.";
  await skipJob(supabase, job, `scheduled_reminder_${result ?? "obsolete"}`, reason, phone);
  return false;
}

async function processJob(supabase: SupabaseClient, job: Job) {
  const [connectionResult, settingsResult, customerResult, companyResult, moduleResult, regionalSettingsResult] = await Promise.all([
    supabase.from("whatsapp_connections").select("*").eq("id", job.connection_id).eq("company_id", job.company_id).maybeSingle(),
    supabase.from("company_whatsapp_settings").select("*").eq("company_id", job.company_id).maybeSingle(),
    job.customer_id
      ? supabase.from("customers").select("id, company_id, name, phone, celular, whatsapp_notifications_enabled, whatsapp_opt_out_at").eq("id", job.customer_id).eq("company_id", job.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("companies").select("name").eq("id", job.company_id).maybeSingle(),
    supabase.rpc("company_has_module", { p_company_id: job.company_id, p_module_code: "whatsapp" }),
    supabase.from("company_settings").select("country_code, timezone").eq("company_id", job.company_id).maybeSingle(),
  ]);

  const initialReadError = [
    connectionResult.error,
    settingsResult.error,
    customerResult.error,
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
  if (!customer) {
    return skipJob(supabase, job, "customer_unavailable", "O cliente vinculado ao envio não foi encontrado.");
  }
  if (!customer.whatsapp_notifications_enabled || customer.whatsapp_opt_out_at) {
    return skipJob(supabase, job, "customer_opt_out", "O cliente não autorizou mensagens pelo WhatsApp.");
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
  const phone = normalizePhone(customer.celular?.trim() || customer.phone, regionalSettings.country_code);
  if (!phone) return skipJob(supabase, job, "invalid_phone", "Cliente sem WhatsApp válido cadastrado.");

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
  if (optedOut) return skipJob(supabase, job, "customer_opt_out", "O cliente pediu para parar os envios.", phone);

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
          "Já foi enviada uma cobrança a este cliente nas últimas 24 horas.",
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

  let text: string | null;
  try {
    if (job.source_type === "service_order") {
      text = await buildOsMessage(supabase, job, settings, customer);
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
      text = await buildBillingMessage(supabase, job, settings, customer, company);
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

    // O lembrete agendado precisa validar o snapshot DEPOIS da espera humana.
    // Portanto, nele a digitacao e simulada localmente e o provedor recebe o
    // envio sem `delay`; nos eventos transacionais antigos o delay server-side
    // permanece inalterado.
    if (job.event_key === "os.scheduled_reminder" && delayMs !== undefined) {
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

    // Segunda barreira depois dos efeitos humanos e imediatamente antes da
    // chamada que pode enviar. Fecha a janela de corrida aberta por marcar
    // leitura/presenca enquanto o agendamento ainda podia mudar.
    if (!(await beginScheduledReminderDispatch(supabase, job, phone))) {
      await goodbyePresence(connection.instance_name, phone);
      return;
    }

    providerCallStarted = true;
    const sent = await sendText(
      connection.instance_name,
      phone,
      text,
      job.event_key === "os.scheduled_reminder" ? undefined : { delayMs },
    );
    const sentAt = new Date().toISOString();
    // Cadência humana (log-normal + pausa longa ocasional + curva horária) em
    // vez de intervalo uniforme, que é assinatura estatística de máquina.
    const gapSeconds = humanGapSeconds(companyHour(regionalSettings.timezone));
    const nextSendAt = new Date(Date.now() + gapSeconds * 1000).toISOString();
    if (job.event_key === "os.scheduled_reminder") {
      const { data: finalized, error: finalizeError } = await supabase.rpc(
        "whatsapp_finalize_scheduled_os_reminder",
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
        console.error("[whatsapp-send-worker] scheduled reminder finalization unavailable", {
          job_id: job.id,
          message: finalizeError?.message ?? "finalization_rejected",
        });
        await goodbyePresence(connection.instance_name, phone);
        return;
      }
    } else {
      await recordEvent(supabase, job, {
        phone, status: "enviado", error: null, sent_at: sentAt, provider_message_id: sent.id,
      });
      await supabase.from("whatsapp_send_jobs").update({
        status: "sent", locked_at: null, sent_at: sentAt, provider_message_id: sent.id,
        last_error: null, last_error_code: null,
      }).eq("id", job.id).eq("company_id", job.company_id);
      await supabase.from("whatsapp_connections").update({
        next_send_at: nextSendAt,
        consecutive_failures: 0, last_error: null, last_seen_at: sentAt,
      }).eq("id", job.connection_id).eq("company_id", job.company_id);
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
