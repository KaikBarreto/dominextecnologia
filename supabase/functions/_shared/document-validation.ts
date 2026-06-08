// Validação de CPF/CNPJ para edge functions (Deno não importa src/).
// Algoritmo idêntico ao do frontend. Portado do EcoSistema.

export const unmaskDoc = (value: string | null | undefined): string => {
  return (value ?? "").replace(/\D/g, "");
};

export const validateCPF = (cpf: string): boolean => {
  cpf = unmaskDoc(cpf);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i)) * (10 - i);
  let digit = 11 - (sum % 11);
  if (digit > 9) digit = 0;
  if (digit !== parseInt(cpf.charAt(9))) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i)) * (11 - i);
  digit = 11 - (sum % 11);
  if (digit > 9) digit = 0;
  return digit === parseInt(cpf.charAt(10));
};

export const validateCNPJ = (cnpj: string): boolean => {
  cnpj = unmaskDoc(cnpj);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  let length = cnpj.length - 2;
  let numbers = cnpj.substring(0, length);
  const digits = cnpj.substring(length);
  let sum = 0;
  let pos = length - 7;
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  length = length + 1;
  numbers = cnpj.substring(0, length);
  sum = 0;
  pos = length - 7;
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === parseInt(digits.charAt(1));
};

export const isValidDocument = (value: string | null | undefined): boolean => {
  const d = unmaskDoc(value);
  if (d.length === 11) return validateCPF(d);
  if (d.length === 14) return validateCNPJ(d);
  return false;
};

/**
 * Lança erro 400-amigável (PT-BR) se inválido. Use no início de cada handler.
 * Se valor vazio/null, passa silenciosamente quando required=false.
 * Retorna o documento normalizado (só dígitos) ou null se vazio e opcional.
 */
export const assertValidDocument = (
  value: string | null | undefined,
  opts: { required?: boolean; field?: string } = {},
): string | null => {
  const cleaned = unmaskDoc(value);
  if (!cleaned) {
    if (opts.required) {
      throw new Error(`${opts.field ?? "CPF/CNPJ"} é obrigatório`);
    }
    return null;
  }
  if (!isValidDocument(cleaned)) {
    throw new Error(`${opts.field ?? "CPF/CNPJ"} inválido`);
  }
  return cleaned;
};
