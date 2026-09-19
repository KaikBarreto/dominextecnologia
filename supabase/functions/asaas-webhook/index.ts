// asaas-webhook
// -------------
// Endpoint PÚBLICO chamado pela Asaas (produção) a cada evento de cobrança/recorrência.
// É o portão de ATIVAÇÃO da assinatura SaaS Auctus de cada tenant (company).
//
// Segurança (regra-lei Dominex #6 — FAIL-CLOSED):
//  - O header `asaas-access-token` precisa bater (comparação timing-safe) com o
//    secret ASAAS_WEBHOOK_TOKEN. Se o secret NÃO estiver setado → 401 SEMPRE.
//    NÃO há bypass de retrocompatibilidade (o EcoSistema tinha; aqui não).
//
// Idempotência (defense-in-depth):
//  - credit_ltv_once_for_payment(p_asaas_payment_id, p_company_id, p_amount):
//    RPC que credita LTV 1x por asaas_payment_id. TRUE = creditou agora (winner);
//    FALSE = já creditado (no-op total). Funciona como mutex entre webhook e
//    confirm-sale-payment.
//  - admin_financial_transactions.asaas_transaction_id UNIQUE → UPSERT ON CONFLICT
//    DO NOTHING garante 1 lançamento financeiro por transação.
//
// Resolução de company (cascata): asaas_subscription_id → externalReference
//  (=company_id) → asaas_customer_id → CPF/CNPJ (companies.cnpj). Sem match num
//  pagamento confirmado, registramos como ÓRFÃO (ledger_asaas pending_categorization
//  + admin_notifications), nunca silencioso.
//
// Eventos tratados:
//  - PAYMENT_RECEIVED / PAYMENT_CONFIRMED               → ativação/renovação (ÚNICO caminho de dinheiro)
//  - PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED    → só CONFIRMA a recorrência (NÃO move dinheiro)
//  - PAYMENT_CREATED                                    → linka pay_* à subscription_payments
//  - PAYMENT_OVERDUE                                    → desativa só 1ª venda sem pagamento (ver nota past_due)
//  - PAYMENT_REFUNDED / PAYMENT_CHARGEBACK_*            → registra estorno + alerta admin
//  - RECEIVABLE_ANTICIPATION_* (CREDITED/DEBITED)       → taxa de antecipação como despesa SEPARADA (re-consulta o fee real)
//
// Downgrade agendado: na renovação confirmada (gated pelo mutex), se companies tem
//  pending_plan_code, aplicamos plano/ciclo/max_users/módulos alvo e limpamos pending_*.
//
// Cliente Supabase: service_role (RLS bloqueia tenant; aqui é fluxo de sistema).
//
// RESPOSTA E RE-ENTREGA (mudou em 2026-09-19 — leia antes de "simplificar"):
//  - O padrão anterior era 200 em TODO caminho, inclusive quando uma escrita de
//    dinheiro falhava. Como o `supabase-js` NÃO lança em erro de banco (devolve
//    `{ error }`), a falha sumia: o try/catch nunca disparava, a Asaas recebia
//    200 e NUNCA mais re-entregava aquele evento. Renovação, receita e comissão
//    viravam prejuízo silencioso.
//  - Agora toda escrita passa por `_shared/db-write.ts` (`applyWrite` = fatal,
//    `tryWrite` = não-fatal com linha de recuperação obrigatória), e a resposta
//    é decidida por `webhookResponseFor`: erro marcado como retryable → 500
//    `{ retry: true }` (a Asaas re-entrega); qualquer outro → 200 (payload ruim
//    ou bug de código não melhora com re-entrega, e re-entregar trava a fila).
//  - A FRONTEIRA é o mutex `credit_ltv_once_for_payment`: ANTES dele, falhar é
//    barato (nada reivindicado) e a re-entrega conserta. DEPOIS dele, a
//    re-entrega vira NO-OP (o mutex devolve FALSE) e lançar não repara nada —
//    por isso o pós-mutex é `tryWrite` + alerta ao admin, exceto o UPDATE vital
//    de `companies`, que DEVOLVE o mutex antes de lançar (ver releaseLtvClaim).
//
// Adaptado do EcoSistema (asaas-webhook/index.ts). Divergências de schema:
//  - companies NÃO tem base_subscription_value, crm_lead_id, referral_discount_balance.
//  - NFS-e fora de escopo (sem nfse_* em admin_financial_transactions aqui).
//  - subscription_plans usa included_modules (jsonb); company_modules usa activated_at + quantity.
//  - Vencimento via RPC compute_next_expiration (BRT-aware no banco), NÃO helper TS.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AsaasConfigError,
  listAnticipationsByPayment,
} from "../_shared/asaas-client.ts";
import {
  applyWrite,
  formatRecovery,
  tryWrite,
  WriteWarnings,
} from "../_shared/db-write.ts";
import {
  computeLtvRollback,
  retryableRethrow,
  RetryableWebhookError,
  splitRenewalCompanyUpdate,
  webhookResponseFor,
} from "../_shared/asaas-webhook-renewal.ts";

