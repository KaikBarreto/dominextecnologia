import { supabase } from '@/integrations/supabase/client';

/**
 * Helper de chamada às edges de NFS-e (onboarding fiscal + emissão).
 *
 * As edges sempre respondem JSON `{ error?: code, message?: PT-BR, ... }`.
 * Em status não-2xx o supabase-js devolve um FunctionsHttpError cujo `.context`
 * é o `Response` original — daí lemos o corpo pra extrair a mensagem PT-BR e o
 * código de erro.
 *
 * Casos especiais tratados aqui: integração não configurada, serviço fiscal
 * temporariamente indisponível (503) e operação ainda não oferecida (501).
 */

/** Códigos que significam "a integração fiscal ainda não foi ativada". */
const UNCONFIGURED_CODES = new Set(['nfse_unconfigured']);

/** Operação ainda não disponível no motor fiscal próprio. */
const OPERATION_UNSUPPORTED_CODE = 'operation_unsupported';

const UNCONFIGURED_MESSAGE = 'Emissão de notas ainda não ativada. Tente novamente em breve.';
const OPERATION_UNAVAILABLE_MESSAGE =
  'Esta operação fiscal ainda não está disponível. Fale com o suporte se precisar de ajuda.';

/**
 * Orientação segura devolvida pelo motor fiscal.
 */
export interface NfseFiscalOrientation {
  mensagem: string | null;
  planoAcao: string[];
  codigoOficial: string | null;
  podeTentarNovamente: boolean | null;
  precisaContabilidade: boolean | null;
}

function readOrientation(body: Record<string, unknown> | null): NfseFiscalOrientation | null {
  const erro = body?.erro;
  const resposta = body?.resposta;
  const raw = body?.orientacao ??
    (erro && typeof erro === 'object' && !Array.isArray(erro)
      ? (erro as Record<string, unknown>).orientacao
      : null) ??
    (resposta && typeof resposta === 'object' && !Array.isArray(resposta)
      ? (resposta as Record<string, unknown>).orientacao
      : null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const planoAcao = Array.isArray(value.planoAcao)
    ? value.planoAcao.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const mensagem = typeof value.mensagem === 'string' && value.mensagem.trim()
    ? value.mensagem.trim()
    : null;
  const codigoOficial = typeof value.codigoOficial === 'string' && value.codigoOficial.trim()
    ? value.codigoOficial.trim()
    : null;
  const podeTentarNovamente = typeof value.podeTentarNovamente === 'boolean'
    ? value.podeTentarNovamente
    : null;
  const precisaContabilidade = typeof value.precisaContabilidade === 'boolean'
    ? value.precisaContabilidade
    : null;
  return mensagem || planoAcao.length || codigoOficial || podeTentarNovamente != null || precisaContabilidade != null
    ? { mensagem, planoAcao, codigoOficial, podeTentarNovamente, precisaContabilidade }
    : null;
}

/** Texto curto para toast; detalhes permanecem disponíveis no objeto tipado. */
export function nfseOrientationDescription(orientation: NfseFiscalOrientation | null): string | undefined {
  if (!orientation) return undefined;
  const parts = [
    orientation.mensagem,
    ...orientation.planoAcao,
    orientation.codigoOficial ? `Código oficial: ${orientation.codigoOficial}.` : null,
    orientation.podeTentarNovamente === true ? 'Você pode tentar novamente após seguir a orientação.' : null,
    orientation.podeTentarNovamente === false ? 'Não tente emitir novamente antes de corrigir esta situação.' : null,
    orientation.precisaContabilidade ? 'Revise com a contabilidade.' : null,
  ].filter((item): item is string => !!item);
  return parts.length ? parts.join(' ') : undefined;
}

export interface NfseEdgeResult<T = Record<string, unknown>> {
  ok: boolean;
  data: T | null;
  /** Código de erro retornado pela edge (ex: nfse_unconfigured, missing_fields). */
  errorCode: string | null;
  /** Mensagem PT-BR pronta pra exibir ao usuário. */
  message: string | null;
  /** true somente quando o backend declara `nfse_unconfigured`. */
  unconfigured: boolean;
  /** true quando o serviço ou a operação fiscal está indisponível (503/501). */
  unavailable: boolean;
  /**
   * Corpo completo do erro, preservado pra consumidores que precisam de campos
   * extras além de `error`/`message`. Ex: o bloqueio de cota de NFS-e (402
   * `nfse_quota_exceeded`) traz `used`, `limit`, `tier` e `next_tier` aqui —
   * a UI lê esses campos pra montar o modal de upgrade. `null` no caminho feliz.
   */
  errorBody: Record<string, unknown> | null;
  /** Instrução clara do motor fiscal, quando a resposta a fornecer. */
  orientacao: NfseFiscalOrientation | null;
}

async function readBody(resp: Response | undefined): Promise<Record<string, unknown> | null> {
  if (!resp || typeof resp.json !== 'function') return null;
  try {
    return (await resp.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Invoca uma edge de NFS-e e normaliza sucesso/erro num shape único.
 * `body` pode ser objeto JSON ou FormData (multipart, p/ upload de certificado).
 */
export async function invokeNfse<T = Record<string, unknown>>(
  name: string,
  body?: Record<string, unknown> | FormData,
): Promise<NfseEdgeResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    // FunctionsHttpError → .context é o Response. Lê o corpo pra mensagem PT-BR.
    const resp = (error as { context?: Response }).context;
    const parsed = await readBody(resp);
    const errorCode = (parsed?.error as string) ?? null;
    const message = (parsed?.message as string) ?? error.message ?? 'Falha na integração fiscal.';
    const unconfigured = !!errorCode && UNCONFIGURED_CODES.has(errorCode);
    const serviceUnavailable = resp?.status === 503;
    const operationUnavailable =
      errorCode === OPERATION_UNSUPPORTED_CODE || (!unconfigured && resp?.status === 501);
    return {
      ok: false,
      data: null,
      errorCode,
      message: unconfigured
        ? UNCONFIGURED_MESSAGE
        : operationUnavailable
          ? OPERATION_UNAVAILABLE_MESSAGE
          : message,
      unconfigured,
      unavailable: unconfigured || operationUnavailable || serviceUnavailable,
      errorBody: parsed,
      orientacao: readOrientation(parsed),
    };
  }

  // Algumas edges podem devolver { error } com 200 — trata como falha lógica.
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.error) {
    const errorCode = payload.error as string;
    const unconfigured = UNCONFIGURED_CODES.has(errorCode);
    const operationUnavailable = errorCode === OPERATION_UNSUPPORTED_CODE;
    return {
      ok: false,
      data: null,
      errorCode,
      message: unconfigured
        ? UNCONFIGURED_MESSAGE
        : operationUnavailable
          ? OPERATION_UNAVAILABLE_MESSAGE
          : ((payload.message as string) ?? 'Falha na integração fiscal.'),
      unconfigured,
      unavailable: unconfigured || operationUnavailable,
      errorBody: payload,
      orientacao: readOrientation(payload),
    };
  }

  return {
    ok: true,
    data: payload as T,
    errorCode: null,
    message: (payload.message as string) ?? null,
    unconfigured: false,
    unavailable: false,
    errorBody: null,
    orientacao: readOrientation(payload),
  };
}
