import { cepMask, cpfCnpjMask, phoneMask } from '@/utils/masks';
import { onlyDigits } from '@/lib/utils';

/**
 * Formatação exclusiva de apresentação para dados do cliente.
 *
 * O cadastro interno pode persistir valores mascarados, enquanto o formulário
 * público grava somente dígitos. Estes helpers aceitam os dois formatos sem
 * alterar o contrato persistido nem esconder valores legados incompletos.
 */
export function formatCustomerDocument(value: string | null | undefined): string {
  if (!value) return '';
  const digits = onlyDigits(value);
  return digits.length === 11 || digits.length === 14 ? cpfCnpjMask(digits) : value;
}

export function formatCustomerPhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = onlyDigits(value);
  // DDD 55 também é válido no Brasil. Só interpreta o prefixo como DDI quando
  // o total tem 12/13 dígitos, a mesma regra defensiva de `phoneMask`.
  const hasCountryCode = digits.startsWith('55') && (digits.length === 12 || digits.length === 13);
  const nationalLength = hasCountryCode ? digits.length - 2 : digits.length;
  return nationalLength === 10 || nationalLength === 11 ? phoneMask(digits) : value;
}

export function formatCustomerZipCode(value: string | null | undefined): string {
  if (!value) return '';
  const digits = onlyDigits(value);
  return digits.length === 8 ? cepMask(digits) : value;
}

export function getCustomerOriginLabel(
  origin: string | null | undefined,
  publicFormLabel: string,
): string {
  if (!origin) return '';
  return origin === 'public_form' ? publicFormLabel : origin;
}