// CORS permissivo: a Asaas chama server-to-server (sem Origin), então NÃO usamos
// o allowlist de origem do _shared/cors.ts aqui. asaas-access-token liberado no header.
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Comparação timing-safe de tokens (constante no tempo, evita timing attack). */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Tamanhos diferentes => compara contra o próprio pra não vazar timing, retorna false.
  if (ab.length !== bb.length) {
    let diff = 1;
    const max = Math.max(ab.length, bb.length);
    for (let i = 0; i < max; i++) {
      diff |= (ab[i % ab.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
    }
    return diff === 0 && false;
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/**
 * Alerta o admin do painel master de que uma escrita de DINHEIRO não entrou.
 *
 * Existe porque, no pós-mutex, a re-entrega do evento é NO-OP: não há conserto
 * automático possível. Sobra o conserto humano — e ele só acontece se alguém
 * ficar sabendo. O `console.error` do `tryWrite` já guarda a linha de
 * recuperação; isto põe a mesma informação na frente de quem pode agir.
 *
 * Best-effort de propósito (`tryWrite`): se o alerta falhar, o log continua
 * sendo a fonte. Nunca lança — lançar aqui derrubaria um handler que já aplicou
 * o efeito principal.
 */
async function alertAdmin(
  supabase: any,
  type: string,
  title: string,
  message: string,
  data: Record<string, unknown>,
): Promise<void> {
  await tryWrite(
    `alerta ao admin (${type})`,
    supabase.from("admin_notifications").insert({ type, title, message, data }),
    { recovery: { type, ...data } },
  );
}

/**
 * DEVOLVE o mutex `credit_ltv_once_for_payment` pra que a re-entrega do evento
 * volte a ter efeito.
 *
 * ⚠️ O PORQUÊ, que é a decisão mais delicada deste arquivo: o mutex é a marca de
 * "evento processado". Depois que ele foi reivindicado, re-entregar o mesmo
 * pagamento faz a RPC devolver FALSE e o webhook vira no-op TOTAL. Ou seja:
 * lançar depois do mutex, sem devolver o mutex, é responder 500 pra receber o
 * evento de novo e jogá-lo fora — a renovação some do mesmo jeito.
 *
 * Desfaz as DUAS coisas que a RPC fez, nesta ordem de propósito:
 *   1) tira o valor do `companies.ltv`;
 *   2) só então limpa `subscription_payments.ltv_credited_at`.
 * Invertido, uma falha no meio deixaria o mutex livre com o LTV já somado — e a
 * re-entrega somaria de novo (LTV inflado, que já aconteceu no EcoSistema).
 * Nesta ordem, uma falha no meio deixa o mutex preso (perdemos a re-entrega,
 * que é o que já aconteceria) mas NUNCA infla o LTV.
 *
 * Devolve `true` só quando o mutex está de fato livre. Com `false`, o chamador
 * NÃO deve lançar: não haveria conserto, só uma fila de webhook travada.
 */
async function releaseLtvClaim(
  supabase: any,
  asaasPaymentId: string,
  companyId: string,
  amount: number,
): Promise<boolean> {
  const { data: fresh, error: readErr } = await supabase
    .from("companies")
    .select("ltv")
    .eq("id", companyId)
    .maybeSingle();
  if (readErr) {
    console.error(`[ltv-release] não consegui reler o LTV de ${companyId}:`, readErr.message);
    return false;
  }

  const undone = await tryWrite(
    "estorno do LTV creditado (devolução do mutex)",
    supabase
      .from("companies")
      .update({ ltv: computeLtvRollback(fresh?.ltv, amount) })
      .eq("id", companyId),
    { recovery: { company_id: companyId, asaas_payment_id: asaasPaymentId, amount, ltv_antes: fresh?.ltv } },
  );
  if (!undone) return false;

  return await tryWrite(
    "liberação do mutex de LTV (ltv_credited_at = null)",
    supabase
      .from("subscription_payments")
      .update({ ltv_credited_at: null })
      .eq("asaas_payment_id", asaasPaymentId),
    { recovery: { asaas_payment_id: asaasPaymentId, company_id: companyId, amount } },
  );
}

/**
 * Detecta se este é o PRIMEIRO pagamento da company (primeira venda) vs renovação.
 * Sinais: ausência de company_payments do tipo venda/renovação + salesperson_sales +
 * admin_financial_transactions de first_sale/sale + LTV zero.
 *
 * Devolve `null` quando QUALQUER uma das leituras falha.
 *
 * ⚠️ O PORQUÊ: aqui a mentira é de LEITURA, não de escrita, mas o mecanismo é o
 * mesmo — `const { data } = await …` descarta o `error` por construção. Com um
 * SELECT recusado, `data` vem `undefined`, os três sinais dão "não encontrei" e
 * uma RENOVAÇÃO é classificada como PRIMEIRA VENDA. Isso custa duas coisas de
 * dinheiro de uma vez: gera comissão de venda pra um vendedor que não vendeu
 * nada agora, e re-ancora o vencimento em HOJE em vez do vencimento vigente
 * (quem pagou adiantado perde os dias acumulados). Melhor não decidir do que
 * decidir errado — o chamador devolve o mutex e pede re-entrega.
 */
async function detectIsFirstSale(
  supabase: any,
  companyId: string,
  ltv: number,
): Promise<boolean | null> {
  const { data: prevPayments, error: prevErr } = await supabase
    .from("company_payments")
    .select("id")
    .eq("company_id", companyId)
    .in("type", ["primeira_venda", "renovacao"])
    .limit(1);

  const { data: existingSale, error: saleErr } = await supabase
    .from("salesperson_sales")
    .select("id")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();

  const { data: existingSaleTx, error: txErr } = await supabase
    .from("admin_financial_transactions")
    .select("id")
    .eq("reference_id", companyId)
    .in("category", ["sale", "first_sale"])
    .eq("type", "income")
    .limit(1);

  const leituraFalhou = prevErr || saleErr || txErr;
  if (leituraFalhou) {
    console.error(
      `[first-sale] leitura falhou p/ ${companyId}:`,
      (prevErr || saleErr || txErr).message,
    );
    return null;
  }

  const hasAnySaleRecord =
    (prevPayments?.length ?? 0) > 0 ||
    !!existingSale ||
    (existingSaleTx?.length ?? 0) > 0;

  return !hasAnySaleRecord && (Number(ltv) || 0) === 0;
}

/**
 * Sincroniza company_modules com os módulos do plano da company.
 * Lê subscription_plans.included_modules (jsonb array de module_code) pelo
 * companies.subscription_plan e faz UPSERT em company_modules (sem apagar extras
 * já comprados — só garante que os do plano existam). Idempotente.
 */
async function activatePlanModules(
  supabase: any,
  companyId: string,
  planCode: string | null,
  warnings?: WriteWarnings,
) {
  if (!planCode) return;
  try {
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("included_modules")
      .eq("code", planCode)
      .maybeSingle();

    const included: unknown = plan?.included_modules;
    const moduleCodes: string[] = Array.isArray(included)
      ? included.filter((m): m is string => typeof m === "string")
      : [];

    if (moduleCodes.length === 0) {
      // included_modules vazio/ausente: nada a ativar pelo plano (atual default dos planos Dominex).
      return;
    }

    // Quais já existem pra essa company (evita duplicar / resetar quantity de extras).
    const { data: existing } = await supabase
      .from("company_modules")
      .select("module_code")
      .eq("company_id", companyId);
    const existingSet = new Set((existing ?? []).map((m: any) => m.module_code));

    const toInsert = moduleCodes
      .filter((code) => !existingSet.has(code))
      .map((code) => ({
        company_id: companyId,
        module_code: code,
        quantity: 1,
        activated_at: new Date().toISOString(),
      }));

    if (toInsert.length > 0) {
      // Não-fatal: roda DEPOIS do mutex (re-entrega seria no-op) e o cliente já
      // está com a assinatura ativa. Um módulo do plano que não entrou é falta
      // de acesso reclamável, não perda de dinheiro — a linha de recuperação
      // tem os códigos pra reaplicar à mão.
      const ok = await tryWrite(
        "ativação dos módulos do plano (company_modules)",
        supabase.from("company_modules").insert(toInsert),
        { recovery: { company_id: companyId, plano: planCode, modulos: toInsert.map((m) => m.module_code).join("|") }, warnings },
      );
      if (ok) console.log(`[modules] ativados ${toInsert.length} módulo(s) do plano '${planCode}' para ${companyId}`);
    }
  } catch (e) {
    console.error("[modules] erro inesperado (engolido):", (e as Error).message);
  }
}

/**
 * Sincroniza company_modules EXATAMENTE para o conjunto `targetCodes` (downgrade).
 * Diferente de activatePlanModules (aditivo), AQUI removemos módulos que não estão
 * mais no plano-alvo — é o efeito real do downgrade. Idempotente: se já estiver
 * sincronizado, vira no-op. Best-effort (erros logados, não-fatais) pra não travar
 * o caminho de pagamento já gated pelo mutex.
 */
async function syncCompanyModulesExact(
  supabase: any,
  companyId: string,
  targetCodes: string[],
  warnings?: WriteWarnings,
) {
  try {
    const target = new Set(targetCodes);
    const { data: existing } = await supabase
      .from("company_modules")
      .select("module_code")
      .eq("company_id", companyId);
    const existingSet = new Set((existing ?? []).map((m: any) => m.module_code));

    // Remove os que sobraram (não estão no alvo).
    const toRemove = [...existingSet].filter((code) => !target.has(code as string)) as string[];
    if (toRemove.length > 0) {
      // Não-fatal (pós-mutex). Falhar aqui deixa o cliente com módulo que ele
      // não paga mais — vazamento de receita, não perda de acesso; o aviso vai
      // pra resposta e a linha de recuperação diz o que remover.
      const ok = await tryWrite(
        "remoção dos módulos fora do plano (downgrade)",
        supabase
          .from("company_modules")
          .delete()
          .eq("company_id", companyId)
          .in("module_code", toRemove),
        { recovery: { company_id: companyId, remover: toRemove.join("|") }, warnings },
      );
      if (ok) console.log(`[modules-sync] removidos [${toRemove.join(", ")}] de ${companyId}`);
    }

    // Insere os que faltam.
    const toInsert = targetCodes
      .filter((code) => !existingSet.has(code))
      .map((code) => ({
        company_id: companyId,
        module_code: code,
        quantity: 1,
        activated_at: new Date().toISOString(),
      }));
    if (toInsert.length > 0) {
      const ok = await tryWrite(
        "inclusão dos módulos do plano-alvo (downgrade)",
        supabase.from("company_modules").insert(toInsert),
        { recovery: { company_id: companyId, incluir: toInsert.map((m) => m.module_code).join("|") }, warnings },
      );
      if (ok) console.log(`[modules-sync] adicionados [${toInsert.map((m) => m.module_code).join(", ")}] em ${companyId}`);
    }
  } catch (e) {
    console.error("[modules-sync] erro inesperado (engolido):", (e as Error).message);
  }
}

/**
 * Notifica admin (admin_financial_transactions como rastro) quando um estorno/chargeback
 * chega. Aqui registramos como despesa pra refletir no consolidado e deixamos o status
 * do pagamento como REFUNDED/CHARGEBACK. Idempotente via asaas_transaction_id UNIQUE.
 */
async function recordRefundOrChargeback(
  supabase: any,
  payment: any,
  companyId: string | null,
  companyName: string,
  kind: "refund" | "chargeback",
) {
  const amount = Number(payment.value || 0);
  if (amount <= 0) return;
  const label = kind === "refund" ? "Estorno" : "Chargeback";

  // INSERT idempotente. O índice único de asaas_transaction_id é PARCIAL
  // (WHERE asaas_transaction_id IS NOT NULL); o PostgREST não emite o predicado no
  // onConflict, então UPSERT errava em SILÊNCIO e o estorno/chargeback não era gravado.
  // Fazemos INSERT direto e tratamos 23505 (unique_violation) como sucesso/idempotente.
  // asaas_transaction_id aqui é SEMPRE `${payment.id}_${kind}` (nunca null).
  const txId = `${payment.id}_${kind}`;
  // FATAL (pede re-entrega): este INSERT é o único registro de que a Auctus
  // devolveu dinheiro, é totalmente idempotente (23505 = já existe) e roda
  // ANTES de qualquer mutex — a re-entrega conserta de graça. O `try/catch`
  // que engolia tudo aqui foi removido de propósito: ele transformava "o
  // estorno não entrou no consolidado" em silêncio.
  const gravado = await tryWrite(
    `lançamento de ${label.toLowerCase()} (admin_financial_transactions)`,
    supabase
      .from("admin_financial_transactions")
      .insert({
        type: "expense",
        category: kind === "refund" ? "refund" : "chargeback",
        amount,
        description: `${label} Asaas - ${companyName} (${payment.id})`,
        reference_id: companyId,
        reference_type: kind === "refund" ? "subscription_refund" : "subscription_chargeback",
        asaas_transaction_id: txId,
        transaction_date: new Date().toISOString(),
      }),
    {
      ignoreCodes: ["23505"], // já lançado: idempotente, não é erro.
      recovery: { asaas_transaction_id: txId, empresa: companyName, company_id: companyId, valor: amount, tipo: kind },
    },
  );
  if (!gravado) {
    throw new RetryableWebhookError(`lançamento de ${kind} não gravado (${txId})`);
  }
  console.log(`[${kind}] registrado para ${companyName}: R$ ${amount} (${payment.id})`);
}

/**
 * Caminho central de ATIVAÇÃO/RENOVAÇÃO a partir de um pagamento confirmado.
 * Recebe a company já resolvida e o objeto payment (ou um pseudo-payment do Pix Automático).
 * Idempotente: usa credit_ltv_once_for_payment como mutex + UPSERT ON CONFLICT nos lançamentos.
 */
async function processConfirmedPayment(
  supabase: any,
  company: any,
  opts: {
    asaasPaymentId: string;     // ID usado para idempotência (pay_* normalmente; aut_* no Pix Automático)
    amount: number;
    billingType: string;        // PIX / CREDIT_CARD / BOLETO
    netValue?: number | null;   // valor líquido (pra calcular tarifa)
    customerId?: string | null; // asaas_customer_id do pagamento
    dueDate?: string | null;    // payment.dueDate da Asaas (YYYY-MM-DD) = vencimento REAL do ciclo
    matchedBy: string;          // diagnóstico: como a company foi encontrada
  },
): Promise<{ processed: boolean; type?: string; reason?: string; warnings?: string[] }> {
  const companyId = company.id;
  const paymentAmount = Number(opts.amount || 0);
  // Coletor dos avisos de escrita não-fatal. Vai pro corpo da resposta: "deu
  // certo com pendência" não pode se confundir com "deu certo".
  const warnings = new WriteWarnings();

  if (paymentAmount <= 0) {
    return { processed: false, reason: "valor inválido" };
  }

  // ===== VENCIMENTO REAL DO CICLO (antes era sempre "HOJE") =====
  // subscription_payments.due_date é a CHAVE DE CICLO do Guard 2 da RPC
  // credit_ltv_once_for_payment: se existir OUTRA linha da MESMA company com o MESMO
  // amount e o MESMO due_date já creditada, o mutex devolve FALSE e este pagamento vira
  // no-op total (não credita LTV e NÃO estende subscription_expires_at).
  //
  // Por isso NÃO gravamos mais due_date = HOJE: duas cobranças de CICLOS DIFERENTES,
  // de mesmo valor, pagas no MESMO DIA colapsavam na mesma chave e a 2ª era descartada
  // como duplicata — o cliente pagava dois meses e ganhava um. Caso real: Alô gás
  // Juquitiba com 19/09 e 19/10 (R$ 197 cada) abertas ao mesmo tempo na Asaas.
  //
  // Agora usamos payment.dueDate (vencimento REAL que vem no payload da Asaas).
  // Ganho colateral: a dedup de duas cobranças do MESMO ciclo (ex.: PIX + boleto do
  // mesmo mês) passa a funcionar mesmo quando são pagas em DIAS DIFERENTES — cenário
  // que o "hoje" NÃO pegava.
  // Fallback: sem dueDate no payload (ou fora de YYYY-MM-DD) → HOJE, exatamente o
  // comportamento anterior. É UMA const só, usada nos DOIS pontos de gravação.
  const todayIsoDate = new Date().toISOString().split("T")[0];
  const effectiveDueDate = opts.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.dueDate)
    ? opts.dueDate
    : todayIsoDate;

  // ===== FALLBACK DE MATERIALIZAÇÃO DA RENOVAÇÃO (FURO 3) =====
  // Root cause do incidente VS Project (17/ago): na renovação recorrente de CARTÃO,
  // a Asaas gera um pay_* NOVO pela subscription, mas NÃO existe mais uma linha
  // subscription_payments PENDING com asaas_payment_id NULL pra o PAYMENT_CREATED
  // linkar (a única já foi consumida na 1ª venda). Sem linha pra esse pay_*, o mutex
  // abaixo (credit_ltv_once_for_payment) reivindica 0 → retorna FALSE → o webhook
  // trata como "já processado" e PULA a extensão do vencimento. Resultado sistêmico:
  // type='renovacao' nunca materializou.
  //
  // Correção (aditiva, fail-safe): quando NÃO existe subscription_payments pra este
  // pay_*, MATERIALIZAMOS a linha AQUI, ANTES do mutex, com company já resolvida.
  // Regras invioláveis:
  //  - ltv_credited_at fica NULL de propósito → quem credita é o mutex (não pré-creditar).
  //  - INSERT ... ON CONFLICT (asaas_payment_id) DO NOTHING (coluna UNIQUE) → reprocessar
  //    o webhook (RECEIVED + CONFIRMED do mesmo pay_*) NÃO cria 2ª linha.
  //  - due_date = effectiveDueDate (vencimento REAL do payload da Asaas; HOJE só como
  //    fallback) e paid_at = agora. TEM que ser o MESMO valor usado no UPSERT canônico
  //    de rastro mais abaixo: aquele bloco roda DEPOIS do mutex e REGRAVA esta linha,
  //    então se os dois divergirem o colapso de ciclo volta pela porta dos fundos no
  //    PRÓXIMO pagamento avaliado pelo Guard 2. due_date importa: o Guard 2 do mutex
  //    dedup por CICLO usa (company_id + amount + due_date) — com o vencimento real,
  //    ciclos diferentes deixam de colidir e cobranças do mesmo ciclo continuam colidindo.
  //  - NÃO estende vencimento nem credita LTV aqui — só CRIA a linha pro mutex reivindicar.
  //  - 1ª venda intacta: nela a linha JÁ existe (linkada pelo PAYMENT_CREATED), então
  //    o SELECT abaixo acha e este bloco vira no-op.
  {
    const { data: existingRow, error: existErr } = await supabase
      .from("subscription_payments")
      .select("id")
      .eq("asaas_payment_id", opts.asaasPaymentId)
      .maybeSingle();

    if (existErr) {
      // FATAL (pede re-entrega). Antes isto só logava e seguia: sem a linha
      // materializada, o mutex logo abaixo não acha o que reivindicar, devolve
      // FALSE e o webhook trata como "já processado" — a renovação some inteira
      // em silêncio. Nada foi reivindicado ainda, então a re-entrega conserta.
      console.error(
        `[materialize] falha ao checar subscription_payments de ${opts.asaasPaymentId}:`,
        existErr.message,
      );
      throw new RetryableWebhookError(
        `checagem de subscription_payments falhou (${opts.asaasPaymentId}): ${existErr.message}`,
        existErr,
      );
    } else if (!existingRow) {
      // Sem linha pra este pay_* → renovação recorrente que nunca materializou.
      // Cria a linha de renovação. O `type` real (primeira_venda vs renovacao) é
      // reconfirmado logo abaixo por detectIsFirstSale; aqui gravamos 'renovacao'
      // porque, se a linha não existe, a 1ª venda (que sempre cria a linha PENDING)
      // já passou — é sempre um ciclo posterior.
      const materializedBillingCycle = company.billing_cycle === "yearly" ? "yearly" : "monthly";
      const nowIso = new Date().toISOString();
      // FATAL (pede re-entrega). Mesmo motivo do `existErr` acima: sem esta
      // linha, o mutex não tem o que reivindicar e a renovação inteira vira
      // no-op silencioso. É pré-mutex e idempotente (23505 tratado como
      // sucesso), então re-entregar é barato e conserta.
      // 23505 (unique_violation) = corrida entre RECEIVED e CONFIRMED do mesmo
      // pay_* criando a linha ao mesmo tempo. É o "ON CONFLICT DO NOTHING" na
      // prática: um ganha, o outro bate no UNIQUE e segue — não é erro.
      const materializada = await tryWrite(
        "materialização da linha de renovação (subscription_payments)",
        supabase.from("subscription_payments").insert({
          company_id: companyId,
          asaas_payment_id: opts.asaasPaymentId,
          asaas_customer_id: opts.customerId ?? company.asaas_customer_id ?? null,
          amount: paymentAmount,
          status: "CONFIRMED",
          billing_type: opts.billingType || "PIX",
          billing_cycle: materializedBillingCycle,
          type: "renovacao",
          payment_method: (opts.billingType || "PIX").toLowerCase(),
          due_date: effectiveDueDate,
          paid_at: nowIso,
          ltv_credited_at: null, // o mutex é quem credita — NÃO pré-creditar aqui.
        }),
        {
          ignoreCodes: ["23505"],
          recovery: {
            company_id: companyId,
            asaas_payment_id: opts.asaasPaymentId,
            valor: paymentAmount,
            due_date: effectiveDueDate,
          },
        },
      );
      if (!materializada) {
        throw new RetryableWebhookError(
          `materialização da renovação não gravada (${opts.asaasPaymentId})`,
        );
      }
      console.log(
        `[materialize] linha de renovação garantida p/ ${company.name} ` +
          `(${opts.matchedBy}): ${opts.asaasPaymentId} R$ ${paymentAmount}`,
      );
    }
  }

  // ===== GATING DE IDEMPOTÊNCIA (FURO 1) =====
  // A Asaas envia PAYMENT_RECEIVED **e** PAYMENT_CONFIRMED pro MESMO pay_*. Sem portão,
  // a EXTENSÃO de subscription_expires_at rodaria 2x (cliente ganharia mês grátis).
  // credit_ltv_once_for_payment é o MUTEX: TRUE = 1ª vez (winner), FALSE = já processado.
  // A RPC dedup por CICLO (mesma company + amount + due_date), então RECEIVED/CONFIRMED
  // do mesmo pagamento reivindicam a MESMA linha → só 1 ganha. TUDO que NÃO é
  // naturalmente idempotente (extensão de vencimento via compute_next_expiration,
  // company_payments, salesperson_sales) fica ABAIXO deste portão. Se FALSE → no-op
  // total e resposta 200. Garantia: o vencimento estende NO MÁXIMO 1x por asaas_payment_id.
  const { data: ltvClaimed, error: ltvError } = await supabase.rpc("credit_ltv_once_for_payment", {
    p_asaas_payment_id: opts.asaasPaymentId,
    p_company_id: companyId,
    p_amount: paymentAmount,
  });
  if (ltvError) {
    console.error(`[process] credit_ltv_once_for_payment falhou:`, ltvError.message);
    // FATAL (pede re-entrega). O comentário antigo dizia "Asaas re-tenta o
    // webhook", mas o `return` virava HTTP 200 — a Asaas NUNCA re-tentava e o
    // pagamento ficava sem renovação nenhuma. A RPC falhou, então NADA foi
    // reivindicado: reprocessar é seguro e é o único conserto.
    throw new RetryableWebhookError(
      `mutex de LTV falhou (${opts.asaasPaymentId}): ${ltvError.message}`,
      ltvError,
    );
  }
  if (!ltvClaimed) {
    // FALSE = já processado (outra confirmação do mesmo ciclo já creditou). PULA TODOS
    // os efeitos colaterais — em especial a extensão de subscription_expires_at.
    console.log(`[process] ${opts.asaasPaymentId} já processado (LTV já creditado). No-op.`);
    return { processed: false, reason: "já processado" };
  }
  // A partir daqui somos o WINNER: extensão de vencimento + lançamentos rodam 1x só.

  /**
   * Aborta um pagamento JÁ reivindicado pelo mutex.
   *
   * Só pode ser usado ANTES da primeira escrita não-idempotente (hoje: o INSERT
   * em company_payments). Devolve o mutex e lança pedindo re-entrega — sem a
   * devolução, o 500 traria o evento de volta só pra ser descartado como "já
   * processado". Se a devolução falhar, NÃO lança: vira alerta humano, porque
   * insistir na re-entrega só trava a fila da Asaas sem consertar nada.
   */
  const abortarDevolvendoMutex = async (
    motivo: string,
    alerta: { type: string; title: string; message: string; data: Record<string, unknown> },
  ): Promise<{ processed: boolean; reason: string; warnings?: string[] }> => {
    const devolvido = await releaseLtvClaim(supabase, opts.asaasPaymentId, companyId, paymentAmount);
    if (devolvido) {
      throw new RetryableWebhookError(
        `${motivo} (${opts.asaasPaymentId}) — mutex devolvido, pedindo re-entrega`,
      );
    }
    console.error(
      `[process] RENOVAÇÃO PERDIDA (${motivo}) — ${formatRecovery({
        company_id: companyId,
        empresa: company.name,
        asaas_payment_id: opts.asaasPaymentId,
        valor: paymentAmount,
      })}`,
    );
    await alertAdmin(supabase, alerta.type, alerta.title, alerta.message, alerta.data);
    return { processed: false, reason: motivo, warnings: warnings.list };
  };

  // Tipo: primeira venda vs renovação.
  const isFirstSale = await detectIsFirstSale(supabase, companyId, company.ltv);
  if (isFirstSale === null) {
    // Sem saber o tipo, tudo o que vem depois sai errado (comissão e âncora do
    // vencimento). Nada não-idempotente foi escrito ainda → devolve o mutex.
    return await abortarDevolvendoMutex("tipo do pagamento não determinado", {
      type: "subscription_renewal_failed",
      title: "Pagamento recebido sem classificação",
      message:
        `A empresa ${company.name} pagou R$ ${paymentAmount.toFixed(2)} (${opts.asaasPaymentId}) mas não foi ` +
        `possível saber se é primeira venda ou renovação. A renovação NÃO foi aplicada; confira manualmente.`,
      data: { company_id: companyId, payment_id: opts.asaasPaymentId, amount: paymentAmount },
    });
  }
  const paymentType = isFirstSale ? "primeira_venda" : "renovacao";
  // "sale" e "renewal" existem em admin_financial_categories (labels "Vendas"/"Renovações").
  // NÃO usar "first_sale" aqui: foi consolidado em "sale" e a UI exibiria o name cru.
  const financialCategory = isFirstSale ? "sale" : "renewal";
  const financialDescription = isFirstSale
    ? `Primeira Venda - ${company.name} (Asaas ${opts.asaasPaymentId}) [${opts.matchedBy}]`
    : `Renovação - ${company.name} (Asaas ${opts.asaasPaymentId}) [${opts.matchedBy}]`;

  // Vencimento via RPC compute_next_expiration (BRT-aware no banco).
  //
  // ÂNCORA:
  //  - PRIMEIRA VENDA: ancora na DATA DO PAGAMENTO (agora). Antes ancorávamos em
  //    subscription_expires_at, que no cadastro de venda podia estar contaminado
  //    (janela de +3 dias) e virava HOJE+3+1mês (incidente 17/07 → 20/08). Agora a
  //    origem (self-register) grava a âncora = HOJE e aqui, na 1ª venda, re-ancoramos
  //    em agora → sempre +1 mês (mensal) / +1 ano (anual) exatos a partir do pagamento.
  //    Espelha o activate-subscription (que ancora em new Date()).
  //  - RENOVAÇÃO: ancora no subscription_expires_at vigente (assim pagar adiantado
  //    NÃO perde dias — o próximo ciclo continua do vencimento atual).
  const billingCycle = company.billing_cycle === "yearly" ? "yearly" : "monthly";
  const baseExpiration = isFirstSale
    ? new Date().toISOString()
    : (company.subscription_expires_at ?? new Date().toISOString());
  const { data: nextExpiration, error: expError } = await supabase.rpc("compute_next_expiration", {
    p_current: baseExpiration,
    p_cycle: billingCycle,
  });
  if (expError || !nextExpiration) {
    // O fallback antigo era `nextExpiration ?? baseExpiration`: a empresa era
    // renovada com o MESMO vencimento de antes — o cliente pagava e ganhava
    // ZERO dia, com o mutex consumido e resposta 200. Silêncio caro.
    // Aqui nada não-idempotente foi escrito ainda, então devolvemos o mutex e
    // pedimos re-entrega.
    console.error(
      `[process] compute_next_expiration falhou (${billingCycle}, base ${baseExpiration}):`,
      expError?.message ?? "sem data de retorno",
    );
    return await abortarDevolvendoMutex("novo vencimento não calculado", {
      type: "subscription_renewal_failed",
      title: "Pagamento recebido mas vencimento não calculado",
      message:
        `A empresa ${company.name} pagou R$ ${paymentAmount.toFixed(2)} (${opts.asaasPaymentId}) e o novo ` +
        `vencimento não pôde ser calculado. Renove manualmente a partir de ${baseExpiration} (${billingCycle}).`,
      data: {
        company_id: companyId,
        payment_id: opts.asaasPaymentId,
        amount: paymentAmount,
        base_expiration: baseExpiration,
        cycle: billingCycle,
      },
    });
  }
  const newExpiration: string = nextExpiration;

  // ===== O UPDATE DA COMPANY, PARTIDO EM DOIS (VITAL x EXTRAS) =====
  // Ver `_shared/asaas-webhook-renewal.ts`. Resumo: um único objeto carregava o
  // `subscription_status: 'active'` (o gate de acesso de quem ACABOU de pagar)
  // junto com `subscription_plan`/`billing_cycle`/`max_users` vindos dos
  // `pending_*`. Um valor fora do CHECK em qualquer um deles faz o Postgres
  // recusar o UPDATE INTEIRO, e o `supabase-js` devolve isso calado — cliente
  // pagante sem acesso, em silêncio. Agora o vital vai sozinho.
  const split = splitRenewalCompanyUpdate(company, newExpiration);
  const hasPendingDowngrade = split.downgrade !== null;

  // Conjunto-alvo de módulos do downgrade: `pending_modules` explícito, senão os
  // included do plano-alvo. Resolvido aqui porque exige SELECT (o split é puro).
  let pendingModuleCodes: string[] | null = split.downgrade?.explicitModules ?? null;
  if (split.downgrade && pendingModuleCodes === null) {
    const { data: targetPlan } = await supabase
      .from("subscription_plans")
      .select("included_modules")
      .eq("code", split.downgrade.planCode)
      .maybeSingle();
    const inc: unknown = targetPlan?.included_modules;
    pendingModuleCodes = Array.isArray(inc)
      ? inc.filter((m): m is string => typeof m === "string")
      : [];
  }

  // (1) VITAL — FATAL. Se não entrar, responder sucesso é mentira: o cliente
  // pagou e continua bloqueado. Como estamos DEPOIS do mutex, a re-entrega
  // sozinha seria no-op — por isso DEVOLVEMOS o mutex antes de lançar. E só
  // lançamos se a devolução deu certo: 500 sem mutex devolvido é fila travada
  // pra receber o mesmo evento e jogá-lo fora de novo.
  const vitalOk = await tryWrite(
    "renovação da empresa (companies: status + vencimento)",
    supabase.from("companies").update(split.vital).eq("id", companyId),
    {
      recovery: {
        company_id: companyId,
        empresa: company.name,
        asaas_payment_id: opts.asaasPaymentId,
        novo_vencimento: newExpiration,
        valor: paymentAmount,
      },
      warnings,
    },
  );
  if (!vitalOk) {
    return await abortarDevolvendoMutex("renovação não gravada", {
      type: "subscription_renewal_failed",
      title: "Pagamento recebido mas assinatura não renovada",
      message:
        `A empresa ${company.name} pagou R$ ${paymentAmount.toFixed(2)} (${opts.asaasPaymentId}) e a renovação ` +
        `não foi gravada. Renove manualmente: status ativo e vencimento ${newExpiration}.`,
      data: {
        company_id: companyId,
        payment_id: opts.asaasPaymentId,
        amount: paymentAmount,
        new_expiration: newExpiration,
      },
    });
  }

  // (2) EXTRAS — NÃO-fatal. Promoção temporária, valor agendado e downgrade.
  // Falhar aqui deixa o cliente no plano ANTIGO (mais caro / mais acesso), com
  // os `pending_*` intactos — ou seja, o downgrade é reavaliado na próxima
  // renovação em vez de sumir. É degradação segura; perder o acesso não seria.
  let extrasOk = true;
  if (split.hasExtras) {
    extrasOk = await tryWrite(
      "ajustes da renovação (companies: valor, promoção, downgrade)",
      supabase.from("companies").update(split.extras).eq("id", companyId),
      {
        recovery: {
          company_id: companyId,
          empresa: company.name,
          asaas_payment_id: opts.asaasPaymentId,
          campos: Object.keys(split.extras).join("|"),
        },
        warnings,
      },
    );
  }

  if (hasPendingDowngrade && extrasOk) {
    // Sincroniza company_modules EXATAMENTE pro conjunto-alvo do downgrade:
    // remove os que não fazem mais parte e insere os que faltam. Reduz acesso
    // de verdade (diferente de activatePlanModules, que só adiciona).
    // Só roda se os extras entraram: mexer nos módulos sem ter gravado o plano
    // novo deixaria acesso e cobrança apontando pra planos diferentes.
    await syncCompanyModulesExact(supabase, companyId, pendingModuleCodes ?? [], warnings);
    console.log(
      `[downgrade] aplicado p/ ${company.name}: plano '${split.downgrade?.planCode}', ` +
        `módulos [${(pendingModuleCodes ?? []).join(", ")}]`,
    );
  } else if (!hasPendingDowngrade) {
    // Sem downgrade pendente: mantém o comportamento aditivo (não remove extras pagos).
    await activatePlanModules(supabase, companyId, company.subscription_plan ?? null, warnings);
  }

  // company_payments — histórico do valor recebido.
  // NÃO-fatal e SEM re-entrega: a tabela não tem UNIQUE em asaas_payment_id
  // (conferido na migration de fundação: "nullable, SEM unique"), então este
  // INSERT NÃO é idempotente. Devolver o mutex e re-entregar duplicaria a linha
  // E estenderia o vencimento uma segunda vez (mês grátis). A perda aqui é de
  // histórico, não de acesso — vai pro log de recuperação e pro alerta.
  const histOk = await tryWrite(
    "histórico de pagamento da empresa (company_payments)",
    supabase.from("company_payments").insert({
      company_id: companyId,
      amount: paymentAmount,
      type: paymentType,
      payment_method: (opts.billingType || "PIX").toLowerCase(),
      notes: `Pagamento via Asaas - ${opts.asaasPaymentId}`,
      payment_date: new Date().toISOString(),
      origin: company.origin || null,
      asaas_payment_id: opts.asaasPaymentId,
    }),
    {
      recovery: {
        company_id: companyId,
        empresa: company.name,
        valor: paymentAmount,
        tipo: paymentType,
        asaas_payment_id: opts.asaasPaymentId,
      },
      warnings,
    },
  );
  if (!histOk) {
    await alertAdmin(
      supabase,
      "company_payment_not_recorded",
      "Pagamento recebido fora do histórico da empresa",
      `A empresa ${company.name} pagou R$ ${paymentAmount.toFixed(2)} (${opts.asaasPaymentId}) e o lançamento ` +
        `em histórico de pagamentos não entrou. A assinatura FOI renovada; falta só o registro.`,
      { company_id: companyId, payment_id: opts.asaasPaymentId, amount: paymentAmount, type: paymentType },
    );
  }

  // admin_financial_transactions (receita) — INSERT idempotente.
  // O índice único é PARCIAL (WHERE asaas_transaction_id IS NOT NULL); o PostgREST não
  // emite o predicado no onConflict, então UPSERT errava em SILÊNCIO e a receita não era
  // gravada. Fazemos INSERT direto e tratamos 23505 (unique_violation no índice parcial)
  // como sucesso/idempotente. asaas_transaction_id aqui é SEMPRE o pay_* (nunca null).
  // NÃO-fatal e SEM re-entrega: pós-mutex. A receita sumida é conserto humano
  // (o alerta abaixo), não automático.
  const receitaOk = await tryWrite(
    "receita da assinatura (admin_financial_transactions)",
    supabase.from("admin_financial_transactions").insert({
      type: "income",
      category: financialCategory,
      amount: paymentAmount,
      description: financialDescription,
      reference_id: companyId,
      reference_type: "subscription_payment",
      asaas_transaction_id: opts.asaasPaymentId,
      transaction_date: new Date().toISOString(),
    }),
    {
      ignoreCodes: ["23505"], // já lançada: idempotente, não é erro.
      recovery: {
        asaas_transaction_id: opts.asaasPaymentId,
        empresa: company.name,
        company_id: companyId,
        valor: paymentAmount,
        categoria: financialCategory,
      },
      warnings,
    },
  );
  if (!receitaOk) {
    await alertAdmin(
      supabase,
      "subscription_income_not_recorded",
      "Receita de assinatura não lançada",
      `O pagamento de R$ ${paymentAmount.toFixed(2)} de ${company.name} (${opts.asaasPaymentId}) foi confirmado, ` +
        `mas a receita não entrou no financeiro consolidado. Lance manualmente.`,
      {
        company_id: companyId,
        payment_id: opts.asaasPaymentId,
        amount: paymentAmount,
        category: financialCategory,
      },
    );
  }

  // Tarifa Asaas (só quando netValue real veio e é menor que o bruto).
  const netValue = Number(opts.netValue ?? 0);
  if (netValue > 0 && netValue < paymentAmount) {
    const asaasFee = Math.round((paymentAmount - netValue) * 100) / 100;
    // INSERT idempotente (mesmo motivo do índice parcial acima). 23505 = já existe → ok.
    const feeTxId = `${opts.asaasPaymentId}_fee`;
    // NÃO-fatal e SEM re-entrega (pós-mutex). Tarifa faltando subestima o custo
    // no consolidado; a linha de recuperação tem tudo pra lançar à mão.
    await tryWrite(
      "tarifa Asaas (admin_financial_transactions)",
      supabase.from("admin_financial_transactions").insert({
        type: "expense",
        category: "asaas_fee",
        amount: asaasFee,
        description: `Tarifa Asaas - ${company.name} (${opts.billingType || "PIX"})`,
        reference_id: companyId,
        reference_type: "asaas_fee",
        asaas_transaction_id: feeTxId,
        transaction_date: new Date().toISOString(),
      }),
      {
        ignoreCodes: ["23505"],
        recovery: { asaas_transaction_id: feeTxId, empresa: company.name, company_id: companyId, tarifa: asaasFee },
        warnings,
      },
    );
  }

  // subscription_payments — garante rastro (UPSERT por asaas_payment_id UNIQUE).
  // due_date usa a MESMA const effectiveDueDate da materialização lá em cima (vencimento
  // REAL da Asaas, HOJE só no fallback). NÃO trocar por "hoje" aqui: este UPSERT roda
  // DEPOIS do mutex e regrava a linha, então gravar "hoje" aqui desfaria a correção para
  // o PRÓXIMO pagamento que o Guard 2 comparar contra esta linha.
  //
  // NÃO-fatal e SEM re-entrega (pós-mutex), MAS é a escrita mais perigosa de
  // perder calada: `due_date` é a CHAVE DE CICLO do Guard 2 da RPC
  // credit_ltv_once_for_payment. Falhar aqui não estraga ESTE pagamento (já
  // renovado) — envenena o PRÓXIMO, que será comparado contra uma linha com
  // due_date errado e pode ser descartado como duplicata. Por isso vai com
  // alerta ao admin, não só com log.
  const rastroOk = await tryWrite(
    "rastro do pagamento (subscription_payments: paid_at + due_date do ciclo)",
    supabase.from("subscription_payments").upsert(
      {
        company_id: companyId,
        asaas_payment_id: opts.asaasPaymentId,
        asaas_customer_id: opts.customerId ?? company.asaas_customer_id ?? null,
        amount: paymentAmount,
        status: "CONFIRMED",
        billing_type: opts.billingType || "PIX",
        billing_cycle: billingCycle,
        type: paymentType,
        payment_method: (opts.billingType || "PIX").toLowerCase(),
        due_date: effectiveDueDate,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "asaas_payment_id" },
    ),
    {
      recovery: {
        asaas_payment_id: opts.asaasPaymentId,
        company_id: companyId,
        empresa: company.name,
        valor: paymentAmount,
        due_date: effectiveDueDate,
        tipo: paymentType,
      },
      warnings,
    },
  );
  if (!rastroOk) {
    await alertAdmin(
      supabase,
      "subscription_payment_trace_failed",
      "Rastro do pagamento incompleto (risco no próximo ciclo)",
      `A renovação de ${company.name} (${opts.asaasPaymentId}) foi aplicada, mas o registro do ciclo não ` +
        `atualizou (vencimento ${effectiveDueDate}). Confira antes da próxima cobrança: o ciclo seguinte ` +
        `pode ser lido como repetido.`,
      {
        company_id: companyId,
        payment_id: opts.asaasPaymentId,
        due_date: effectiveDueDate,
        amount: paymentAmount,
      },
    );
  }

  // salesperson_sales — SÓ na primeira venda e SÓ se houver vendedor.
  // FONTE DA VERDADE DA COMISSÃO (FURO 2): a comissão é criada EXCLUSIVAMENTE aqui no
  // webhook (gatilho confiável de pagamento). O confirm-sale-payment NÃO cria comissão
  // — assim não há duplicação. Este bloco já está GATED pelo mutex: processConfirmedPayment
  // retorna cedo (linha do `if (!ltvClaimed) return`) quando o pagamento já foi processado,
  // então a comissão também roda no máximo 1x por pagamento.
  if (isFirstSale && company.salesperson_id) {
    // Esta leitura é a ÚNICA trava contra comissão em dobro. Com o `error`
    // descartado, um SELECT recusado devolvia `undefined` — indistinguível de
    // "não existe" — e o INSERT rodava por cima de uma comissão já paga. Na
    // dúvida, NÃO paga: o admin é avisado e lança à mão (o inverso, pagar duas
    // vezes, é dinheiro que sai e não volta).
    const { data: existingSale, error: existingSaleErr } = await supabase
      .from("salesperson_sales")
      .select("id")
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle();

    if (existingSaleErr) {
      console.error(
        `[salesperson] leitura de comissão existente falhou (${companyId}):`,
        existingSaleErr.message,
      );
      warnings.add("comissão do vendedor: não foi possível conferir se já existia — não lançada.");
      await alertAdmin(
        supabase,
        "salesperson_commission_not_recorded",
        "Comissão não lançada por segurança",
        `A primeira venda de ${company.name} (${opts.asaasPaymentId}) foi confirmada, mas não deu pra conferir ` +
          `se a comissão já existia. Nada foi lançado pra não pagar em dobro; confira e lance à mão.`,
        { company_id: companyId, payment_id: opts.asaasPaymentId, salesperson_id: company.salesperson_id },
      );
    } else if (!existingSale) {
      // REGRA DE COMISSÃO SDR/CLOSER — régua NOVA (CEO 2026-07-16), espelha
      // calculateCommission de src/hooks/useSalespersonData.ts (fonte da verdade
      // no painel master) e a RPC register_manual_company_payment.
      //   - mensal: total = base * 1.00 (100% do que o cliente pagou; ANTES 0.5)
      //   - anual:  total = base * 0.20 (inalterado)
      //   - COM SDR → closer 80% / sdr 20% (ANTES 50/50)
      //   - SEM SDR → 100% closer
      // Base de comissão = subscription_value mensal (mesmo "valor da venda" que o
      // closer informa no diálogo Registrar Venda). NÃO multiplicamos por 12 no anual
      // — o diálogo usa o valor informado direto, então mantemos paridade.
      //
      // SDR: companies.sdr_id é capturado na ORIGEM (link de teste/venda ou form do
      // painel master). Se a empresa tem sdr_id → comissão dividida 80/20; senão,
      // 100% closer. O closer é SEMPRE company.salesperson_id.
      const isYearly = company.billing_cycle === "yearly";
      const totalRate = isYearly ? 0.20 : 1.00;
      const commissionBase = Number(company.subscription_value || paymentAmount);
      const total = Math.round(commissionBase * totalRate * 100) / 100;

      const sdrId: string | null = company.sdr_id ?? null;
      let closerCommission: number;
      let sdrCommission: number;
      if (sdrId) {
        // 80/20 centavo-safe: closer leva 80% arredondado, SDR leva o resto
        // (total - closer) pra não perder/ganhar 1 centavo no arredondamento.
        closerCommission = Math.round((total * 0.8) * 100) / 100;
        sdrCommission = Math.round((total - closerCommission) * 100) / 100;
      } else {
        closerCommission = total;
        sdrCommission = 0;
      }

      // NÃO-fatal e SEM re-entrega (pós-mutex) — mas com ALERTA obrigatório.
      // Este webhook é a fonte da verdade EXCLUSIVA da comissão: o
      // confirm-sale-payment não cria comissão de propósito (pra não duplicar).
      // Se esta linha não entrar, NÃO existe segundo caminho que a recupere; o
      // vendedor simplesmente não recebe e ninguém descobre. Por isso o alerta
      // carrega os valores já calculados, prontos pra lançar à mão.
      const comissaoOk = await tryWrite(
        "comissão do vendedor (salesperson_sales)",
        supabase.from("salesperson_sales").insert({
          salesperson_id: company.salesperson_id, // closer
          sdr_id: sdrId,
          company_id: companyId,
          customer_name: company.name,
          customer_origin: company.origin,
          amount: commissionBase,
          paid_amount: company.subscription_value ?? paymentAmount,
          commission_amount: total,
          closer_commission: closerCommission,
          sdr_commission: sdrCommission,
          billing_cycle: isYearly ? "annual" : "monthly",
          // [LEAD SELF-SERVICE] segura a comissão só quando é lead self-service
          // ainda não trabalhado (espelha a RPC register_manual_company_payment).
          status: (!company.is_self_service || company.lead_worked_at)
            ? "confirmed"
            : "pending_work",
        }),
        {
          recovery: {
            company_id: companyId,
            empresa: company.name,
            closer_id: company.salesperson_id,
            sdr_id: sdrId,
            base: commissionBase,
            comissao_total: total,
            closer: closerCommission,
            sdr: sdrCommission,
            ciclo: isYearly ? "annual" : "monthly",
            asaas_payment_id: opts.asaasPaymentId,
          },
          warnings,
        },
      );
      if (comissaoOk) {
        console.log(
          `[salesperson] venda registrada p/ ${company.name}: comissão total R$ ${total} ` +
            (sdrId
              ? `(80/20 → closer R$ ${closerCommission} / sdr R$ ${sdrCommission})`
              : `(100% closer R$ ${closerCommission})`),
        );
      } else {
        await alertAdmin(
          supabase,
          "salesperson_commission_not_recorded",
          "Comissão de venda não registrada",
          `A primeira venda de ${company.name} (${opts.asaasPaymentId}) foi confirmada, mas a comissão não ` +
            `foi gravada. Lance manualmente: total R$ ${total.toFixed(2)}` +
            (sdrId
              ? ` (closer R$ ${closerCommission.toFixed(2)} / SDR R$ ${sdrCommission.toFixed(2)}).`
              : ` (100% do closer).`),
          {
            company_id: companyId,
            payment_id: opts.asaasPaymentId,
            salesperson_id: company.salesperson_id,
            sdr_id: sdrId,
            commission_amount: total,
            closer_commission: closerCommission,
            sdr_commission: sdrCommission,
          },
        );
      }
    }
  }

  console.log(
    `[process] ${paymentType} aplicada p/ ${company.name} (${opts.matchedBy}): R$ ${paymentAmount}, ` +
      `nova expiração ${newExpiration}` +
      (warnings.hasAny ? ` | COM PENDÊNCIAS: ${warnings.list.join(" / ")}` : ""),
  );
  return { processed: true, type: paymentType, ...warnings.toBody() };
}

/** Colunas da company necessárias em todo caminho de ativação. */
const COMPANY_COLS =
  "id, name, cnpj, subscription_status, subscription_plan, subscription_value, subscription_expires_at, " +
  "billing_cycle, ltv, origin, salesperson_id, sdr_id, asaas_customer_id, asaas_subscription_id, " +
  "pending_subscription_value, pending_plan_code, pending_billing_cycle, pending_modules, pending_max_users, " +
  "custom_price, custom_price_months, custom_price_payments_made, " +
  // [LEAD SELF-SERVICE] status da comissão: segura ('pending_work') quando é lead
  // self-service ainda não trabalhado; senão 'confirmed'.
  "custom_price_permanent, is_self_service, lead_worked_at";

/** Mantém só dígitos (normaliza CPF/CNPJ pra comparação tolerante a máscara). */
function digitsOnly(v: unknown): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : "";
}

/**
 * Resolve a company por cascata:
 *   1) asaas_subscription_id → 2) externalReference (=company_id) →
 *   3) asaas_customer_id → 4) CPF/CNPJ (companies.cnpj normalizado).
 * O passo 4 (FM1) cobre pagamentos onde a Asaas não preencheu subscription/
 * externalReference e a company ainda não tem asaas_customer_id linkado (ex.:
 * cobrança avulsa/manual reconciliada pelo documento). Em match por CPF/CNPJ,
 * faz backfill best-effort do asaas_customer_id quando vazio.
 */
async function resolveCompany(
  supabase: any,
  payment: any,
): Promise<{ company: any; matchedBy: string } | null> {
  // 1) por subscription/authorization id
  if (payment.subscription) {
    const { data } = await supabase
      .from("companies")
      .select(COMPANY_COLS)
      .eq("asaas_subscription_id", payment.subscription)
      .maybeSingle();
    if (data) return { company: data, matchedBy: "asaas_subscription_id" };
  }
  // 2) por externalReference (= company_id)
  if (payment.externalReference) {
    const { data } = await supabase
      .from("companies")
      .select(COMPANY_COLS)
      .eq("id", payment.externalReference)
      .maybeSingle();
    if (data) return { company: data, matchedBy: "externalReference" };
  }
  // 3) por asaas_customer_id
  if (payment.customer) {
    const { data } = await supabase
      .from("companies")
      .select(COMPANY_COLS)
      .eq("asaas_customer_id", payment.customer)
      .maybeSingle();
    if (data) return { company: data, matchedBy: "asaas_customer_id" };
  }
  // 4) por CPF/CNPJ (fallback FM1). cpfCnpj pode vir no payment ou no customer embutido.
  const docDigits = digitsOnly(
    payment.cpfCnpj ?? payment.customerCpfCnpj ?? payment.customer?.cpfCnpj,
  );
  if (docDigits.length >= 11) {
    // companies.cnpj pode estar mascarado no banco → normaliza ambos os lados.
    // Sem coluna gerada de dígitos, casamos via regexp_replace no PostgREST.
    const { data: candidates } = await supabase
      .from("companies")
      .select(COMPANY_COLS)
      .not("cnpj", "is", null);
    const match = (candidates ?? []).find(
      (c: any) => digitsOnly(c.cnpj) === docDigits,
    );
    if (match) {
      // Backfill best-effort do customer (só se a company ainda não tem e veio cus_*).
      const incomingCustomer: string | null =
        typeof payment.customer === "string" ? payment.customer : null;
      if (!match.asaas_customer_id && incomingCustomer) {
        // NÃO-fatal e SEM re-entrega: a company JÁ foi resolvida pelo CPF/CNPJ,
        // então o pagamento processa normalmente e re-entregar o evento inteiro
        // só pra backfillar um ponteiro seria desproporcional (a mesma cascata
        // resolve o próximo evento do mesmo jeito).
        // MAS não é inofensivo: `asaas_customer_id` vazio é o que faz outras
        // rotas criarem um customer DUPLICADO na Asaas. Por isso vai com linha
        // de recuperação, e o reflexo em memória só acontece se GRAVOU — antes
        // o objeto passava a mentir pro chamador mesmo com a escrita recusada.
        const backfilled = await tryWrite(
          "backfill do asaas_customer_id (companies)",
          supabase
            .from("companies")
            .update({ asaas_customer_id: incomingCustomer })
            .eq("id", match.id),
          { recovery: { company_id: match.id, empresa: match.name, asaas_customer_id: incomingCustomer } },
        );
        if (backfilled) {
          match.asaas_customer_id = incomingCustomer; // reflete pro caller
          console.log(`[resolve] backfill asaas_customer_id=${incomingCustomer} em ${match.name} (match por CPF/CNPJ)`);
        }
      }
      return { company: match, matchedBy: "cpf_cnpj" };
    }
  }
  return null;
}

/**
 * Registra um pagamento ÓRFÃO (sem company resolvida) pra categorização manual.
 * Proíbe órfão silencioso (FM1): grava no ledger_asaas + alerta o admin. Idempotente:
 *   - ledger_asaas.asaas_transaction_id é UNIQUE → ON CONFLICT DO NOTHING.
 *   - admin_notifications: checa antes pra não duplicar pro mesmo payment.id.
 */
async function recordUnmatchedPayment(supabase: any, payment: any): Promise<void> {
  const paymentId: string = payment.id;
  const amount = Number(payment.value || 0);
  const customer: string | null =
    typeof payment.customer === "string" ? payment.customer : null;
  const cpfCnpj =
    payment.cpfCnpj ?? payment.customerCpfCnpj ?? payment.customer?.cpfCnpj ?? null;
  const occurredAt =
    payment.confirmedDate || payment.paymentDate || payment.dateCreated || new Date().toISOString();

  // 1) Ledger pendente de categorização (company_id NULL). ON CONFLICT DO NOTHING via upsert.
  //
  // FATAL (pede re-entrega). Esta linha é o ÚNICO lugar onde o dinheiro de um
  // pagamento sem empresa fica registrado — perdê-la é perder a pista de uma
  // entrada real de caixa. É idempotente (`ignoreDuplicates` no
  // asaas_transaction_id UNIQUE) e roda ANTES de qualquer mutex, então a
  // re-entrega conserta de graça. O `try/catch` que engolia isso foi removido.
  await applyWrite(
    "registro do pagamento órfão (ledger_asaas)",
    supabase.from("ledger_asaas").upsert(
      {
        asaas_transaction_id: paymentId,
        asaas_payment_id: paymentId,
        direction: "credit",
        amount: amount >= 0 ? amount : 0,
        occurred_at: occurredAt,
        status: "pending_categorization",
        source: "webhook",
        company_id: null,
        description: `Pagamento Asaas não vinculado a empresa (${paymentId})`,
        raw_payload: payment,
      },
      { onConflict: "asaas_transaction_id", ignoreDuplicates: true },
    ),
    { rethrow: retryableRethrow("registro do pagamento órfão (ledger_asaas)") },
  );

  // 2) Alerta ao admin — idempotente: só insere se não existe notificação pro mesmo payment.id.
  //
  // NÃO-fatal de propósito, e é a única exceção consciente à régua "dinheiro é
  // fatal": o dinheiro já está preservado no ledger acima (que É fatal), e a
  // conciliação financeira lista o ledger pendente — o alerta é conveniência.
  // Re-entregar o evento só pra repetir um aviso vira ruído na fila da Asaas.
  const { data: existingNotif } = await supabase
    .from("admin_notifications")
    .select("id")
    .eq("type", "unmatched_asaas_payment")
    .eq("data->>payment_id", paymentId)
    .limit(1)
    .maybeSingle();

  if (!existingNotif) {
    const avisado = await tryWrite(
      "alerta de pagamento órfão (admin_notifications)",
      supabase.from("admin_notifications").insert({
        type: "unmatched_asaas_payment",
        title: "Pagamento Asaas sem empresa vinculada",
        message:
          `Recebemos um pagamento de R$ ${amount.toFixed(2)} (${paymentId}) que não foi ` +
          `associado a nenhuma empresa. Vincule manualmente na conciliação financeira.`,
        data: {
          payment_id: paymentId,
          amount,
          customer,
          cpfCnpj,
        },
      }),
      { recovery: { payment_id: paymentId, valor: amount, customer, cpfCnpj } },
    );
    if (avisado) console.log(`[unmatched] alerta criado p/ pagamento órfão ${paymentId} (R$ ${amount})`);
  } else {
    console.log(`[unmatched] alerta já existente p/ ${paymentId} — não duplicado.`);
  }
}

/**
 * Lança a TAXA DE ANTECIPAÇÃO Asaas como despesa SEPARADA (category=asaas_anticipation_fee),
 * distinta da tarifa comum (asaas_fee). Disparado pelos eventos RECEIVABLE_ANTICIPATION_*.
 *
 * FONTE DA VERDADE: re-consulta a API (GET /anticipations?payment=pay_*) pra obter o `fee`
 * REAL — NÃO confiamos no payload do webhook (formato/wrapper não garantido pela doc).
 * Isso elimina o timing frágil: a taxa de antecipação só existe num 2º momento (após o
 * PAYMENT_RECEIVED), e o fee correto vive no objeto da antecipação, não no payment.
 *
 * Idempotência: asaas_transaction_id = `${pay_*}_anticipation_fee` (UNIQUE parcial).
 * 23505 = já existe = ok. ESTA CHAVE é a MESMA usada pelo lançamento retroativo manual,
 * então se a automação chegar depois ela bate em 23505 e NÃO duplica.
 *
 * Só lança quando a antecipação está efetivamente concretizada (status CREDITED/DEBITED):
 * PENDING/SCHEDULED ainda não cobraram a taxa; DENIED/CANCELLED nunca cobram.
 */
async function recordAnticipationFee(
  supabase: any,
  paymentId: string,
  anticipationStatus: string,
): Promise<{ recorded: boolean; reason?: string; fee?: number }> {
  // Só vale a pena lançar quando a antecipação saiu do limbo. Em CREDITED a taxa já
  // foi descontada do líquido creditado; DEBITED idem (caso de débito posterior).
  const concretized = anticipationStatus === "CREDITED" || anticipationStatus === "DEBITED";
  if (!concretized) {
    return { recorded: false, reason: `status ${anticipationStatus} (sem cobrança ainda)` };
  }

  // Re-consulta o Asaas pra pegar o fee REAL da antecipação dessa cobrança.
  let anticipations;
  try {
    anticipations = await listAnticipationsByPayment(paymentId);
  } catch (e) {
    if (e instanceof AsaasConfigError) {
      console.error(`[anticipation] Asaas não configurado — não foi possível ler o fee de ${paymentId}.`);
      return { recorded: false, reason: "asaas não configurado" };
    }
    console.error(`[anticipation] falha ao consultar antecipações de ${paymentId}:`, (e as Error).message);
    return { recorded: false, reason: "consulta à Asaas falhou" };
  }

  // Soma os fees das antecipações concretizadas dessa cobrança (normalmente 1).
  const relevant = anticipations.filter(
    (a) => a.status === "CREDITED" || a.status === "DEBITED",
  );
  const totalFee =
    Math.round(relevant.reduce((acc, a) => acc + Number(a.fee || 0), 0) * 100) / 100;

  if (totalFee <= 0) {
    return { recorded: false, reason: "fee de antecipação zero ou ausente" };
  }

  // Resolve a company pela cobrança (mesma empresa do pagamento antecipado).
  const { data: payRow } = await supabase
    .from("subscription_payments")
    .select("company_id, billing_type")
    .eq("asaas_payment_id", paymentId)
    .maybeSingle();

  const companyId: string | null = payRow?.company_id ?? null;
  let companyName = "empresa não identificada";
  if (companyId) {
    const { data: comp } = await supabase
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .maybeSingle();
    companyName = comp?.name ?? companyName;
  }
  const billingType = (payRow?.billing_type || "PIX").toString().toUpperCase();

  const antFeeTxId = `${paymentId}_anticipation_fee`;
  // FATAL (pede re-entrega). É despesa real já cobrada pela Asaas; não lançar
  // subestima o custo no consolidado. Idempotente por `${pay_*}_anticipation_fee`
  // (23505 = já existe = ok) e sem mutex envolvido, então a re-entrega conserta.
  // Antes, o `return { recorded: false }` virava HTTP 200 e a taxa sumia.
  const lancada = await tryWrite(
    "taxa de antecipação (admin_financial_transactions)",
    supabase.from("admin_financial_transactions").insert({
      type: "expense",
      category: "asaas_anticipation_fee",
      amount: totalFee,
      description: `Taxa de Antecipação Asaas - ${companyName} (${billingType})`,
      reference_id: companyId,
      reference_type: "asaas_anticipation_fee",
      asaas_transaction_id: antFeeTxId,
      transaction_date: new Date().toISOString(),
    }),
    {
      ignoreCodes: ["23505"],
      recovery: { asaas_transaction_id: antFeeTxId, empresa: companyName, company_id: companyId, taxa: totalFee },
    },
  );
  if (!lancada) {
    throw new RetryableWebhookError(`taxa de antecipação não lançada (${antFeeTxId})`);
  }
  console.log(
    `[anticipation] taxa de antecipação R$ ${totalFee.toFixed(2)} lançada p/ ${companyName} (${antFeeTxId})`,
  );
  return { recorded: true, fee: totalFee };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ===== FAIL-CLOSED: valida token do webhook (regra-lei Dominex #6) =====
  const expectedToken = (Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "").trim();
  if (!expectedToken) {
    // Sem secret configurado, o endpoint NÃO confia em ninguém. Sem bypass.
    console.error("[webhook-auth] ASAAS_WEBHOOK_TOKEN não configurado — recusando (fail-closed).");
    return json({ error: "Webhook não configurado." }, 401);
  }
  const providedToken = (req.headers.get("asaas-access-token") || "").trim();
  if (!providedToken || !timingSafeEqual(providedToken, expectedToken)) {
    console.error(
      `[webhook-auth] token inválido — provided.len=${providedToken.length}, expected.len=${expectedToken.length}`,
    );
    return json({ error: "Unauthorized webhook" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json();
    const event: string = body?.event ?? "";
    const payment = body?.payment ?? null;
    console.log(`[webhook] evento ${event} recebido`);

    // ==========================================================
    // PIX AUTOMÁTICO — autorização CRIADA (apenas informativo)
    // O dinheiro/ativação chega depois SOMENTE nos PAYMENT_RECEIVED/CONFIRMED
    // (o ACTIVATED apenas confirma a recorrência, não move dinheiro — ver abaixo).
    // Aqui NÃO há processamento financeiro: nada de processConfirmedPayment,
    // nada de crédito de LTV. Só confirmamos o recebimento (200) pra não ficar
    // silenciosamente ignorado — paridade com o EcoSistema.
    // ==========================================================
    if (event === "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED") {
      const authorization = body.pixAutomatic || body.authorization || body;
      const authId: string | undefined =
        authorization?.id || authorization?.authorizationId;
      console.log(
        `[pix-auto] autorização CRIADA (informativo) authId=${authId ?? "n/d"} — sem processamento financeiro`,
      );
      return json({ received: true, informational: true });
    }

    // ==========================================================
    // PIX AUTOMÁTICO — autorização ATIVADA (apenas confirma a recorrência)
    // ----------------------------------------------------------
    // FM2-b (idempotência): este evento NÃO move dinheiro. Ele só sinaliza que
    // o cliente autorizou o débito automático Pix. O dinheiro/renovação SEMPRE
    // chega depois via PAYMENT_RECEIVED/PAYMENT_CONFIRMED com o pay_* REAL — a
    // empresa tem asaas_subscription_id=aut_* (e asaas_customer_id), então esses
    // eventos resolvem a company pela cascata (subscription → customer).
    //
    // Por que NÃO processamos aqui: o handler antigo usava o authId (aut_*) como
    // fallback de asaas_payment_id e chamava processConfirmedPayment. Isso CEGAVA
    // o mutex credit_ltv_once_for_payment (que casa por asaas_payment_id): o aut_*
    // creditava LTV/estendia vencimento, e quando o pay_* real chegava ele creditava
    // DE NOVO (chave diferente) → renovação dupla. Agora: log + 200, ZERO efeito
    // financeiro, e NUNCA gravamos aut_* em subscription_payments.asaas_payment_id.
    // A 1ª ativação da assinatura acontece no 1º PAYMENT_RECEIVED desse aut_*.
    // ==========================================================
    if (event === "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED") {
      const authorization = body.pixAutomatic || body.authorization || body;
      const authId: string | undefined =
        authorization?.id || authorization?.authorizationId;

      if (!authId) {
        return json({ received: true, ignored: "sem authorizationId" });
      }

      const { data: companyByAuth } = await supabase
        .from("companies")
        .select("id, name")
        .eq("asaas_subscription_id", authId)
        .maybeSingle();

      console.log(
        `[pix-auto] autorização ATIVADA (confirmação de recorrência) authId=${authId} ` +
          `company=${companyByAuth?.name ?? "n/d"} — SEM processamento financeiro ` +
          `(dinheiro vem nos PAYMENT_RECEIVED/CONFIRMED com pay_* real)`,
      );
      return json({ received: true, authorization_confirmed: true, matched: !!companyByAuth });
    }

    // ==========================================================
    // ANTECIPAÇÃO DE RECEBÍVEL — taxa de antecipação como despesa SEPARADA
    // ----------------------------------------------------------
    // O Asaas tem uma FILA DE WEBHOOK PRÓPRIA pra antecipações ("Receivable
    // anticipation events"), que precisa estar HABILITADA na conta. Eventos:
    // RECEIVABLE_ANTICIPATION_{PENDING,SCHEDULED,CREDITED,DEBITED,DENIED,CANCELLED,OVERDUE}.
    //
    // A taxa de antecipação NÃO chega no PAYMENT_RECEIVED (o netValue de lá só reflete
    // a tarifa comum). Ela é cobrada num 2º momento, aqui. Para não depender do formato
    // do payload (wrapper não documentado), re-consultamos a API pelo pay_* e pegamos o
    // `fee` REAL. Lançamento idempotente por `${pay_*}_anticipation_fee`.
    // ==========================================================
    if (event.startsWith("RECEIVABLE_ANTICIPATION_")) {
      const ant = body.anticipation || body.receivableAnticipation || body.payment || {};
      const antStatus = String(ant.status || event.replace("RECEIVABLE_ANTICIPATION_", "") || "").toUpperCase();
      // O pay_* da cobrança antecipada (antecipação de parcelamento não tem payment → ignoramos).
      const antPaymentId: string | null =
        (typeof ant.payment === "string" && ant.payment) ? ant.payment : null;

      if (!antPaymentId) {
        console.log(`[anticipation] ${event} sem pay_* (provável antecipação de parcelamento) — ack sem lançamento.`);
        return json({ received: true, anticipation: true, skipped: "sem payment" });
      }

      const result = await recordAnticipationFee(supabase, antPaymentId, antStatus);
      return json({ received: true, anticipation: true, ...result });
    }

    // ==========================================================
    // Eventos que precisam de objeto payment
    // ==========================================================
    if (!payment || !payment.id) {
      console.log(`[webhook] evento ${event} sem payment — ignorado`);
      return json({ received: true, ignored: "sem payment" });
    }

    const status = String(payment.status || "").toUpperCase();
    const isBeingPaid = status === "RECEIVED" || status === "CONFIRMED";

    // ---------- PAYMENT_CREATED: linka pay_* à subscription_payments ----------
    if (event === "PAYMENT_CREATED") {
      // Cartão recorrente grava subscription_payments com asaas_payment_id NULL; quando
      // o pay_* nasce, vinculamos pelo subscription para o webhook de pagamento achar depois.
      if (payment.subscription) {
        const { data: company } = await supabase
          .from("companies")
          .select("id")
          .eq("asaas_subscription_id", payment.subscription)
          .maybeSingle();
        if (company) {
          const { data: linkable } = await supabase
            .from("subscription_payments")
            .select("id")
            .eq("company_id", company.id)
            .is("asaas_payment_id", null)
            .in("status", ["PENDING", "CONFIRMED"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (linkable) {
            // FATAL (pede re-entrega). Sem o link, o pagamento que chegar depois
            // não acha a linha, o mutex não tem o que reivindicar e a renovação
            // vira no-op silencioso. Idempotente: o filtro
            // `.is("asaas_payment_id", null)` faz a re-execução não achar nada
            // quando o link já entrou. Nada reivindicado ainda.
            await applyWrite(
              "vínculo da cobrança à assinatura (subscription_payments)",
              supabase
                .from("subscription_payments")
                .update({ asaas_payment_id: payment.id, updated_at: new Date().toISOString() })
                .eq("id", linkable.id),
              { rethrow: retryableRethrow("vínculo da cobrança à assinatura") },
            );
            console.log(`[payment_created] linkado ${payment.id} ao subscription_payment ${linkable.id}`);
          }
        }
      }
      return json({ received: true, linked: true });
    }

    // ---------- PAYMENT_REFUNDED / PAYMENT_CHARGEBACK_* ----------
    if (event === "PAYMENT_REFUNDED" || event.startsWith("PAYMENT_CHARGEBACK")) {
      const resolved = await resolveCompany(supabase, payment);
      const kind = event === "PAYMENT_REFUNDED" ? "refund" : "chargeback";
      await recordRefundOrChargeback(
        supabase,
        payment,
        resolved?.company?.id ?? null,
        resolved?.company?.name ?? "empresa não identificada",
        kind,
      );
      // Atualiza status do pagamento local (sem desativar automaticamente — decisão manual do admin).
      // FATAL (pede re-entrega): é o estado que diz que o dinheiro voltou.
      // Idempotente (grava um valor fixo) e sem mutex — re-entregar conserta.
      await applyWrite(
        `status de ${kind} no pagamento (subscription_payments)`,
        supabase
          .from("subscription_payments")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("asaas_payment_id", payment.id),
        { rethrow: retryableRethrow(`status de ${kind} no pagamento`) },
      );
      return json({ received: true, recorded: kind });
    }

    // ---------- PAYMENT_OVERDUE ----------
    // NOTA (divergência sinalizada): Dominex NÃO tem status 'past_due' em uso
    // (só active/testing/inactive). Em vez de inventar um valor novo, seguimos o
    // padrão do EcoSistema: marca subscription_payments=OVERDUE e SÓ desativa a
    // company (inactive) quando for 1ª venda nunca paga (LTV=0 e sem company_payments).
    // Renovação vencida NÃO derruba o cliente automaticamente.
    if (event === "PAYMENT_OVERDUE") {
      // FATAL (pede re-entrega): inadimplência registrada. Idempotente (valor
      // fixo), sem mutex — re-entregar conserta e não duplica nada.
      await applyWrite(
        "marcação de inadimplência (subscription_payments)",
        supabase
          .from("subscription_payments")
          .update({ status: "OVERDUE", updated_at: new Date().toISOString() })
          .eq("asaas_payment_id", payment.id),
        { rethrow: retryableRethrow("marcação de inadimplência") },
      );

      const resolved = await resolveCompany(supabase, payment);
      if (resolved?.company && resolved.company.subscription_status === "active") {
        const { data: confirmed } = await supabase
          .from("company_payments")
          .select("id")
          .eq("company_id", resolved.company.id)
          .in("type", ["primeira_venda", "renovacao"])
          .limit(1);
        const neverPaid = (!confirmed || confirmed.length === 0) && (Number(resolved.company.ltv) || 0) === 0;
        if (neverPaid) {
          // FATAL (pede re-entrega): é o gate de assinatura decidindo acesso.
          // Falhar calado deixa uma 1ª venda nunca paga usando o sistema de
          // graça. Idempotente: na re-execução o `subscription_status` já não é
          // 'active', então o bloco inteiro é pulado. Sem mutex envolvido.
          await applyWrite(
            "desativação da empresa inadimplente (companies)",
            supabase
              .from("companies")
              .update({ subscription_status: "inactive" })
              .eq("id", resolved.company.id),
            { rethrow: retryableRethrow("desativação da empresa inadimplente") },
          );
          console.log(`[overdue] ${resolved.company.name} desativada (1ª venda nunca paga).`);
        }
      }
      return json({ received: true, overdue: true });
    }

    // ---------- PAYMENT_RECEIVED / PAYMENT_CONFIRMED ----------
    if ((event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") && isBeingPaid) {
      const resolved = await resolveCompany(supabase, payment);
      if (!resolved?.company) {
        // PROIBIDO órfão silencioso (FM1): registra no ledger + alerta admin (idempotente).
        console.log(`[payment] sem company para ${payment.id} (cascata falhou). Registrando como órfão.`);
        await recordUnmatchedPayment(supabase, payment);
        return json({ received: true, matched: false, unmatched_recorded: true });
      }

      const result = await processConfirmedPayment(supabase, resolved.company, {
        asaasPaymentId: payment.id,
        amount: Number(payment.value || 0),
        billingType: payment.billingType || "PIX",
        netValue: payment.netValue != null ? Number(payment.netValue) : null,
        customerId: payment.customer ?? null,
        dueDate: payment.dueDate ?? null,
        matchedBy: resolved.matchedBy,
      });
      return json({ received: true, ...result });
    }

    // ---------- Demais eventos: ack silencioso ----------
    console.log(`[webhook] evento ${event} (status ${status}) sem ação. Ack.`);
    return json({ received: true, handled: false });
  } catch (error) {
    // A resposta é decidida por `webhookResponseFor` (ver `_shared/asaas-webhook-renewal.ts`):
    //  - erro marcado como retryable → 500 `{ retry: true }`: a Asaas RE-ENTREGA,
    //    que é o único conserto automático que existe pra uma escrita idempotente
    //    que o banco recusou. Antes isto respondia 200 e o evento sumia.
    //  - qualquer outro erro → 200: payload ruim ou bug de código não melhora com
    //    re-entrega, e insistir trava a fila de webhook da conta inteira.
    // A mensagem interna vai só pro log — nunca no corpo de um endpoint público.
    const plan = webhookResponseFor(error);
    console.error(
      `[webhook] erro ${plan.status === 500 ? "RETRYABLE (pedindo re-entrega)" : "não-retryable (ack)"}:`,
      (error as Error).message,
    );
    return json(plan.body, plan.status);
  }
});
