// tenant-asaas-reconcile
// -----------------------
// Conciliação automática das cobranças BYO (add-on "Cobranças", modelo por-tenant).
//
// PROBLEMA que resolve: a baixa de uma cobrança normalmente vem do webhook
// `tenant-asaas-webhook`. Se um webhook do Asaas se perde (entrega falha, timeout,
// re-entrega não configurada), a cobrança fica PENDING/OVERDUE no banco mesmo já
// tendo sido paga no Asaas — a baixa se perde.
//
// Este edge é um JOB DE SISTEMA (cron): varre as cobranças ainda em aberto de TODOS
// os tenants com Cobranças ativa, consulta o status REAL no Asaas de cada uma e:
//   - se o Asaas diz RECEIVED/CONFIRMED (pago) → chama a RPC idempotente
//     `apply_tenant_charge_payment` pra aplicar a baixa que faltou (recupera).
//   - se o Asaas diz OVERDUE e o banco ainda diz PENDING → atualiza o status pra
//     OVERDUE (best-effort). NÃO faz reversão de estorno/chargeback (isso é do webhook).
//
// Idempotência TOTAL: `apply_tenant_charge_payment` é no-op se a cobrança já está paga.
// Rodar o job 2x seguidas não duplica baixa nem lançamento.
//
// AUTORIZAÇÃO (regra-lei #6): NÃO há JWT de usuário num cron. Autentica por SEGREDO —
// header `x-cron-secret` OU `Authorization: Bearer <secret>` comparado TIMING-SAFE
// contra `CRON_SECRET`. Fail-closed 401. Só o cron (que tem o segredo) chama.
//
// Cliente Supabase: SERVICE_ROLE (job de sistema, cruza tenants; RLS bypass). NUNCA
// exposto a ninguém além do cron. A chave BYO de cada tenant vive só na memória do
// isolate durante o processamento daquele tenant e nunca vai pra log (maskKey/omitida).
//
// ROBUSTEZ: cada tenant é processado num try/catch próprio — um tenant que falha
// (chave inválida, timeout no Asaas) NÃO derruba o job; segue pro próximo. Resposta =
// resumo pra observabilidade do cron (contadores; nunca custo/margem/chave).
//
// verify_jwt=false no config.toml: o cron manda o segredo cru (não um JWT), então o
// gateway não pode validar JWT antes — a própria função valida o x-cron-secret.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { vaultReadSecret } from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError } from "../_shared/asaas-tenant-client.ts";
import {
  applyCapturedInstallmentPayments,
  deleteSupersededPayment,
  findCapturedInstallmentSale,
  swapToInstallmentSale,
} from "../_shared/customer-installment-swap.ts";

// Limite de cobranças em aberto verificadas por tenant por execução (as mais recentes
// por due_date). Trava de tempo: o cron roda de novo e pega o resto na próxima janela.
const MAX_CHARGES_PER_TENANT = 100;

// Status "em aberto" que ainda podem ter uma baixa perdida (case-tolerante).
const OPEN_STATUSES = ["PENDING", "OVERDUE", "pending", "overdue"];

// Limpeza das cobranças 1x SUBSTITUÍDAS pela venda parcelada ("cliente escolhe
// as parcelas") cujo DELETE na Asaas falhou na hora da troca. Enquanto vivas,
// o pagador ainda pode pagá-las pelo link da Asaas (dinheiro em dobro).
// Recorte: trocas recentes (a janela cobre várias rodadas do cron) e poucas
// por tenant, pra nunca virar varredura sem fim.
const SUPERSEDED_CLEANUP_DAYS = 7;
const MAX_SUPERSEDED_CHARGES_PER_TENANT = 20;

// Troca PRESA do "cliente escolhe as parcelas": o cartão foi capturado numa
// venda parcelada nova (externalReference = tenant_charges.id) mas a cobrança
// ainda aponta pra 1x (isolate morreu, resposta perdida, pagador nunca voltou).
// Mesmo recorte da limpeza: tocadas nos últimos 7 dias, no máx. 20 por tenant.
const STUCK_SWAP_DAYS = 7;
const MAX_STUCK_SWAP_CHARGES_PER_TENANT = 20;

interface TenantAccountRow {
  company_id: string;
  vault_secret_name: string | null;
}

interface TenantChargeRow {
  id: string;
  asaas_payment_id: string | null;
  status: string | null;
}

