// =============================================================================
// whatsapp-send — Onda 2 do add-on "Avisos de WhatsApp".
// =============================================================================
// Dispara um aviso ao CLIENTE FINAL quando a OS muda de status.
//
// Duas formas de chamada, ambas privilegiadas:
//   (A) Autenticada de usuário: Authorization Bearer + módulo 'whatsapp' +
//       can_manage_system (whatsapp-auth.ts). Usada por testes/ações manuais.
//   (B) Chamada INTERNA assinada: header `x-whatsapp-internal-secret` ==
//       WHATSAPP_INTERNAL_SECRET (Deno.env). É o caminho da Onda 3, quando o
//       useServiceOrders/edge de mudança de status dispara o aviso server-to-server
//       (sem JWT de usuário). O company_id vem do body e é validado contra a OS.
//   NÃO existe caminho anônimo: sem (A) nem (B) válidos → 401.
//
// Body: { os_id, trigger, company_id? }.
//   - trigger ∈ 'a_caminho' | 'em_andamento' | 'concluida'.
//   - company_id: obrigatório no modo (B); no modo (A) usa o do usuário.
//
// Portões antes de enviar (qualquer um falho → não envia, resposta clara PT-BR):
//   1. módulo 'whatsapp' ativo (no modo A já validado; no modo B revalidado aqui);
//   2. settings.enabled = true;
//   3. settings.connection_status = 'connected';
//   4. toggle do gatilho ligado (trigger_a_caminho / trigger_em_andamento /
//      trigger_concluida) conforme o `trigger`;
//   5. whatsapp_can_send(company_id) = true (cota mensal). Estourou → 402-like.
//
// Template: SORTEIA aleatoriamente um whatsapp_templates.active do trigger (NÃO
// round-robin previsível — variar o texto é anti-ban). Placeholders resolvidos
// com dados reais da OS.
//
// ANTI-BAN (comentado ponto a ponto abaixo): sorteio de template + throttle
// entre envios + aquecimento (teto menor nos primeiros dias do número) +
// opt-out (cliente que respondeu "parar").
//
// Grava whatsapp_events (enviado/erro). NÃO finge sucesso se a Evolution não
// estiver configurada.
// =============================================================================

import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { authorizeWhatsappManager, jsonResponse } from "../_shared/whatsapp-auth.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertEvolutionConfigured,
  EvolutionApiError,
  EvolutionConfigError,
  sendText,
} from "../_shared/evolution-client.ts";
import { buildSlugSegment } from "../_shared/pretty-links.ts";

type Trigger = "a_caminho" | "em_andamento" | "concluida";
const TRIGGERS: Trigger[] = ["a_caminho", "em_andamento", "concluida"];

// ---------------------------------------------------------------------------
// ANTI-BAN — parâmetros de aquecimento e throttle. Números conservadores; o
// objetivo é PARECER humano, nunca disparar rajada de um número novo.
// ---------------------------------------------------------------------------
const WARMUP_DAYS = 14; // janela de aquecimento após conectar o número.
// Teto DIÁRIO de envios por dia-de-vida do número (índice 0 = 1º dia).
// Cresce gradualmente; do dia 15 em diante, sem teto de aquecimento (cota mensal manda).
const WARMUP_DAILY_CAP = [20, 30, 40, 60, 80, 100, 120, 150, 180, 220, 260, 300, 350, 400];
// Atraso mínimo entre dois envios da MESMA instância (throttle anti-rajada).
const MIN_GAP_MS = 8000;

/** Normaliza telefone BR pra E.164 sem símbolos (ex.: 5511999998888). */
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

/** Substitui os placeholders do template pelos valores reais. */
function fillTemplate(
  body: string,
  vars: {
    cliente: string;
    tecnico: string;
    servico: string;
    os: string;
    link: string;
    hora: string;
    eta: string;
  },
): string {
  return body
    .replaceAll("{cliente}", vars.cliente)
    .replaceAll("{tecnico}", vars.tecnico)
    .replaceAll("{servico}", vars.servico)
    .replaceAll("{os}", vars.os)
    .replaceAll("{link}", vars.link)
    .replaceAll("{hora}", vars.hora)
    .replaceAll("{eta}", vars.eta);
}

