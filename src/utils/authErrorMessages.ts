// ─────────────────────────────────────────────────────────────────────────────
// authErrorMessages — mapeia os erros CRUS do Supabase Auth (GoTrue), que chegam
// em inglês/genérico, pra mensagem já localizada. Recebe o dicionário do locale
// atual (messages.auth.gotrueErrors), então o idioma acompanha a tela.
//
// Por quê aqui e não em errorMessages.ts: aquele util devolve texto pt-br
// hardcoded (usado no app autenticado). As telas de auth são localizadas, então
// precisam resolver a mensagem pelo dicionário do locale, com fallback genérico.
// ─────────────────────────────────────────────────────────────────────────────

/** Formato do dicionário localizado (subset de messages.auth.gotrueErrors). */
export interface GotrueErrorDict {
  invalidCredentials: string;
  emailNotConfirmed: string;
  rateLimited: string;
  networkError: string;
  generic: string;
}

/**
 * Extrai o texto cru de um erro do supabase-js. GoTrue tipicamente devolve
 * `AuthError` (instância de Error com `.message`); casos de rede vêm como
 * `TypeError: Failed to fetch`. Objetos planos também são tolerados.
 */
function rawErrorText(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return '';
}

/**
 * Traduz o erro do GoTrue pra mensagem localizada. Casamento por substring
 * (case-insensitive) sobre as strings estáveis que o GoTrue emite em inglês:
 *
 *   • "Invalid login credentials"      → email/senha incorretos
 *   • "Email not confirmed"            → email não confirmado
 *   • "For security purposes..." / 429 → rate limit
 *   • "Failed to fetch" / network      → sem conexão
 *
 * Qualquer coisa que não bata cai em `dict.generic`. NUNCA vaza o texto cru em
 * inglês pro usuário final.
 */
export function mapGotrueError(error: unknown, dict: GotrueErrorDict): string {
  const raw = rawErrorText(error);
  const m = raw.toLowerCase();
  if (!m) return dict.generic;

  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return dict.invalidCredentials;
  }
  if (m.includes('email not confirmed') || m.includes('not confirmed')) {
    return dict.emailNotConfirmed;
  }
  if (
    m.includes('for security purposes') ||
    m.includes('rate limit') ||
    m.includes('too many requests') ||
    m.includes('over_request_rate_limit') ||
    m.includes('email rate limit')
  ) {
    return dict.rateLimited;
  }
  if (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed')
  ) {
    return dict.networkError;
  }

  return dict.generic;
}
