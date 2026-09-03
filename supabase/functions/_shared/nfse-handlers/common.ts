// =============================================================================
// _shared/nfse-handlers/common.ts — utilidades comuns aos handlers de NFS-e.
// =============================================================================
// Os handlers vivem em `_shared` (e não dentro da pasta da edge) porque cada um
// é servido por DUAS rotas durante a janela de transição: o nome novo (`nfse-*`)
// e o nome antigo (`fisqal-*`, casca mantida por 1 release para o cliente com
// bundle em cache). Um handler único = zero risco de as duas rotas divergirem.
// =============================================================================

import { jsonResponse } from "../fiscal-auth.ts";
import {
  friendlyFiscalMessage,
  NfseProviderError,
  NfseProviderUnconfiguredError,
  NfseProviderUnsupportedError,
} from "../nfse-provider.ts";

export function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function onlyDigits(v: unknown): string {
  return clean(v).replace(/\D/g, "");
}

/** company_id encurtado para log (nunca logar o id inteiro). */
export function logId(companyId: string): string {
  return companyId.slice(0, 8) + "...";
}

/**
 * Traduz erro NEUTRO do provedor em Response JSON PT-BR.
 * Retorna `null` quando o erro não é de provedor (o chamador segue no catch).
 *
 * ⚠️ Os códigos de erro do CORPO (`fisqal_unconfigured`, `fisqal_error`) são
 * CONTRATO com o frontend atual (`src/utils/fisqalEdge.ts`, `useNfse`) e NÃO
 * podem mudar aqui — a troca é coordenada no passo B5. A mensagem que o usuário
 * lê já é neutra (não cita fornecedor).
 */
export function providerErrorResponse(
  err: unknown,
  opts: { friendly?: boolean } = {},
): Response | null {
  if (err instanceof NfseProviderUnconfiguredError) {
    return jsonResponse({ error: "fisqal_unconfigured", message: err.message }, 503);
  }
  if (err instanceof NfseProviderUnsupportedError) {
    return jsonResponse({ error: "provider_unsupported", message: err.message }, 501);
  }
  if (err instanceof NfseProviderError) {
    const message = opts.friendly
      ? friendlyFiscalMessage(err.codigo, err.message)
      : err.message;
    return jsonResponse(
      { error: "fisqal_error", message, code: err.codigo },
      err.status >= 400 && err.status < 600 ? err.status : 502,
    );
  }
  return null;
}

/**
 * cTribMun — código de tributação MUNICIPAL do layout nacional (3 dígitos).
 *
 * Complementa o cTribNac (`codigo_servico`, 6 dígitos): o município registra o
 * serviço como `14.01.01.001` = cTribNac(6) + cTribMun(3). Sem ele a prefeitura
 * rejeita com **E0312** ("código não administrado pelo município").
 *
 * Valor fora do formato é DESCARTADO (retorna ""). Omitir o campo é ruim; mandar
 * lixo para a prefeitura é pior — e o erro que volta seria indecifrável.
 *
 * Aceita number além de string (campo numérico no front manda `101`, não `"101"`)
 * — mas SEM completar com zero à esquerda: `1` continua inválido, porque supor
 * que o usuário quis dizer `001` é chutar código de serviço da prefeitura.
 */
export function cleanCTribMun(v: unknown): string {
  const s = typeof v === "number" && Number.isFinite(v) ? String(v) : clean(v);
  return /^\d{3}$/.test(s) ? s : "";
}

/** Resultado da validação do cTribMun informado explicitamente pelo usuário. */
export interface CTribMunDoBody {
  /** Valor válido (3 dígitos) ou "" quando não foi informado. */
  valor: string;
  /** Mensagem PT-BR de 422 quando o usuário informou algo fora do formato. */
  erro?: string;
}

/**
 * Valida o cTribMun que veio EXPLICITAMENTE no body da emissão.
 *
 * Assimetria proposital (decisão do Tech Lead):
 *   - body preenchido e fora de `/^\d{3}$/` → **422 com mensagem PT-BR**. Se o
 *     usuário digitou e o campo evapora, a nota sai sem cTribMun e volta E0312
 *     da prefeitura sem nenhuma pista — a armadilha que custou várias tentativas
 *     no spike. Falhar cedo e explicando é melhor que falhar tarde e mudo.
 *   - rascunho / herança do tipo de serviço inválidos → descarte SILENCIOSO
 *     (`cleanCTribMun`). É defesa contra dado velho; derrubar a emissão por causa
 *     de um valor que o usuário nem tocou nesta tela seria pior.
 *
 * Campo ausente, null ou string vazia = "não informado" (sem erro).
 */
export function validarCTribMunDoBody(v: unknown): CTribMunDoBody {
  const informado = v !== undefined && v !== null &&
    (typeof v === "number" ? Number.isFinite(v) : clean(v) !== "");
  if (!informado) return { valor: "" };
  const valor = cleanCTribMun(v);
  if (!valor) {
    return {
      valor: "",
      erro: "O código de tributação municipal deve ter exatamente 3 dígitos.",
    };
  }
  return { valor };
}

/**
 * `true` quando o erro do PostgREST é "esta coluna não existe" — seja no cache de
 * schema (`PGRST204`) ou no banco (`42703`).
 *
 * Serve para a gravação sobreviver a uma janela de deploy em que a edge já subiu
 * e a migration da coluna nova ainda não foi aplicada. Perder um campo OPCIONAL é
 * infinitamente melhor que perder o registro inteiro da nota (que já pode ter
 * sido enviada ao provedor).
 */
export function isUnknownColumnError(
  err: { code?: string; message?: string } | null | undefined,
  column: string,
): boolean {
  if (!err) return false;
  const code = clean((err as { code?: string }).code);
  if (code !== "PGRST204" && code !== "42703") return false;
  return clean(err.message).includes(column);
}

/** Cópia do objeto sem a coluna informada (não muta o original). */
export function withoutColumn<T extends Record<string, unknown>>(
  cols: T,
  column: string,
): Record<string, unknown> {
  const { [column]: _drop, ...rest } = cols;
  return rest;
}

/** Nome da coluna do cTribMun em `nfse_emissions` (migration 20260903170000). */
export const COL_CTRIBMUN = "codigo_tributacao_municipal";

/**
 * Nome da coluna do vínculo nota↔tipo de serviço em `nfse_emissions`
 * (migration 20260903190000). Guarda a ESCOLHA do seletor; os códigos fiscais
 * efetivamente usados continuam congelados nas colunas próprias da nota.
 */
export const COL_SERVICE_TYPE = "service_type_id";

/**
 * Nome da coluna de AUTORIA em `nfse_emissions` (migration 20260903210000).
 * Guarda o `auth.users.id` de quem criou o rascunho / emitiu a nota, para a
 * lista poder mostrar o avatar do responsável.
 *
 * A edge roda com service_role, então `auth.uid()` NÃO vem de graça: o valor
 * tem que ser carimbado explicitamente com o userId que o gate de auth já
 * resolveu (`authorizeFiscalManager` → `userId`).
 *
 * Só é carimbada no INSERT — um UPDATE nunca reescreve o autor original.
 */
export const COL_CREATED_BY = "created_by";
