// tenant-asaas-manage-subscription
// ---------------------------------
// PRIVILEGIADA (Bearer + módulo 'cobrancas' + can_manage_system). Gerencia uma
// assinatura recorrente existente na conta Asaas DO TENANT (chave BYO do Vault).
//
// company_id vem do profile (payments-auth), nunca do payload. Posse: a
// assinatura TEM que ser da company do gestor (predicado company_id reaplicado).
//
// Ações (MVP):
//   'cancel' → encerra o vínculo recorrente NA ASAAS e só depois grava
//              status 'cancelled' aqui. O endpoint depende do meio:
//                · assinatura comum → DELETE /v3/subscriptions/{id}
//                · Pix Automático  → DELETE /v3/pix/automatic/authorizations/{id}
//   'update' → PUT /v3/subscriptions/{id} (value/cycle/nextDueDate/description) +
//              espelha em tenant_subscriptions.
//   'archive'   → esconde da lista uma assinatura JÁ cancelada, via RPC
//                 archive_tenant_subscription (SECURITY DEFINER). Só depois de o
//                 vínculo estar comprovadamente morto na Asaas.
//   'unarchive' → devolve pra lista (arquivar é reversível de propósito).
//
// ARQUIVAR, NÃO EXCLUIR: esta tabela é o ÚNICO lugar que guarda o
// pix_auto_authorization_id, e o webhook resolve o tenant POR ELE
// (resolvePixAuthCompany). Apagar a linha deixaria um evento atrasado da Asaas
// sem casa — irroteável — que é o mesmo buraco do incidente abaixo, só adiado.
//
// ⚠️ PIX AUTOMÁTICO — REGRA-LEI (incidente 2026-09-19)
// O vínculo recorrente do Pix Automático NÃO é `asaas_subscription_id` (nasce NULL
// de propósito, ver tenant-asaas-pix-auto-authorize): é `pix_auto_authorization_id`,
// o CONSENTIMENTO de débito que o cliente final aprova no app do banco. A versão
// antiga deste arquivo só olhava `asaas_subscription_id` — para PIX_AUTO isso é
// null, nenhuma chamada era feita à Asaas e a linha era marcada 'cancelled' assim
// mesmo. Se o cliente lesse o QR depois, o consentimento virava AUTHORIZED e a
// Asaas começava a DEBITAR uma assinatura que o gestor já tinha cancelado e não
// via mais na tela. Nunca marque 'cancelled' aqui sem encerrar o vínculo lá.
//
// pause/resume: a Asaas NÃO expõe pause/resume nativo de assinatura (só ACTIVE/
// INACTIVE/EXPIRED, sem endpoint de "retomar"). No MVP não oferecemos pause/resume
// (uma pausa só-local geraria cobranças pela Asaas mesmo assim, enganando o tenant).
// Retornamos 400 explicativo se pedido. Reavaliar quando a Asaas suportar.
//
// Nunca loga a chave. Erros em PT-BR via error.context; try/catch de topo.

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  jsonResponse,
  vaultReadSecret,
} from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError } from "../_shared/asaas-tenant-client.ts";

type Action = "cancel" | "update" | "pause" | "resume" | "archive" | "unarchive";
const ALLOWED_ACTIONS: readonly Action[] = [
  "cancel",
  "update",
  "pause",
  "resume",
  "archive",
  "unarchive",
];

type Cycle = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";
const ALLOWED_CYCLES: readonly Cycle[] = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUALLY",
  "YEARLY",
];

const MIN_VALUE = 5;

