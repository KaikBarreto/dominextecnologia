// admin-asaas-sync-billing
// ------------------------
// Aplica na ASAAS, sob demanda, a configuração de cobrança por e-mail que está gravada
// em `companies` (billing_notifications_enabled + billing_email).
//
// POR QUÊ EXISTE: ligar a flag no banco NÃO reconfigura o customer que já existe na
// Asaas — o `notificationDisabled` de lá só seria reescrito no próximo PUT /customers
// do checkout (create-asaas-payment), que pode demorar um mês ou nunca acontecer. E a
// chave da conta Asaas da Auctus só existe dentro das edge functions, então não dá pra
// fazer isso na mão pelo painel sem perder o rastro. Esta função é o caminho oficial.
//
// PERMANENTE E REUSÁVEL: serve pra QUALQUER empresa que a gente ligue no modo e-mail no
// futuro (a primeira foi a Alô Gás Juquitiba). Não é script descartável — não apague.
//
// Auth (regra-lei Dominex #6): header `x-cron-secret` == CRON_SECRET, FAIL-CLOSED.
// Sem o secret (ou com secret não configurado no ambiente) devolve 401 e não toca em
// nada. NÃO aceita JWT de tenant: é operação de painel master, disparada pelo Tech Lead.
// `verify_jwt = false` no config.toml porque a autenticação é o secret, não um JWT.
//
// Body: { company_id: string, sync_subscription?: boolean }
//   - NÃO aceita customer_id/subscription_id cru vindo de fora: tudo é resolvido a
//     partir do company_id lendo `companies` (senão vira canhão apontado pra conta
//     Asaas inteira).
//
// Ações:
//   1) SEMPRE: PUT /customers/{asaas_customer_id} com
//        notificationDisabled: !company.billing_notifications_enabled
//        additionalEmails: company.billing_email (só quando preenchido)
//      Mesma semântica do create-asaas-payment / _shared/asaas-customer.ts.
//   2) SÓ com sync_subscription === true: para cada subscription ACTIVE do customer,
//      PUT /subscriptions/{id} com billingType "UNDEFINED" (o cliente escolhe como
//      pagar: boleto/PIX/cartão pelo link da fatura) e updatePendingPayments: true
//      (as cobranças já geradas também passam a aceitar qualquer forma). Grava o id
//      em companies.asaas_subscription_id — é por esse campo que o asaas-webhook
//      resolve a empresa ao receber o pagamento.
//      Se houver MAIS DE UMA subscription ACTIVE, NÃO adivinha: devolve a lista e não
//      altera nenhuma (quem decide é o Tech Lead).
//
// Diagnóstico (sempre, leitura pura): bloco `payments` com as últimas ~20 cobranças do
// customer + `payments_summary` (contagem por status e lista das EM ABERTO). Não altera
// nada na Asaas e é best-effort: se falhar, vira `payments_error` e o resto segue.
//
// Diagnóstico (sempre, leitura pura): bloco `notifications` com GET /customers/{id}/
// notifications — a configuração POR CLIENTE de QUAIS eventos notificam e por qual canal.
// Existe porque `notificationDisabled: false` é só o interruptor GERAL: se os eventos de
// cobrança gerada/vencendo estiverem desligados neste cliente, o interruptor ligado não
// entrega e-mail nenhum. `notifications_summary.email_enabled_events` responde isso direto.
// Itens devolvidos CRUS (sem filtrar campo a campo) pra nunca engolir o campo que importa
// caso a Asaas mude o shape. Também best-effort: falha vira `notifications_error`.
//
// Resposta: JSON com o estado ANTES e DEPOIS (customer e subscriptions), como PROVA
// da operação. Nunca loga/ecoa a chave da Asaas nem o CRON_SECRET.
//
// Cliente Supabase: service_role (lê/grava companies — RLS de companies bloqueia o
// tenant; operação master é service_role).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { asaas, buildQuery, AsaasConfigError, AsaasApiError } from "../_shared/asaas-client.ts";

