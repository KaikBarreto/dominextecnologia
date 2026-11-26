// get-tenant-payment-checkout
// ---------------------------
// PÚBLICA, sem sessão. Gate = public_short_code válido de uma tenant_charge não-cancelada.
// Retorna um payload ALLOWLIST ESTRITA pro checkout público do cliente final.
//
// SEGURANÇA (memória do time: to_jsonb(*) vaza custo/margem): montamos o objeto de
// resposta campo a campo. NUNCA expor net_value, source_id, customer_id cru,
// externalReference, chaves, nem qualquer campo interno.
//
// Identidade de quem cobra (regra-lei "a Dominex é a plataforma; quem aparece pro
// cliente final é o tenant"): o NOME exibido é SEMPRE o do tenant. Logo e cor de
// marca continuam condicionados a `white_label_enabled` — sem white-label a tela
// mostra só o nome, sem logo nenhum e com o fundo escuro neutro.
//
// IDENTIFICAÇÃO DO EMISSOR (2026-09-07, autorizado pelo CEO): endereço, telefone,
// e-mail e CNPJ do tenant entram no payload SÓ quando o toggle
// `show_*_in_documents` correspondente permite. O filtro roda AQUI, no servidor —
// campo escondido na UI mas presente no JSON seria vazamento numa rota anônima.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { vaultReadSecret } from "../_shared/payments-auth.ts";
import { asaasFor } from "../_shared/asaas-tenant-client.ts";
import {
  type CardFeeTable,
  FALLBACK_CARD_FEES,
  resolveTenantCardFees,
} from "../_shared/asaas-card-fees.ts";
import {
  buildCustomerInstallmentOptions,
  type CustomerInstallmentOption,
  effectiveCustomerMaxInstallments,
  normalizeFeePayer,
} from "../_shared/customer-installments.ts";

/** Status em que a cobrança ainda pode ser paga (só aí oferecemos parcelas). */
const PAYABLE_LOCAL_STATUSES = new Set(["PENDING", "OVERDUE"]);

