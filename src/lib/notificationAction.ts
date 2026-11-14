const NOTIFICATION_BASE_URL = 'https://dominex.invalid';

/**
 * Notificações são conteúdo persistido no banco. Mesmo com produtores
 * server-side, o frontend não deve tratar `action_url` como URL confiável.
 * Aceitamos apenas caminhos absolutos da própria SPA e rejeitamos URLs
 * protocol-relative, barras invertidas e credenciais/origens externas.
 */
export function isSafeNotificationActionUrl(value: string | null | undefined): value is string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return false;
  }

  try {
    const parsed = new URL(value, NOTIFICATION_BASE_URL);
    return parsed.origin === NOTIFICATION_BASE_URL && parsed.pathname.startsWith('/');
  } catch {
    return false;
  }
}