/** Valida `next_due_date` no formato YYYY-MM-DD e não no passado (UTC, dia cheio). */
function validateDueDate(due: string): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return { ok: false, error: "A data de vencimento deve estar no formato AAAA-MM-DD." };
  }
  const parsed = new Date(`${due}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "A data de vencimento é inválida." };
  }
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (parsed.getTime() < todayUtc) {
    return { ok: false, error: "A data de vencimento não pode estar no passado." };
  }
  return { ok: true };
}

/**
 * Status de AUTORIZAÇÃO de Pix Automático (vocabulário da Asaas, maiúsculas) que
 * já significam "consentimento encerrado" → não gera mais débito. O valor à
 * direita é o `pix_auto_status` local correspondente.
 *
 * O CHECK de tenant_subscriptions.pix_auto_status aceita
 * pending | authorized | cancelled | expired | rejected, então mapeamos fiel ao
 * gateway. ('rejected' passou a caber no CHECK junto da migration de archived_at;
 * é o MESMO valor que o webhook grava em mapPixAutoStatus, de propósito.)
 */
const CLOSED_ASAAS_AUTH_STATUSES: Record<string, "cancelled" | "expired" | "rejected"> = {
  CANCELLED: "cancelled",
  CANCELED: "cancelled",
  REJECTED: "rejected",
  REFUSED: "rejected",
  DENIED: "rejected",
  EXPIRED: "expired",
};

/**
 * Valores de `pix_auto_status` (nossos) que já significam consentimento morto.
 * MESMO conjunto do predicado das RPCs archive/unarchive_tenant_subscription —
 * se um divergir do outro, a edge revoga e a RPC recusa (ou pior, o contrário).
 */
const CLOSED_PIX_AUTO_STATUSES = new Set(["cancelled", "expired", "rejected"]);

/**
 * REVOGA o consentimento de Pix Automático na Asaas e devolve o `pix_auto_status`
 * local que reflete o gateway. Esta é a chamada que de fato impede débito futuro.
 *
 * Contrato (importante): ou retorna com o consentimento COMPROVADAMENTE morto lá,
 * ou LANÇA. Nunca devolve "ok" por omissão — o registro local não pode mentir
 * sobre o gateway.
 */
async function revokePixAutoAuthorization(
  asaas: ReturnType<typeof asaasFor>,
  authorizationId: string,
): Promise<"cancelled" | "expired" | "rejected"> {
  const path = `/pix/automatic/authorizations/${encodeURIComponent(authorizationId)}`;

  // 1) Estado autoritativo na Asaas. Se já está encerrada, não há o que revogar:
  //    espelhamos o status de lá. (404 = não existe mais → consentimento morto.)
  try {
    const current = await asaas.get<any>(path);
    const closed = CLOSED_ASAAS_AUTH_STATUSES[String(current?.status ?? "").toUpperCase()];
    if (closed) return closed;
  } catch (e) {
    if (e instanceof AsaasApiError && e.status === 404) return "cancelled";
    // GET instável não pode barrar o cancelamento: segue pro DELETE, que é quem
    // encerra o consentimento de verdade.
    console.error(
      "[manage-subscription] GET da autorização Pix Automático falhou (seguindo pro DELETE):",
      (e as Error)?.message ?? e,
    );
  }

  // 2) Revoga. Diferente de uma cobrança avulsa, autorização JÁ AUTORIZADA também
  //    tem que ser revogável aqui: é exatamente o caso de "parar de debitar".
  try {
    await asaas.delete<any>(path);
    return "cancelled";
  } catch (e) {
    if (e instanceof AsaasApiError && e.status === 404) return "cancelled";
    const detail = e instanceof AsaasApiError && e.message ? ` Motivo informado pela Asaas: ${e.message}` : "";
    const status = e instanceof AsaasApiError && e.status >= 400 && e.status < 600 ? e.status : 502;
    // NÃO marcamos nada como cancelado aqui. Preferimos o gestor ver o erro e
    // tentar de novo a esconder um débito que ainda pode acontecer.
    throw new AsaasApiError(
      `Não foi possível encerrar a autorização de Pix Automático na Asaas, então a assinatura NÃO foi cancelada. Enquanto isso, o cliente ainda pode ser debitado. Tente novamente em instantes.${detail}`,
      status,
    );
  }
}

interface ManageInput {
  subscription_id?: string; // id local (tenant_subscriptions.id)
  action?: Action;
  // update:
  value?: number;
  cycle?: Cycle;
  next_due_date?: string;
  description?: string;
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (e) {
    console.error("[manage-subscription] exceção não tratada no topo:", (e as Error)?.message ?? e);
    return jsonResponse(req, {
      error: "Ocorreu um erro ao gerenciar a assinatura. Tente novamente em instantes.",
    }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authorizePaymentsManager(req);
  if (!auth.ok) return auth.response;
  const { supabase, companyId } = auth;

  let input: ManageInput;
  try {
    input = await req.json();
  } catch {
    return jsonResponse(req, { error: "Requisição inválida." }, 400);
  }

  if (!input.subscription_id || typeof input.subscription_id !== "string") {
    return jsonResponse(req, { error: "Assinatura não informada." }, 400);
  }
  const action = input.action as Action;
  if (!ALLOWED_ACTIONS.includes(action)) {
    return jsonResponse(req, { error: "Ação inválida." }, 400);
  }

  // pause/resume não são suportados no MVP (Asaas não expõe pause/resume nativo).
  if (action === "pause" || action === "resume") {
    return jsonResponse(req, {
      error: "Pausar ou retomar assinatura ainda não está disponível. Cancele a assinatura e crie uma nova quando quiser retomar.",
    }, 400);
  }

  try {
    // 1) Carrega a assinatura COM posse por company (predicado reaplicado no server).
    const { data: subData } = await supabase
      .from("tenant_subscriptions")
      .select(
        "id, company_id, asaas_subscription_id, status, value, cycle, next_due_date, description, "
        + "billing_type, pix_auto_authorization_id, pix_auto_status",
      )
      .eq("id", input.subscription_id)
      .eq("company_id", companyId)
      .maybeSingle();
    const sub = subData as any;
    if (!sub) {
      // 404 neutro: não vaza se a assinatura existe em outro tenant.
      return jsonResponse(req, { error: "Assinatura não encontrada na sua empresa." }, 404);
    }

    // 2) Conta ativa + chave do Vault.
    const { data: accountData } = await supabase
      .from("tenant_payment_accounts")
      .select("status, vault_secret_name")
      .eq("company_id", companyId)
      .maybeSingle();
    const account = accountData as any;
    if (!account || account.status !== "active" || !account.vault_secret_name) {
      return jsonResponse(req, {
        error: "Ative o recebimento de pagamentos em Configurações → Integrações para gerenciar assinaturas.",
      }, 400);
    }
    const apiKey = await vaultReadSecret(supabase, account.vault_secret_name);
    if (!apiKey) {
      return jsonResponse(req, {
        error: "A chave da Asaas não foi encontrada. Reative a integração em Configurações → Integrações.",
      }, 400);
    }
    const asaas = asaasFor(apiKey);

    const asaasSubId: string | null =
      typeof sub.asaas_subscription_id === "string" && sub.asaas_subscription_id
        ? sub.asaas_subscription_id
        : null;

    // Vínculo recorrente do Pix Automático (aut_* ou UUID, conforme a conta).
    // É ELE que autoriza o débito — não o asaas_subscription_id.
    const pixAuthId: string | null =
      typeof sub.pix_auto_authorization_id === "string" && sub.pix_auto_authorization_id
        ? sub.pix_auto_authorization_id
        : null;

    // O consentimento de Pix Automático ainda pode gerar débito?
    // Linha 'cancelled' aqui com autorização 'pending'/'authorized' lá é
    // exatamente o estado quebrado que este arquivo passou a consertar.
    const pixStillLive =
      pixAuthId !== null &&
      !CLOSED_PIX_AUTO_STATUSES.has(String(sub.pix_auto_status ?? "pending"));

    /**
     * Encerra o vínculo recorrente NA ASAAS. Retorna o patch de status local a
     * aplicar DEPOIS. Lança se o gateway não confirmar o encerramento.
     */
    const revokeAtGateway = async (): Promise<Record<string, unknown>> => {
      const patch: Record<string, unknown> = {};
      if (pixAuthId) {
        // PIX AUTOMÁTICO: revoga o consentimento. Sem isso, o cliente pode ler o
        // QR depois, a autorização vira AUTHORIZED e a Asaas passa a debitar.
        patch.pix_auto_status = await revokePixAutoAuthorization(asaas, pixAuthId);
      }
      if (asaasSubId) {
        // Assinatura comum. 404 = já não existe lá, segue.
        try {
          await asaas.delete<any>(`/subscriptions/${encodeURIComponent(asaasSubId)}`);
        } catch (e) {
          if (!(e instanceof AsaasApiError && e.status === 404)) throw e;
        }
      }
      return patch;
    };

    // ================= CANCEL =================
    if (action === "cancel") {
      // Idempotente SÓ quando não há consentimento Pix Automático vivo. Se houver,
      // seguimos e revogamos de fato — é a auto-cura das linhas já quebradas.
      if (sub.status === "cancelled" && !pixStillLive) {
        return jsonResponse(req, {
          subscription: { id: sub.id, status: "cancelled" },
        }, 200);
      }

      // ORDEM É LEI: gateway primeiro, nosso banco depois. Se a revogação falhar,
      // isto lança e NADA é gravado — a assinatura continua aparecendo como ativa,
      // que é a verdade enquanto o débito ainda pode acontecer.
      const gatewayPatch = await revokeAtGateway();

      // ⚠️ supabase-js NÃO lança em erro de banco: devolve { error }. Um update
      // sem checagem engole a falha inteira em silêncio (foi assim que a mentira
      // do Pix Automático passou despercebida no webhook). Checar é obrigatório.
      const { error: cancelErr } = await supabase
        .from("tenant_subscriptions")
        .update({ ...gatewayPatch, status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", sub.id)
        .eq("company_id", companyId);
      if (cancelErr) {
        // O vínculo JÁ foi encerrado na Asaas (não há risco de débito novo), mas
        // a tela vai continuar mostrando a assinatura. Dizemos a verdade.
        console.error("[manage-subscription] update de cancelamento falhou:", cancelErr.message);
        return jsonResponse(req, {
          error: "A cobrança recorrente foi encerrada na Asaas, mas não conseguimos atualizar o registro aqui. A assinatura pode continuar aparecendo na lista. Tente cancelar de novo em instantes.",
        }, 500);
      }

      return jsonResponse(req, {
        subscription: { id: sub.id, status: "cancelled" },
      }, 200);
    }

    // ================= ARCHIVE / UNARCHIVE =================
    // Some da lista SEM destruir a linha. Escrita por RPC SECURITY DEFINER
    // (padrão da casa: authenticated não escreve direto em tabela-espelho de
    // gateway; EXECUTE é só de service_role). O histórico de cobranças fica
    // intacto e o ponteiro pro consentimento da Asaas é preservado.
    if (action === "archive" || action === "unarchive") {
      if (action === "archive") {
        if (sub.status !== "cancelled") {
          return jsonResponse(req, {
            error: "Só é possível arquivar uma assinatura cancelada. Cancele a assinatura antes de arquivar.",
          }, 400);
        }

        // Cancelada AQUI não prova morta LÁ quando ainda existe consentimento de
        // Pix Automático vivo. Revoga antes de esconder: depois de sumir da
        // lista, ninguém mais tem por onde achar essa autorização.
        // (A RPC também recusa nesse caso — aqui a gente resolve em vez de barrar.)
        if (pixStillLive) {
          const pixStatus = await revokePixAutoAuthorization(asaas, pixAuthId as string);
          // Sem checar o error, o pix_auto_status não gravaria, a RPC recusaria
          // com 'pix_auto_consent_live' e o gestor veria uma mensagem que não
          // bate com a realidade (o consentimento JÁ foi revogado).
          const { error: pixErr } = await supabase
            .from("tenant_subscriptions")
            .update({ pix_auto_status: pixStatus, updated_at: new Date().toISOString() })
            .eq("id", sub.id)
            .eq("company_id", companyId);
          if (pixErr) {
            console.error("[manage-subscription] update de pix_auto_status falhou:", pixErr.message);
            return jsonResponse(req, {
              error: "A autorização de Pix Automático foi encerrada na Asaas, mas não conseguimos atualizar o registro aqui. Tente arquivar de novo em instantes.",
            }, 500);
          }
        }
      }

      const rpcName = action === "archive"
        ? "archive_tenant_subscription"
        : "unarchive_tenant_subscription";

      const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName, {
        p_company_id: companyId,
        p_subscription_id: sub.id,
      });
      if (rpcError) {
        console.error(`[manage-subscription] ${rpcName} falhou:`, rpcError.message);
        return jsonResponse(req, {
          error: action === "archive"
            ? "Não foi possível arquivar a assinatura. Tente novamente em instantes."
            : "Não foi possível devolver a assinatura para a lista. Tente novamente em instantes.",
        }, 500);
      }

      // A RPC NÃO lança em recusa de negócio: devolve { archived:false, reason,
      // message } com a copy PT-BR pronta. Repassamos a mensagem dela.
      const result = (rpcData ?? {}) as any;
      const okFlag = action === "archive" ? result.archived : result.unarchived;
      if (okFlag !== true) {
        const reason = typeof result.reason === "string" ? result.reason : "";
        // A RPC já devolve copy PT-BR boa; sobrescrevemos só onde a edge sabe
        // mais que ela — sobretudo o caminho que NÃO deveria acontecer.
        let message = typeof result.message === "string" && result.message
          ? result.message
          : "Não foi possível concluir a operação nesta assinatura.";
        let status = 400;
        if (reason === "not_found") {
          // 404 neutro: não vaza se a assinatura existe em outro tenant.
          status = 404;
        } else if (reason === "pix_auto_consent_live") {
          // Chegar aqui significa que a revogação ACIMA não pegou (ou o estado
          // mudou no meio). Arquivar agora esconderia um débito possível.
          message =
            "Esta assinatura ainda tem uma autorização de Pix Automático ativa no banco do cliente, então não pode ser arquivada: ela sumiria da lista e o cliente continuaria podendo ser debitado. Use \"Cancelar de novo\" para encerrar a autorização e tente arquivar em seguida.";
          status = 409;
        } else if (reason === "state_changed") {
          status = 409;
        } else if (reason === "invalid_arguments") {
          status = 400;
        }
        return jsonResponse(req, { error: message, reason: reason || undefined }, status);
      }

      return jsonResponse(req, {
        [action === "archive" ? "archived" : "unarchived"]: true,
        // 'already_archived' (archive) / 'already_visible' (unarchive): a RPC é idempotente.
        already: result.already_archived === true || result.already_visible === true,
        subscription: { id: sub.id, status: sub.status },
      }, 200);
    }

    // ================= UPDATE =================
    // Atualiza campos opcionais (só os enviados). Exige assinatura viva no Asaas.
    if (!asaasSubId) {
      // Pix Automático não tem endpoint de edição: o consentimento do cliente é
      // por valor/frequência. Mudar exige um novo consentimento.
      return jsonResponse(req, {
        error: pixAuthId
          ? "O Pix Automático não pode ser alterado depois de criado, porque o cliente autorizou este valor e esta frequência. Cancele e crie uma nova autorização."
          : "Esta assinatura ainda não está ativa na Asaas e não pode ser alterada.",
      }, 400);
    }
    if (sub.status === "cancelled") {
      return jsonResponse(req, {
        error: "Esta assinatura está cancelada e não pode ser alterada.",
      }, 400);
    }

    const asaasBody: Record<string, unknown> = {};
    const localPatch: Record<string, unknown> = {};

    if (input.value !== undefined) {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < MIN_VALUE) {
        return jsonResponse(req, {
          error: `O valor mínimo de uma assinatura é R$ ${MIN_VALUE.toFixed(2).replace(".", ",")}.`,
        }, 400);
      }
      const rounded = Math.round(value * 100) / 100;
      asaasBody.value = rounded;
      localPatch.value = rounded;
    }
    if (input.cycle !== undefined) {
      if (!ALLOWED_CYCLES.includes(input.cycle)) {
        return jsonResponse(req, { error: "Frequência de cobrança inválida." }, 400);
      }
      asaasBody.cycle = input.cycle;
      localPatch.cycle = input.cycle;
    }
    if (input.next_due_date !== undefined) {
      const raw = String(input.next_due_date).trim();
      const check = validateDueDate(raw);
      if (!check.ok) return jsonResponse(req, { error: check.error }, 400);
      asaasBody.nextDueDate = raw;
      localPatch.next_due_date = raw;
    }
    if (input.description !== undefined) {
      const desc = typeof input.description === "string" ? input.description.trim().slice(0, 500) : "";
      asaasBody.description = desc || null;
      localPatch.description = desc || null;
    }

    if (Object.keys(asaasBody).length === 0) {
      return jsonResponse(req, { error: "Nenhuma alteração informada." }, 400);
    }

    const updated = await asaas.put<any>(
      `/subscriptions/${encodeURIComponent(asaasSubId)}`,
      asaasBody,
    );

    localPatch.updated_at = new Date().toISOString();
    const { data: saved, error: savedErr } = await supabase
      .from("tenant_subscriptions")
      .update(localPatch)
      .eq("id", sub.id)
      .eq("company_id", companyId)
      .select("id, status, value, cycle, next_due_date, billing_type")
      .maybeSingle();
    if (savedErr) {
      // A Asaas já aceitou a alteração; o espelho local é que não acompanhou.
      // Devolver 200 com valor antigo faria a tela mentir sobre o que o cliente
      // vai pagar no próximo ciclo.
      console.error("[manage-subscription] espelho local do update falhou:", savedErr.message);
      return jsonResponse(req, {
        error: "A alteração foi aplicada na Asaas, mas não conseguimos atualizar os dados aqui. Atualize a tela em instantes para conferir os valores.",
      }, 500);
    }

    return jsonResponse(req, {
      subscription: {
        id: sub.id,
        status: saved?.status ?? sub.status,
        value: saved?.value ?? updated?.value ?? sub.value,
        cycle: saved?.cycle ?? updated?.cycle ?? sub.cycle,
        next_due_date: saved?.next_due_date ?? updated?.nextDueDate ?? sub.next_due_date,
        billing_type: saved?.billing_type ?? null,
      },
    }, 200);
  } catch (e) {
    const status = e instanceof AsaasApiError ? e.status : 500;
    console.error("[manage-subscription] erro:", (e as Error).message);
    return jsonResponse(req, {
      error: e instanceof AsaasApiError
        ? (e.message || "Falha ao gerenciar a assinatura na Asaas.")
        : "Ocorreu um erro ao gerenciar a assinatura. Tente novamente.",
    }, status >= 400 && status < 600 ? status : 500);
  }
}
