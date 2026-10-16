import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkWhatsappNumbers,
  EvolutionApiError,
  humanGapSeconds,
  markMessagesAsRead,
  sendPresence,
  sendText,
  typingDelayMs,
} from "../_shared/evolution-client.ts";

const WARMUP_DAILY_CAP = [20, 30, 40, 60, 80, 100, 120, 150, 180, 220, 260, 300, 350, 400];
const MAX_PER_HOUR = 60;
const MAX_PER_DAY = 400;
const MAX_PER_RECIPIENT_24H = 5;
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
type CustomerData = { name: string };

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) result |= left[i] ^ right[i];
  return result === 0;
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
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
  await supabase.from("whatsapp_send_jobs").update({
    status: "skipped", locked_at: null, last_error_code: code, last_error: message,
  }).eq("id", job.id).eq("company_id", job.company_id);
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
    last_error_code: code,
    last_error: message,
    next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
  }).eq("id", job.id).eq("company_id", job.company_id);
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
  }).eq("id", job.id).eq("company_id", job.company_id);
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
 * Hora local de Brasília (0–23). A edge roda em UTC, então a conversão é de
 * verdade, via `Intl` com `America/Sao_Paulo` — NUNCA subtraindo 3 horas na
 * mão (lei do projeto: fuso Brasil, e a regra de fuso não é uma subtração).
 */