/** Subconjunto do customer Asaas que devolvemos como prova. */
interface AsaasCustomerSnapshot {
  id?: string;
  name?: string;
  email?: string;
  additionalEmails?: string | null;
  notificationDisabled?: boolean;
  cpfCnpj?: string;
}

/** Subconjunto da subscription Asaas que devolvemos como prova. */
interface AsaasSubscriptionSnapshot {
  id?: string;
  billingType?: string;
  value?: number;
  nextDueDate?: string;
  status?: string;
  cycle?: string;
}

function pickCustomer(c: any): AsaasCustomerSnapshot {
  if (!c) return {};
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    additionalEmails: c.additionalEmails ?? null,
    notificationDisabled: c.notificationDisabled,
    cpfCnpj: c.cpfCnpj,
  };
}

/** Subconjunto da cobrança Asaas que devolvemos como diagnóstico. */
interface AsaasPaymentSnapshot {
  id?: string;
  status?: string;
  billingType?: string;
  value?: number;
  dueDate?: string;
  dateCreated?: string;
  paymentDate?: string | null;
  subscription?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
}

/** Status que significam "cobrança em aberto" (o cliente ainda tem que pagar). */
const OPEN_PAYMENT_STATUSES = ["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"];

function pickPayment(p: any): AsaasPaymentSnapshot {
  if (!p) return {};
  return {
    id: p.id,
    status: p.status,
    billingType: p.billingType,
    value: p.value,
    dueDate: p.dueDate,
    dateCreated: p.dateCreated,
    paymentDate: p.paymentDate ?? null,
    subscription: p.subscription ?? null,
    invoiceUrl: p.invoiceUrl ?? null,
    bankSlipUrl: p.bankSlipUrl ?? null,
  };
}

