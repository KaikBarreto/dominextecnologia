// tenant-asaas-provision
// -----------------------
// PRIVILEGIADA (Bearer + módulo 'cobrancas' + can_manage_system). Modelo BYO
// ("traga sua conta Asaas", plano §9). Recebe a API key colada pelo tenant, valida
// contra o Asaas, guarda no Vault (nunca no banco em claro, nunca de volta pro
// client), registra o webhook por API na conta do tenant e faz upsert em
// tenant_payment_accounts.
//
// company_id vem SEMPRE do profile (payments-auth), nunca do payload — anti-vazamento.
//
// Ações:
//   - activate:   valida a chave (GET /v3/myAccount, fallback /v3/finance/balance)
//                 → Vault upsert → registra/atualiza webhook → status 'active'.
//   - revalidate: revalida a chave já guardada (não exige nova key).
//   - deactivate: DELETE /v3/webhooks/<id> + status 'disabled' + apaga secrets do Vault.
//
// Contrato de erro: retorna { error: '<PT-BR>' } + HTTP 4xx pro hook ler error.context.
//
// DEPENDE das RPCs de Vault do dev-database (vault_upsert/read/delete_tenant_secret) —
// se ainda não estiverem no ar, activate/revalidate falham em runtime (o gate e a
// validação da chave rodam, mas a gravação do secret quebra).

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  jsonResponse,
  vaultKeySecretName,
  vaultWebhookTokenSecretName,
  vaultUpsertSecret,
  vaultReadSecret,
  vaultDeleteSecret,
  generateWebhookToken,
} from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError, maskKey } from "../_shared/asaas-tenant-client.ts";

const WEBHOOK_EVENTS = [
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
];

/** URL pública do nosso webhook multi-tenant (rota única). */
function webhookUrl(): string {
  const ref = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  return `${ref}/functions/v1/tenant-asaas-webhook`;
}

/** Valida a chave contra o Asaas. Retorna dados cadastrais mínimos ou lança AsaasApiError. */
async function validateKey(
  apiKey: string,
): Promise<{ name: string; cpfCnpj: string | null; email: string | null }> {
  const client = asaasFor(apiKey);
  try {
    const acct = await client.get<any>("/myAccount");
    return {
      name: acct?.name ?? acct?.companyName ?? "Conta Asaas",
      cpfCnpj: acct?.cpfCnpj ?? null,
      email: acct?.email ?? null,
    };
  } catch (e) {
    // Fallback aceitável: /finance/balance (prova que a chave autentica).
    if (e instanceof AsaasApiError && (e.status === 404 || e.status === 405)) {
      await client.get<any>("/finance/balance");
      return { name: "Conta Asaas", cpfCnpj: null, email: null };
    }
    throw e;
  }
}

/** Mascara um CPF/CNPJ pra exibição segura (mostra só os últimos 4 dígitos). */
function maskDoc(doc: string | null): string | null {
  if (!doc) return null;
  const d = doc.replace(/\D/g, "");
  if (d.length < 4) return "****";
  return `••••${d.slice(-4)}`;
}