function brasiliaHour(at: Date = new Date()): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
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
  const { count } = await query;
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
  const { data: os } = await supabase
    .from("service_orders")
    .select("id, company_id, order_number, public_short_code, technician_id, service_type_id")
    .eq("id", job.source_id)
    .eq("company_id", job.company_id)
    .maybeSingle();
  if (!os) return null;

  const [technicianResult, serviceResult] = await Promise.all([
    os.technician_id
      ? supabase.from("profiles").select("full_name").eq("user_id", os.technician_id).maybeSingle()
      : Promise.resolve({ data: null }),
    os.service_type_id
      ? supabase.from("service_types").select("name").eq("id", os.service_type_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const key = job.event_key.split(".")[1] as "a_caminho" | "em_andamento" | "concluida";
  const style = pickStyle(pref(settings.automation_preferences, ["os", "events", key, "template"], "automatic"));
  const technician = technicianResult.data?.full_name ?? "nosso técnico";
  const service = serviceResult.data?.name ?? "seu atendimento";
  const order = os.order_number ? `#${os.order_number}` : "";
  const actions = {
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

async function buildBillingMessage(supabase: SupabaseClient, job: Job, settings: SettingsData, customer: CustomerData) {
  const { data: charge } = await supabase
    .from("tenant_charges")
    .select("id, company_id, value, due_date, description, public_short_code, created_by, status")
    .eq("id", job.source_id)
    .eq("company_id", job.company_id)
    .maybeSingle();
  if (!charge || !["PENDING", "OVERDUE"].includes(charge.status)) return null;

  const key = job.event_key.split(".")[1] as "created" | "before_due" | "due_today" | "after_due";
  const style = pickStyle(pref(settings.automation_preferences, ["billing", "events", key, "template"], "automatic"));
  const before = pref(settings.automation_preferences, ["billing", "daysBeforeDue"], 3);
  const after = pref(settings.automation_preferences, ["billing", "daysAfterDue"], 2);
  const openings = {
    created: {
      objective: "Uma nova cobrança foi gerada.",
      cordial: "Passando para avisar que uma nova cobrança foi gerada para você.",
      detailed: "Uma nova cobrança referente aos serviços contratados foi gerada.",
    },
    before_due: {
      objective: `Sua cobrança vence em ${before} dias.`,
      cordial: `Este é um lembrete amigável: sua cobrança vence em ${before} dias.`,
      detailed: `Lembramos que existe uma cobrança com vencimento próximo, em ${before} dias.`,
    },
    due_today: {
      objective: "Sua cobrança vence hoje.", cordial: "Passando para lembrar que sua cobrança vence hoje.",
      detailed: "A cobrança abaixo chegou à data de vencimento hoje.",
    },
    after_due: {
      objective: `Sua cobrança venceu há ${after} dias.`,
      cordial: `Notamos que sua cobrança venceu há ${after} dias. Se já pagou, desconsidere este aviso.`,
      detailed: `A cobrança abaixo está vencida há ${after} dias. Caso o pagamento já tenha sido realizado, desconsidere esta mensagem.`,
    },
  }[key];
  if (!openings) return null;

  let createdBy = "Sistema";
  if (charge.created_by && pref(settings.automation_preferences, ["billing", "includeCreatedBy"], false)) {
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", charge.created_by).maybeSingle();
    createdBy = profile?.full_name || "Sistema";
  }
  const details = [
    pref(settings.automation_preferences, ["billing", "includeAmount"], true) ? `*Valor:* ${money(charge.value)}` : null,
    `*Vencimento:* ${dateBr(charge.due_date)}`,
    pref(settings.automation_preferences, ["billing", "includeDescription"], true) && charge.description ? `*Descrição:* ${charge.description}` : null,
    pref(settings.automation_preferences, ["billing", "includeCreatedBy"], false) ? `*Gerada por:* ${createdBy}` : null,
    pref(settings.automation_preferences, ["billing", "includePaymentLink"], true) && charge.public_short_code
      ? `*Pagar agora:* https://dominex.app/pagar/${charge.public_short_code}`
      : null,
  ].filter(Boolean);
  return [`Olá, ${customer.name}!`, "", openings[style], "", ...details].join("\n");
}

async function processJob(supabase: SupabaseClient, job: Job) {
  const [{ data: connection }, { data: settings }, { data: customer }, moduleResult] = await Promise.all([
    supabase.from("whatsapp_connections").select("*").eq("id", job.connection_id).eq("company_id", job.company_id).maybeSingle(),
    supabase.from("company_whatsapp_settings").select("*").eq("company_id", job.company_id).maybeSingle(),
    job.customer_id
      ? supabase.from("customers").select("id, company_id, name, phone, celular, whatsapp_notifications_enabled, whatsapp_opt_out_at").eq("id", job.customer_id).eq("company_id", job.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc("company_has_module", { p_company_id: job.company_id, p_module_code: "whatsapp" }),
  ]);

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
    return skipJob(supabase, job, "provider_not_implemented", "A Meta Cloud API ainda não está liberada.");
  }
  if (!connection.instance_name) {
    return skipJob(supabase, job, "invalid_connection", "A conexão QR Code não possui uma instância válida.");
  }
  if (!customer?.whatsapp_notifications_enabled || customer.whatsapp_opt_out_at) {
    return skipJob(supabase, job, "customer_opt_out", "O cliente não autorizou mensagens pelo WhatsApp.");
  }
  const phone = normalizePhone(customer.celular ?? customer.phone);
  if (!phone) return skipJob(supabase, job, "invalid_phone", "Cliente sem WhatsApp válido cadastrado.");

  const { data: optedOut } = await supabase
    .from("whatsapp_opt_outs").select("phone").eq("company_id", job.company_id).eq("phone", phone).maybeSingle();
  if (optedOut) return skipJob(supabase, job, "customer_opt_out", "O cliente pediu para parar os envios.", phone);

  const { data: canSend } = await supabase.rpc("whatsapp_can_send", { p_company_id: job.company_id });
  if (canSend !== true) return skipJob(supabase, job, "monthly_quota", "Limite mensal do módulo atingido.", phone);

  // Antes de qualquer limite de volume: o número existe mesmo no WhatsApp?
  // Número inexistente é descartado (skip), não adiado — reagendar não faz o
  // telefone passar a ter WhatsApp.
  if (!(await hasWhatsapp(supabase, job, connection.instance_name, phone))) {
    return skipJob(supabase, job, "number_not_on_whatsapp", "Esse número não tem WhatsApp.", phone);
  }

  const now = Date.now();
  const [hourCount, dayCount, recipientCount] = await Promise.all([
    sentCount(supabase, job, new Date(now - 60 * 60 * 1000).toISOString()),
    sentCount(supabase, job, new Date(now - 24 * 60 * 60 * 1000).toISOString()),
    sentCount(supabase, job, new Date(now - 24 * 60 * 60 * 1000).toISOString(), phone),
  ]);
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

  const text = job.source_type === "service_order"
    ? await buildOsMessage(supabase, job, settings, customer)
    : await buildBillingMessage(supabase, job, settings, customer);
  if (!text) return skipJob(supabase, job, "source_unavailable", "A origem não existe mais ou a cobrança já foi paga.", phone);

  const prefs = settings.automation_preferences;

  // Opt-in, default desligado. Antes da presença: a pessoa lê a conversa e só
  // depois aparece como disponível e começa a digitar.
  // `pref<boolean>` explícito: sem o parâmetro de tipo, T é inferido como o
  // literal `false` e a comparação com `true` vira erro de tipo.
  if (pref<boolean>(prefs, ["humanBehavior", "markAsReadBeforeReply"], false) === true) {
    await markConversationRead(supabase, job, connection.instance_name, phone);
  }

  try {
    // "Abriu o app". Enfeite de comportamento: silencioso, nunca bloqueia.
    try {
      await sendPresence(connection.instance_name, phone, "available");
    } catch {
      // Presença não é parte do envio.
    }

    // `delayMs` faz o "digitando" NO SERVIDOR: por baixo o Baileys faz
    // presenceSubscribe → composing → espera o delay → paused → envia. Por
    // isso o `sendText` leva esses segundos pra retornar — é await de rede,
    // não CPU da edge presa num laço.
    const delayMs = pref<boolean>(prefs, ["humanBehavior", "simulateTyping"], true) === false
      ? undefined
      : typingDelayMs(text);
    const sent = await sendText(connection.instance_name, phone, text, { delayMs });
    const sentAt = new Date().toISOString();
    await recordEvent(supabase, job, {
      phone, status: "enviado", error: null, sent_at: sentAt, provider_message_id: sent.id,
    });
    await supabase.from("whatsapp_send_jobs").update({
      status: "sent", locked_at: null, sent_at: sentAt, provider_message_id: sent.id,
      last_error: null, last_error_code: null,
    }).eq("id", job.id).eq("company_id", job.company_id);
    // Cadência humana (log-normal + pausa longa ocasional + curva horária) em
    // vez de intervalo uniforme, que é assinatura estatística de máquina.
    const gapSeconds = humanGapSeconds(brasiliaHour());
    await supabase.from("whatsapp_connections").update({
      next_send_at: new Date(Date.now() + gapSeconds * 1000).toISOString(),
      consecutive_failures: 0, last_error: null, last_seen_at: sentAt,
    }).eq("id", job.connection_id).eq("company_id", job.company_id);
    // Só AGORA, com job=sent, evento=enviado e a conexão já reagendada: nenhum
    // timeout da presença final pode fazer um envio bem-sucedido parecer falha.
    await goodbyePresence(connection.instance_name, phone);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof EvolutionApiError ? error.status : 0;
    const failures = (connection.consecutive_failures ?? 0) + 1;
    const mustPause = status === 401 || status === 403 || failures >= 3;
    await supabase.from("whatsapp_connections").update({
      status: status === 403 ? "banned" : mustPause ? "attention" : "connected",
      consecutive_failures: failures,
      last_error: message.slice(0, 500),
      last_seen_at: new Date().toISOString(),
    }).eq("id", job.connection_id).eq("company_id", job.company_id);
    if (mustPause || job.attempts >= MAX_ATTEMPTS) {
      await supabase.from("whatsapp_send_jobs").update({
        status: "failed", locked_at: null, last_error_code: status === 403 ? "possible_ban" : "send_failed",
        last_error: message.slice(0, 500),
      }).eq("id", job.id).eq("company_id", job.company_id);
      await recordEvent(supabase, job, { phone, status: "erro", error: message.slice(0, 500), sent_at: new Date().toISOString() });
    } else {
      // ÚNICO retryJob que sobra no arquivo, de propósito: aqui houve chamada
      // real ao provedor e ela falhou — isso é tentativa, e tem que contar
      // contra o MAX_ATTEMPTS. Todos os outros caminhos de adiamento acima são
      // deferJob, porque nenhum deles tocou o provedor.
      await retryJob(supabase, job, "send_failed", message.slice(0, 500), Math.min(3600, 30 * (2 ** job.attempts)));
    }
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
  const { data: jobs, error } = await supabase.rpc("whatsapp_claim_send_jobs", { p_limit: 20, p_orphan_minutes: 10 });
  if (error) {
    console.error("[whatsapp-send-worker] claim failed", { message: error.message });
    return new Response(JSON.stringify({ error: "claim_failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const settled = await Promise.allSettled(((jobs ?? []) as Job[]).map((job) => processJob(supabase, job)));
  for (const result of settled) {
    if (result.status === "rejected") console.error("[whatsapp-send-worker] job failed", { message: String(result.reason) });
  }
  return new Response(JSON.stringify({ ok: true, claimed: jobs?.length ?? 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
});