/**
 * ETA best-effort via OSRM (open, sem chave). NUNCA derruba o envio: qualquer
 * falha (sem coords, OSRM fora do ar, timeout) devolve null e o pool escolhe
 * uma variação SEM ETA. Timeout curto (4s) pra não segurar a resposta.
 */
async function computeEtaMinutes(
  originLat: number | null | undefined,
  originLng: number | null | undefined,
  destLat: number | null | undefined,
  destLng: number | null | undefined,
): Promise<number | null> {
  if (
    originLat == null || originLng == null ||
    destLat == null || destLng == null
  ) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    const duration = json?.routes?.[0]?.duration;
    if (typeof duration !== "number" || !isFinite(duration)) return null;
    return Math.max(1, Math.round(duration / 60));
  } catch {
    return null; // OSRM best-effort: nunca propaga.
  } finally {
    clearTimeout(timer);
  }
}

/** slug helper — pra montar o link público bonito da OS igual ao front. */
function trimSlug(s: string, max = 60): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/**
 * Monta o link público de acompanhamento da OS (modo cliente), replicando
 * buildServiceOrderShareLink do front (src/utils/shareLinks.ts): com short_code
 * gera URL bonita; sem ele cai no UUID.
 */
function buildOsShareLink(params: {
  shortCode?: string | null;
  customerName?: string | null;
  serviceName?: string | null;
  osId?: string | null;
}): string {
  const { shortCode, customerName, serviceName, osId } = params;
  const segment = shortCode
    ? buildSlugSegment(
        [customerName, serviceName].map((n) => (n ? trimSlug(String(n)) : n)),
        shortCode,
        "os",
      )
    : osId ?? "";
  return `https://dominex.app/os-tecnico/${segment}?modo=cliente`;
}

