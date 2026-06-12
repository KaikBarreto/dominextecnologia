// create-asaas-payment
// ---------------------
// Cria uma cobrança Asaas para a assinatura SaaS de uma empresa (tenant):
//  - PIX AUTOMÁTICO recorrente (pix_recurring=true) via POST /v3/pix/automatic/authorizations
//    (com fallback para subscription PIX se Pix Automático não estiver disponível);
//  - Assinatura RECORRENTE no cartão via POST /v3/subscriptions;
//  - PIX avulso / BOLETO via POST /v3/payments.
//
// Grava em subscription_payments (status PENDING) e em companies.asaas_subscription_id
// (sub_*/aut_*) nas recorrências. Idempotência: reusa cobrança PENDING < 30min do
// mesmo tipo/valor. externalReference = company_id.
//
// Auth: checkout autenticado (o PRÓPRIO tenant paga sua assinatura) ou painel
// master (verify_jwt = true). Server-side: usuário só age sobre a PRÓPRIA empresa,
// OU é super_admin. Escrita em subscription_payments via service_role (RLS bloqueia
// tenant escrevendo direto).
//
// Adaptado do EcoSistema (supabase/functions/create-asaas-payment/index.ts).
// Divergências de schema: Dominex usa `cnpj` em companies; subscription_payments
// tem `billing_cycle` e `type` (primeira_venda/renovacao) — gravamos ambos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  asaas,
  buildQuery,
  AsaasConfigError,
  AsaasApiError,
  assertAsaasConfigured,
} from "../_shared/asaas-client.ts";
import { authorizeAsaasCompany } from "../_shared/asaas-auth.ts";

class ValidationError extends Error {}

