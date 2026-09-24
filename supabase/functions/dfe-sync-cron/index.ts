// =============================================================================
// dfe-sync-cron — rotina automática de busca de notas destinadas (NF-e + NFS-e).
// =============================================================================
// Roda a cada 10 minutos via pg_cron + pg_net (job `dfe-sync-notas`, agendado na
// migration 20260924170000 e renomeado na 20260924191000). Passo CURTO de
// propósito: a trava anti-consumo-indevido é por empresa E POR TIPO
// (`dfe_sync_state.proxima_consulta_em`), então varrer de 10 em 10 min só
// significa "pegar quem já venceu a janela". Quem não venceu é pulado sem custo
// — o claim recusa e ninguém fala com o governo.
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ AUTH — ESTA FUNÇÃO NÃO ACEITA JWT DE USUÁRIO                              │
// │                                                                           │
// │ Guard por CRON_SECRET (Vault), mesmo padrão de extend-contract-billing /   │
// │ extend-recurring-tasks / activate-scheduled-orders. NÃO existe caminho     │
// │ alternativo com `Authorization: Bearer <jwt>`: ela itera TODAS as empresas │
// │ com opt-in ligado, então aceitar sessão de usuário seria dar a qualquer    │
// │ tenant o poder de disparar consulta ao governo no CNPJ dos outros — e de   │
// │ queimar a cota horária alheia. Quem quer sincronizar a própria empresa usa │
// │ `dfe-sync`, que prova posse pelo profile.                                  │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ DUAS FILAS, UMA RODADA, UM TETO SÓ                                        │
// │                                                                           │
// │ NF-e (SEFAZ) e NFS-e (Ambiente de Dados Nacional) são webservices          │
// │ diferentes, mas o custo que interessa limitar é o MESMO: chamada ao        │
// │ governo dentro de uma rodada de edge com wall clock finito. Por isso       │
// │ `MAX_CHAMADAS` é GLOBAL e não por tipo — dois tetos de 10 seriam 20        │
// │ chamadas por rodada, e a rodada não tem tempo pra isso.                    │
// │                                                                           │
// │ Empresa com os dois opt-ins ligados gera DUAS tarefas independentes, cada  │
// │ uma com a sua linha de estado. A ordem de atendimento é "mais atrasado     │
// │ primeiro" olhando `proxima_consulta_em` da respectiva linha, misturando os │
// │ tipos: quem esperou mais vai antes, seja de que fila for.                  │
// └───────────────────────────────────────────────────────────────────────────┘
//
// Toda a mecânica de rodada (as três obrigações anti-656) está em
// `_shared/dfe-sync-core.ts` — handler único com o botão, de propósito.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  sincronizarNfeDestinada,
  sincronizarNfseDestinada,
} from "../_shared/dfe-sync-core.ts";
import { temCertificado } from "../_shared/dfe-client.ts";

/**
 * Orçamento de parede da rodada inteira.
 *
 * Uma chamada à VPS pode levar até 75s (orçamento do serviço) e o nosso teto de
 * fetch é 110s. Com 100s de orçamento aqui, uma empresa lenta consome a rodada
 * sozinha e as demais esperam o tick seguinte — o que é CORRETO: elas não têm
 * pressa (a janela delas é de 65 min) e estourar o wall clock da edge mataria a
 * gravação do cursor no meio, que é o pior desfecho possível.
 */
const ORCAMENTO_MS = 100_000;

/**
 * Teto de CHAMADAS AO GOVERNO por rodada, somando as DUAS filas. Com 10 min de
 * passo, 60/hora — e a janela de cada (empresa, tipo) é de 65 min.
 *
 * ⚠️ O teto conta só o que CUSTA (chamada à VPS/governo). Empresa recusada no
 * claim ("ainda na janela") ou barrada por configuração custa um SELECT e NÃO
 * consome vaga — senão bastariam 10 empresas mal configuradas, que nunca
 * avançam `proxima_consulta_em` e por isso ficam eternamente no topo da ordem
 * de atendimento, pra as saudáveis nunca mais sincronizarem.
 */
const MAX_CHAMADAS = 10;

/**
 * Estados que significam "falamos com o governo nesta rodada".
 *
 * `rejeitado` entra: a recusa do Ambiente Nacional é uma resposta, e chegar até
 * ela custou a chamada. Deixá-lo de fora faria uma empresa com credenciamento
 * pendente consumir a rodada inteira sem nunca ocupar uma vaga.
 */
const CUSTOU_CHAMADA = new Set([
  "sincronizado",
  "consumo_indevido",
  "rejeitado",
  "indisponivel",
]);

type TipoFila = "nfe" | "nfse";