/** "HH:mm" em America/Sao_Paulo a partir de data+hora agendada da OS. */
function formatHora(scheduledDate: string | null, scheduledTime: string | null): string {
  // scheduled_time costuma vir como "HH:mm[:ss]"; se presente, usa direto.
  if (scheduledTime && /^\d{2}:\d{2}/.test(scheduledTime)) return scheduledTime.slice(0, 5);
  if (scheduledDate) {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(scheduledDate));
    } catch {
      /* ignore */
    }
  }
  return "";
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed", message: "Método não suportado." }, 405);
  }

  try {
    assertEvolutionConfigured();

    let body: { os_id?: string; trigger?: string; company_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse(req, { error: "invalid_body", message: "Requisição inválida." }, 400);
    }

    const osId = (body?.os_id ?? "").trim();
    const trigger = (body?.trigger ?? "").trim() as Trigger;
    if (!osId) return jsonResponse(req, { error: "missing_os", message: "OS não informada." }, 400);
    if (!TRIGGERS.includes(trigger)) {
      return jsonResponse(req, { error: "invalid_trigger", message: "Gatilho inválido." }, 400);
    }

    // ---- Autenticação: modo (A) usuário OU modo (B) chamada interna assinada.
    const internalSecret = Deno.env.get("WHATSAPP_INTERNAL_SECRET") ?? "";
    const providedInternal = req.headers.get("x-whatsapp-internal-secret") ?? "";
    const isInternal = internalSecret.length > 0 && providedInternal === internalSecret;

    let supabase: SupabaseClient;
    let companyId: string;

    if (isInternal) {
      // Modo (B): server-to-server. company_id vem do body e será validado contra a OS.
      companyId = (body?.company_id ?? "").trim();
      if (!companyId) {
        return jsonResponse(req, { error: "missing_company", message: "Empresa não informada." }, 400);
      }
      supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      // Revalida o módulo no modo interno (o gate de usuário não rodou).
      const { data: hasModule } = await supabase.rpc("company_has_module", {
        p_company_id: companyId,
        p_module_code: "whatsapp",
      });
      if (hasModule !== true) {
        return jsonResponse(req, {
          error: "module_inactive",
          message: "O módulo de Avisos de WhatsApp não está ativo no seu plano.",
        }, 403);
      }
    } else {
      // Modo (A): usuário autenticado que gerencia o tenant.
      const auth = await authorizeWhatsappManager(req);
      if (!auth.ok) return auth.response;
      supabase = auth.supabase;
      companyId = auth.companyId;
    }

    // ---- Carrega settings do tenant.
    const { data: settings } = await supabase
      .from("company_whatsapp_settings")
      .select(
        "instance_name, connection_status, connected_number, enabled, trigger_a_caminho, trigger_em_andamento, trigger_concluida, updated_at, connected_at",
      )
      .eq("company_id", companyId)
      .maybeSingle();

    if (!settings) {
      return jsonResponse(req, {
        error: "not_configured",
        message: "O WhatsApp ainda não foi configurado para esta empresa.",
      }, 422);
    }
    if (settings.enabled !== true) {
      return jsonResponse(req, {
        error: "disabled",
        message: "Os avisos de WhatsApp estão desativados.",
      }, 422);
    }
    if (settings.connection_status === "banned") {
      return jsonResponse(req, {
        error: "banned",
        message: "O número de WhatsApp desta empresa foi bloqueado. Reconecte um novo número.",
      }, 422);
    }
    if (settings.connection_status !== "connected") {
      return jsonResponse(req, {
        error: "not_connected",
        message: "O WhatsApp não está conectado. Conecte um número antes de enviar avisos.",
      }, 422);
    }

    // ---- Toggle do gatilho específico.
    const toggleCol = trigger === "a_caminho"
      ? settings.trigger_a_caminho
      : trigger === "em_andamento"
      ? settings.trigger_em_andamento
      : settings.trigger_concluida;
    if (toggleCol !== true) {
      return jsonResponse(req, {
        ok: true,
        skipped: "trigger_disabled",
        message: "Este aviso está desativado para este gatilho.",
      }, 200);
    }

    // ---- Gate de cota mensal (whatsapp_can_send). Estourou → 402-like sem enviar.
    {
      const { data: canSend, error: quotaErr } = await supabase.rpc("whatsapp_can_send", {
        p_company_id: companyId,
      });
      if (quotaErr) {
        console.error("[whatsapp-send] whatsapp_can_send error", { message: quotaErr.message });
        return jsonResponse(req, {
          error: "quota_check_failed",
          message: "Não foi possível verificar o limite de mensagens. Tente novamente em instantes.",
        }, 500);
      }
      if (canSend !== true) {
        return jsonResponse(req, {
          error: "whatsapp_quota_exceeded",
          message: "Você atingiu o limite de mensagens de WhatsApp deste mês.",
        }, 402);
      }
    }

    // ---- Carrega a OS + cliente + técnico (service-role; RLS bypass, filtrado por company).
    const { data: os } = await supabase
      .from("service_orders")
      .select(
        "id, company_id, order_number, public_short_code, scheduled_date, scheduled_time, customer_id, technician_id, service_type_id, contract_id, service_latitude, service_longitude, contract:contracts(id, is_pmoc)",
      )
      .eq("id", osId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!os) {
      return jsonResponse(req, { error: "os_not_found", message: "Ordem de serviço não encontrada." }, 404);
    }

    const [{ data: customer }, techRes, typeRes] = await Promise.all([
      os.customer_id
        ? supabase.from("customers")
            .select("id, name, phone, celular, latitude, longitude, lat, lng")
            .eq("id", os.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
      // service_orders.technician_id guarda o auth uid (= profiles.user_id),
      // NÃO profiles.id (confirmado em generate-pmoc-cronograma-pdf).
      os.technician_id
        ? supabase.from("profiles").select("full_name").eq("user_id", os.technician_id).maybeSingle()
        : Promise.resolve({ data: null }),
      os.service_type_id
        ? supabase.from("service_types").select("name").eq("id", os.service_type_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // `celular` (WhatsApp/móvel) tem precedência; cai no `phone` fixo se ausente.
    const phone = normalizePhone(
      (customer as any)?.celular ?? (customer as any)?.phone,
    );
    if (!phone) {
      return jsonResponse(req, {
        error: "no_phone",
        message: "O cliente desta OS não tem um telefone de WhatsApp válido cadastrado.",
      }, 422);
    }

    // ---- ANTI-BAN #1: OPT-OUT. Cliente que respondeu "parar"/"sair" não recebe mais.
    // A tabela whatsapp_opt_outs NÃO está no contrato da Onda 1 (ver PENDÊNCIA no
    // reporte). Consultamos de forma tolerante: se a tabela não existir ainda, o
    // erro é ignorado e o envio segue (o webhook de MESSAGES_UPSERT que popula o
    // opt-out também é da pendência). Quando a tabela existir, o opt-out passa a
    // valer automaticamente sem mexer aqui.
    try {
      const { data: optOut } = await supabase
        .from("whatsapp_opt_outs")
        .select("phone")
        .eq("company_id", companyId)
        .eq("phone", phone)
        .maybeSingle();
      if (optOut) {
        return jsonResponse(req, {
          ok: true,
          skipped: "opt_out",
          message: "O cliente optou por não receber mensagens (respondeu 'parar').",
        }, 200);
      }
    } catch (_e) {
      // tabela ainda não existe (pendência) — segue sem bloquear.
    }

    // ---- ANTI-BAN #2: THROTTLE. Não dispara dois envios da mesma instância em
    // menos de MIN_GAP_MS. Olha o último whatsapp_event 'enviado' da empresa.
    {
      const { data: last } = await supabase
        .from("whatsapp_events")
        .select("sent_at")
        .eq("company_id", companyId)
        .eq("status", "enviado")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last?.sent_at) {
        const gap = Date.now() - new Date(last.sent_at).getTime();
        if (gap < MIN_GAP_MS) {
          // Espera o restante do intervalo (throttle simples). O invoker (Onda 3)
          // deve chamar de forma tolerante a essa latência; nunca em rajada.
          await new Promise((r) => setTimeout(r, MIN_GAP_MS - gap));
        }
      }
    }

    // ---- ANTI-BAN #3: AQUECIMENTO. Nos primeiros WARMUP_DAYS de vida do número,
    // aplica um teto DIÁRIO menor que a cota mensal. Conta os envios de HOJE.
    {
      const connectedAt = settings.connected_at ? new Date(settings.connected_at) : null;
      if (connectedAt) {
        const daysAlive = Math.floor((Date.now() - connectedAt.getTime()) / 86400000);
        if (daysAlive < WARMUP_DAYS) {
          const cap = WARMUP_DAILY_CAP[Math.min(daysAlive, WARMUP_DAILY_CAP.length - 1)];
          // "Hoje" em BRT.
          const todayBRT = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
            year: "numeric", month: "2-digit", day: "2-digit",
          }).format(new Date());
          const dayStart = new Date(`${todayBRT}T00:00:00-03:00`).toISOString();
          const { count } = await supabase
            .from("whatsapp_events")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("status", "enviado")
            .gte("sent_at", dayStart);
          if ((count ?? 0) >= cap) {
            return jsonResponse(req, {
              error: "warmup_cap_reached",
              message:
                "O número foi conectado há pouco tempo e o limite de envios de hoje foi atingido. Isso protege o número de bloqueios. Tente novamente amanhã.",
              warmup_day: daysAlive + 1,
              warmup_cap: cap,
            }, 429);
          }
        }
      }
    }

    // ---- Resolve o CONTEXTO da OS pra escolher o pool de templates.
    //   - contract_id + is_pmoc=true  → 'pmoc'
    //   - contract_id + is_pmoc=false → 'contrato'
    //   - sem contract_id             → 'avulsa'
    const contract = (os as any)?.contract as { id: string; is_pmoc: boolean } | null | undefined;
    const context: "pmoc" | "contrato" | "avulsa" = os.contract_id
      ? (contract?.is_pmoc === true ? "pmoc" : "contrato")
      : "avulsa";

    // ---- Resolve {eta} — SÓ no gatilho 'a_caminho'. Best-effort (OSRM); falha
    // vira eta_available=false e o pool escolhe uma variação sem ETA.
    let etaText = "";
    let etaAvailable = false;
    if (trigger === "a_caminho") {
      // Origem = última posição conhecida do técnico nesta OS.
      const { data: lastLoc } = await supabase
        .from("technician_locations")
        .select("lat, lng")
        .eq("service_order_id", os.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const originLat = (lastLoc as any)?.lat ?? null;
      const originLng = (lastLoc as any)?.lng ?? null;

      // Destino = coords da OS; se nulas, cai nas coords do cliente.
      const destLat = os.service_latitude
        ?? (customer as any)?.latitude ?? (customer as any)?.lat ?? null;
      const destLng = os.service_longitude
        ?? (customer as any)?.longitude ?? (customer as any)?.lng ?? null;

      const min = await computeEtaMinutes(originLat, originLng, destLat, destLng);
      if (min != null) {
        etaText = `~${min} min`;
        etaAvailable = true;
      }
    }

    // ---- Seleciona template: SORTEIO ALEATÓRIO entre os elegíveis do trigger.
    // (ANTI-BAN #4: variar o texto — round-robin previsível deixa rastro.)
    // Filtra por contexto (com fallback pra 'avulsa') e por requires_eta quando
    // é 'a_caminho' sem ETA disponível (nesse caso só variações que NÃO usam {eta}).
    async function fetchPool(ctx: "pmoc" | "contrato" | "avulsa") {
      let q = supabase
        .from("whatsapp_templates")
        .select("id, body")
        .eq("trigger", trigger)
        .eq("active", true)
        .eq("context", ctx);
      // Sem ETA num 'a_caminho' → só templates que não exigem ETA.
      if (trigger === "a_caminho" && !etaAvailable) {
        q = q.eq("requires_eta", false);
      }
      const { data } = await q;
      return data ?? [];
    }

    let templates = await fetchPool(context);
    // Fallback de contexto: se o pool do contexto resolvido veio vazio, usa 'avulsa'.
    if (templates.length === 0 && context !== "avulsa") {
      templates = await fetchPool("avulsa");
    }

    if (templates.length === 0) {
      return jsonResponse(req, {
        error: "no_template",
        message: "Nenhum modelo de mensagem ativo para este aviso.",
      }, 422);
    }
    const chosen = templates[Math.floor(Math.random() * templates.length)];

    // ---- Resolve placeholders com dados reais.
    const clienteNome = (customer as any)?.name ?? "cliente";
    const tecnicoNome = (techRes.data as any)?.full_name ?? "nosso técnico";
    const serviceName = (typeRes.data as any)?.name ?? null;
    const link = buildOsShareLink({
      shortCode: os.public_short_code,
      customerName: clienteNome,
      serviceName,
      osId: os.id,
    });
    const hora = formatHora(os.scheduled_date, os.scheduled_time);
    const text = fillTemplate(chosen.body, {
      cliente: clienteNome,
      tecnico: tecnicoNome,
      // {servico}: nome do tipo de serviço da OS; nulo → "seu atendimento".
      servico: serviceName ?? "seu atendimento",
      os: os.order_number != null ? String(os.order_number) : "",
      link,
      hora,
      // {eta} só é não-vazio quando calculado; nos templates requires_eta=true ele
      // sempre estará presente (pela regra do pool acima).
      eta: etaText,
    });

    // ---- Envia pela Evolution e grava o evento.
    try {
      const sent = await sendText(settings.instance_name, phone, text);
      await supabase.from("whatsapp_events").insert({
        company_id: companyId,
        os_id: os.id,
        trigger,
        template_id: chosen.id,
        phone,
        status: "enviado",
        sent_at: new Date().toISOString(),
      });
      return jsonResponse(req, {
        ok: true,
        status: "enviado",
        message_id: sent.id,
        message: "Aviso enviado ao cliente.",
      }, 200);
    } catch (sendErr) {
      const errMsg = sendErr instanceof EvolutionApiError
        ? sendErr.message
        : (sendErr as Error)?.message ?? "erro desconhecido";
      await supabase.from("whatsapp_events").insert({
        company_id: companyId,
        os_id: os.id,
        trigger,
        template_id: chosen.id,
        phone,
        status: "erro",
        error: errMsg.slice(0, 500),
        sent_at: new Date().toISOString(),
      });
      console.error("[whatsapp-send] send failed", { message: errMsg });
      return jsonResponse(req, {
        error: "send_failed",
        message: "Não foi possível enviar o aviso agora. O erro foi registrado.",
      }, 502);
    }
  } catch (err) {
    if (err instanceof EvolutionConfigError) {
      return jsonResponse(req, { error: "whatsapp_unconfigured", message: err.message }, 503);
    }
    console.error("[whatsapp-send] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return new Response(
      JSON.stringify({ error: "internal_error", message: "Falha inesperada ao enviar o aviso." }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json; charset=utf-8" } },
    );
  }
});
