// sync-asaas-ledger
// ------------------
// Conciliação bancária Asaas (painel master Auctus). Puxa o EXTRATO da conta Asaas
// (GET /financialTransactions, paginado) e ESPELHA cada movimento em `ledger_asaas`
// (UPSERT idempotente por asaas_transaction_id UNIQUE). Para cada movimento decide:
//
//   CONHECIDO  → o movimento tem paymentId que casa com um lançamento JÁ criado pelo
//                webhook em admin_financial_transactions (por asaas_transaction_id =
//                paymentId, ou paymentId + '_fee' para tarifa). Nesse caso:
//                  - status = 'auto_categorized'
//                  - category = a category do lançamento existente (sale/renewal/asaas_fee)
//                  - admin_financial_transaction_id = id desse lançamento
//                NÃO cria lançamento novo (o webhook já criou).
//
//   DESCONHECIDO → sem paymentId, ou paymentId que NÃO casa (ex: PIX recebido fora da
//                cobrança, PIX enviado, transferência, saque). Nesse caso:
//                  - status = 'pending_categorization'
//                  - category = other_income (credit) / other_expense (debit)
//                  - CRIA um lançamento PROVISÓRIO em admin_financial_transactions
//                    (income/expense conforme direction, category other_income/
//                    other_expense, asaas_transaction_id = id do movimento, ON CONFLICT
//                    DO NOTHING) e linka admin_financial_transaction_id.
//                Assim o movimento aparece no financeiro como "Outras Receitas/Despesas"
//                até o admin categorizá-lo (Fase C).
//
// Idempotência TOTAL (rodar 2x não duplica):
//   - ledger_asaas.asaas_transaction_id UNIQUE → UPSERT onConflict.
//   - lançamento provisório por admin_financial_transactions.asaas_transaction_id
//     (índice UNIQUE parcial) → upsert ignoreDuplicates.
//
// Janela de sincronização (last_sync_at): Dominex NÃO tem tabela genérica de config
// (não existe app_config/admin_config). Em vez de criar uma tabela só pra um cursor
// (seria escopo do dev-database), derivamos o ponto de partida do HIGHWATER MARK:
// o maior occurred_at já presente em ledger_asaas, com lookback de segurança. Como o
// sync é idempotente, reprocessar a borda é inofensivo. Veja getStartDate().
//
// Auth (regra-lei Dominex #6): super_admin (botão "Sincronizar" da tela) OU cron via
// header `x-cron-secret` == CRON_SECRET (pronto pra agendamento futuro).
//
// Cliente Supabase: service_role (grava ledger_asaas + lançamentos provisórios; o RLS
// do ledger é admin-only, então a escrita é por service_role).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { asaas, buildQuery, AsaasConfigError, AsaasApiError } from "../_shared/asaas-client.ts";

// Categorias guarda-chuva (existem em admin_financial_categories).
const CAT_OTHER_INCOME = "other_income";
const CAT_OTHER_EXPENSE = "other_expense";

// Lookback padrão quando o ledger está vazio (primeira sincronização).
const DEFAULT_LOOKBACK_DAYS = 90;
// Margem de segurança ao retomar do highwater mark (reprocessa a borda — idempotente).
const HIGHWATER_SAFETY_DAYS = 2;
// Trava de segurança contra loop de paginação.
const MAX_OFFSET = 20000;
const PAGE_LIMIT = 100;

interface AsaasFinancialTx {
  id: string;
  type?: string;
  value: number;
  description?: string;
  date?: string;       // "YYYY-MM-DD" (sem hora no extrato)
  paymentId?: string | null;
  transferId?: string | null;
  balance?: number;
}

// O extrato Asaas (/financialTransactions) traz `date` como "YYYY-MM-DD" (sem hora).
// Asaas opera em America/Sao_Paulo (UTC-3). Convertemos para meio-dia BRT → ISO UTC
// para o occurred_at ficar TZ-aware e cair no dia correto no painel (UTC-3 fixo Dominex).
function asaasDateToIsoBRT(dateStr: string | undefined | null): string {
  if (!dateStr) return new Date().toISOString();
  if (dateStr.includes("T")) return new Date(dateStr).toISOString();
  // "YYYY-MM-DD HH:MM:SS" → respeita a hora; "YYYY-MM-DD" → meio-dia BRT.
  const m = dateStr.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/);
  if (!m) return new Date(`${dateStr}T12:00:00-03:00`).toISOString();
  const time = m[2] ? (m[2].length === 5 ? `${m[2]}:00` : m[2]) : "12:00:00";
  return new Date(`${m[1]}T${time}-03:00`).toISOString();
}