function pickSubscription(s: any): AsaasSubscriptionSnapshot {
  if (!s) return {};
  return {
    id: s.id,
    billingType: s.billingType,
    value: s.value,
    nextDueDate: s.nextDueDate,
    status: s.status,
    cycle: s.cycle,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ===== Auth FAIL-CLOSED: só x-cron-secret =====
    // Secret ausente no ambiente => NINGUÉM entra (não vira porta aberta por
    // esquecimento de configuração). Comparação de strings já trimadas.
    const cronSecret = (Deno.env.get("CRON_SECRET") || "").trim();
    const providedCron = (req.headers.get("x-cron-secret") || "").trim();
    if (cronSecret.length === 0 || providedCron !== cronSecret) {
      return json({ error: "Não autorizado." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const companyId = typeof body?.company_id === "string" ? body.company_id.trim() : "";
    const syncSubscription = body?.sync_subscription === true;
    if (!companyId) {
      return json({ error: "company_id é obrigatório." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: company, error: compErr } = await supabase
      .from("companies")
      .select(
        "id, name, email, cnpj, asaas_customer_id, asaas_subscription_id, billing_email, billing_notifications_enabled",
      )
      .eq("id", companyId)
      .maybeSingle();

    if (compErr) return json({ error: `Falha ao ler a empresa: ${compErr.message}` }, 500);
    if (!company) return json({ error: "Empresa não encontrada." }, 404);
    if (!company.asaas_customer_id) {
      return json({
        error:
          "Esta empresa ainda não tem cliente vinculado na Asaas (asaas_customer_id vazio). " +
          "Rode o provisionamento (backfill-asaas-customers) antes de sincronizar a cobrança.",
      }, 400);
    }

    const customerId: string = company.asaas_customer_id;
    // Mesma semântica do resto do código: sem flag => notificação DESLIGADA.
    const notificationDisabled = !company.billing_notifications_enabled;
    const billingEmail = (company.billing_email || "").trim();

    // ===== Estado ANTES (prova) =====
    const customerBefore = pickCustomer(await asaas.get(`/customers/${customerId}`));

    const subsBeforeRes = await asaas.get(
      `/subscriptions`,
      buildQuery({ customer: customerId, status: "ACTIVE" }),
    );
    const activeSubsBefore: any[] = subsBeforeRes?.data || [];

    // ===== Ação 1 (SEMPRE): sincroniza o customer =====
    const customerPayload: Record<string, unknown> = { notificationDisabled };
    if (billingEmail) customerPayload.additionalEmails = billingEmail;
    await asaas.put(`/customers/${customerId}`, customerPayload);
    const customerAfter = pickCustomer(await asaas.get(`/customers/${customerId}`));

    // ===== Diagnóstico (SEMPRE, leitura pura): cobranças do cliente =====
    // Não altera NADA na Asaas. Serve pra responder "a fatura mensal está saindo
    // mesmo?" — e, principalmente, pra flagrar cliente com MAIS DE UMA cobrança em
    // aberto ao mesmo tempo (dueDate futuro na assinatura pode significar tanto
    // cobranças já geradas e pendentes quanto data movida na mão no painel).
    // BEST-EFFORT: se esta leitura falhar, a sincronização do customer (que é o que
    // importa) NÃO pode cair junto — o erro vira `payments_error` no retorno.
    const paymentsBlock: Record<string, unknown> = {};
    try {
      const paymentsRes = await asaas.get(
        `/payments`,
        buildQuery({
          customer: customerId,
          limit: 20,
          offset: 0,
          order: "desc",
          sort: "dateCreated",
        }),
      );
      const paymentsRaw: any[] = paymentsRes?.data || [];
      const payments = paymentsRaw.map(pickPayment);
      const summary: Record<string, number> = {};
      for (const pay of payments) {
        const st = pay.status || "UNKNOWN";
        summary[st] = (summary[st] || 0) + 1;
      }
      paymentsBlock.payments = payments;
      paymentsBlock.payments_summary = {
        total_returned: payments.length,
        by_status: summary,
        open_count: payments.filter((pay) => OPEN_PAYMENT_STATUSES.includes(pay.status || "")).length,
        open: payments.filter((pay) => OPEN_PAYMENT_STATUSES.includes(pay.status || "")),
      };
    } catch (payErr: unknown) {
      const msg = payErr instanceof Error ? payErr.message : "Erro ao listar cobranças na Asaas.";
      paymentsBlock.payments_error = msg;
    }

    // ===== Diagnóstico (SEMPRE, leitura pura): configuração de notificações =====
    // `notificationDisabled: false` no customer é apenas o interruptor GERAL. A Asaas
    // guarda, POR CLIENTE, quais EVENTOS notificam e por qual CANAL (e-mail/SMS/WhatsApp).
    // Com os eventos de cobrança gerada/vencendo desligados, o interruptor geral ligado
    // NÃO entrega nada — daí esta leitura, que é a prova de que o e-mail sai mesmo.
    // NÃO alteramos nenhuma configuração aqui: é GET puro.
    // Os itens vão CRUS no retorno (sem pick campo a campo): se a Asaas mudar o shape,
    // prefiro dado bruto a um filtro que esconde justamente o campo que importa.
    // BEST-EFFORT: falha vira `notifications_error` e a função segue retornando 200.
    const notificationsBlock: Record<string, unknown> = {};
    try {
      const notifRes = await asaas.get(`/customers/${customerId}/notifications`);
      // A Asaas devolve { data: [...] }; toleramos array cru caso o shape venha diferente.
      const shapeOk = Array.isArray(notifRes?.data) || Array.isArray(notifRes);
      const notifRaw: any[] = Array.isArray(notifRes?.data)
        ? notifRes.data
        : (Array.isArray(notifRes) ? notifRes : []);
      notificationsBlock.notifications = notifRaw;
      // Shape inesperado: devolve a resposta CRUA junto, pra não parecer "0 notificações"
      // quando na verdade foi o formato que mudou.
      if (!shapeOk) notificationsBlock.notifications_raw_response = notifRes ?? null;
      notificationsBlock.notifications_summary = {
        total: notifRaw.length,
        // Eventos que REALMENTE mandam e-mail pro cliente: interruptor do evento ligado
        // E canal e-mail ligado pro cliente.
        email_enabled_events: notifRaw
          .filter((n) => n?.enabled === true && n?.emailEnabledForCustomer === true)
          .map((n) => n?.event ?? null),
        email_enabled_count: notifRaw.filter(
          (n) => n?.enabled === true && n?.emailEnabledForCustomer === true,
        ).length,
      };
    } catch (notifErr: unknown) {
      const msg = notifErr instanceof Error
        ? notifErr.message
        : "Erro ao ler a configuração de notificações na Asaas.";
      notificationsBlock.notifications_error = msg;
    }

    const result: Record<string, unknown> = {
      success: true,
      company: {
        id: company.id,
        name: company.name,
        billing_notifications_enabled: company.billing_notifications_enabled ?? false,
        billing_email: company.billing_email ?? null,
        asaas_customer_id: customerId,
        asaas_subscription_id: company.asaas_subscription_id ?? null,
      },
      applied: {
        notificationDisabled,
        additionalEmails: billingEmail || null,
      },
      customer: { before: customerBefore, after: customerAfter },
      ...paymentsBlock,
      ...notificationsBlock,
      subscriptions: {
        before: activeSubsBefore.map(pickSubscription),
        after: activeSubsBefore.map(pickSubscription),
        synced: false,
      },
    };

    // ===== Ação 2 (opcional): sincroniza a subscription =====
    if (!syncSubscription) {
      (result.subscriptions as Record<string, unknown>).skipped_reason =
        "sync_subscription não foi enviado como true.";
      return json(result);
    }

    if (activeSubsBefore.length === 0) {
      (result.subscriptions as Record<string, unknown>).skipped_reason =
        "Nenhuma assinatura ACTIVE encontrada para este cliente na Asaas.";
      return json(result);
    }

    if (activeSubsBefore.length > 1) {
      // NÃO adivinha qual é a boa: devolve a lista e não altera NADA.
      (result.subscriptions as Record<string, unknown>).skipped_reason =
        `Existem ${activeSubsBefore.length} assinaturas ACTIVE neste cliente. ` +
        "Nada foi alterado — escolha qual deve valer antes de sincronizar.";
      (result.subscriptions as Record<string, unknown>).needs_decision = true;
      return json(result, 409);
    }

    const sub = activeSubsBefore[0];
    // billingType UNDEFINED = "o cliente escolhe" (boleto/PIX/cartão pelo link da fatura).
    // updatePendingPayments: true propaga pras cobranças JÁ geradas e ainda pendentes.
    await asaas.put(`/subscriptions/${sub.id}`, {
      billingType: "UNDEFINED",
      updatePendingPayments: true,
    });
    const subAfter = await asaas.get(`/subscriptions/${sub.id}`);

    // O asaas-webhook resolve a empresa por companies.asaas_subscription_id — sem isso,
    // o pagamento da fatura mensal chega e não acha o tenant.
    const { error: updErr } = await supabase
      .from("companies")
      .update({ asaas_subscription_id: sub.id })
      .eq("id", companyId);

    (result.subscriptions as Record<string, unknown>).after = [pickSubscription(subAfter)];
    (result.subscriptions as Record<string, unknown>).synced = true;
    (result.subscriptions as Record<string, unknown>).asaas_subscription_id_saved = updErr
      ? false
      : sub.id;
    if (updErr) {
      (result.subscriptions as Record<string, unknown>).save_error =
        `Assinatura ${sub.id} atualizada na Asaas, mas falhou ao gravar em companies: ${updErr.message}`;
    }

    return json(result);
  } catch (error: unknown) {
    // NUNCA ecoa chave da Asaas nem o CRON_SECRET: só a mensagem já tratada.
    console.error("admin-asaas-sync-billing error:", error);
    let status = 500;
    let message = "Erro ao sincronizar a cobrança na Asaas.";
    if (error instanceof AsaasConfigError) {
      status = 503;
      message = error.message;
    } else if (error instanceof AsaasApiError) {
      status = 400;
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
