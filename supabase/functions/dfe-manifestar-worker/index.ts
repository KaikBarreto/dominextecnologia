// =============================================================================
// dfe-manifestar-worker — consome a fila de manifestação e transmite à SEFAZ.
// =============================================================================
// Roda a cada 2 minutos via pg_cron + pg_net (job `dfe-manifestar-worker`,
// agendado na migration 20260924170000). Guard por CRON_SECRET (Vault).
//
// ⚠️ NÃO ACEITA JWT DE USUÁRIO. Ela drena a fila de TODAS as empresas e
// transmite evento IRREVERSÍVEL em nome de cada CNPJ. Quem pede manifestação é
// `dfe-manifestar`, que prova posse pelo profile.
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ O QUE TORNA ESTE WORKER SEGURO DE RE-EXECUTAR                             │
// │                                                                           │
// │ 1. O claim é atômico (FOR UPDATE SKIP LOCKED na RPC): duas instâncias do   │
// │    cron não pegam o mesmo job.                                            │
// │ 2. cStat 573 (duplicidade) é SUCESSO. É o retorno quando a SEFAZ aceitou e │
// │    a nossa gravação falhou depois — reenviar é idempotente, e é por isso   │
// │    que retentar um job "preso" não gera evento duplicado na Receita.       │
// │ 3. Job órfão (processo morto com status='processando') volta pra fila só   │
// │    depois de 10 min, dentro da própria RPC de claim.                      │
// └───────────────────────────────────────────────────────────────────────────┘
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  carregarConfigFiscal,
  DfeServiceError,
  manifestar,
  resolverIdentidadeFiscal,
  temCertificado,
} from "../_shared/dfe-client.ts";
import type { TipoManifestacao } from "../_shared/dfe-client.ts";

const TAG = "[dfe-manifestar-worker]";

/** Transmissão de evento é rápida (um SOAP curto). 45s é folga generosa. */
const TIMEOUT_MS = 45_000;

const ORCAMENTO_MS = 100_000;
const MAX_JOBS = 15;

/**
 * Tentativas antes de desistir.
 *
 * 6 tentativas com o backoff abaixo cobrem ~4h de indisponibilidade da SEFAZ —
 * mais que qualquer janela de manutenção documentada. Depois disso o job vira
 * 'erro' e o usuário decide se pede de novo: insistir para sempre esconderia um
 * problema de configuração (certificado vencido, por exemplo) atrás de um
 * spinner eterno.
 */
const MAX_TENTATIVAS = 6;

/** Backoff por tentativa JÁ CONSUMIDA (o claim incrementa antes de chamar). */
function esperaMinutos(tentativas: number): number {
  const grade = [2, 5, 15, 45, 120, 180];
  return grade[Math.min(Math.max(tentativas, 1) - 1, grade.length - 1)];
}

interface Job {
  id: string;
  company_id: string;
  inbound_nfe_id: string;
  chave: string;
  tipo: TipoManifestacao;
  justificativa: string | null;
  tentativas: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  const cronSecret = (Deno.env.get("CRON_SECRET") ?? "").trim();
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const comeco = Date.now();

