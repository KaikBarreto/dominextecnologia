/**
 * Validação de dígito verificador de CNPJ (módulo 11, pesos padrão da
 * Receita Federal). Não existe helper equivalente no repo — `CnpjDocumentInput`
 * só consulta a BrasilAPI (confirma existência via rede), e `masks.ts` só
 * formata, sem validar dígito. Esta função é client-side, offline, e usada
 * para bloquear CNPJ com dígito errado no cadastro de prestador PJ/MEI.
 */

const WEIGHTS_FIRST = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_SECOND = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function calcCheckDigit(digits: string, weights: number[]): number {
  const sum = digits
    .split('')
    .reduce((acc, digit, i) => acc + Number(digit) * weights[i], 0);
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

/**
 * `true` quando `value` (com ou sem máscara) é um CNPJ com dígito verificador
 * válido. Rejeita sequências de dígito repetido (00.000.000/0000-00 etc.),
 * que passariam no módulo 11 mas nunca são CNPJ real.
 */
export function isValidCnpj(value: string | null | undefined): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const firstTwelve = digits.slice(0, 12);
  const digit1 = calcCheckDigit(firstTwelve, WEIGHTS_FIRST);
  const digit2 = calcCheckDigit(firstTwelve + digit1, WEIGHTS_SECOND);

  return digits === firstTwelve + String(digit1) + String(digit2);
}
