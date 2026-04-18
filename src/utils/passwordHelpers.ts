/**
 * Checks if a Supabase auth error is a "weak password" error.
 */
export const isWeakPasswordError = (error: any): boolean => {
  const msg = (error?.message || '').toLowerCase();
  return (
    msg.includes('weak') ||
    msg.includes('easy to guess') ||
    msg.includes('commonly used') ||
    msg.includes('password strength') ||
    msg.includes('pwned')
  );
};

export const getWeakPasswordMessage = (): string =>
  'Essa senha é muito comum e fácil de adivinhar. Tente usar uma combinação de letras maiúsculas, minúsculas, números e símbolos.';

export const getFriendlyPasswordError = (error: any): string => {
  if (isWeakPasswordError(error)) return getWeakPasswordMessage();
  return error?.message || 'Erro ao alterar senha.';
};
