export function buildServiceOrderShareLink(osId: string) {
  // Direct friendly URL on custom domain
  return `https://dominex.app/os-tecnico/${osId}?modo=cliente`;
}

/**
 * Monta o link wa.me a partir de um telefone "sujo" (com máscara/espaços).
 * Remove tudo que não é dígito; se o número não começar com 55 (DDI Brasil)
 * e tiver até 11 dígitos (DDD + número), prefixa 55. Retorna null se não
 * houver dígitos suficientes pra um número válido.
 */
export function buildWhatsAppLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const number = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${number}`;
}