interface CreatePaymentRequest {
  company_id: string;
  billing_type: "PIX" | "CREDIT_CARD" | "BOLETO";
  amount: number;
  description?: string;
  cpf_cnpj?: string;
  pix_recurring?: boolean;
  billing_cycle?: "monthly" | "yearly";
  // Primeira venda: code do plano que o cliente SELECIONOU no checkout. Usado
  // pra validar o `amount` contra o preço desse plano (e não contra o plano
  // antigo guardado na empresa). Ausente em renovação.
  plan_code?: string;
  // Cartão
  card_holder_name?: string;
  card_holder_email?: string;
  card_number?: string;
  card_expiry_month?: string;
  card_expiry_year?: string;
  card_ccv?: string;
  card_holder_cpf?: string;
  card_holder_phone?: string;
  card_holder_postal_code?: string;
  card_holder_address_number?: string;
}

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

    // Falha cedo e claro se a chave não estiver setada.
    assertAsaasConfigured();

    const body: CreatePaymentRequest = await req.json();
    const { company_id, billing_type, amount, description, cpf_cnpj, pix_recurring, billing_cycle, plan_code } = body;

    if (!company_id) throw new ValidationError("company_id é obrigatório.");
    if (!billing_type) throw new ValidationError("Forma de pagamento é obrigatória.");
    if (!amount || amount <= 0) throw new ValidationError("Valor da cobrança inválido.");

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

    // monthly→MONTHLY / yearly→YEARLY (subscription); PIX Automático usa ANNUALLY.
    const asaasCycle = billing_cycle === "yearly" ? "YEARLY" : "MONTHLY";
    const cycleForDb = billing_cycle === "yearly" ? "yearly" : "monthly";

    // ========== IDEMPOTÊNCIA: reusar cobrança PENDING < 30min ==========
    const { data: existingPending } = await supabase
      .from("subscription_payments")
      .select("id, asaas_payment_id, created_at, billing_type, invoice_url, pix_qr_code, pix_copy_paste, pix_expiration_date, due_date, status, amount")
      .eq("company_id", company_id)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingPending && existingPending.length > 0) {
      const existing = existingPending[0];
      const minutesAgo = (Date.now() - new Date(existing.created_at).getTime()) / 1000 / 60;

      // Pix Automático grava aut_* (não pay_*); detecta mudança de modo recorrente.
      const existingIsPixAutomatic = existing.billing_type?.toUpperCase() === "PIX" &&
        existing.asaas_payment_id && !existing.asaas_payment_id.startsWith("pay_");
      const requestingPixAutomatic = billing_type === "PIX" && pix_recurring === true;
      const recurringMismatch = billing_type === "PIX" && (existingIsPixAutomatic !== requestingPixAutomatic);
      const amountMismatch = existing.amount !== amount;

      if (minutesAgo < 30 && existing.billing_type?.toUpperCase() === billing_type && !recurringMismatch && !amountMismatch) {
        // Para boleto, busca linha digitável e bankSlipUrl atuais.
        let bankSlipUrl: string | null = null;
        let identificationField: string | null = null;
        if (billing_type === "BOLETO" && existing.asaas_payment_id) {
          try {
            const idFieldData = await asaas.get(`/payments/${existing.asaas_payment_id}/identificationField`);
            identificationField = idFieldData.identificationField ?? null;
            bankSlipUrl = idFieldData.bankSlipUrl ?? null;
            if (!bankSlipUrl) {
              const paymentInfo = await asaas.get(`/payments/${existing.asaas_payment_id}`);
              bankSlipUrl = paymentInfo.bankSlipUrl ?? null;
            }
          } catch (e) {
            console.error("Erro ao buscar dados do boleto existente:", e);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            payment_id: existing.asaas_payment_id,
            status: existing.status,
            invoice_url: existing.invoice_url,
            bank_slip_url: bankSlipUrl,
            identification_field: identificationField,
            pix_qr_code: existing.pix_qr_code,
            pix_copy_paste: existing.pix_copy_paste,
            pix_expiration_date: existing.pix_expiration_date,
            due_date: existing.due_date,
            local_payment_id: existing.id,
            reused_existing: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Mudança de modo recorrente → invalida a antiga pra não ser reusada.
      if (recurringMismatch && minutesAgo < 30) {
        await supabase
          .from("subscription_payments")
          .update({ status: "CANCELLED" })
          .eq("id", existing.id);
      }
    }

    // --- Empresa ---
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", company_id)
      .single();
    if (companyError || !company) throw new ValidationError("Empresa não encontrada.");

    // ===================================================================
    // VALIDAÇÃO SERVER-SIDE DO VALOR (FURO 3)
    // -------------------------------------------------------------------
    // Não confiar cegamente no `amount` do front. Recalculamos o valor ESPERADO a
    // partir do(s) candidato(s) de base mensal no banco e rejeitamos divergências
    // grosseiras. O `amount` é aceito se bater com QUALQUER base legítima:
    //
    //  - PLANO SELECIONADO (primeira venda): quando o front envia `plan_code` — o
    //    cliente escolheu o plano no checkout, então o preço esperado vem de
    //    subscription_plans.price[plan_code]. NÃO usamos o plano antigo guardado na
    //    empresa (companies.subscription_plan), que numa primeira venda ainda não
    //    reflete a escolha e causava rejeição falsa.
    //  - PLANO GUARDADO da empresa: subscription_plans.price[company.subscription_plan]
    //    (fallback / coerência).
    //  - VALOR EFETIVO da empresa (renovação): custom_price se houver promoção ativa
    //    (custom_price_payments_made < custom_price_months), senão subscription_value.
    //    NUNCA pending_subscription_value (é o PRÓXIMO valor).
    //
    // Esperado por método (regra B9), aplicado a CADA base candidata:
    //  - Cartão: SEMPRE mensal (base).
    //  - PIX/boleto anual à vista: round(base × 12 × 0,8) (−20%).
    //  - PIX/boleto mensal: base.
    //
    // Tolerância: aceitamos divergência de até max(2% do esperado, R$ 0,02) pra absorver
    // arredondamento. Basta UMA base bater. Se NENHUMA base for computável, aplicamos
    // só um PISO: rejeita amount < 50% do maior price de plano disponível; sem nenhuma
    // referência, deixamos passar pra não quebrar fluxo legítimo desconhecido.
    {
      // price do plano por code (subscription_plans.price)
      const planPriceByCode = async (code?: string | null): Promise<number> => {
        if (!code) return 0;
        const { data: planRow } = await supabase
          .from("subscription_plans")
          .select("price")
          .eq("code", code)
          .maybeSingle();
        return Number(planRow?.price) || 0;
      };

      // Base candidata 1: plano SELECIONADO no checkout (primeira venda).
      const selectedPlanPrice = await planPriceByCode(plan_code);
      // Base candidata 2: plano guardado da empresa.
      const storedPlanPrice = company.subscription_plan && company.subscription_plan !== plan_code
        ? await planPriceByCode(company.subscription_plan)
        : 0;

      // Base candidata 3: valor efetivo da empresa (renovação).
      const cp = Number(company.custom_price) || 0;
      const cpMonths = Number(company.custom_price_months) || 0;
      const cpMade = Number(company.custom_price_payments_made) || 0;
      const hasActiveCustomPrice = cp > 0 && cpMonths > 0 && cpMade < cpMonths;
      const effectiveCompanyValue = hasActiveCustomPrice
        ? cp
        : Number(company.subscription_value) || 0;

      // Esperado por método/ciclo a partir de uma base mensal (regra B9).
      const expectedFor = (monthlyBase: number): number => {
        if (billing_type === "CREDIT_CARD") return monthlyBase; // cartão sempre mensal
        if (billing_cycle === "yearly") return Math.round(monthlyBase * 12 * 0.8); // anual −20%
        return monthlyBase;
      };

      // Bases candidatas legítimas (> 0).
      const candidateBases = [selectedPlanPrice, storedPlanPrice, effectiveCompanyValue]
        .filter((b) => b > 0);

      if (candidateBases.length > 0) {
        const matches = candidateBases.some((base) => {
          const expected = expectedFor(base);
          const tolerance = Math.max(expected * 0.02, 0.02);
          return Math.abs(amount - expected) <= tolerance;
        });

        if (!matches) {
          console.error(
            `[valor] divergência: amount=${amount} ` +
              `bases=[${candidateBases.join(",")}] esperados=[${candidateBases.map(expectedFor).join(",")}] ` +
              `(método=${billing_type}, ciclo=${billing_cycle}, plan_code=${plan_code ?? "-"}, ` +
              `customPrice=${hasActiveCustomPrice})`,
          );
          throw new ValidationError("Valor de cobrança inválido.");
        }
      } else {
        // Nenhuma base efetiva. Tenta um piso de segurança contra qualquer plano.
        const anyPlanPrice = Math.max(selectedPlanPrice, storedPlanPrice);
        if (anyPlanPrice > 0 && amount < anyPlanPrice * 0.5) {
          console.error(
            `[valor] abaixo do piso: amount=${amount} planPrice=${anyPlanPrice} (piso 50%)`,
          );
          throw new ValidationError("Valor de cobrança inválido.");
        }
        // Sem plano e sem subscription_value → sem referência confiável; não bloqueamos.
      }
    }

    // --- CPF/CNPJ: da request, senão da empresa ---
    const providedCpfCnpj = cpf_cnpj?.replace(/\D/g, "") || "";
    const companyCpfCnpj = company.cnpj?.replace(/\D/g, "") || "";
    let validCpfCnpj: string | undefined;
    if (providedCpfCnpj.length === 11 || providedCpfCnpj.length === 14) {
      validCpfCnpj = providedCpfCnpj;
    } else if (companyCpfCnpj.length === 11 || companyCpfCnpj.length === 14) {
      validCpfCnpj = companyCpfCnpj;
    }
    if (!validCpfCnpj) throw new ValidationError("CPF ou CNPJ é obrigatório para gerar cobranças.");

    // --- Get or create Asaas customer ---
    let asaasCustomerId = company.asaas_customer_id;
    if (!asaasCustomerId) {
      try {
        const created = await asaas.post(`/customers`, {
          name: company.name,
          email: company.email || undefined,
          cpfCnpj: validCpfCnpj,
          notificationDisabled: true,
        });
        asaasCustomerId = created.id;
      } catch (e) {
        // Se já cadastrado, busca por CPF/CNPJ.
        if (e instanceof AsaasApiError && /já cadastrad/i.test(e.message)) {
          const searchData = await asaas.get(`/customers`, buildQuery({ cpfCnpj: validCpfCnpj }));
          if (searchData?.data?.length > 0) {
            asaasCustomerId = searchData.data[0].id;
          } else {
            throw new ValidationError("Não foi possível localizar ou criar o cliente na Asaas.");
          }
        } else {
          throw e;
        }
      }
      await supabase.from("companies").update({ asaas_customer_id: asaasCustomerId }).eq("id", company_id);
    } else {
      // Garante CPF/CNPJ atualizado no customer existente.
      try {
        await asaas.put(`/customers/${asaasCustomerId}`, {
          cpfCnpj: validCpfCnpj,
          notificationDisabled: true,
        });
      } catch (e) {
        if (e instanceof AsaasApiError && /já cadastrad/i.test(e.message)) {
          const searchData = await asaas.get(`/customers`, buildQuery({ cpfCnpj: validCpfCnpj }));
          if (searchData?.data?.length > 0) {
            asaasCustomerId = searchData.data[0].id;
            await supabase.from("companies").update({ asaas_customer_id: asaasCustomerId }).eq("id", company_id);
          }
        } else {
          throw e;
        }
      }
    }

    // Determina se é primeira venda ou renovação (grava em subscription_payments.type).
    const isFirstSale = company.subscription_status === "testing" ||
      company.subscription_status === "Testando" ||
      company.subscription_status === "trial";
    const paymentType = isFirstSale ? "primeira_venda" : "renovacao";

    // --- Vencimento ---
    const subscriptionExpiresAt = company.subscription_expires_at
      ? new Date(company.subscription_expires_at)
      : new Date();
    const dueDate = new Date(subscriptionExpiresAt);
    if (dueDate < new Date()) {
      dueDate.setTime(Date.now());
      dueDate.setDate(dueDate.getDate() + 1);
    }
    const dueDateStr = dueDate.toISOString().split("T")[0];

    // "Hoje" em America/Sao_Paulo (UTC-3 fixo Dominex). Usado SÓ no cartão: como o
    // cartão é informado no ato do checkout, a 1ª cobrança deve ser debitada HOJE —
    // se mandarmos nextDueDate no futuro, a Asaas AGENDA em vez de debitar na hora
    // (incidente CLIMATIZE). PIX/boleto mantêm o dueDateStr (janela de pagamento).
    const todayBRT = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()); // "YYYY-MM-DD"

    // --- Helper: cancela subscriptions ativas existentes (evita duplicidade) ---
    const cancelExistingSubscriptions = async (customerId: string) => {
      try {
        const existing = await asaas.get(`/subscriptions`, buildQuery({ customer: customerId, status: "ACTIVE" }));
        const activeSubs = existing?.data || [];
        for (const sub of activeSubs) {
          try {
            await asaas.delete(`/subscriptions/${sub.id}`);
          } catch (e) {
            console.error(`Falha ao cancelar subscription ${sub.id}:`, e);
          }
        }
      } catch (e) {
        console.error("Erro ao verificar/cancelar subscriptions existentes:", e);
      }
    };

    // ===================================================================
    // PIX AUTOMÁTICO recorrente
    // ===================================================================
    if (billing_type === "PIX" && pix_recurring) {
      const asaasFrequency = billing_cycle === "yearly" ? "ANNUALLY" : "MONTHLY";
      await cancelExistingSubscriptions(asaasCustomerId!);

      const contractId = `DMX-${company_id.substring(0, 8)}-${Date.now().toString(36)}`.substring(0, 35);
      const authorizationPayload = {
        frequency: asaasFrequency,
        contractId,
        startDate: dueDateStr,
        customerId: asaasCustomerId,
        value: amount,
        description: `Dominex - ${company.name}`.substring(0, 35),
        immediateQrCode: {
          expirationSeconds: 86400,
          originalValue: amount,
        },
      };

      let authData: any;
      try {
        authData = await asaas.post(`/pix/automatic/authorizations`, authorizationPayload);
      } catch (e) {
        // ---- Fallback: subscription PIX padrão ----
        console.log("Pix Automático indisponível, usando subscription PIX padrão:", (e as Error).message);
        const subscriptionData = await asaas.post(`/subscriptions`, {
          customer: asaasCustomerId,
          billingType: "PIX",
          cycle: asaasCycle,
          value: amount,
          nextDueDate: dueDateStr,
          description: description || `Assinatura Dominex - ${company.name}`,
          externalReference: company_id,
        });

        await supabase.from("companies").update({
          asaas_subscription_id: subscriptionData.id,
          payment_method: "pix",
        }).eq("id", company_id);

        // Busca primeiro payment real (pay_*) da subscription pro QR Code.
        let firstPaymentId: string | null = null;
        let pixQrCode: string | null = null;
        let pixCopyPaste: string | null = null;
        let pixExpirationDate: string | null = null;
        try {
          const paymentsData = await asaas.get(`/subscriptions/${subscriptionData.id}/payments`);
          if (paymentsData?.data?.length > 0) {
            firstPaymentId = paymentsData.data[0].id;
            const pixData = await asaas.get(`/payments/${firstPaymentId}/pixQrCode`);
            pixQrCode = pixData.encodedImage ?? null;
            pixCopyPaste = pixData.payload ?? null;
            const exp = new Date();
            exp.setHours(exp.getHours() + 24);
            pixExpirationDate = exp.toISOString();
          }
        } catch (err) {
          console.error("Erro ao buscar QR Code do fallback PIX:", err);
        }

        const { data: savedPayment } = await supabase
          .from("subscription_payments")
          .insert({
            company_id,
            asaas_payment_id: firstPaymentId,
            asaas_customer_id: asaasCustomerId,
            amount,
            status: "PENDING",
            payment_method: "pix",
            billing_type: "PIX",
            billing_cycle: cycleForDb,
            type: paymentType,
            pix_qr_code: pixQrCode,
            pix_copy_paste: pixCopyPaste,
            pix_expiration_date: pixExpirationDate,
            invoice_url: subscriptionData.invoiceUrl,
            due_date: dueDateStr,
          })
          .select()
          .single();

        return new Response(
          JSON.stringify({
            success: true,
            payment_id: firstPaymentId,
            status: "PENDING",
            invoice_url: subscriptionData.invoiceUrl,
            pix_qr_code: pixQrCode,
            pix_copy_paste: pixCopyPaste,
            pix_expiration_date: pixExpirationDate,
            due_date: dueDateStr,
            local_payment_id: savedPayment?.id,
            subscription_id: subscriptionData.id,
            is_recurring: true,
            pix_automatic: false,
            fallback: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // ---- Pix Automático criado ----
      const pixQrCode = authData.encodedImage || null;
      const pixCopyPaste = authData.payload || null;
      const pixExpirationDate = authData.immediateQrCode?.expirationDate
        ? new Date(authData.immediateQrCode.expirationDate).toISOString()
        : (() => { const d = new Date(); d.setHours(d.getHours() + 24); return d.toISOString(); })();

      await supabase.from("companies").update({
        asaas_subscription_id: authData.id, // aut_* / id da authorization
        payment_method: "pix",
      }).eq("id", company_id);

      // Busca primeiro payment real (pay_*) da authorization — o webhook chega com pay_*.
      let realFirstPaymentId: string | null = null;
      try {
        const subPayments = await asaas.get(`/payments`, buildQuery({ subscription: authData.id, limit: 1, order: "ASC" }));
        if (subPayments?.data?.length > 0) realFirstPaymentId = subPayments.data[0].id;
      } catch (e) {
        console.log(`[pix-auto] sem payment ainda para auth ${authData.id}:`, (e as Error).message);
      }

      const savedAsaasPaymentId = realFirstPaymentId || authData.id;
      const { data: savedPayment } = await supabase
        .from("subscription_payments")
        .insert({
          company_id,
          asaas_payment_id: savedAsaasPaymentId,
          asaas_customer_id: asaasCustomerId,
          amount,
          status: "PENDING",
          payment_method: "pix",
          billing_type: "PIX",
          billing_cycle: cycleForDb,
          type: paymentType,
          pix_qr_code: pixQrCode,
          pix_copy_paste: pixCopyPaste,
          pix_expiration_date: pixExpirationDate,
          due_date: dueDateStr,
        })
        .select()
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          payment_id: authData.id,
          status: authData.status || "PENDING",
          pix_qr_code: pixQrCode,
          pix_copy_paste: pixCopyPaste,
          pix_expiration_date: pixExpirationDate,
          due_date: dueDateStr,
          local_payment_id: savedPayment?.id,
          authorization_id: authData.id,
          is_recurring: true,
          pix_automatic: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===================================================================
    // CARTÃO DE CRÉDITO recorrente (subscription)
    // ===================================================================
    if (billing_type === "CREDIT_CARD" && body.card_number) {
      await cancelExistingSubscriptions(asaasCustomerId!);

      // B9 (revisado): no CARTÃO a cobrança é SEMPRE mensal recorrente, sem
      // desconto anual e sem parcelamento. Ignoramos o billing_cycle escolhido:
      // forçamos cycle = MONTHLY e value = preço mensal base. O front já envia
      // `amount` como o mensal cheio (sem aplicar os 20% do anual), mas, por
      // segurança server-side, derivamos o mensal do amount caso venha anual
      // (amount / 12 quando o ciclo é yearly), garantindo que nunca cobremos o
      // anual cheio de uma vez no cartão.
      const monthlyCardValue = billing_cycle === "yearly"
        ? Math.round((amount / 12) * 100) / 100
        : amount;

      // nextDueDate = HOJE (BRT): o cartão foi informado agora, então a 1ª cobrança
      // deve ser debitada IMEDIATAMENTE. Com dueDateStr (+N dias) a Asaas agendava a
      // cobrança pro futuro em vez de processar o cartão na hora (incidente CLIMATIZE).
      const subscriptionData = await asaas.post(`/subscriptions`, {
        customer: asaasCustomerId,
        billingType: "CREDIT_CARD",
        cycle: "MONTHLY",
        value: monthlyCardValue,
        nextDueDate: todayBRT,
        description: description || `Assinatura Dominex - ${company.name}`,
        externalReference: company_id,
        creditCard: {
          holderName: body.card_holder_name,
          number: body.card_number?.replace(/\D/g, ""),
          expiryMonth: body.card_expiry_month,
          expiryYear: body.card_expiry_year,
          ccv: body.card_ccv,
        },
        creditCardHolderInfo: {
          name: body.card_holder_name,
          email: body.card_holder_email || "",
          cpfCnpj: body.card_holder_cpf?.replace(/\D/g, ""),
          phone: body.card_holder_phone?.replace(/\D/g, ""),
          postalCode: body.card_holder_postal_code?.replace(/\D/g, ""),
          addressNumber: body.card_holder_address_number,
        },
      });

      await supabase.from("companies").update({
        asaas_subscription_id: subscriptionData.id,
        payment_method: "credit_card",
      }).eq("id", company_id);

      // sub_* não é payment.id — webhook PAYMENT_CREATED preenche pay_* depois e
      // PAYMENT_CONFIRMED/RECEIVED é quem confirma de fato (ativa a empresa + credita LTV
      // via credit_ltv_once_for_payment). subscription.status === "ACTIVE" significa apenas
      // que a assinatura recorrente foi criada no Asaas — NÃO que a 1ª cobrança foi paga.
      // Gravar CONFIRMED aqui criava "Pago" falso (linha CONFIRMED com asaas_payment_id/
      // paid_at/ltv_credited_at nulos, empresa seguia pending_payment, LTV=0 — incidente
      // CLIMATIZE). Por isso o cartão SEMPRE entra PENDING; o webhook reconcilia esta linha
      // (PAYMENT_CREATED linka o pay_* nela; PAYMENT_CONFIRMED dá UPDATE pra CONFIRMED).
      const firstPaymentStatus = "PENDING";

      const { data: savedPayment } = await supabase
        .from("subscription_payments")
        .insert({
          company_id,
          asaas_payment_id: null,
          asaas_customer_id: asaasCustomerId,
          // No cartão a cobrança é mensal: gravamos o valor mensal e o ciclo
          // "monthly" pra refletir o que a Asaas vai cobrar de fato.
          amount: monthlyCardValue,
          status: firstPaymentStatus,
          payment_method: "credit_card",
          billing_type,
          billing_cycle: "monthly",
          type: paymentType,
          invoice_url: subscriptionData.invoiceUrl,
          // Cartão debita HOJE (BRT), igual ao nextDueDate enviado à Asaas.
          due_date: todayBRT,
        })
        .select()
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          payment_id: null,
          status: firstPaymentStatus,
          invoice_url: subscriptionData.invoiceUrl,
          due_date: todayBRT,
          local_payment_id: savedPayment?.id,
          subscription_id: subscriptionData.id,
          is_recurring: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===================================================================
    // PIX avulso e BOLETO (cobrança única)
    // ===================================================================
    const payment = await asaas.post(`/payments`, {
      customer: asaasCustomerId,
      billingType: billing_type,
      value: amount,
      dueDate: dueDateStr,
      description: description || `Assinatura Dominex - ${company.name}`,
      externalReference: company_id,
      interest: { value: 1, type: "PERCENTAGE" }, // juros 1% (decisão Asaas)
      fine: { value: 2, type: "PERCENTAGE" },      // multa 2% (decisão Asaas)
    });

    let pixQrCode: string | null = null;
    let pixCopyPaste: string | null = null;
    let pixExpirationDate: string | null = null;
    if (billing_type === "PIX") {
      try {
        const pixData = await asaas.get(`/payments/${payment.id}/pixQrCode`);
        pixQrCode = pixData.encodedImage ?? null;
        pixCopyPaste = pixData.payload ?? null;
        const exp = new Date();
        exp.setHours(exp.getHours() + 24);
        pixExpirationDate = exp.toISOString();
      } catch (e) {
        console.error("Erro ao buscar QR Code PIX:", e);
      }
    }

    let identificationField: string | null = null;
    if (billing_type === "BOLETO") {
      try {
        const idFieldData = await asaas.get(`/payments/${payment.id}/identificationField`);
        identificationField = idFieldData.identificationField ?? null;
      } catch (e) {
        console.error("Erro ao buscar linha digitável do boleto:", e);
      }
    }

    const { data: savedPayment } = await supabase
      .from("subscription_payments")
      .insert({
        company_id,
        asaas_payment_id: payment.id,
        asaas_customer_id: asaasCustomerId,
        amount,
        status: payment.status || "PENDING",
        payment_method: billing_type.toLowerCase(),
        billing_type,
        billing_cycle: cycleForDb,
        type: paymentType,
        pix_qr_code: pixQrCode,
        pix_copy_paste: pixCopyPaste,
        pix_expiration_date: pixExpirationDate,
        invoice_url: payment.invoiceUrl,
        due_date: dueDateStr,
      })
      .select()
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: payment.id,
        status: payment.status,
        invoice_url: payment.invoiceUrl,
        bank_slip_url: payment.bankSlipUrl,
        identification_field: identificationField,
        pix_qr_code: pixQrCode,
        pix_copy_paste: pixCopyPaste,
        pix_expiration_date: pixExpirationDate,
        due_date: dueDateStr,
        local_payment_id: savedPayment?.id,
        is_recurring: false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("create-asaas-payment error:", error);
    let status = 500;
    let message = "Erro ao gerar cobrança.";
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
