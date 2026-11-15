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
//   DESCONHECIDO → permanece no ledger para revisão, sem gerar receita provisória.
// A RPC usa a identidade do movimento para adotar o registro criado pelo webhook.
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
// Cliente Supabase: service_role (grava ledger_asaas e tarifas identificadas; o RLS
// do ledger é admin-only, então a escrita é por service_role).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { asaas, buildQuery, AsaasConfigError, AsaasApiError } from "../_shared/asaas-client.ts";

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
  billId?: string | null;
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

function amountsMatch(a: number | string | null | undefined, b: number): boolean {
  return Math.abs(Number(a) - b) < 0.005;
}

/**
 * O paymentId sozinho NÃO identifica a linha: o mesmo pagamento pode ter a
 * receita e uma ou mais tarifas. Só oferecemos a chave do webhook compatível
 * com a família do evento do extrato; tipo/direção/valor ainda são validados.
 */
function knownWebhookKeys(tx: AsaasFinancialTx, direction: "credit" | "debit"): string[] {
  if (!tx.paymentId) return [];
  const event = String(tx.type ?? "").toUpperCase();
  if (direction === "credit" && ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(event)) {
    return [tx.paymentId];
  }
  if (direction === "debit" && event.includes("ANTICIPATION") && event.endsWith("_FEE")) {
    return [`${tx.paymentId}_anticipation_fee`];
  }
  if (direction === "debit" && event === "PAYMENT_FEE") {
    return [`${tx.paymentId}_fee`];
  }
  return [];
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

    // ===== Auth: cron (x-cron-secret) OU permissão financeira de lançamento =====
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
      const { data: canManage, error: permissionError } = await supabase.rpc("can_manage_admin_financial", {
        _user_id: user.id,
      });
      if (permissionError) {
        console.error("[sync-asaas-ledger] guarda financeira indisponível:", permissionError.message);
        return json({ error: "Não foi possível validar a permissão financeira." }, 503);
      }
      if (!canManage) {
        return json({ error: "Permissão de lançamento financeiro necessária." }, 403);
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

    // O sync só é fonte para linhas ainda automáticas/pendentes. Uma decisão
    // humana não pode ser sobrescrita por um replay do mesmo ftn_.
    const existingLedgerStatus = new Map<string, string>();
    const extractIds = [...new Set(extract.map((tx) => tx.id).filter(Boolean))];
    const LEDGER_CHUNK = 100;
    for (let i = 0; i < extractIds.length; i += LEDGER_CHUNK) {
      const { data: rows, error } = await supabase
        .from("ledger_asaas")
        .select("asaas_transaction_id, status")
        .in("asaas_transaction_id", extractIds.slice(i, i + LEDGER_CHUNK));
      if (error) throw new Error(`falha ao pré-carregar ledger: ${error.message}`);
      for (const row of rows ?? []) {
        if (row.asaas_transaction_id) existingLedgerStatus.set(row.asaas_transaction_id, String(row.status ?? ""));
      }
    }

    // Pré-carrega as possíveis chaves do webhook. A decisão final abaixo também
    // confere família, direção e valor — paymentId por si só não é suficiente.
    const candidateIds = new Set<string>();
    for (const tx of extract) {
      if (tx.paymentId) {
        candidateIds.add(tx.paymentId);
        candidateIds.add(`${tx.paymentId}_fee`);
        candidateIds.add(`${tx.paymentId}_anticipation_fee`);
      }
    }
    const knownByAsaasId = new Map<string, { id: string; category: string | null; type: string; amount: number }>();
    if (candidateIds.size > 0) {
      const ids = Array.from(candidateIds);
      // Quebra em lotes pra não estourar limite do .in()
      const CHUNK = 200;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: rows } = await supabase
          .from("admin_financial_transactions")
          .select("id, category, type, amount, asaas_transaction_id")
          .in("asaas_transaction_id", slice);
        for (const r of rows ?? []) {
          if (r.asaas_transaction_id) {
            knownByAsaasId.set(r.asaas_transaction_id, {
              id: r.id,
              category: r.category ?? null,
              type: r.type,
              amount: Number(r.amount),
            });
          }
        }
      }
    }

    let imported = 0;
    let known = 0;
    let unknown = 0;
    let failed = 0;
    let manuallySkipped = 0;

    for (const tx of extract) {
      try {
        if (existingLedgerStatus.get(tx.id) === "manually_categorized") {
          manuallySkipped++;
          continue;
        }
        const direction = directionOf(tx.value);
        const amount = Math.abs(Number(tx.value));
        const occurredAt = asaasDateToIsoBRT(tx.date);
        const paymentId = tx.paymentId ?? null;
        const description = tx.description ?? null;

        // Tenta casar o movimento com lançamento do webhook. Nunca usa o
        // paymentId cru para tarifa: isso era o que ligava PAYMENT_FEE à venda.
        const expectedType = direction === "credit" ? "income" : "expense";
        const matched = knownWebhookKeys(tx, direction)
          .map((key) => knownByAsaasId.get(key))
          .find((candidate) => !!candidate && candidate.type === expectedType && amountsMatch(candidate.amount, amount));

        let status: string;
        let category: string | null;
        let adminTxId: string | null;

        if (matched) {
          // ===== CONHECIDO: já existe lançamento (webhook). Só espelha no ledger. =====
          status = "auto_categorized";
          category = matched.category; // sale / renewal / asaas_fee
          adminTxId = matched.id;
        } else {
          // Movimentos sem vínculo ficam na revisão. Não cria receita paralela
          // à venda que o webhook pode estar processando simultaneamente.
          status = "pending_categorization";
          category = null;
          adminTxId = null;
        }

        // ===== Espelha no ledger_asaas (UPSERT idempotente por asaas_transaction_id) =====
        const ledgerRow = {
          asaas_transaction_id: tx.id,
          asaas_event_type: tx.type ?? "UNKNOWN",
          asaas_payment_id: paymentId,
          asaas_transfer_id: tx.transferId ?? tx.billId ?? null,
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

        const { error: ledgerErr } = await supabase.rpc("record_admin_asaas_ledger", {p_entries:[ledgerRow],p_source:"sync"});

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
      unknown,          // movimentos sem vínculo, aguardando revisão
      failed,
      manually_skipped: manuallySkipped,
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
