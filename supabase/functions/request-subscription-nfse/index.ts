// deno-lint-ignore-file no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  asaas,
  AsaasApiError,
  AsaasConfigError,
  buildQuery,
} from "../_shared/asaas-client.ts";
import { authorizeAsaasCompany } from "../_shared/asaas-auth.ts";
import {
  parseSubscriptionNfseConfig,
  safeInvoiceErrorMessage,
  subscriptionNfseTypeLabel,
} from "../_shared/subscription-nfse.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GENERIC_ERROR =
  "Não foi possível solicitar a nota fiscal agora. Tente novamente.";
const CONFIG_ERROR =
  "A emissão de nota fiscal da assinatura ainda não está configurada. Fale com o suporte.";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AsaasPaymentSnapshot {
  status?: string | null;
  value?: number | null;
  customer?: string | null;
  externalReference?: string | null;
}

interface AsaasInvoiceSnapshot {
  id: string;
  status?: string | null;
  pdfUrl?: string | null;
  xmlUrl?: string | null;
  number?: string | number | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function missingCompanyFields(company: Record<string, unknown>): string[] {
  const fields: string[] = [];
  const document = clean(company.cnpj).replace(/\D/g, "");
  const postalCode = clean(company.zip_code).replace(/\D/g, "");
  if (document.length !== 11 && document.length !== 14) fields.push("CPF/CNPJ");
  if (!clean(company.email)) fields.push("e-mail");
  if (!clean(company.phone)) fields.push("telefone");
  if (!clean(company.address)) fields.push("endereço");
  if (!clean(company.address_number) && !clean(company.street_number)) {
    fields.push("número");
  }
  if (!clean(company.neighborhood)) fields.push("bairro");
  if (postalCode.length !== 8) fields.push("CEP");
  return fields;
}

function incompleteMessage(fields: string[]): string {
  const last = fields.at(-1);
  const joined = fields.length <= 1
    ? (last || "dados cadastrais")
    : `${fields.slice(0, -1).join(", ")} e ${last}`;
  return `Para emitir a nota, complete ${joined} no cadastro da empresa e tente novamente.`;
}

function isPaidStatus(status: unknown): boolean {
  const normalized = String(status || "").toUpperCase();
  return normalized === "RECEIVED" || normalized === "CONFIRMED";
}

function paymentReferenceBelongsToCompany(
  reference: unknown,
  companyId: string,
): boolean {
  const normalized = clean(reference);
  if (!normalized || normalized === companyId) return true;
  return normalized.startsWith("upgrade:") && normalized.endsWith(`:${companyId}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const persistError = async (
    paymentId: string,
    companyId: string,
    message: string,
  ): Promise<void> => {
    const { error } = await supabase
      .from("subscription_payments")
      .update({
        nfse_status: "ERROR",
        nfse_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId)
      .eq("company_id", companyId);
    if (error) {
      console.error(
        "[request-subscription-nfse] falha ao persistir erro:",
        error.message,
      );
    }
  };
  let currentPaymentId = "";
  let currentCompanyId = "";

  try {
    let paymentId = "";
    try {
      const body = await req.json();
      paymentId = clean(body?.payment_id);
    } catch {
      return json({ error: "Requisição inválida." }, 400);
    }
    if (!UUID_RE.test(paymentId)) {
      return json({ error: "Pagamento inválido." }, 400);
    }
    // Primeiro autentica sem confiar em company_id do navegador. A empresa alvo
    // será sempre derivada da linha persistida do pagamento.
    const auth = await authorizeAsaasCompany(
      supabase,
      req.headers.get("Authorization"),
      null,
    );
    if (!auth.ok) return json({ error: auth.message }, auth.status || 401);

    let paymentQuery = supabase
      .from("subscription_payments")
      .select(
        "id, company_id, asaas_payment_id, asaas_customer_id, amount, status, paid_at, type, nfse_status, nfse_invoice_id, nfse_pdf_url, nfse_xml_url, nfse_number",
      )
      .eq("id", paymentId);
    if (!auth.isSuperAdmin) {
      paymentQuery = paymentQuery.eq("company_id", auth.userCompanyId);
    }
    const { data: payment, error: paymentError } = await paymentQuery
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return json({ error: "Pagamento não encontrado." }, 404);

    if (!auth.isSuperAdmin) {
      const [{ data: isAdmin, error: adminError }, { data: isManager, error: managerError }] =
        await Promise.all([
          supabase.rpc("has_role", { _user_id: auth.userId, _role: "admin" }),
          supabase.rpc("has_role", { _user_id: auth.userId, _role: "gestor" }),
        ]);
      if (adminError || managerError) throw adminError || managerError;
      if (!isAdmin && !isManager) {
        return json({ error: "Somente administradores e gestores podem solicitar a nota fiscal." }, 403);
      }
    }

    if (!isPaidStatus(payment.status) && !payment.paid_at) {
      return json({
        error: "A nota fiscal fica disponível após a confirmação do pagamento.",
      }, 400);
    }
    if (!payment.asaas_payment_id) {
      return json({
        error:
          "Este pagamento não está vinculado a uma cobrança. Fale com o suporte.",
      }, 400);
    }

    const currentNfseStatus = clean(payment.nfse_status).toUpperCase();
    let failedNfse = ["ERROR", "CANCELED", "CANCELLED"].includes(currentNfseStatus);
    if (payment.nfse_invoice_id && !failedNfse) {
      const invoice = await asaas.get<AsaasInvoiceSnapshot>(
        `/invoices/${payment.nfse_invoice_id}`,
      );
      const invoiceStatus = clean(invoice.status).toUpperCase() || currentNfseStatus || "PROCESSING";
      const reconciledFailure = ["ERROR", "CANCELED", "CANCELLED"].includes(invoiceStatus);
      const { error: reconcileError } = await supabase
        .from("subscription_payments")
        .update({
          nfse_status: invoiceStatus,
          nfse_pdf_url: clean(invoice.pdfUrl) || payment.nfse_pdf_url || null,
          nfse_xml_url: clean(invoice.xmlUrl) || payment.nfse_xml_url || null,
          nfse_number: invoice.number == null ? payment.nfse_number : String(invoice.number),
          nfse_error: reconciledFailure ? safeInvoiceErrorMessage() : null,
          nfse_requested_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id)
        .eq("company_id", payment.company_id)
        .eq("nfse_invoice_id", payment.nfse_invoice_id);
      if (reconcileError) throw reconcileError;
      if (!reconciledFailure) return json({ status: "recovered" });
      failedNfse = true;
    }
    if (payment.nfse_pdf_url && !failedNfse) {
      return json({ status: "already" });
    }

    const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: claimed, error: claimError } = await supabase.rpc(
      "claim_subscription_payment_nfse",
      {
        p_payment_id: payment.id,
        p_company_id: payment.company_id,
        p_stale_before: staleBefore,
      },
    );
    if (claimError) throw claimError;
    if (!claimed) return json({ status: "already" });
    currentPaymentId = payment.id;
    currentCompanyId = payment.company_id;

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(
        "id, name, cnpj, email, phone, address, address_number, street_number, complement, neighborhood, zip_code, asaas_customer_id",
      )
      .eq("id", payment.company_id)
      .single();
    if (companyError || !company) {
      throw companyError || new Error("company_not_found");
    }

    const missing = missingCompanyFields(company);
    if (missing.length > 0) {
      const message = incompleteMessage(missing);
      await persistError(payment.id, payment.company_id, message);
      return json(
        { error: message, code: "cadastro_incompleto", missing },
        400,
      );
    }

    let fiscalConfig;
    try {
      fiscalConfig = parseSubscriptionNfseConfig(
        Deno.env.get("DOMINEX_SUBSCRIPTION_NFSE_CONFIG"),
      );
    } catch (error) {
      console.error(
        "[request-subscription-nfse] configuração fiscal inválida:",
        (error as Error).message,
      );
      await persistError(payment.id, payment.company_id, CONFIG_ERROR);
      return json(
        { error: CONFIG_ERROR, code: "configuracao_fiscal_pendente" },
        503,
      );
    }

    // Reconciliamos com a cobrança real antes de emitir, mas o valor da nota
    // continua vindo da linha persistida (fonte canônica do billing Dominex).
    const remotePayment = await asaas.get<AsaasPaymentSnapshot>(
      `/payments/${payment.asaas_payment_id}`,
    );
    if (!isPaidStatus(remotePayment?.status)) {
      const message =
        "O pagamento ainda não consta como confirmado no Asaas. Aguarde e tente novamente.";
      await persistError(payment.id, payment.company_id, message);
      return json({ error: message }, 409);
    }
    const amount = Number(payment.amount);
    const remoteAmount = Number(remotePayment.value);
    if (
      !Number.isFinite(amount) || amount <= 0 ||
      !Number.isFinite(remoteAmount) || remoteAmount <= 0 ||
      Math.abs(remoteAmount - amount) > 0.01
    ) {
      console.error(
        `[request-subscription-nfse] divergência de valor no pagamento ${payment.id}`,
      );
      const message =
        "O valor do pagamento precisa ser conferido antes da emissão. Fale com o suporte.";
      await persistError(payment.id, payment.company_id, message);
      return json({ error: message }, 409);
    }

    const remoteCustomerId = clean(remotePayment.customer);
    const expectedCustomerIds = [
      clean(payment.asaas_customer_id),
      clean(company.asaas_customer_id),
    ].filter(Boolean);
    const customerMismatch = !remoteCustomerId || expectedCustomerIds.some((id) =>
      id !== remoteCustomerId
    );
    const referenceMismatch = !paymentReferenceBelongsToCompany(
      remotePayment.externalReference,
      payment.company_id,
    );
    if (customerMismatch || referenceMismatch) {
      console.error(
        `[request-subscription-nfse] identidade divergente no pagamento ${payment.id}`,
      );
      const message =
        "O vínculo do pagamento com a empresa precisa ser conferido. Fale com o suporte.";
      await persistError(payment.id, payment.company_id, message);
      return json({ error: message }, 409);
    }
    const customerId = remoteCustomerId;
    if (!customerId) {
      const message =
        "O cadastro financeiro da empresa precisa ser conferido. Fale com o suporte.";
      await persistError(payment.id, payment.company_id, message);
      return json({ error: message }, 409);
    }

    await asaas.put(`/customers/${customerId}`, {
      name: company.name,
      email: company.email,
      phone: company.phone,
      cpfCnpj: clean(company.cnpj).replace(/\D/g, ""),
      address: company.address,
      addressNumber: company.address_number || company.street_number,
      complement: company.complement || undefined,
      province: company.neighborhood,
      postalCode: clean(company.zip_code).replace(/\D/g, ""),
    });

    // Recupera uma nota criada antes de uma eventual queda entre POST /invoices
    // e o UPDATE local. Isso fecha a janela de duplicidade após retry tardio.
    const existing = await asaas.get<{ data?: AsaasInvoiceSnapshot[] }>(
      "/invoices",
      buildQuery({ payment: payment.asaas_payment_id, limit: 100 }),
    );
    const recoverable = (existing.data || []).find((invoice) =>
      !["ERROR", "CANCELED", "CANCELLED"].includes(
        String(invoice?.status || "").toUpperCase(),
      )
    );

    const typeLabel = subscriptionNfseTypeLabel(payment.type);
    const invoice = recoverable ||
      await asaas.post<AsaasInvoiceSnapshot>("/invoices", {
        payment: payment.asaas_payment_id,
        externalReference: `dominex_subscription_payment:${payment.id}`,
        serviceDescription:
          `${typeLabel} - ${company.name} - Assinatura Dominex (software de gestão empresarial)`,
        observations: `${typeLabel} da assinatura Dominex`,
        value: amount,
        deductions: 0,
        effectiveDate: todayInSaoPaulo(),
        ...fiscalConfig,
      });

    const { error: updateError } = await supabase
      .from("subscription_payments")
      .update({
        nfse_status: clean(invoice.status).toUpperCase() || "SCHEDULED",
        nfse_invoice_id: invoice.id,
        nfse_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .eq("company_id", payment.company_id);
    if (updateError) {
      // O webhook ainda consegue casar por invoice.payment/asaas_payment_id.
      console.error(
        "[request-subscription-nfse] invoice criada, mas vínculo local falhou:",
        updateError.message,
      );
    }

    return json({ status: recoverable ? "recovered" : "processing" });
  } catch (error) {
    const known = error instanceof AsaasApiError ||
      error instanceof AsaasConfigError;
    const clientMessage = known ? safeInvoiceErrorMessage() : GENERIC_ERROR;
    console.error(
      "[request-subscription-nfse] falha:",
      error instanceof Error ? error.message : error,
    );
    if (currentPaymentId) {
      await persistError(currentPaymentId, currentCompanyId, clientMessage);
    }
    return json({ error: clientMessage }, known ? 400 : 500);
  }
});
