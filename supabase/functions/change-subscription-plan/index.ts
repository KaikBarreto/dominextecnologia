// change-subscription-plan
// -------------------------
// Gerencia a mudança de plano/módulos da assinatura SaaS de um tenant a partir da
// tela "Sua Assinatura" (Billing). O TENANT não pode dar UPDATE direto em companies
// (RLS bloqueia), então toda a mudança passa por aqui com service_role, validando
// posse (própria empresa OU super_admin via authorizeAsaasCompany).
//
// Entrada:
//   { company_id, plan_code, billing_cycle, custom_modules?: string[], extra_users?: number }
//
// Valor mensal calculado server-side (NUNCA confia no front):
//   - Plano pronto (start/avancado/master): subscription_plans.price[plan_code].
//   - Personalizado: soma dos preços dos módulos escolhidos + extra_users × preço
//     do `extra_user` no catálogo ativo.
//     A base (`basic`, Portal do Cliente, Precificação Avançada e Perguntas em
//     Vídeo) é SEMPRE inclusa e obrigatória.
//
// Decisão upgrade vs downgrade vs igual (compara com o VALOR EFETIVO atual da empresa:
// custom_price se promoção ativa, senão subscription_value — NUNCA pending):
//
//   B1 — UPGRADE (novo > atual): calcula a diferença proporcional até o vencimento.
//        → cria cotação imutável; o checkout gera uma cobrança única; plano, módulos,
//          usuários e novo valor recorrente só são aplicados pelo webhook após confirmação.
//          Na renovação seguinte, cobra o valor integral do novo plano.
//
//   B2 — DOWNGRADE (novo < atual): paga o ciclo atual; o valor menor vale no próximo.
//        → pending_subscription_value = novo; NÃO mexe em subscription_value nem no Asaas.
//          ⚠️ NÃO aplica plano/módulos/max_users agora — isso quebraria o acesso JÁ PAGO.
//          O acesso atual é preservado integralmente. A INTENÇÃO de downgrade (plano +
//          módulos + max_users + extra_users alvo) fica registrada em subscription_history
//          (reason estruturado) para o webhook de renovação aplicar quando o ciclo virar.
//          O webhook de renovação aplica os pending_* quando o próximo ciclo virar.
//
//   IGUAL (novo == atual): aplica plano/módulos/max_users/billing_cycle agora (reorganização
//        sem mudança de preço — ex: trocar módulos mantendo o mesmo valor); limpa pending.
//
// Sincronização de company_modules (só em upgrade/igual):
//   - Plano pronto → included_modules do plano.
//   - Personalizado → custom_modules (com todos os recursos-base garantidos).
//
// Auth: própria empresa OU super_admin (authorizeAsaasCompany). Escrita via service_role.
// PT-BR nas mensagens. Espelha o modelo do EcoSistema adaptado ao schema Dominex.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { asaas, AsaasConfigError, AsaasApiError } from "../_shared/asaas-client.ts";
import { authorizeAsaasCompany } from "../_shared/asaas-auth.ts";
import { applyWrite, tryWrite, WriteWarnings } from "../_shared/db-write.ts";
import {
  calculateUpgradeProration,
  roundSubscriptionMoney,
  subscriptionPeriodValue,
} from "../_shared/subscription-proration.ts";
import { resolveFirstPaidWhatsappTier } from "../_shared/whatsapp-pricing.ts";

class ValidationError extends Error {}

const BASE_MODULE = "basic";
const CUSTOMER_PORTAL_MODULE = "customer_portal";
const EXTRA_USER_MODULE = "extra_user";
const FREE_BASE_MODULES = [
  CUSTOMER_PORTAL_MODULE,
  "finance_advanced",
  "pricing_advanced",
  "video_questions",
] as const;
const BASE_INCLUDED_MODULES = [BASE_MODULE, ...FREE_BASE_MODULES] as const;
const CUSTOM_PLAN_INCLUDED_USERS = 5;
const MAX_SUBSCRIPTION_USERS = 999;

interface ChangePlanRequest {
  company_id: string;
  plan_code: string;
  billing_cycle?: "monthly" | "yearly";
  custom_modules?: string[];
  extra_users?: number;
  nfse_tier?: number;
  /** false = cotação sem escrita; true = aplica/agendada após confirmação. */
  confirm?: boolean;
}