interface AsaasPayment {
  id: string;
  status?: string;
  value?: number | null;
  installment?: string | null;
  installmentNumber?: number | null;
  netValue?: number | null;
  paymentDate?: string | null;
  confirmedDate?: string | null;
}

interface TenantResult {
  company_id: string;
  checked: number;
  recovered: number;
  overdue_synced: number;
  errors: number;
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const corsHeaders = getCorsHeaders(req);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });

  // ===== Rede de segurança de topo: nenhuma exceção escapa como 500 sem corpo. =====
  try {
    // ---- Autorização por CRON_SECRET (timing-safe). Aceita x-cron-secret OU
    //      Authorization: Bearer <secret>. Fail-closed.
    const cronSecret = (Deno.env.get("CRON_SECRET") || "").trim();
    if (!cronSecret) {
      // Sem segredo configurado no ambiente: nunca autoriza (fail-closed).
      console.error("[tenant-asaas-reconcile] CRON_SECRET ausente no ambiente");
      return json({ error: "Não autorizado." }, 401);
    }
    const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const bearerSecret = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const provided = headerSecret || bearerSecret;
    if (!provided || !timingSafeEqual(provided, cronSecret)) {
      return json({ error: "Não autorizado." }, 401);
    }

    // ---- Client service-role (job de sistema; cruza tenants).
    const supabase: SupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ---- Tenants com Cobranças ativa e chave no Vault.
    const { data: accounts, error: accErr } = await supabase
      .from("tenant_payment_accounts")
      .select("company_id, vault_secret_name")
      .eq("status", "active")
      .not("vault_secret_name", "is", null);

    if (accErr) {
      console.error("[tenant-asaas-reconcile] falha ao listar contas:", accErr.message);
      return json({ error: "Falha ao listar contas de cobrança." }, 500);
    }

    const tenants = (accounts ?? []) as TenantAccountRow[];

    let tenantsProcessed = 0;
    let totalChecked = 0;
    let totalRecovered = 0;
    let totalOverdueSynced = 0;
    let tenantsWithError = 0;
    const perTenant: TenantResult[] = [];

    for (const account of tenants) {
      const companyId = account.company_id;
      const result: TenantResult = {
        company_id: companyId,
        checked: 0,
        recovered: 0,
        overdue_synced: 0,
        errors: 0,
      };

      // ---- try/catch POR TENANT: um tenant que falha não derruba o job. ----
      try {
        if (!account.vault_secret_name) {
          // Defensivo (o filtro já garante não-null): sem chave, pula.
          continue;
        }

        // Lê a chave BYO do Vault (só na memória deste isolate; nunca logada).
        const apiKey = await vaultReadSecret(supabase, account.vault_secret_name);
        if (!apiKey) {
          // Conta ativa mas sem chave decriptável: registra erro e segue.
          result.errors++;
          tenantsWithError++;
          perTenant.push(result);
          console.error(`[tenant-asaas-reconcile] chave ausente no Vault (company ${companyId})`);
          continue;
        }

        // Cliente Asaas do tenant (detecta sandbox/produção pela própria chave).
        const asaas = asaasFor(apiKey);

        // Troca presa do "cliente escolhe as parcelas" ANTES do laço de baixa:
        // se completar aqui, o laço abaixo já enxerga o id novo. Isolado em
        // try/catch próprio: falha só loga, não conta como erro do tenant.
        try {
          const sinceIso = new Date(Date.now() - STUCK_SWAP_DAYS * 86_400_000).toISOString();
          const { data: modeRows, error: modeErr } = await supabase
            .from("tenant_charges")
            .select("id, asaas_payment_id")
            .eq("company_id", companyId)
            .not("customer_max_installments", "is", null)
            .not("asaas_payment_id", "is", null)
            .is("payment_date", null)
            .in("status", OPEN_STATUSES)
            .gte("updated_at", sinceIso)
            .order("updated_at", { ascending: false })
            .limit(MAX_STUCK_SWAP_CHARGES_PER_TENANT);
          if (modeErr) throw new Error(modeErr.message);
          for (const row of (modeRows ?? []) as { id: string; asaas_payment_id: string }[]) {
            try {
              const captured = await findCapturedInstallmentSale(asaas, row.id, row.asaas_payment_id);
              if (!captured) continue;
              const swap = await swapToInstallmentSale(supabase, row.id, row.asaas_payment_id, captured);
              if (swap.outcome !== "swapped") {
                // Não desfazemos venda capturada a partir do cron: fica alto no
                // log pra decisão humana (estorno ou troca manual).
                console.error(
                  `[tenant-asaas-reconcile] GRAVE troca presa não completada (charge ${row.id}, company ${companyId}): ${swap.outcome}/${swap.reason}`,
                );
                continue;
              }
              const baixa = await applyCapturedInstallmentPayments(supabase, asaas, captured.installmentId);
              const removed = await deleteSupersededPayment(asaas, row.asaas_payment_id);
              console.log(
                `[tenant-asaas-reconcile] troca presa completada (charge ${row.id}, company ${companyId}): baixas=${baixa.applied}, erros=${baixa.errors}, 1x_removida=${removed}`,
              );
            } catch (stuckErr) {
              console.error(
                `[tenant-asaas-reconcile] troca presa falhou (charge ${row.id}, company ${companyId}): ${
                  stuckErr instanceof AsaasApiError ? `Asaas HTTP ${stuckErr.status}` : (stuckErr as Error).message
                }`,
              );
            }
          }
        } catch (modeReadErr) {
          console.error(
            `[tenant-asaas-reconcile] leitura de trocas presas falhou (company ${companyId}): ${(modeReadErr as Error).message}`,
          );
        }

        // Cobranças em aberto desse tenant que podem ter baixa perdida
        // (as mais recentes por due_date; trava de tempo por tenant).
        const { data: charges, error: chErr } = await supabase
          .from("tenant_charges")
          .select("id, asaas_payment_id, status")
          .eq("company_id", companyId)
          .not("asaas_payment_id", "is", null)
          .in("status", OPEN_STATUSES)
          .order("due_date", { ascending: false })
          .limit(MAX_CHARGES_PER_TENANT);

        if (chErr) {
          result.errors++;
          tenantsWithError++;
          perTenant.push(result);
          console.error(
            `[tenant-asaas-reconcile] falha ao ler cobranças (company ${companyId}):`,
            chErr.message,
          );
          continue;
        }

        const openCharges = (charges ?? []) as TenantChargeRow[];

        for (const charge of openCharges) {
          const paymentId = charge.asaas_payment_id;
          if (!paymentId) continue;

          try {
            result.checked++;
            totalChecked++;

            // Status REAL no Asaas.
            const payment = await asaas.get<AsaasPayment>(`/payments/${paymentId}`);
            const asaasStatus = String(payment?.status || "").toUpperCase();

            if (asaasStatus === "RECEIVED" || asaasStatus === "CONFIRMED") {
              // PAGO no Asaas mas ainda em aberto no banco → baixa perdida. Recupera.
              // RPC idempotente: se já estava pago, é no-op (seguro).
              const paidAt =
                payment.paymentDate || payment.confirmedDate || new Date().toISOString();
              const net = payment.netValue != null ? Number(payment.netValue) : null;

              // Venda PARCELADA no cartão (payment.installment presente): o
              // valor/netValue deste payment são de UMA parcela, e a cobrança
              // local só guarda o id da 1ª. A baixa é POR PARCELA, de TODAS as
              // parcelas já confirmadas do agrupamento (mesma RPC do webhook,
              // idempotente por parcela). apply_tenant_charge_payment quitaria
              // a venda inteira com o líquido de uma parcela só.
              const isInstallment = typeof payment?.installment === "string" &&
                payment.installment.length > 0;
              let rpcErr: { message: string } | null = null;
              if (isInstallment) {
                const baixa = await applyCapturedInstallmentPayments(
                  supabase,
                  asaas,
                  payment.installment as string,
                );
                if (baixa.errors > 0) {
                  rpcErr = { message: `${baixa.errors} parcela(s) do agrupamento sem baixa` };
                }
              } else {
                const { error } = await supabase.rpc("apply_tenant_charge_payment", {
                  p_asaas_payment_id: paymentId,
                  p_paid_at: paidAt,
                  p_net: net,
                });
                rpcErr = error;
              }
              if (rpcErr) {
                result.errors++;
                console.error(
                  `[tenant-asaas-reconcile] baixa falhou ${paymentId} (company ${companyId}):`,
                  rpcErr.message,
                );
              } else {
                result.recovered++;
                totalRecovered++;
              }
            } else if (
              asaasStatus === "OVERDUE" &&
              String(charge.status || "").toUpperCase() === "PENDING"
            ) {
              // Divergência simples de status: banco diz PENDING, Asaas diz OVERDUE.
              // Atualiza best-effort (posse por company_id). Não é reversão de estorno.
              const { error: updErr } = await supabase
                .from("tenant_charges")
                .update({ status: "OVERDUE", updated_at: new Date().toISOString() })
                .eq("id", charge.id)
                .eq("company_id", companyId);
              if (updErr) {
                result.errors++;
                console.error(
                  `[tenant-asaas-reconcile] sync OVERDUE falhou ${paymentId} (company ${companyId}):`,
                  updErr.message,
                );
              } else {
                result.overdue_synced++;
                totalOverdueSynced++;
              }
            }
            // Outros status (PENDING no Asaas, REFUNDED, CHARGEBACK, etc.): nada a fazer
            // aqui. Estorno/chargeback é responsabilidade do webhook.
          } catch (chargeErr) {
            // Falha numa cobrança (ex: 404 no Asaas, timeout) não derruba o tenant.
            result.errors++;
            const msg = chargeErr instanceof AsaasApiError
              ? `Asaas HTTP ${chargeErr.status}`
              : (chargeErr as Error).message;
            console.error(
              `[tenant-asaas-reconcile] erro na cobrança ${paymentId} (company ${companyId}): ${msg}`,
            );
          }
        }

        // Limpeza de cobranças 1x substituídas (best-effort, isolada: falha
        // aqui só loga e não conta como erro do tenant).
        try {
          const sinceIso = new Date(Date.now() - SUPERSEDED_CLEANUP_DAYS * 86_400_000).toISOString();
          const { data: swappedRows, error: swErr } = await supabase
            .from("tenant_charges")
            .select("id, superseded_asaas_payment_ids")
            .eq("company_id", companyId)
            .neq("superseded_asaas_payment_ids", "{}")
            .gte("updated_at", sinceIso)
            .limit(MAX_SUPERSEDED_CHARGES_PER_TENANT);
          if (swErr) throw new Error(swErr.message);
          for (const row of (swappedRows ?? []) as { superseded_asaas_payment_ids?: string[] | null }[]) {
            for (const oldId of row.superseded_asaas_payment_ids ?? []) {
              try {
                const old = await asaas.get<AsaasPayment>(`/payments/${oldId}`);
                const st = String(old?.status || "").toUpperCase();
                // Só remove o que ainda pode ser pago. Paga/estornada fica:
                // pagamento na 1x substituída é alerta do webhook, não daqui.
                if (st === "PENDING" || st === "OVERDUE") {
                  await asaas.delete(`/payments/${oldId}`);
                  console.log(`[tenant-asaas-reconcile] cobrança substituída removida ${oldId} (company ${companyId})`);
                }
              } catch (oldErr) {
                // 404 = já removida. O resto só loga e tenta na próxima rodada.
                if (!(oldErr instanceof AsaasApiError && oldErr.status === 404)) {
                  console.error(
                    `[tenant-asaas-reconcile] limpeza de substituída falhou ${oldId} (company ${companyId}): ${
                      oldErr instanceof AsaasApiError ? `Asaas HTTP ${oldErr.status}` : (oldErr as Error).message
                    }`,
                  );
                }
              }
            }
          }
        } catch (cleanupErr) {
          console.error(
            `[tenant-asaas-reconcile] leitura de substituídas falhou (company ${companyId}): ${(cleanupErr as Error).message}`,
          );
        }

        tenantsProcessed++;
        if (result.errors > 0) tenantsWithError++;
        perTenant.push(result);
      } catch (tenantErr) {
        // Falha do tenant inteiro (ex: chave inválida no primeiro GET). Segue adiante.
        result.errors++;
        tenantsWithError++;
        perTenant.push(result);
        const msg = tenantErr instanceof AsaasApiError
          ? `Asaas HTTP ${tenantErr.status}`
          : (tenantErr as Error).message;
        console.error(`[tenant-asaas-reconcile] tenant ${companyId} falhou: ${msg}`);
      }
    }

    // Resposta = observabilidade do cron (sem custo/margem/chave).
    return json({
      ok: true,
      tenants_total: tenants.length,
      tenants_processed: tenantsProcessed,
      tenants_with_error: tenantsWithError,
      charges_checked: totalChecked,
      payments_recovered: totalRecovered,
      overdue_synced: totalOverdueSynced,
      per_tenant: perTenant,
      ran_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[tenant-asaas-reconcile] erro inesperado:", (e as Error).message);
    return json({ error: "Erro ao conciliar cobranças." }, 500);
  }
});
