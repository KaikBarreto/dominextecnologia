// ─────────────────────────────────────────────────────────────────────────────
// Validação de CPF/CNPJ no CLIENT.
//
// Algoritmo IDÊNTICO ao de `supabase/functions/_shared/document-validation.ts`
// (o Deno das edges não consegue importar `src/`, por isso as duas cópias — a
// do servidor continua sendo a autoritativa; esta aqui é só UX, pra avisar o
// usuário ANTES de gastar uma ida à edge).
//
// Ao mexer na regra, mexer nos DOIS arquivos.
// ─────────────────────────────────────────────────────────────────────────────

/** Remove máscara e devolve só os dígitos. */
export function unmaskDocument(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function validateCPF(value: string | null | undefined): boolean {
  const cpf = unmaskDocument(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  let digit = 11 - (sum % 11);
  if (digit > 9) digit = 0;
  if (digit !== parseInt(cpf.charAt(9), 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  digit = 11 - (sum % 11);
  if (digit > 9) digit = 0;
  return digit === parseInt(cpf.charAt(10), 10);
}

export function validateCNPJ(value: string | null | undefined): boolean {
  const cnpj = unmaskDocument(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  let length = cnpj.length - 2;
  let numbers = cnpj.substring(0, length);
  const digits = cnpj.substring(length);
  let sum = 0;
  let pos = length - 7;
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0), 10)) return false;
  length = length + 1;
  numbers = cnpj.substring(0, length);
  sum = 0;
  pos = length - 7;
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === parseInt(digits.charAt(1), 10);
}

/** true só para CPF (11 dígitos) ou CNPJ (14 dígitos) com dígito verificador OK. */
export function isValidDocument(value: string | null | undefined): boolean {
  const d = unmaskDocument(value);
  if (d.length === 11) return validateCPF(d);
  if (d.length === 14) return validateCNPJ(d);
  return false;
}

/** Estado do documento de um cadastro, pra UI decidir o que mostrar. */
export type DocumentStatus = 'ok' | 'missing' | 'invalid';

export function getDocumentStatus(value: string | null | undefined): DocumentStatus {
  const d = unmaskDocument(value);
  if (!d) return 'missing';
  return isValidDocument(d) ? 'ok' : 'invalid';
}