const MIN_UPGRADE_CHARGE = 5;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body: ChangePlanRequest = await req.json();
    const {
      company_id,
      plan_code,
      billing_cycle,
      custom_modules,
      extra_users,
      nfse_tier,
    } = body;

    if (!company_id) throw new ValidationError("Empresa não informada.");
    if (!plan_code) throw new ValidationError("Plano não informado.");

    // ===== POLÍTICA DE FALHA DE ESCRITA (incidente "supabase-js não lança", 2026-09-19) =====
    // O `supabase-js` devolve `{ error }` em vez de lançar: um `await supabase…update()`
    // sem checar engole a recusa do banco inteira. Aqui isso é caro porque a escrita
    // que importa é VALOR DE ASSINATURA. Regra desta função:
    //
    //   applyWrite (fatal) → tudo que define quanto o cliente vai pagar: os campos
    //     `pending_*` do downgrade e o `companies.update` do upgrade/igual. Nenhuma
    //     chamada ao gateway acontece antes deles, então o erro é barato: o usuário
    //     repete a mudança de plano e nada foi cobrado a mais.
    //
    //   tryWrite (aviso) → auditoria (`subscription_history`), que não muda o que é
    //     cobrado. Falhar alto por causa do histórico faria o usuário repetir uma
    //     mudança já aplicada; vira aviso + linha de recuperação no log.
    //
    // ORDEM IMPORTA: o valor é gravado ANTES do histórico. Nunca registramos um
    // upgrade/downgrade que não chegou a ser persistido — era exatamente esse o furo
    // (histórico dizendo "downgrade agendado" com os `pending_*` vazios, o webhook de
    // renovação não achando nada e o cliente seguindo no valor antigo).
    const warnings = new WriteWarnings();

    const cycleForDb: "monthly" | "yearly" =
      billing_cycle === "yearly" ? "yearly" : "monthly";

    // --- Auth: própria empresa OU super_admin ---
    const auth = await authorizeAsaasCompany(
      supabase,
      req.headers.get("Authorization"),
      company_id,
    );
    if (!auth.ok) {
      return new Response(
        JSON.stringify({ error: auth.message }),
        { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Empresa atual ---
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(
        "id, name, subscription_plan, subscription_value, pending_subscription_value, max_users, extra_users, billing_cycle, asaas_subscription_id, custom_price, custom_price_permanent, custom_price_months, custom_price_payments_made, subscription_status, subscription_expires_at, nfse_tier, whatsapp_tier",
      )
      .eq("id", company_id)
      .single();
    if (companyError || !company) throw new ValidationError("Empresa não encontrada.");

    const isCustom = plan_code === "personalizado";

    // --- Catálogo de preços (server-side) ---
    // O personalizado depende do catálogo ativo para TODOS os valores, inclusive
    // usuário adicional. Se a leitura ou o preço de `extra_user` falhar, não há
    // preço seguro para persistir nem enviar ao gateway: falha fechado.
    let modulePriceByCode = new Map<string, number>();
    let extraUserPrice = 0;
    if (isCustom) {
      const { data: modulesCatalog, error: modulesCatalogError } = await supabase
        .from("subscription_modules")
        .select("code, price")
        .eq("is_active", true);
      if (modulesCatalogError) {
        throw new ValidationError("Não foi possível consultar os preços dos módulos. Tente novamente mais tarde.");
      }

      modulePriceByCode = new Map<string, number>(
        (modulesCatalog ?? []).map((m) => [m.code, Number(m.price)]),
      );
      extraUserPrice = modulePriceByCode.get(EXTRA_USER_MODULE) ?? Number.NaN;
      if (!Number.isFinite(extraUserPrice) || extraUserPrice <= 0) {
        throw new ValidationError("O preço do usuário adicional não está configurado corretamente. Tente novamente mais tarde.");
      }

      const basePrice = modulePriceByCode.get(BASE_MODULE) ?? Number.NaN;
      const freeBaseModulesAreValid = FREE_BASE_MODULES.every(
        (code) => modulePriceByCode.get(code) === 0,
      );
      if (!Number.isFinite(basePrice) || basePrice <= 0 || !freeBaseModulesAreValid) {
        throw new ValidationError("Os módulos obrigatórios do plano personalizado não estão configurados corretamente.");
      }
    }

    // Plano pronto: precisa existir.
    let planRow: { code: string; price: number; max_users: number; included_modules: string[] } | null = null;
    if (!isCustom) {
      const { data: pr } = await supabase
        .from("subscription_plans")
        .select("code, price, max_users, included_modules")
        .eq("code", plan_code)
        .eq("is_active", true)
        .maybeSingle();
      if (!pr) throw new ValidationError("Plano não encontrado.");
      planRow = {
        code: pr.code,
        price: Number(pr.price) || 0,
        max_users: Number(pr.max_users) || 0,
        included_modules: Array.isArray(pr.included_modules)
          ? (pr.included_modules as unknown[]).filter((m): m is string => typeof m === "string")
          : [],
      };
    }

    // --- Resolve módulos + max_users + valor mensal alvo ---
    let targetModules: string[];
    let targetMaxUsers: number;
    let targetMonthlyValue: number;
    const targetExtraUsers = isCustom
      ? Math.min(
        MAX_SUBSCRIPTION_USERS - CUSTOM_PLAN_INCLUDED_USERS,
        Math.max(0, Math.floor(Number(extra_users) || 0)),
      )
      : 0;

    if (isCustom) {
      // Personalizado: todos os recursos-base são inclusos/obrigatórios,
      // independentemente do payload. Filtra códigos válidos (presentes no catálogo
      // ativo) e ignora extra_user como módulo (é via contador).
      const chosen = new Set<string>(BASE_INCLUDED_MODULES);
      for (const code of custom_modules ?? []) {
        if (code === EXTRA_USER_MODULE) continue;
        if (modulePriceByCode.has(code)) chosen.add(code);
      }
      targetModules = Array.from(chosen);

      const modulesPrice = targetModules.reduce(
        (sum, code) => sum + (modulePriceByCode.get(code) ?? 0),
        0,
      );
      targetMonthlyValue = modulesPrice + targetExtraUsers * extraUserPrice;
      // No personalizado, companies.max_users JÁ é o total (não soma extra por cima).
      // Base de 5 usuários (igual ao subscription_plans.personalizado.max_users) + extras.
      targetMaxUsers = CUSTOM_PLAN_INCLUDED_USERS + targetExtraUsers;
    } else {
      targetModules = planRow!.included_modules;
      targetMaxUsers = planRow!.max_users;
      targetMonthlyValue = planRow!.price;
    }

    if (!(targetMonthlyValue > 0)) {
      throw new ValidationError("Não foi possível calcular o valor do plano. Selecione ao menos um módulo.");
    }

    // Tiers são parte do preço e do entitlement. O tier 1 de NFS-e já está
    // embutido no módulo/plano; WhatsApp tier 1 é grátis. Preserva o nível pago
    // quando o módulo continua no alvo e volta ao nível 1 quando ele é removido.
    const currentNfseTier = Number(company.nfse_tier) || 1;
    const currentWhatsappTier = Number(company.whatsapp_tier) || 1;
    const [nfseAccess, whatsappAccess] = await Promise.all([
      supabase.rpc("company_has_module", { p_company_id: company_id, p_module_code: "nfe" }),
      supabase.rpc("company_has_module", { p_company_id: company_id, p_module_code: "whatsapp" }),
    ]);
    if (nfseAccess.error || whatsappAccess.error) {
      throw new ValidationError(
        "Não foi possível confirmar os módulos atuais para calcular o valor. Tente novamente.",
      );
    }
    const currentlyHasNfse = nfseAccess.data;
    const currentlyHasWhatsapp = whatsappAccess.data;
    const requestedNfseTier = Number(nfse_tier);
    if (Number.isFinite(requestedNfseTier) && ![1, 2, 3, 4].includes(requestedNfseTier)) {
      throw new ValidationError("Nível de Notas Fiscais inválido.");
    }
    const targetNfseTier = targetModules.includes("nfe")
      ? (Number.isFinite(requestedNfseTier) ? requestedNfseTier : currentlyHasNfse ? currentNfseTier : 1)
      : 1;
    let targetWhatsappTier = 1;
    if (targetModules.includes("whatsapp")) {
      if (currentlyHasWhatsapp && currentWhatsappTier > 1) {
        targetWhatsappTier = currentWhatsappTier;
      } else {
        let whatsappOffer;
        try {
          whatsappOffer = await resolveFirstPaidWhatsappTier(supabase);
        } catch {
          throw new ValidationError("Não foi possível consultar o preço do WhatsApp. Tente novamente.");
        }
        if (!whatsappOffer) {
          throw new ValidationError("O preço do WhatsApp não está configurado corretamente.");
        }
        targetWhatsappTier = whatsappOffer.tier;
      }
    }

    if (targetNfseTier > 1) {
      const { data: nfsePrices, error: nfsePriceError } = await supabase
        .from("nfse_tiers")
        .select("tier, price")
        .in("tier", [1, targetNfseTier]);
      if (nfsePriceError || !nfsePrices) {
        throw new ValidationError("Não foi possível calcular o nível de Notas Fiscais.");
      }
      const byTier = new Map(nfsePrices.map((row) => [Number(row.tier), Number(row.price) || 0]));
      if (!byTier.has(targetNfseTier)) throw new ValidationError("Nível de Notas Fiscais não encontrado.");
      targetMonthlyValue += (byTier.get(targetNfseTier) ?? 0) - (byTier.get(1) ?? 0);
    }
    if (targetWhatsappTier > 1) {
      const { data: whatsappPrice, error: whatsappPriceError } = await supabase
        .from("whatsapp_tiers")
        .select("price")
        .eq("tier", targetWhatsappTier)
        .maybeSingle();
      if (whatsappPriceError || !whatsappPrice) {
        throw new ValidationError("Não foi possível calcular o nível de WhatsApp.");
      }
      targetMonthlyValue += Number(whatsappPrice.price) || 0;
    }

    // --- Valor EFETIVO atual (custom_price se promoção ativa, senão subscription_value) ---
    const cp = Number(company.custom_price) || 0;
    const cpPermanent = company.custom_price_permanent === true;
    const cpMonths = Number(company.custom_price_months) || 0;
    const cpMade = Number(company.custom_price_payments_made) || 0;
    const hasActiveCustomPrice = cp > 0 && (cpPermanent || (cpMonths > 0 && cpMade < cpMonths));
    const currentEffectiveValue = hasActiveCustomPrice
      ? cp
      : Number(company.subscription_value) || 0;

    const currentCycle: "monthly" | "yearly" = company.billing_cycle === "yearly"
      ? "yearly"
      : "monthly";
    // Reduzir o compromisso anual para mensal nunca entra no meio do contrato,
    // mesmo que o plano alvo tenha preço mensal maior. A troca fica agendada.
    const annualToMonthly = currentCycle === "yearly" && cycleForDb === "monthly";
    let isUpgrade = targetMonthlyValue > currentEffectiveValue;
    let isDowngrade = targetMonthlyValue < currentEffectiveValue;
    if (annualToMonthly) {
      isUpgrade = false;
      isDowngrade = true;
    } else if (currentCycle === "monthly" && cycleForDb === "yearly" && !isDowngrade) {
      // Mensal -> anual cria um novo compromisso anual, ainda que seja o mesmo plano.
      isUpgrade = true;
    }
    const changeKind = isUpgrade ? "upgrade" : isDowngrade ? "downgrade" : "igual";

    // Passo 1: cotação pura. Nenhuma tabela nem gateway é alterado antes da
    // confirmação explícita do cliente. O cálculo é repetido no passo 2 para
    // evitar aplicar uma cotação velha caso preço/vencimento tenham mudado.
    if (body.confirm !== true) {
      const periodEnd = company.subscription_expires_at ? new Date(company.subscription_expires_at) : null;
      const now = new Date();
      const canProrate = isUpgrade
        && company.subscription_status === "active"
        && periodEnd !== null
        && Number.isFinite(periodEnd.getTime())
        && periodEnd.getTime() > now.getTime();
      const preview = canProrate
        ? calculateUpgradeProration({
            now,
            periodEnd: periodEnd!,
            currentCycle,
            targetCycle: cycleForDb,
            currentMonthlyValue: currentEffectiveValue,
            targetMonthlyValue,
          })
        : null;
      return new Response(JSON.stringify({
        success: true,
        dry_run: true,
        change_kind: changeKind,
        current_value: currentEffectiveValue,
        target_monthly_value: targetMonthlyValue,
        target_plan_code: plan_code,
        target_billing_cycle: cycleForDb,
        target_max_users: targetMaxUsers,
        target_modules: targetModules,
        amount_due: preview?.amountDue ?? 0,
        credit_amount: preview?.creditAmount ?? 0,
        next_renewal_at: preview?.nextRenewalAt?.toISOString() ?? company.subscription_expires_at,
        message: changeKind === "upgrade"
          ? "Confira o valor proporcional antes de continuar."
          : changeKind === "downgrade"
          ? "O novo valor será cobrado na próxima renovação; o acesso atual continua até lá."
          : "Confira a nova composição antes de confirmar.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================================================================
    // DOWNGRADE (B2): agenda o valor menor pro próximo ciclo, preserva acesso.
    // ===================================================================
    if (isDowngrade) {
      // Agenda o ALVO completo (valor + plano + ciclo + módulos + max_users) nos campos
      // pending_*. NÃO mexe em subscription_value, plano, módulos, max_users nem no Asaas —
      // o cliente já pagou o ciclo atual e mantém o acesso integral. O webhook de renovação
      // lê esses pending_* e aplica a troca quando o próximo ciclo virar.
      // FATAL: é o downgrade inteiro. Sem estes campos não existe downgrade nenhum —
      // o webhook de renovação não acha o que aplicar e o cliente continua pagando o
      // valor antigo, enquanto a tela diz "agendado". Nada foi tocado na Asaas neste
      // ramo, então o erro é barato: o usuário repete e a escrita é idempotente.
      await applyWrite(
        "agendamento do downgrade (companies.pending_*)",
        supabase
          .from("companies")
          .update({
            pending_subscription_value: targetMonthlyValue,
            pending_plan_code: plan_code,
            pending_billing_cycle: cycleForDb,
            pending_modules: targetModules,
            pending_max_users: targetMaxUsers,
            pending_nfse_tier: targetNfseTier,
            pending_whatsapp_tier: targetWhatsappTier,
          })
          .eq("id", company_id),
        { rethrow: () => new ValidationError("Não foi possível agendar a mudança de plano. Tente de novo.") },
      );

      // A redução já vale na PRIMEIRA cobrança seguinte. Para subscriptions
      // tradicionais, inclusive a subscription criada por uma autorização de Pix
      // Automático, propagamos o alvo para cobranças futuras já materializadas.
      // Entitlements continuam intactos até o webhook confirmar o pagamento.
      let asaasUpdated = false;
      let asaasWarning: string | null = null;
      const recurrenceId: string | null = company.asaas_subscription_id ?? null;
      if (recurrenceId) {
        try {
          let subscriptionId = recurrenceId.startsWith("sub_") ? recurrenceId : null;
          if (!subscriptionId) {
            const authorization = await asaas.get(
              `/pix/automatic/authorizations/${encodeURIComponent(recurrenceId)}`,
            );
            subscriptionId = typeof authorization?.subscriptionId === "string"
              ? authorization.subscriptionId
              : null;
          }

          if (subscriptionId?.startsWith("sub_")) {
            const yearly = cycleForDb === "yearly";
            await asaas.put(`/subscriptions/${subscriptionId}`, {
              value: subscriptionPeriodValue(targetMonthlyValue, cycleForDb),
              cycle: yearly ? "YEARLY" : "MONTHLY",
              ...(yearly ? { billingType: "UNDEFINED" } : {}),
              updatePendingPayments: true,
            });
            asaasUpdated = true;
          } else {
            asaasWarning =
              "O downgrade foi agendado, mas a cobrança automática futura precisa de conferência.";
          }
        } catch (e) {
          asaasWarning =
            "O downgrade foi agendado, mas não foi possível sincronizar a próxima cobrança com a operadora agora.";
          console.error(`[change-plan] falha ao sincronizar downgrade da recorrência ${recurrenceId}:`, e);
        }
      }

      // Registra a INTENÇÃO de downgrade (plano + módulos + usuários alvo) pra um
      // passo futuro no webhook de renovação aplicar quando o ciclo virar.
      const intent = {
        scheduled_plan: plan_code,
        scheduled_modules: targetModules,
        scheduled_max_users: targetMaxUsers,
        scheduled_extra_users: targetExtraUsers,
        scheduled_billing_cycle: cycleForDb,
        scheduled_value: targetMonthlyValue,
      };
      // NÃO-FATAL: os `pending_*` acima já estão gravados, então o downgrade VAI
      // acontecer com ou sem esta linha. É auditoria; falhar alto faria o usuário
      // repetir uma mudança já agendada.
      await tryWrite(
        "histórico da assinatura (downgrade agendado)",
        supabase.from("subscription_history").insert({
          company_id,
          changed_by: auth.userId ?? null,
          previous_plan: company.subscription_plan ?? null,
          new_plan: company.subscription_plan ?? null, // plano só muda no próximo ciclo
          previous_value: currentEffectiveValue,
          new_value: company.subscription_value ?? currentEffectiveValue, // valor atual não muda agora
          previous_status: company.subscription_status ?? null,
          new_status: company.subscription_status ?? null,
          reason: `Downgrade agendado para o próximo ciclo: ${JSON.stringify(intent)}`,
        }),
        {
          warnings,
          recovery: { company_id, change_kind: "downgrade", scheduled: JSON.stringify(intent) },
        },
      );

      return new Response(
        JSON.stringify({
          success: true,
          change_kind: "downgrade",
          scheduled_value: targetMonthlyValue,
          current_value: company.subscription_value ?? currentEffectiveValue,
          asaas_updated: asaasUpdated,
          asaas_warning: asaasWarning,
          message:
            "Downgrade agendado. Você mantém o plano atual até o fim do período já pago; o novo valor passa a valer na próxima cobrança.",
          ...warnings.toBody(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===================================================================
    // UPGRADE PROPORCIONAL: cria cotacao imutavel e NAO libera acesso.
    // O checkout gera uma cobranca avulsa e o webhook aplica o alvo depois
    // do dinheiro confirmado. Trial/conta inativa continua no fluxo de venda.
    // ===================================================================
    const periodEnd = company.subscription_expires_at
      ? new Date(company.subscription_expires_at)
      : null;
    const now = new Date();
    const canProrate = isUpgrade &&
      company.subscription_status === "active" &&
      periodEnd !== null &&
      Number.isFinite(periodEnd.getTime()) &&
      periodEnd.getTime() > now.getTime();

    if (canProrate) {
      const quote = calculateUpgradeProration({
        now,
        periodEnd: periodEnd!,
        currentCycle,
        targetCycle: cycleForDb,
        currentMonthlyValue: currentEffectiveValue,
        targetMonthlyValue,
      });
      const {
        periodStart,
        remainingRatio,
        sourcePeriodValue,
        targetPeriodValue,
        resetsBillingAnchor,
        creditAmount,
        amountDue,
        nextRenewalAt,
      } = quote;

      // Ajustes residuais menores que o piso do gateway sao concedidos como
      // cortesia e seguem para a aplicacao imediata abaixo.
      if (amountDue >= MIN_UPGRADE_CHARGE) {
        const normalizedModules = [...targetModules].sort();
        const fingerprint = [
          company.subscription_plan ?? "",
          plan_code,
          currentCycle,
          cycleForDb,
          targetMonthlyValue.toFixed(2),
          targetMaxUsers,
          targetExtraUsers,
          targetNfseTier,
          targetWhatsappTier,
          normalizedModules.join(","),
          periodEnd!.toISOString(),
        ].join("|");

        // Libera o fingerprint de cotacoes que venceram antes da cobranca ser criada.
        await applyWrite(
          "expiração de cotação proporcional anterior",
          supabase
            .from("subscription_change_requests")
            .update({ status: "expired" })
            .eq("company_id", company_id)
            .eq("request_fingerprint", fingerprint)
            .eq("status", "pending")
            .lte("expires_at", now.toISOString()),
          { rethrow: () => new ValidationError("Não foi possível renovar a cotação do upgrade.") },
        );

        // Reabrir o mesmo upgrade nao cria varias cotacoes/cobrancas concorrentes.
        const { data: existingRequest } = await supabase
          .from("subscription_change_requests")
          .select("id, amount_due, status, expires_at")
          .eq("company_id", company_id)
          .eq("request_fingerprint", fingerprint)
          .in("status", ["pending", "payment_pending"])
          .gt("expires_at", now.toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let requestId = existingRequest?.id ?? null;
        if (!requestId) {
          const { data: createdRequest, error: requestError } = await supabase
            .from("subscription_change_requests")
            .insert({
              company_id,
              requested_by: auth.userId ?? null,
              source_plan_code: company.subscription_plan ?? null,
              target_plan_code: plan_code,
              source_billing_cycle: currentCycle,
              target_billing_cycle: cycleForDb,
              source_subscription_value: roundSubscriptionMoney(Number(company.subscription_value) || 0),
              source_monthly_value: roundSubscriptionMoney(currentEffectiveValue),
              target_monthly_value: roundSubscriptionMoney(targetMonthlyValue),
              source_period_value: sourcePeriodValue,
              target_period_value: targetPeriodValue,
              credit_amount: creditAmount,
              amount_due: amountDue,
              remaining_ratio: Number(remainingRatio.toFixed(8)),
              period_started_at: periodStart.toISOString(),
              period_ends_at: periodEnd!.toISOString(),
              next_renewal_at: nextRenewalAt.toISOString(),
              resets_billing_anchor: resetsBillingAnchor,
              target_modules: normalizedModules,
              target_max_users: targetMaxUsers,
              target_extra_users: targetExtraUsers,
              source_nfse_tier: currentNfseTier,
              target_nfse_tier: targetNfseTier,
              source_whatsapp_tier: currentWhatsappTier,
              target_whatsapp_tier: targetWhatsappTier,
              request_fingerprint: fingerprint,
              expires_at: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
            })
            .select("id")
            .single();
          if (requestError || !createdRequest) {
            // Corrida do indice parcial: tenta reutilizar a request vencedora.
            const { data: racedRequest } = await supabase
              .from("subscription_change_requests")
              .select("id")
              .eq("company_id", company_id)
              .eq("request_fingerprint", fingerprint)
              .in("status", ["pending", "payment_pending"])
              .maybeSingle();
            if (!racedRequest) {
              console.error("[change-plan] falha ao criar cotacao proporcional:", requestError);
              throw new ValidationError("Não foi possível calcular o upgrade agora. Tente novamente.");
            }
            requestId = racedRequest.id;
          } else {
            requestId = createdRequest.id;
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            change_kind: "upgrade",
            requires_payment: true,
            change_request_id: requestId,
            checkout_url: `/checkout?mode=upgrade&change=${requestId}`,
            amount_due: amountDue,
            credit_amount: creditAmount,
            remaining_ratio: Number(remainingRatio.toFixed(8)),
            next_renewal_at: nextRenewalAt.toISOString(),
            message: "Upgrade preparado. Confirme o pagamento proporcional para liberar os novos recursos.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ===================================================================
    // UPGRADE (B1) ou IGUAL: aplica plano/módulos/max_users/ciclo AGORA.
    // ===================================================================

    // 1) Atualiza companies (service_role — RLS bloqueia o tenant direto).
    const companyUpdate: Record<string, unknown> = {
      subscription_plan: plan_code,
      max_users: targetMaxUsers,
      extra_users: targetExtraUsers,
      billing_cycle: cycleForDb,
      subscription_value: targetMonthlyValue, // upgrade entra já; igual mantém o mesmo
      // Limpa qualquer downgrade agendado anterior — o alvo aplica AGORA, não na renovação.
      pending_subscription_value: null,
      pending_plan_code: null,
      pending_billing_cycle: null,
      pending_modules: null,
      pending_max_users: null,
      pending_nfse_tier: null,
      pending_whatsapp_tier: null,
      nfse_tier: targetNfseTier,
      whatsapp_tier: targetWhatsappTier,
    };
    if (isUpgrade) {
      // O upgrade encerra qualquer promocao do plano anterior. Sem limpar estes
      // campos, a proxima reconciliacao ainda enxergaria o preco promocional antigo.
      companyUpdate.custom_price = null;
      companyUpdate.custom_price_months = null;
      companyUpdate.custom_price_payments_made = 0;
    }
    // FATAL: define quanto o cliente passa a pagar. Roda ANTES de qualquer chamada
    // ao gateway (o PUT no Asaas está no passo 4), então falhar aqui não cobra nada.
    await applyWrite(
      "atualização da assinatura (companies)",
      supabase.from("companies").update(companyUpdate).eq("id", company_id),
      { rethrow: () => new ValidationError("Não foi possível atualizar a assinatura.") },
    );

    // 2) Sincroniza company_modules: remove os atuais e insere os do plano alvo.
    //    FATAL nos dois passos. O DELETE também: se ele falhar em silêncio, o INSERT
    //    logo abaixo tenta recriar módulos que continuam lá — ou esbarra no índice
    //    único (e aí o erro aparece no lugar errado), ou duplica a linha. O par
    //    delete+insert é idempotente, então a retentativa do usuário conserta.
    await applyWrite(
      "limpeza dos módulos atuais (company_modules)",
      supabase.from("company_modules").delete().eq("company_id", company_id),
      { rethrow: () => new ValidationError("Não foi possível sincronizar os módulos do plano.") },
    );
    if (targetModules.length > 0) {
      const inserts = targetModules.map((module_code) => ({
        company_id,
        module_code,
      }));
      await applyWrite(
        "módulos do plano alvo (company_modules)",
        supabase.from("company_modules").insert(inserts),
        { rethrow: () => new ValidationError("Não foi possível sincronizar os módulos do plano.") },
      );
    }

    // 3) Registra no histórico. NÃO-FATAL: o plano e o valor já estão aplicados;
    //    o histórico é auditoria e não muda o que é cobrado.
    await tryWrite(
      "histórico da assinatura (mudança aplicada)",
      supabase.from("subscription_history").insert({
        company_id,
        changed_by: auth.userId ?? null,
        previous_plan: company.subscription_plan ?? null,
        new_plan: plan_code,
        previous_value: currentEffectiveValue,
        new_value: targetMonthlyValue,
        previous_status: company.subscription_status ?? null,
        new_status: company.subscription_status ?? null,
        reason: changeKind === "upgrade"
          ? "Upgrade sem cobrança proporcional (trial, conta inativa ou ajuste abaixo de R$ 5)"
          : "Reorganização de módulos sem mudança de valor",
      }),
      {
        warnings,
        recovery: {
          company_id,
          change_kind: changeKind,
          previous_value: currentEffectiveValue,
          new_value: targetMonthlyValue,
          new_plan: plan_code,
        },
      },
    );

    // 4) Atualiza a assinatura recorrente no Asaas (só em upgrade, só se houver sub_*).
    //    O teste por `sub_` é identificação POSITIVA de assinatura: autorização de
    //    Pix Automático vem como UUID (não `aut_*`), então cai fora por construção.
    //    PIX Automático e ausência de recorrência não são atualizados aqui — o
    //    novo valor passa a valer na próxima cobrança gerada pela recorrência.
    let asaasUpdated = false;
    let asaasWarning: string | null = null;
    if (isUpgrade) {
      const subId: string | null = company.asaas_subscription_id ?? null;
      if (subId && subId.startsWith("sub_")) {
        try {
          await asaas.put(`/subscriptions/${subId}`, {
            value: targetMonthlyValue,
            updatePendingPayments: false, // não recria a cobrança do ciclo atual já gerada
          });
          asaasUpdated = true;
        } catch (e) {
          // Não fingimos sucesso da integração, mas o estado local (que é a fonte da
          // verdade pro gate de acesso) já está aplicado. Reportamos como aviso.
          if (e instanceof AsaasConfigError) {
            asaasWarning = "Integração de pagamento não configurada; valor será ajustado na próxima cobrança.";
          } else {
            asaasWarning = "Não foi possível sincronizar o novo valor com a operadora agora; será ajustado na próxima cobrança.";
          }
          console.error(`[change-plan] falha ao atualizar subscription ${subId} no Asaas:`, e);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        change_kind: changeKind,
        new_value: targetMonthlyValue,
        max_users: targetMaxUsers,
        modules: targetModules,
        asaas_updated: asaasUpdated,
        asaas_warning: asaasWarning,
        message: changeKind === "upgrade"
          ? "Plano atualizado. O ajuste proporcional foi concedido e os recursos já estão liberados."
          : "Plano atualizado com sucesso.",
        ...warnings.toBody(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("change-subscription-plan error:", error);
    let status = 500;
    let message = "Erro ao atualizar o plano.";
    if (error instanceof AsaasConfigError) {
      status = 503;
      message = error.message;
    } else if (error instanceof ValidationError) {
      status = 400;
      message = error.message;
    } else if (error instanceof AsaasApiError) {
      status = 400;
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
