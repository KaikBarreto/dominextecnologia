// backfill-asaas-customers
// -------------------------
// Provisiona o customer Asaas (cus_*) para empresas que ainda NÃO têm
// companies.asaas_customer_id. Recupera o furo FM1 da auditoria: empresas criadas
// antes do provisionamento no cadastro (ou cujo provisionamento falhou) ficavam sem
// customer, gerando pagamento órfão no webhook.
//
// On-demand: o CEO roda 1x pelo painel master (super_admin) OU via cron com header
// `x-cron-secret` == CRON_SECRET (regra-lei Dominex #6).
//
// Comportamento:
//   - Itera companies WHERE asaas_customer_id IS NULL, em LOTES.
//   - Para cada uma: find-or-create do customer (provisionAsaasCustomer, best-effort).
//   - Pausa ~1s entre chamadas Asaas pra não estourar rate limit.
//   - NÃO falha tudo se uma empresa der erro — acumula em errors[] e segue.
//
// Retorna { processed, created, skipped, failed, errors[] }.
//
// Cliente Supabase: service_role (lê todas as companies e grava asaas_customer_id —
// RLS de companies bloqueia o tenant; escrita master é service_role).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { provisionAsaasCustomer } from "../_shared/asaas-customer.ts";

const BATCH_SIZE = 50;
const SLEEP_MS = 1000; // pausa entre chamadas Asaas (rate limit)
const MAX_COMPANIES = 5000; // trava de segurança contra loop

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
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
    }

    // ===== Itera companies sem asaas_customer_id, em lotes =====
    let processed = 0;
    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ company_id: string; name: string | null; error: string }> = [];

    while (processed < MAX_COMPANIES) {
      // Sempre busca a partir do início: cada empresa provisionada deixa de bater no
      // filtro (asaas_customer_id passa a NOT NULL), então o range avança naturalmente.
      const { data: batch, error: batchErr } = await supabase
        .from("companies")
        .select("id, name, email, cnpj, asaas_customer_id, address, address_number, neighborhood, zip_code")
        .is("asaas_customer_id", null)
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (batchErr) {
        return json({ error: `Falha ao listar empresas: ${batchErr.message}` }, 500);
      }
      if (!batch || batch.length === 0) break;

      // Empresas que FALHAM mantêm asaas_customer_id NULL e voltariam neste mesmo filtro
      // no próximo lote → loop infinito. Contamos quantas AVANÇARAM (created/skipped) neste
      // lote; se nenhuma avançou, paramos (ex: chave Asaas ausente faz todas falharem igual).
      let advancedThisBatch = 0;

      for (const company of batch) {
        processed++;
        const result = await provisionAsaasCustomer(supabase, company);
        if (result.outcome === "created") {
          created++;
          advancedThisBatch++;
        } else if (result.outcome === "skipped") {
          skipped++;
          advancedThisBatch++;
        } else {
          failed++;
          errors.push({
            company_id: company.id,
            name: company.name ?? null,
            error: result.error ?? "Erro desconhecido.",
          });
        }
        // Pausa entre chamadas Asaas pra não estourar rate limit.
        await sleep(SLEEP_MS);

        if (processed >= MAX_COMPANIES) break;
      }

      // Nenhuma empresa do lote saiu do filtro (todas falharam) → para pra não rodar em
      // círculos com as mesmas empresas que continuam NULL.
      if (advancedThisBatch === 0) break;
    }

    return json({
      success: true,
      processed,
      created,
      skipped,
      failed,
      errors,
      message: `Backfill concluído: ${created} criados, ${skipped} já existiam, ${failed} falharam.`,
    });
  } catch (error: unknown) {
    console.error("backfill-asaas-customers error:", error);
    const message = error instanceof Error ? error.message : "Erro ao executar o backfill.";
    return json({ error: message }, 500);
  }
});
