// =============================================================================
// dfe-sync — botão "Buscar notas recebidas" do cliente.
// =============================================================================
// PRIVILEGIADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system
// (tudo via `_shared/fiscal-auth.ts`). O `company_id` vem do PROFILE, nunca do
// corpo — é assim que a posse da empresa é provada, e é por isso que não existe
// parâmetro `companyId` neste contrato.
//
// A rodada em si mora em `_shared/dfe-sync-core.ts`, compartilhada com o cron.
// Ver lá as TRÊS OBRIGAÇÕES ANTI-656 (§10.3 do RUNBOOK do dominex-fiscal) —
// elas são a razão de o botão e o cron serem o MESMO código.
//
// -----------------------------------------------------------------------------
// CONTRATO COM O FRONT
// -----------------------------------------------------------------------------
// entrada  POST { tipo?: 'nfe' | 'nfse' }      (ausente = 'nfe')
//
//   'nfe'  → Distribuição DF-e da SEFAZ (notas de mercadoria recebidas).
//   'nfse' → distribuição do Ambiente de Dados Nacional (serviço tomado).
//   As duas caminham a fila por CURSOR DE NSU e têm linha própria em
//   `dfe_sync_state`, opt-in próprio e janela de espera própria.
//
// saída    200 { ok, novas, total, parcial, aviso?,
//                motivo, ultimoNsu?, maxNsu?, proximaConsultaEm? }
//
//   `ok: true`  → a rodada aconteceu. `novas` = notas que entraram agora,
//                 `total` = documentos aproveitados nesta rodada,
//                 `parcial` = sobrou fila (a busca continua sozinha).
//                 ⚠️ EM NFS-e, `novas: 0` COM `ok: true` É NORMAL: o feed do
//                 Ambiente Nacional mistura as notas que a própria empresa
//                 emitiu — elas avançam o cursor e não entram nesta lista.
//                 `maxNsu` é SEMPRE null em 'nfse' (o governo não informa até
//                 onde a fila vai), então a tela não tem como dizer "faltam N".
//   `ok: false` + 200 → ESTADO LEGÍTIMO que o usuário precisa ler, não falha:
//                 'em_espera' (a SEFAZ só permite 1 consulta/hora por CNPJ),
//                 'desativado' (opt-in desligado),
//                 'consumo_indevido' (a SEFAZ trancou o CNPJ por 1h; já
//                 reagendamos). Mesma régua das edges de cobrança do projeto.
//   `ok: false` + 4xx/5xx → precisa de ação ou é falha de verdade:
//                 'sem_certificado' / 'cadastro_incompleto' (422),
//                 'rejeitado' (422 — o governo respondeu e RECUSOU a consulta;
//                 em NFS-e costuma ser credenciamento do CNPJ no Ambiente
//                 Nacional, e a mensagem do órgão vai verbatim pro usuário),
//                 'indisponivel' (503/500).
//
// `motivo` é código estável (nunca traduzir/comparar por texto); `aviso` é o
// PT-BR que vai pra tela.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../_shared/fiscal-auth.ts";
import {
  sincronizarNfeDestinada,
  sincronizarNfseDestinada,
} from "../_shared/dfe-sync-core.ts";
import { carregarConfigFiscal } from "../_shared/dfe-client.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, error: "method_not_allowed", message: "Método HTTP não suportado." },
      405,
    );
  }

  const auth = await authorizeFiscalManager(req);
  if (!auth.ok) return auth.response;
  const { supabase, companyId } = auth;

  let body: { tipo?: string } = {};
  try {
    body = (await req.json()) as { tipo?: string };
  } catch {
    body = {};
  }
  const tipo = String(body?.tipo ?? "nfe").toLowerCase();

  if (tipo !== "nfe" && tipo !== "nfse") {
    return jsonResponse(
      { ok: false, error: "tipo_invalido", message: "Tipo de nota inválido." },
      400,
    );
  }

  // A config fiscal é lida UMA vez e passada adiante: as duas filas leem a mesma
  // linha (opt-in + certificado custodiado), e reler seria um round-trip a mais
  // por clique.
  const fiscal = await carregarConfigFiscal(supabase, companyId);

  // ---------------------------------------------------------------------------
  // As duas filas usam o MESMO handler compartilhado com o cron, cada uma com a
  // sua rota no motor e a sua linha em `dfe_sync_state`. Nada de NFS-e é "onda
  // seguinte" aqui: a rota POST /v1/dfe/nfse/distribuicao existe e o cursor é
  // NSU, igual ao da NF-e.
  //
  // ⚠️ Em NFS-e, `novas: 0` com `ok: true` é RESULTADO NORMAL — o feed do
  // Ambiente Nacional mistura as notas que a própria empresa EMITIU, que
  // avançam o cursor e não viram linha nenhuma. O front mostra o `aviso`
  // verbatim num toast neutro; não transformar isso em erro.
  // ---------------------------------------------------------------------------
  const r = tipo === "nfse"
    ? await sincronizarNfseDestinada(supabase, { companyId, fiscal })
    : await sincronizarNfeDestinada(supabase, { companyId, fiscal });

  return jsonResponse({
    ok: r.ok,
    motivo: r.motivo,
    novas: r.novas,
    total: r.total,
    parcial: r.parcial,
    ...(r.aviso ? { aviso: r.aviso } : {}),
    // `message` só nos NÃO-200, com o MESMO texto do `aviso`.
    //
    // ⚠️ Não é redundância: `functions.invoke` do supabase-js trata 4xx/5xx como
    // erro e o leitor do front (`useInboundNotes.invokeDfeFunction`) procura
    // `message`/`error` no corpo antes de cair num texto genérico. Sem isto, o
    // 422 "envie o certificado digital A1" viraria "não foi possível
    // sincronizar agora" — o usuário perderia exatamente a instrução que o
    // desbloqueia. Nos 200 o campo NÃO vai, pra ninguém confundir estado
    // legítimo (em espera, opt-in desligado) com falha.
    ...(r.httpStatus !== 200 && r.aviso ? { message: r.aviso } : {}),
    ultimoNsu: r.ultimoNsu ?? null,
    maxNsu: r.maxNsu ?? null,
    proximaConsultaEm: r.proximaConsultaEm ?? null,
  }, r.httpStatus);
});
