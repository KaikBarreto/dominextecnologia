// =============================================================================
// dfe-manifestar — o usuário PEDE a manifestação do destinatário.
// =============================================================================
// PRIVILEGIADA: Authorization Bearer + módulo 'nfe' + can_manage_system. O
// `company_id` vem do PROFILE; a nota é conferida contra ele antes de qualquer
// coisa (posse provada no servidor, não no payload).
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ POR QUE ESTA EDGE NÃO FALA COM A SEFAZ                                    │
// │                                                                           │
// │ Manifestação é EVENTO IRREVERSÍVEL perante a Receita. Se esta edge         │
// │ transmitisse direto e a resposta se perdesse, a tela diria "Confirmada"    │
// │ para uma nota que a SEFAZ nunca aceitou — ou o contrário, "falhou" para um │
// │ evento que JÁ está registrado e não se desfaz.                            │
// │                                                                           │
// │ Então o pedido vira LINHA DE FILA (`dfe_manifestacao_jobs`) e o estado     │
// │ conclusivo (`inbound_nfe.manifestacao`) só é escrito pelo worker, DEPOIS   │
// │ do aceite da SEFAZ. Enquanto isso a tela lê `manifestacao_pendente` e      │
// │ mostra "enviando".                                                        │
// └───────────────────────────────────────────────────────────────────────────┘
//
// -----------------------------------------------------------------------------
// CONTRATO COM O FRONT
// -----------------------------------------------------------------------------
// entrada  POST { inboundNfeId: uuid,
//                 tipo: 'ciencia' | 'confirmada' | 'desconhecida' | 'nao_realizada',
//                 justificativa?: string }
//
// saída    200 { ok: true,  status: 'enfileirada' }
//          200 { ok: false, status: 'ja_manifestada' | 'em_andamento', message }
//          400/404/422     { ok: false, error, message }
//
// `ja_manifestada` e `em_andamento` são ESTADOS LEGÍTIMOS (200 com corpo
// explicativo, mesma régua das edges de cobrança) — o usuário clicou duas vezes
// ou outra pessoa já pediu. Não é erro e não pode virar toast vermelho.
//
// ⚠️ Justificativa: obrigatória (15..255) SÓ em `nao_realizada`. A NT 2020.001
// v1.50 tirou a exigência do Desconhecimento e o motor só serializa `xJust` na
// Operação não Realizada. Exigir mais que o governo bloquearia uma operação que
// a SEFAZ aceita.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../_shared/fiscal-auth.ts";
import {
  JUSTIFICATIVA_MAX,
  JUSTIFICATIVA_MIN,
  TIPO_EXIGE_JUSTIFICATIVA,
  TIPOS_MANIFESTACAO,
} from "../_shared/dfe-client.ts";
import type { TipoManifestacao } from "../_shared/dfe-client.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rótulo PT-BR do evento, pro texto que volta pra tela. */
const ROTULO: Record<TipoManifestacao, string> = {
  ciencia: "Ciência da operação",
  confirmada: "Confirmação da operação",
  desconhecida: "Desconhecimento da operação",
  nao_realizada: "Operação não realizada",
};

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
  const { supabase, companyId, userId } = auth;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  // ---- Validação ------------------------------------------------------------
  const inboundNfeId = String(body.inboundNfeId ?? "").trim();
  if (!UUID_RE.test(inboundNfeId)) {
    return jsonResponse(
      { ok: false, error: "nota_invalida", message: "Nota fiscal não informada." },
      400,
    );
  }

  const tipo = String(body.tipo ?? "").trim().toLowerCase() as TipoManifestacao;
  if (!TIPOS_MANIFESTACAO.includes(tipo)) {
    return jsonResponse(
      { ok: false, error: "tipo_invalido", message: "Tipo de manifestação inválido." },
      400,
    );
  }

  const justificativaBruta = typeof body.justificativa === "string"
    ? body.justificativa.trim()
    : "";

  if (tipo === TIPO_EXIGE_JUSTIFICATIVA) {
    if (
      justificativaBruta.length < JUSTIFICATIVA_MIN ||
      justificativaBruta.length > JUSTIFICATIVA_MAX
    ) {
      return jsonResponse({
        ok: false,
        error: "justificativa_invalida",
        message:
          `Descreva o motivo com ${JUSTIFICATIVA_MIN} a ${JUSTIFICATIVA_MAX} caracteres. A SEFAZ exige a justificativa neste tipo de manifestação.`,
      }, 422);
    }
  }
  // Nos demais tipos a justificativa é DESCARTADA, não recusada: o governo não
  // a serializa, e a CHECK de dfe_manifestacao_jobs proíbe texto onde o evento
  // não o comporta. Recusar o clique por causa de um campo que o front deixou
  // preenchido seria atrito sem ganho.
  const justificativa = tipo === TIPO_EXIGE_JUSTIFICATIVA ? justificativaBruta : null;

  // ---- Enfileirar (atômico: fila + selo "enviando" na nota) -----------------
  // A RPC confere a posse da nota (company_id), recusa repetição e faz os dois
  // UPDATEs numa transação só. Fazer isso em dois round-trips daqui deixaria a
  // porta aberta pra fila com job e nota sem selo (ou o contrário) quando a
  // edge morre no meio.
  const { data, error } = await supabase.rpc("dfe_enfileirar_manifestacao", {
    p_company_id: companyId,
    p_inbound_nfe_id: inboundNfeId,
    p_tipo: tipo,
    p_justificativa: justificativa,
    p_user_id: userId,
  });

  if (error) {
    console.error("[dfe-manifestar] rpc", {
      company_id: companyId.slice(0, 8) + "...",
      message: error.message,
    });
    return jsonResponse({
      ok: false,
      error: "internal_error",
      message: "Não foi possível registrar o pedido de manifestação. Tente novamente.",
    }, 500);
  }

  const status = String((Array.isArray(data) ? data[0] : data) ?? "");

  if (status === "nao_encontrada") {
    return jsonResponse(
      { ok: false, error: "nota_nao_encontrada", message: "Nota fiscal não encontrada." },
      404,
    );
  }
  if (status === "ja_manifestada") {
    return jsonResponse({
      ok: false,
      status: "ja_manifestada",
      message: `Esta nota já está com "${ROTULO[tipo]}" registrada na SEFAZ.`,
    }, 200);
  }
  if (status === "em_andamento") {
    return jsonResponse({
      ok: false,
      status: "em_andamento",
      message: "Já existe uma manifestação em envio para esta nota. Aguarde a confirmação da SEFAZ.",
    }, 200);
  }

  return jsonResponse({ ok: true, status: "enfileirada" }, 200);
});
