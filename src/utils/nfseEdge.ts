import { supabase } from '@/integrations/supabase/client';

/**
 * Helper de chamada às edges de NFS-e (onboarding fiscal + emissão).
 *
 * As edges sempre respondem JSON `{ error?: code, message?: PT-BR, ... }`.
 * Em status não-2xx o supabase-js devolve um FunctionsHttpError cujo `.context`
 * é o `Response` original — daí lemos o corpo pra extrair a mensagem PT-BR e o
 * código de erro.
 *
 * Casos especiais tratados aqui:
 *  - "integração ainda não ativada" (HTTP 503): esperado enquanto a chave da
 *    integração fiscal não estiver setada. A tela mostra um texto amigável.
 *  - "caminho de emissão indisponível" (HTTP 501 `provider_unsupported`):
 *    acontece quando a empresa está apontada para um motor de emissão que ainda
 *    não está no ar. Também vira texto amigável.
 *
 * ⚠️ Vocabulário duplo de códigos de erro: o servidor ainda emite os códigos
 * antigos (`fisqal_unconfigured` / `fisqal_error`) e passará a emitir os novos
 * (`nfse_unconfigured` / `nfse_error`). Aceitamos OS DOIS de propósito — o par
 * antigo só sai na etapa D3 do plano de motor próprio de NFS-e. Trocar só de um
 * lado quebraria a mensagem amigável em produção.
 */

/** Códigos que significam "a integração fiscal ainda não foi ativada". */
const UNCONFIGURED_CODES = new Set(['nfse_unconfigured', 'fisqal_unconfigured']);

/** Códigos que significam "o provedor devolveu um erro" (vocabulário antigo + novo). */
export const NFSE_PROVIDER_ERROR_CODES = new Set(['nfse_error', 'fisqal_error']);

/** Código do motor de emissão ainda indisponível para a empresa (HTTP 501). */
const PROVIDER_UNSUPPORTED_CODE = 'provider_unsupported';

const UNCONFIGURED_MESSAGE = 'Emissão de notas ainda não ativada. Tente novamente em breve.';
const PROVIDER_UNSUPPORTED_MESSAGE =
  'A emissão por este caminho ainda não está disponível. Fale com o suporte para liberar a emissão da sua empresa.';

export interface NfseEdgeResult<T = Record<string, unknown>> {
  ok: boolean;
  data: T | null;
  /** Código de erro retornado pela edge (ex: nfse_unconfigured, missing_fields). */
  errorCode: string | null;
  /** Mensagem PT-BR pronta pra exibir ao usuário. */
  message: string | null;
  /** true quando a integração ainda não foi ativada (503). */
  unconfigured: boolean;
  /** true quando o motor de emissão configurado ainda não está disponível (501). */
  providerUnsupported: boolean;
  /**
   * Corpo completo do erro, preservado pra consumidores que precisam de campos
   * extras além de `error`/`message`. Ex: o bloqueio de cota de NFS-e (402
   * `nfse_quota_exceeded`) traz `used`, `limit`, `tier` e `next_tier` aqui —
   * a UI lê esses campos pra montar o modal de upgrade. `null` no caminho feliz.
   */
  errorBody: Record<string, unknown> | null;
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
    const unconfigured = (!!errorCode && UNCONFIGURED_CODES.has(errorCode)) || resp?.status === 503;
    const providerUnsupported =
      errorCode === PROVIDER_UNSUPPORTED_CODE || (!unconfigured && resp?.status === 501);
    return {
      ok: false,
      data: null,
      errorCode,
      message: unconfigured
        ? UNCONFIGURED_MESSAGE
        : providerUnsupported
          ? PROVIDER_UNSUPPORTED_MESSAGE
          : message,
      unconfigured,
      providerUnsupported,
      errorBody: parsed,
    };
  }

  // Algumas edges podem devolver { error } com 200 — trata como falha lógica.
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.error) {
    const errorCode = payload.error as string;
    const unconfigured = UNCONFIGURED_CODES.has(errorCode);
    const providerUnsupported = errorCode === PROVIDER_UNSUPPORTED_CODE;
    return {
      ok: false,
      data: null,
      errorCode,
      message: unconfigured
        ? UNCONFIGURED_MESSAGE
        : providerUnsupported
          ? PROVIDER_UNSUPPORTED_MESSAGE
          : ((payload.message as string) ?? 'Falha na integração fiscal.'),
      unconfigured,
      providerUnsupported,
      errorBody: payload,
    };
  }

  return {
    ok: true,
    data: payload as T,
    errorCode: null,
    message: (payload.message as string) ?? null,
    unconfigured: false,
    providerUnsupported: false,
    errorBody: null,
  };
}