interface Tarefa {
  companyId: string;
  tipo: TipoFila;
  fiscal: Record<string, unknown>;
  /** Quando esta (empresa, tipo) ficou/fica liberada. 0 = nunca sincronizou. */
  liberadaEm: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  // ---- Guard: só o cron/scheduler com CRON_SECRET --------------------------
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
    // Empresas com ALGUM opt-in de recebimento ligado. A fila real (quem já
    // venceu a janela) é resolvida no claim, dentro do core — aqui só montamos
    // a lista e a ordem.
    const { data, error } = await supabase
      .from("company_fiscal_settings")
      .select(
        "company_id, fiscal_ambiente, certificado_ref, certificado_dek_envelopada, " +
          "certificado_senha_cifrada, certificado_nonce, certificado_algoritmo, " +
          "dfe_nfe_ativo, dfe_nfse_ativo",
      )
      .or("dfe_nfe_ativo.eq.true,dfe_nfse_ativo.eq.true");

    if (error) throw error;

    const candidatas = (data ?? []) as unknown as Array<Record<string, unknown>>;

    // Ordem de atendimento: quem está esperando há mais tempo vai primeiro,
    // MISTURANDO os tipos. A chave é (company_id, tipo) porque as duas filas da
    // mesma empresa correm independentes — uma pode estar em dia e a outra não.
    const { data: estados } = await supabase
      .from("dfe_sync_state")
      .select("company_id, tipo, proxima_consulta_em");
    const quando = new Map<string, number>();
    for (
      const e of (estados ?? []) as Array<
        { company_id: string; tipo: string; proxima_consulta_em: string }
      >
    ) {
      quando.set(`${e.company_id}:${e.tipo}`, Date.parse(e.proxima_consulta_em ?? "") || 0);
    }

    // Sem certificado A1 custodiado não existe consulta possível (os dois
    // webservices autenticam por mTLS com o certificado do próprio CNPJ).
    // Filtrar aqui, com os campos que já vieram no SELECT, evita gastar um claim
    // e uma linha de log a cada 10 minutos por empresa que ainda não subiu o
    // certificado.
    const semCertificado = candidatas.filter((f) => !temCertificado(f)).length;

    const tarefas: Tarefa[] = [];
    for (const f of candidatas) {
      if (!temCertificado(f)) continue;
      const companyId = String(f.company_id);
      // Os dois opt-ins são independentes: ligar NF-e não liga NFS-e.
      for (const tipo of ["nfe", "nfse"] as TipoFila[]) {
        const ligado = tipo === "nfe" ? f.dfe_nfe_ativo === true : f.dfe_nfse_ativo === true;
        if (!ligado) continue;
        tarefas.push({
          companyId,
          tipo,
          fiscal: f,
          // Sem linha em `dfe_sync_state` (acabou de ligar o opt-in) cai em 0 e
          // vai na frente — nunca sincronizou.
          liberadaEm: quando.get(`${companyId}:${tipo}`) ?? 0,
        });
      }
    }
    tarefas.sort((a, b) => a.liberadaEm - b.liberadaEm);

    let chamadas = 0;
    let novasTotal = 0;
    const sincronizadas: Record<TipoFila, number> = { nfe: 0, nfse: 0 };
    const emEspera: Record<TipoFila, number> = { nfe: 0, nfse: 0 };
    const problemas: Array<{ empresa: string; tipo: TipoFila; motivo: string }> = [];

    for (const tarefa of tarefas) {
      if (chamadas >= MAX_CHAMADAS) break;
      if (Date.now() - comeco >= ORCAMENTO_MS) break;

      const alvo = { companyId: tarefa.companyId, fiscal: tarefa.fiscal };
      const r = tarefa.tipo === "nfse"
        ? await sincronizarNfseDestinada(supabase, alvo)
        : await sincronizarNfeDestinada(supabase, alvo);

      if (CUSTOU_CHAMADA.has(r.motivo)) chamadas += 1;

      if (r.motivo === "sincronizado") {
        sincronizadas[tarefa.tipo] += 1;
        // ⚠️ Em NFS-e, `novas === 0` com `sincronizado` é ROTINA, não anomalia:
        // o feed do Ambiente Nacional mistura as notas que a própria empresa
        // emitiu, e elas avançam o cursor sem virar linha. Não vai pra
        // `problemas` e não vira alerta em lugar nenhum.
        novasTotal += r.novas;
      } else if (r.motivo === "em_espera") {
        emEspera[tarefa.tipo] += 1;
      } else {
        // Só o que NÃO é rotina vira ruído no log do cron. `em_espera` é o caso
        // normal do dia a dia e não é problema de ninguém.
        problemas.push({
          empresa: tarefa.companyId.slice(0, 8) + "...",
          tipo: tarefa.tipo,
          motivo: r.motivo,
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: "DF-e sync round finished",
        companies_opted_in: candidatas.length,
        companies_without_certificate: semCertificado,
        queues_eligible: tarefas.length,
        government_calls: chamadas,
        synced_nfe: sincronizadas.nfe,
        synced_nfse: sincronizadas.nfse,
        waiting_nfe: emEspera.nfe,
        waiting_nfse: emEspera.nfse,
        new_documents: novasTotal,
        issues: problemas,
        elapsed_ms: Date.now() - comeco,
      }),
      { headers },
    );
  } catch (err) {
    console.error("[dfe-sync-cron] erro", { message: (err as Error)?.message });
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: (err as Error)?.message }),
      { status: 500, headers },
    );
  }
});
