import { supabase } from '@/integrations/supabase/client';

/**
 * Helper de chamada às edges Fisqal de onboarding fiscal.
 *
 * As edges sempre respondem JSON `{ error?: code, message?: PT-BR, ... }`.
 * Em status não-2xx o supabase-js devolve um FunctionsHttpError cujo `.context`
 * é o `Response` original — daí lemos o corpo pra extrair a mensagem PT-BR e o
 * código de erro. O caso especial é `fisqal_unconfigured` (HTTP 503): acontece
 * enquanto a FISQAL_API_KEY não estiver setada e é ESPERADO — a tela mostra
 * "Integração fiscal ainda não ativada".
 */

const UNCONFIGURED_MESSAGE = 'Integração fiscal ainda não ativada. Tente novamente em breve.';

export interface FisqalEdgeResult<T = Record<string, unknown>> {
  ok: boolean;
  data: T | null;
  /** Código de erro retornado pela edge (ex: fisqal_unconfigured, missing_fields). */
  errorCode: string | null;
  /** Mensagem PT-BR pronta pra exibir ao usuário. */
  message: string | null;
  /** true quando a integração ainda não foi ativada (503 fisqal_unconfigured). */
  unconfigured: boolean;
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
 * Invoca uma edge Fisqal e normaliza sucesso/erro num shape único.
 * `body` pode ser objeto JSON ou FormData (multipart, p/ upload de certificado).
 */
export async function invokeFisqal<T = Record<string, unknown>>(
  name: string,
  body?: Record<string, unknown> | FormData,
): Promise<FisqalEdgeResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    // FunctionsHttpError → .context é o Response. Lê o corpo pra mensagem PT-BR.
    const resp = (error as { context?: Response }).context;
    const parsed = await readBody(resp);
    const errorCode = (parsed?.error as string) ?? null;
    const message = (parsed?.message as string) ?? error.message ?? 'Falha na integração fiscal.';
    const unconfigured = errorCode === 'fisqal_unconfigured' || resp?.status === 503;
    return {
      ok: false,
      data: null,
      errorCode,
      message: unconfigured ? UNCONFIGURED_MESSAGE : message,
      unconfigured,
    };
  }

  // Algumas edges podem devolver { error } com 200 — trata como falha lógica.
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.error) {
    const errorCode = payload.error as string;
    const unconfigured = errorCode === 'fisqal_unconfigured';
    return {
      ok: false,
      data: null,
      errorCode,
      message: unconfigured ? UNCONFIGURED_MESSAGE : ((payload.message as string) ?? 'Falha na integração fiscal.'),
      unconfigured,
    };
  }

  return { ok: true, data: payload as T, errorCode: null, message: (payload.message as string) ?? null, unconfigured: false };
}