/** Direção a partir do sinal do valor do extrato Asaas (negativo = débito/saída). */
function directionOf(value: number): "credit" | "debit" {
  return Number(value) < 0 ? "debit" : "credit";
}

/** Puxa TODO o extrato Asaas no intervalo (paginação por offset). */
async function fetchAsaasExtract(startDate: string, finishDate: string): Promise<AsaasFinancialTx[]> {
  const out: AsaasFinancialTx[] = [];
  let offset = 0;
  while (true) {
    const query = buildQuery({ startDate, finishDate, offset, limit: PAGE_LIMIT });
    const page = await asaas.get<{ data?: AsaasFinancialTx[]; hasMore?: boolean }>(
      `/financialTransactions`,
      query,
    );
    const rows = page?.data ?? [];
    out.push(...rows);
    if (!page?.hasMore || rows.length === 0) break;
    offset += PAGE_LIMIT;
    if (offset > MAX_OFFSET) {
      console.warn(`[sync-asaas-ledger] atingiu trava de segurança de ${MAX_OFFSET} movimentos`);
      break;
    }
  }
  return out;
}

/** Data de início (YYYY-MM-DD) derivada do highwater mark do ledger + margem. */
async function getStartDate(supabase: any): Promise<string> {
  const { data: latest } = await supabase
    .from("ledger_asaas")
    .select("occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lookbackMs = DEFAULT_LOOKBACK_DAYS * 24 * 3600 * 1000;
  if (latest?.occurred_at) {
    const highwaterMs = Date.parse(latest.occurred_at) - HIGHWATER_SAFETY_DAYS * 24 * 3600 * 1000;
    // Nunca anda menos que o lookback padrão pra trás além do necessário, mas também
    // não pula movimentos antigos não-conciliados: parte do highwater - margem.
    return new Date(highwaterMs).toISOString().slice(0, 10);
  }
  return new Date(Date.now() - lookbackMs).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const corsHeaders = getCorsHeaders(req);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ===== Auth: cron (x-cron-secret) OU super_admin =====
    const cronSecret = (Deno.env.get("CRON_SECRET") || "").trim();
    const providedCron = (req.headers.get("x-cron-secret") || "").trim();
    const isCron = cronSecret.length > 0 && providedCron === cronSecret;

    let callerId: string | null = null;
    if (!isCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return json({ error: "Autenticação necessária." }, 401);
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return json({ error: "Token inválido." }, 401);
      }
      const { data: isSuperAdmin } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "super_admin",
      });
      if (!isSuperAdmin) {
        return json({ error: "Acesso negado. Apenas o administrador master." }, 403);
      }
      callerId = user.id;
    }

    // ===== Janela de sincronização =====
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const fullSync = body?.fullSync === true;
    const startDate = fullSync
      ? new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10)
      : await getStartDate(supabase);
    const finishDate = new Date().toISOString().slice(0, 10);

    // ===== Extrato Asaas =====
    const extract = await fetchAsaasExtract(startDate, finishDate);

    // Pré-carrega os lançamentos do webhook que casam com algum paymentId do extrato.
    // Conhecido = admin_financial_transactions.asaas_transaction_id IN (paymentId, paymentId+'_fee').
    const candidateIds = new Set<string>();
    for (const tx of extract) {
      if (tx.paymentId) {
        candidateIds.add(tx.paymentId);
        candidateIds.add(`${tx.paymentId}_fee`);
      }
    }
    const knownByAsaasId = new Map<string, { id: string; category: string | null }>();
    if (candidateIds.size > 0) {
      const ids = Array.from(candidateIds);
      // Quebra em lotes pra não estourar limite do .in()
      const CHUNK = 200;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: rows } = await supabase
          .from("admin_financial_transactions")
          .select("id, category, asaas_transaction_id")
          .in("asaas_transaction_id", slice);
        for (const r of rows ?? []) {
          if (r.asaas_transaction_id) {
            knownByAsaasId.set(r.asaas_transaction_id, { id: r.id, category: r.category ?? null });
          }
        }
      }
    }

    let imported = 0;
    let known = 0;
    let unknown = 0;
    let failed = 0;

    for (const tx of extract) {
      try {
        const direction = directionOf(tx.value);
        const amount = Math.abs(Number(tx.value));
        const occurredAt = asaasDateToIsoBRT(tx.date);
        const paymentId = tx.paymentId ?? null;
        const description = tx.description ?? null;

        // Tenta casar o movimento com um lançamento do webhook (CONHECIDO).
        // Casa pelo paymentId direto OU pela variante '_fee' (tarifa do webhook).
        let matched: { id: string; category: string | null } | undefined;
        if (paymentId) {
          matched = knownByAsaasId.get(paymentId) ?? knownByAsaasId.get(`${paymentId}_fee`);
        }

        let status: string;
        let category: string | null;
        let adminTxId: string | null;

        if (matched) {
          // ===== CONHECIDO: já existe lançamento (webhook). Só espelha no ledger. =====
          status = "auto_categorized";
          category = matched.category; // sale / renewal / asaas_fee
          adminTxId = matched.id;
        } else {
          // ===== DESCONHECIDO: cria lançamento provisório "Outras Receitas/Despesas". =====
          status = "pending_categorization";
          category = direction === "credit" ? CAT_OTHER_INCOME : CAT_OTHER_EXPENSE;

          const provisional = {
            type: direction === "credit" ? "income" : "expense",
            category,
            amount,
            description:
              description ??
              (direction === "credit" ? "Outras receitas (Asaas)" : "Outras despesas (Asaas)"),
            transaction_date: occurredAt,
            asaas_transaction_id: tx.id,
            reference_type: "asaas_ledger_uncategorized",
            created_by: callerId, // null quando vem de cron
          };

          // Idempotente: asaas_transaction_id é UNIQUE parcial → ignora duplicado.
          const { error: insErr } = await supabase
            .from("admin_financial_transactions")
            .upsert(provisional, {
              onConflict: "asaas_transaction_id",
              ignoreDuplicates: true,
            });
          if (insErr) {
            console.error(`[sync-asaas-ledger] falha ao criar lançamento provisório ${tx.id}:`, insErr.message);
          }

          // Recupera o id do lançamento (recém-criado OU pré-existente) pra linkar no ledger.
          const { data: provRow } = await supabase
            .from("admin_financial_transactions")
            .select("id")
            .eq("asaas_transaction_id", tx.id)
            .maybeSingle();
          adminTxId = provRow?.id ?? null;
        }

        // ===== Espelha no ledger_asaas (UPSERT idempotente por asaas_transaction_id) =====
        const ledgerRow = {
          asaas_transaction_id: tx.id,
          asaas_event_type: tx.type ?? "UNKNOWN",
          asaas_payment_id: paymentId,
          direction,
          amount,
          occurred_at: occurredAt,
          description,
          category,
          status,
          source: "sync",
          admin_financial_transaction_id: adminTxId,
          raw_payload: tx as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        };

        const { error: ledgerErr } = await supabase
          .from("ledger_asaas")
          .upsert(ledgerRow, { onConflict: "asaas_transaction_id" });

        if (ledgerErr) {
          failed++;
          console.error(`[sync-asaas-ledger] falha ao gravar ledger ${tx.id}:`, ledgerErr.message);
          continue;
        }

        imported++;
        if (matched) known++;
        else unknown++;
      } catch (rowErr) {
        failed++;
        console.error(`[sync-asaas-ledger] erro no movimento ${tx?.id}:`, (rowErr as Error).message);
      }
    }

    return json({
      ok: true,
      imported,
      known,            // movimentos já categorizados pelo webhook (venda/renovação/tarifa)
      unknown,          // movimentos provisórios (Outras Receitas/Despesas)
      failed,
      total_in_extract: extract.length,
      window: { startDate, finishDate },
      synced_at: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof AsaasConfigError) {
      console.error("[sync-asaas-ledger] config:", e.message);
      return json({ error: e.message }, 503);
    }
    if (e instanceof AsaasApiError) {
      console.error("[sync-asaas-ledger] asaas:", e.message, e.asaasErrors);
      return json({ error: "Não foi possível ler o extrato do Asaas no momento." }, 502);
    }
    console.error("[sync-asaas-ledger] erro inesperado:", (e as Error).message);
    return json({ error: "Erro ao sincronizar o extrato do Asaas." }, 500);
  }
});