Deno.serve(async (req) => {
  // Rede de segurança de topo: NENHUMA exceção pode escapar do handler (senão o
  // gateway devolve 502 cru, sem JSON, e o front não consegue ler error.context).
  // Tudo aqui dentro sempre vira um Response JSON com mensagem PT-BR.
  try {
    return await handleRequest(req);
  } catch (e) {
    console.error("[provision] exceção não tratada no topo:", (e as Error)?.message ?? e);
    return jsonResponse(req, {
      error: "Ocorreu um erro ao configurar a integração. Tente novamente em instantes.",
    }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authorizePaymentsManager(req);
  if (!auth.ok) return auth.response;
  const { supabase, userId, companyId, userEmail } = auth;

  let payload: { action?: string; api_key?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(req, { error: "Requisição inválida." }, 400);
  }

  const action = payload.action ?? "activate";
  const keyName = vaultKeySecretName(companyId);
  const tokenName = vaultWebhookTokenSecretName(companyId);

  try {
    // Estado atual da conta (pra idempotência do webhook e do secret).
    const { data: existing } = await supabase
      .from("tenant_payment_accounts")
      .select("id, asaas_webhook_id, vault_secret_name, webhook_auth_token_name, status")
      .eq("company_id", companyId)
      .maybeSingle();

    // =====================================================================
    // DEACTIVATE
    // =====================================================================
    if (action === "deactivate") {
      // Apaga o webhook na conta do tenant (best-effort — a chave ainda no Vault).
      if (existing?.asaas_webhook_id) {
        try {
          const apiKey = await vaultReadSecret(supabase, keyName);
          if (apiKey) {
            await asaasFor(apiKey).delete(`/webhooks/${existing.asaas_webhook_id}`);
          }
        } catch (e) {
          console.error("[provision] falha ao remover webhook (não-fatal):", (e as Error).message);
        }
      }
      await supabase
        .from("tenant_payment_accounts")
        .update({
          status: "disabled",
          asaas_webhook_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId);

      // Não deixa chave órfã: apaga os secrets do Vault.
      await vaultDeleteSecret(supabase, keyName);
      await vaultDeleteSecret(supabase, tokenName);

      return jsonResponse(req, { status: "disabled", webhook_registered: false }, 200);
    }

    // =====================================================================
    // ACTIVATE / REVALIDATE
    // =====================================================================
    // A chave: no activate vem no payload; no revalidate lê do Vault.
    let apiKey: string | null = null;
    if (action === "revalidate") {
      apiKey = await vaultReadSecret(supabase, keyName);
      if (!apiKey) {
        return jsonResponse(req, {
          error: "Nenhuma chave da Asaas configurada para revalidar. Ative a integração primeiro.",
        }, 400);
      }
    } else {
      apiKey = (payload.api_key ?? "").trim();
      if (!apiKey) {
        return jsonResponse(req, {
          error: "Informe a chave de API da sua conta Asaas.",
        }, 400);
      }
      // Guarda de formato: a chave da Asaas começa com "$aact_" e é longa. Rejeita
      // lixo colado (ex.: um link, um trecho) ANTES de bater na Asaas — mensagem clara.
      const looksLikeAsaasKey = apiKey.startsWith("$aact_") && apiKey.length >= 40;
      if (!looksLikeAsaasKey) {
        return jsonResponse(req, {
          error:
            "Essa não parece ser uma chave de API válida da Asaas. Copie a chave em Configurações → Integrações da sua conta Asaas (começa com \"$aact_\").",
        }, 400);
      }
    }

    // 1) Valida a chave (§9.4). Falhou → NÃO grava nada.
    let account: { name: string; cpfCnpj: string | null; email: string | null };
    try {
      account = await validateKey(apiKey);
    } catch (e) {
      const status = e instanceof AsaasApiError ? e.status : 502;
      console.error(`[provision] chave inválida (company ${companyId}, ${maskKey(apiKey)}):`, (e as Error).message);
      if (status === 401 || status === 403) {
        return jsonResponse(req, {
          error: "Chave da Asaas inválida ou sem permissão. Confira em Configurações → Integrações da sua conta Asaas.",
        }, 400);
      }
      return jsonResponse(req, {
        error: "Não foi possível validar a chave com a Asaas agora. Tente novamente em instantes.",
      }, status >= 400 && status < 500 ? 400 : 502);
    }

    // 2) Guarda a chave no Vault (só no activate; no revalidate já está lá).
    if (action === "activate") {
      await vaultUpsertSecret(supabase, keyName, apiKey);
    }

    // 3) Token do webhook: reusa o existente (idempotente) ou gera um novo.
    let webhookToken = await vaultReadSecret(supabase, tokenName);
    if (!webhookToken) {
      webhookToken = generateWebhookToken();
      await vaultUpsertSecret(supabase, tokenName, webhookToken);
    }

    // 4) Registra/atualiza o webhook na conta do tenant (idempotente por asaas_webhook_id).
    // O Asaas EXIGE `email` no webhook (recebe alertas se ele falhar). Usamos, em
    // ordem: o email cadastral da conta Asaas → o email do usuário logado. Sem um
    // email válido o Asaas rejeita com 400 "O parâmetro email deve ser informado".
    const client = asaasFor(apiKey);
    let asaasWebhookId = existing?.asaas_webhook_id ?? null;
    const webhookEmail = account.email ?? userEmail ?? null;
    if (!webhookEmail) {
      return jsonResponse(req, {
        error:
          "Sua conta Asaas não tem um email cadastrado. Adicione um email de contato na sua conta Asaas e tente ativar de novo.",
      }, 400);
    }
    const webhookBody = {
      name: "Dominex - Baixa automática de cobranças",
      url: webhookUrl(),
      email: webhookEmail,
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: webhookToken,
      sendType: "SEQUENTIALLY",
      events: WEBHOOK_EVENTS,
    };
    try {
      if (asaasWebhookId) {
        // Atualiza URL/token/eventos caso tenham mudado. Não recria (coexiste com os do tenant).
        await client.put(`/webhooks/${asaasWebhookId}`, webhookBody);
      } else {
        const created = await client.post<any>("/webhooks", webhookBody);
        asaasWebhookId = created?.id ?? null;
      }
    } catch (e) {
      // Asaas devolve 400 com a causa exata (ex.: parâmetro faltando). Mostramos essa
      // causa pro tenant (é acionável) e mantemos 4xx pra ele SÓ virar 502 quando o
      // problema for de fato do lado do Asaas (5xx/rede).
      const isAsaas = e instanceof AsaasApiError;
      const status = isAsaas ? (e as AsaasApiError).status : 502;
      const isClientError = status >= 400 && status < 500;
      console.error(
        `[provision] falha ao registrar webhook (company ${companyId}, status ${status}):`,
        (e as Error).message,
      );
      return jsonResponse(req, {
        error: isClientError
          ? `A chave é válida, mas a Asaas recusou a configuração do recebimento automático: ${(e as Error).message}`
          : "A chave é válida, mas não foi possível configurar o recebimento automático de pagamentos agora. Tente novamente em instantes.",
      }, isClientError ? 400 : 502);
    }

    // 5) Upsert em tenant_payment_accounts (status active).
    const row = {
      company_id: companyId,
      provider: "asaas",
      mode: "byo",
      status: "active",
      vault_secret_name: keyName,
      webhook_auth_token_name: tokenName,
      asaas_webhook_id: asaasWebhookId,
      created_by: userId,
      updated_at: new Date().toISOString(),
    };
    const { error: upsertErr } = await supabase
      .from("tenant_payment_accounts")
      .upsert(row, { onConflict: "company_id" });
    if (upsertErr) {
      console.error("[provision] upsert tenant_payment_accounts falhou:", upsertErr.message);
      return jsonResponse(req, {
        error: "Não foi possível salvar a integração. Tente novamente.",
      }, 500);
    }

    return jsonResponse(req, {
      status: "active",
      account: { name: account.name, cpfCnpj_masked: maskDoc(account.cpfCnpj) },
      webhook_registered: true,
    }, 200);
  } catch (e) {
    console.error("[provision] erro inesperado:", (e as Error).message);
    return jsonResponse(req, {
      error: "Ocorreu um erro ao configurar a integração. Tente novamente.",
    }, 500);
  }
}