// Nome do EMISSOR: em cobrança, quem aparece é SEMPRE o tenant (decisão do CEO,
// 2026-09-07). A Dominex é a PLATAFORMA — pode aparecer no rodapé/selo, nunca
// como quem está cobrando: o pagador vendo "Dominex" com o CNPJ da Glacial
// acharia que está pagando pra Dominex, e errar o credor não é estética, é risco.
// Só usado se `company_settings.name` vier vazio (coluna é NOT NULL; é guarda).
const FALLBACK_ISSUER_NAME = "Empresa emissora";

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=15",
    },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // short_code por query (?short_code=) ou por path (/.../<short_code>) ou body.
  let shortCode = new URL(req.url).searchParams.get("short_code") ?? "";
  if (!shortCode) {
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    shortCode = parts[parts.length - 1] ?? "";
    if (shortCode === "get-tenant-payment-checkout") shortCode = "";
  }
  if (!shortCode && req.method === "POST") {
    try {
      const b = await req.json();
      shortCode = (b?.short_code ?? "").toString();
    } catch { /* ignore */ }
  }
  shortCode = shortCode.trim();
  if (!shortCode) {
    return json(req, { error: "Cobrança não encontrada." }, 404);
  }
  // Guarda de formato barata (o short_code é base32 sem ambíguos, 8–16 chars).
  // Rejeita lixo cedo (não bate no banco com valores enormes/estranhos).
  if (!/^[a-z2-9]{6,24}$/.test(shortCode)) {
    return json(req, { error: "Cobrança não encontrada." }, 404);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // SELECT explícito (nunca *): só as colunas necessárias.
    const { data: charge } = await supabase
      .from("tenant_charges")
      .select(
        "company_id, value, due_date, description, status, billing_type, invoice_url, pix_copy_paste, boleto_url, public_short_code, payment_date, customer_max_installments, card_fee_payer, base_value",
      )
      .eq("public_short_code", shortCode)
      .maybeSingle();

    if (!charge) {
      return json(req, { error: "Cobrança não encontrada." }, 404);
    }
    // Gate: não expõe cobrança cancelada/deletada.
    if (String(charge.status).toUpperCase() === "CANCELLED" || String(charge.status).toUpperCase() === "DELETED") {
      return json(req, { error: "Esta cobrança não está mais disponível." }, 404);
    }

    // Cartão no checkout PRÓPRIO: o pagador informa o cartão na nossa página
    // (edge `tenant-asaas-pay-charge-card`) em vez de ir pra fatura hospedada.
    // Só expomos o BOOLEANO da preferência do tenant (allow_card) — nunca a
    // config toda da conta de pagamento. Conta inativa/sem chave → sem cartão
    // in-house (o link hospedado segue como fallback).
    const { data: payAccount } = await supabase
      .from("tenant_payment_accounts")
      .select(
        "status, allow_card, vault_secret_name, default_max_installments, card_fee_override, card_fees_cache, card_fees_synced_at",
      )
      .eq("company_id", charge.company_id)
      .maybeSingle();
    const cardInHouseEnabled =
      payAccount?.status === "active" && payAccount?.allow_card !== false;

    // ── "Cliente escolhe as parcelas" ────────────────────────────────────────
    // Opções 1..teto calculadas AQUI, com a MESMA régua que o
    // tenant-asaas-pay-charge-card usa para cobrar (customer-installments.ts +
    // gross-up de asaas-card-fees.ts). Sai só count/parcela/total por opção e
    // um booleano "sem juros". Taxa, líquido, base_value e quem paga a taxa
    // NUNCA saem desta rota anônima.
    let installmentOptions: CustomerInstallmentOption[] | null = null;
    let installmentsInterestFree: boolean | null = null;
    const localStatus = String(charge.status ?? "").toUpperCase();
    const customerMax = effectiveCustomerMaxInstallments(
      charge.customer_max_installments,
      payAccount?.default_max_installments,
    );
    const baseValue = Number(charge.base_value);
    if (
      cardInHouseEnabled &&
      String(charge.billing_type ?? "").toUpperCase() === "CREDIT_CARD" &&
      customerMax !== null &&
      !charge.payment_date &&
      PAYABLE_LOCAL_STATUSES.has(localStatus) &&
      Number.isFinite(baseValue) && baseValue > 0
    ) {
      try {
        const feePayer = normalizeFeePayer(charge.card_fee_payer);
        // A tabela de taxa só importa quando o CLIENTE paga a taxa. Com a
        // empresa pagando, o total é base_value em toda opção (sem juros) e a
        // tabela não entra na conta: nem lemos o Vault.
        let fees: CardFeeTable | null = feePayer === "company" ? FALLBACK_CARD_FEES : null;
        if (!fees) {
          const apiKey = payAccount?.vault_secret_name
            ? await vaultReadSecret(supabase, payAccount.vault_secret_name)
            : null;
          if (apiKey) {
            fees = (await resolveTenantCardFees({
              account: payAccount as Record<string, unknown>,
              asaas: asaasFor(apiKey),
              nowMs: Date.now(),
              persistCache: async (table) => {
                await supabase
                  .from("tenant_payment_accounts")
                  .update({ card_fees_cache: table, card_fees_synced_at: new Date().toISOString() })
                  .eq("company_id", charge.company_id);
              },
            })).fees;
          }
        }
        if (fees) {
          installmentOptions = buildCustomerInstallmentOptions({
            baseValue,
            oneTimeValue: Number(charge.value),
            maxInstallments: customerMax,
            feePayer,
            fees,
          });
          installmentsInterestFree = feePayer === "company";
        }
      } catch (e) {
        // Sem opções = o checkout cai no 1x de sempre (a cobrança continua
        // pagável). Nunca derruba a página por causa do parcelamento.
        console.error("[checkout] opções de parcelamento indisponíveis:", (e as Error).message);
        installmentOptions = null;
        installmentsInterestFree = null;
      }
    }

    // Marca do tenant (só se white_label_enabled) — senão Dominex fixo.
    // Também trazemos os dados de IDENTIFICAÇÃO DO EMISSOR (endereço/telefone/
    // e-mail/CNPJ) e os toggles `show_*_in_documents` que decidem se cada um
    // pode ser exibido. Colunas listadas uma a uma (nunca `*`).
    const { data: settings } = await supabase
      .from("company_settings")
      .select(
        "name, white_label_enabled, white_label_logo_url, white_label_primary_color," +
          " address, address_number, complement, neighborhood, city, state, zip_code," +
          " phone, email, document," +
          " show_address_in_documents, show_phone_in_documents, show_email_in_documents, show_cnpj_in_documents",
      )
      .eq("company_id", charge.company_id)
      .maybeSingle();

    // NOME = sempre o do tenant (quem cobra), com ou sem white-label.
    // LOGO e COR = só com white-label. Sem white-label NÃO mandamos o logo da
    // plataforma: "logo da Dominex + nome do tenant" identificaria o credor
    // errado (pior que o problema original). Sem white-label a coluna de resumo
    // fica só com o nome bem tipografado + o escuro neutro (primary_color null).
    const useWhiteLabel = settings?.white_label_enabled === true;
    const brand = {
      name: settings?.name?.trim() || FALLBACK_ISSUER_NAME,
      logo_url: useWhiteLabel ? (settings?.white_label_logo_url ?? null) : null,
      // Tenant com white-label mas sem cor configurada → null (fundo escuro neutro).
      primary_color: useWhiteLabel ? (settings?.white_label_primary_color ?? null) : null,
    };

    // ── Identificação do emissor (endereço / contato / documento) ────────────
    // O FILTRO É AQUI, NO SERVIDOR: campo com toggle desligado NÃO sai da edge.
    // Esta é rota ANÔNIMA — mandar o dado e "esconder no client" seria vazar.
    //
    // Convenção dos toggles = `!== false` (exibir por padrão), espelhando o
    // helper canônico do app `src/utils/companyDocumentHeader.ts` (buildDetails).
    // Geradores antigos do repo usam `&&` (esconder por padrão) — o canônico é
    // este; não trocar sem alinhar os dois lados.
    // A composição da linha de endereço segue a MESMA ordem do buildDetails.
    // Telefone e documento saem CRUS (sem máscara): quem formata é o front, com
    // `phoneMask`/`cpfCnpjMask` de src/utils/masks.ts — máscara é apresentação,
    // não exposição extra.
    const issuer = {
      address_line: null as string | null,
      phone: null as string | null,
      email: null as string | null,
      document: null as string | null,
    };
    if (settings) {
      if (settings.show_address_in_documents !== false && settings.address) {
        let a = String(settings.address);
        if (settings.address_number) a += `, ${settings.address_number}`;
        if (settings.complement) a += ` ${settings.complement}`;
        if (settings.neighborhood) a += ` - ${settings.neighborhood}`;
        if (settings.city) a += ` - ${settings.city}`;
        if (settings.state) a += `/${settings.state}`;
        if (settings.zip_code) a += ` - CEP: ${settings.zip_code}`;
        issuer.address_line = a;
      }
      if (settings.show_phone_in_documents !== false && settings.phone) {
        issuer.phone = String(settings.phone);
      }
      if (settings.show_email_in_documents !== false && settings.email) {
        issuer.email = String(settings.email);
      }
      if (settings.show_cnpj_in_documents !== false && settings.document) {
        issuer.document = String(settings.document);
      }
    }

    const company = { ...brand, ...issuer };

    // ALLOWLIST ESTRITA (montado campo a campo — nunca net_value/custo/margem/ids internos).
    return json(req, {
      company,
      charge: {
        value: charge.value,
        due_date: charge.due_date,
        description: charge.description,
        status: charge.status,
        billing_type: charge.billing_type,
        invoice_url: charge.invoice_url,
        pix_copy_paste: charge.pix_copy_paste,
        boleto_url: charge.boleto_url,
        public_short_code: charge.public_short_code,
        // true → checkout de cartão PRÓPRIO (formulário na nossa página).
        // false → cai no fallback do link hospedado da Asaas (invoice_url).
        allow_card: cardInHouseEnabled,
        // "Cliente escolhe as parcelas": null fora do modo (ou quando a
        // cobrança já não é pagável). Cada opção: { count, installment_value,
        // total_value }. `installments_interest_free` = a empresa paga a taxa.
        installment_options: installmentOptions,
        installments_interest_free: installmentsInterestFree,
      },
    }, 200);
  } catch (e) {
    console.error("[checkout] erro:", (e as Error).message);
    return json(req, { error: "Não foi possível carregar a cobrança agora." }, 500);
  }
});