  try {
    const { data, error } = await supabase.rpc("dfe_manifestacao_claim", {
      p_limite: MAX_JOBS,
      p_orfao_minutos: 10,
    });
    if (error) throw error;

    const jobs = (data ?? []) as Job[];

    let registradas = 0;
    let duplicadas = 0;
    let rejeitadas = 0;
    let adiadas = 0;

    // Cache por empresa: vários jobs da mesma empresa no mesmo lote não podem
    // significar várias leituras de config (e várias linhas de auditoria de
    // decifra são inevitáveis — cada transmissão usa o certificado de verdade).
    const configs = new Map<string, Record<string, unknown> | null>();
    const identidades = new Map<string, { cnpj: string; uf: string } | null>();

    for (const job of jobs) {
      if (Date.now() - comeco >= ORCAMENTO_MS) {
        // Sobrou fila: os jobs não processados continuam 'processando' e voltam
        // sozinhos pelo desbloqueio de órfão (10 min). Nenhum evento se perde.
        break;
      }

      const curto = job.company_id.slice(0, 8) + "...";

      if (!configs.has(job.company_id)) {
        configs.set(job.company_id, await carregarConfigFiscal(supabase, job.company_id));
      }
      const fiscal = configs.get(job.company_id) ?? null;

      if (!fiscal || !temCertificado(fiscal)) {
        await falhar(
          supabase,
          job,
          "O certificado digital da empresa não está disponível. Envie o certificado nas configurações fiscais e peça a manifestação novamente.",
          true,
        );
        rejeitadas += 1;
        continue;
      }

      if (!identidades.has(job.company_id)) {
        const r = await resolverIdentidadeFiscal(supabase, job.company_id);
        identidades.set(job.company_id, r.ok ? r.identidade : null);
        if (!r.ok) {
          await falhar(supabase, job, r.motivo, true);
          rejeitadas += 1;
          continue;
        }
      }
      const ident = identidades.get(job.company_id);
      if (!ident) {
        await falhar(
          supabase,
          job,
          "Complete o CNPJ e o estado da empresa no cadastro antes de manifestar notas.",
          true,
        );
        rejeitadas += 1;
        continue;
      }

      try {
        const r = await manifestar(
          { supabase, companyId: job.company_id, fiscal },
          {
            cnpj: ident.cnpj,
            chave: job.chave,
            tipo: job.tipo,
            justificativa: job.justificativa,
            timeoutMs: TIMEOUT_MS,
          },
        );

        // ⚠️ `duplicada: true` (cStat 573) chega aqui como SUCESSO, e é assim
        // que tem que ser: o evento JÁ está na SEFAZ. Tratar como erro faria a
        // tela mostrar falha para algo que está registrado e não se desfaz.
        const { error: okErr } = await supabase.rpc("dfe_manifestacao_concluir", {
          p_job_id: job.id,
          p_cstat: String(r.cStat ?? ""),
          p_protocolo: r.protocolo ?? null,
          p_registrada_em: r.registradaEm ?? null,
        });
        if (okErr) {
          // A SEFAZ aceitou mas não conseguimos gravar. Deixar o job em fila é
          // seguro justamente por causa do 573.
          console.error(`${TAG} concluir`, { company_id: curto, message: okErr.message });
          await falhar(supabase, job, "Falha ao registrar o retorno da SEFAZ.", false);
          adiadas += 1;
          continue;
        }
        if (r.duplicada) duplicadas += 1;
        else registradas += 1;
      } catch (err) {
        const erro = err instanceof DfeServiceError
          ? err
          : new DfeServiceError(
            "Não foi possível transmitir a manifestação agora.",
            { status: 503, codigo: "servico_indisponivel" },
          );

        // 422 = recusa definitiva da SEFAZ: repetir igual não muda o resultado.
        // Tudo o mais (503, timeout, rede) é transitório e volta pra fila.
        const permanente = erro.status === 422 ||
          erro.codigo === "manifestacao_rejeitada" ||
          erro.codigo === "certificado_invalido" ||
          job.tentativas >= MAX_TENTATIVAS;

        console.error(`${TAG} job falhou`, {
          company_id: curto,
          codigo: erro.codigo,
          tentativas: job.tentativas,
          permanente,
        });

        await falhar(supabase, job, erro.message, permanente);
        if (permanente) rejeitadas += 1;
        else adiadas += 1;
      }
    }

    return new Response(
      JSON.stringify({
        message: "Manifestation queue drained",
        jobs_claimed: jobs.length,
        registered: registradas,
        already_registered: duplicadas,
        rejected: rejeitadas,
        retrying: adiadas,
        elapsed_ms: Date.now() - comeco,
      }),
      { headers },
    );
  } catch (err) {
    console.error(`${TAG} erro`, { message: (err as Error)?.message });
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: (err as Error)?.message }),
      { status: 500, headers },
    );
  }
});

async function falhar(
  supabase: SupabaseClient,
  job: Job,
  mensagem: string,
  permanente: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("dfe_manifestacao_falhar", {
    p_job_id: job.id,
    p_erro: mensagem.slice(0, 500),
    p_permanente: permanente,
    p_espera_minutos: esperaMinutos(job.tentativas),
  });
  if (error) {
    console.error(`${TAG} falhar`, { job: job.id.slice(0, 8) + "...", message: error.message });
  }
}
