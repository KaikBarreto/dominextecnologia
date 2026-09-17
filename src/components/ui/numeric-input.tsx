import * as React from "react";

import { Input } from "@/components/ui/input";

export interface SanitizeNumericOptions {
  /** Permite um separador decimal (vírgula). Default: false = só inteiro. */
  decimal?: boolean;
  /** Limita a quantidade de casas decimais. Sem limite quando undefined. */
  maxDecimals?: number;
  /**
   * O valor bruto veio de um COLAR (paste), não de digitação incremental.
   * Só nesse modo a heurística de notação PT-BR completa entra em ação (ver
   * `parseBrazilianAmount`) — colar precisa entender "4.550" (milhar) sem
   * atrapalhar quem está digitando devagar, caractere a caractere, e passa
   * por um estado intermediário que também "parece" um milhar.
   */
  pasted?: boolean;
}

/**
 * Sanitização pura de input numérico (PT-BR). Função sem efeitos colaterais,
 * exportada pra teste e reuso.
 *
 * Regras:
 * - Filtra qualquer caractere que não seja dígito (e, no modo decimal, o
 *   separador). Colar "ab12cd" vira "12"; "asd" vira "".
 * - Sem sinal (não aceita negativo).
 * - Sem zero à esquerda travado: "007" → "7", "048" → "48". MAS preserva o
 *   "0" sozinho (pra digitar "0," / "0,5") e permite vazio ("") ao apagar tudo.
 * - Decimal (digitação, `pasted` ausente/false): aceita "," e "." na entrada,
 *   normaliza pra "," na exibição; só UM separador ("12,,3" → "12,3";
 *   "1.2.3" → "1,23"). Tolerante a estado intermediário — nunca tenta
 *   adivinhar "milhar" aqui, porque digitação nunca chega em "4.550" de
 *   propósito (ninguém digita ponto de milhar num teclado numérico; quem
 *   digita usa vírgula pros centavos). Essa mesma tolerância é o que faz
 *   "4.55" e "1.5" virarem decimal (4,55 e 1,5): com só 1 ou 2 dígitos depois
 *   do ponto não há ambiguidade real — ninguém representa dinheiro em BRL
 *   com 3 casas decimais.
 * - Decimal (`pasted: true`): usa `parseBrazilianAmount`, que entende
 *   "4.550" (colado inteiro, de uma vez) como quatro mil quinhentos e
 *   cinquenta — não quatro vírgula cinco cinco. Ver esse helper pra regra
 *   completa (inclui "1.234.567,89" e o caso ambíguo só-ponto).
 */
export function sanitizeNumeric(raw: string, opts: SanitizeNumericOptions = {}): string {
  const { decimal = false, maxDecimals, pasted = false } = opts;
  if (raw == null) return "";

  if (!decimal) {
    const digits = raw.replace(/[^0-9]/g, "");
    return stripLeadingZeros(digits);
  }

  if (pasted) {
    return sanitizePastedDecimal(raw, maxDecimals);
  }

  // Modo decimal (digitação): normaliza qualquer separador pra ".", mantém só dígitos + ".".
  const cleaned = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");

  // Mantém apenas o PRIMEIRO ponto; ignora os demais (mas seus dígitos seguem).
  let dotSeen = false;
  let intPart = "";
  let fracPart = "";
  for (const ch of cleaned) {
    if (ch === ".") {
      if (!dotSeen) dotSeen = true;
      continue;
    }
    if (dotSeen) fracPart += ch;
    else intPart += ch;
  }

  intPart = stripLeadingZeros(intPart);
  if (maxDecimals != null && maxDecimals >= 0) {
    fracPart = fracPart.slice(0, maxDecimals);
  }

  if (!dotSeen) return intPart;
  // Há separador: preserva o "0," durante a digitação (intPart vazio vira "0").
  const head = intPart === "" ? "0" : intPart;
  return `${head},${fracPart}`;
}

/**
 * Lê um valor colado inteiro (não incremental) em notação PT-BR ou
 * internacional e devolve intPart/fracPart já separados.
 *
 * Regras (nessa ordem):
 * 1. Tem "." E "," → o separador que aparece por ÚLTIMO no texto é o
 *    decimal; o outro é milhar e é descartado. Cobre tanto BR
 *    ("1.234.567,89") quanto o formato internacional ("1,234,567.89"), sem
 *    depender do locale de quem copiou.
 * 2. Só tem "," → vírgula É SEMPRE decimal em notação BR (nunca milhar).
 *    "1,5" → 1,5.
 * 3. Só tem "." → AMBÍGUO. Decisão: ponto seguido de EXATAMENTE 3 dígitos
 *    (com dígito antes) é separador de milhar, porque ninguém representa
 *    dinheiro com 3 casas decimais em BRL — "4.550" → 4550. Qualquer outra
 *    contagem de dígitos depois do ponto (1, 2, 4+) é decimal — "4.55" →
 *    4,55; "1.5" → 1,5. Múltiplos pontos em grupos de 3 (menos o possível
 *    último grupo decimal) são tratados como milhar encadeado
 *    ("1.234.567" → 1234567).
 * 4. Sem separador → é tudo parte inteira.
 */
function parseBrazilianAmount(cleaned: string): { intPart: string; fracPart: string; hasSeparator: boolean } {
  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  if (hasDot && hasComma) {
    const lastDotIdx = cleaned.lastIndexOf(".");
    const lastCommaIdx = cleaned.lastIndexOf(",");
    const decimalChar = lastCommaIdx > lastDotIdx ? "," : ".";
    const thousandsChar = decimalChar === "," ? "." : ",";
    const withoutThousands = cleaned.split(thousandsChar).join("");
    const idx = withoutThousands.lastIndexOf(decimalChar);
    return {
      intPart: withoutThousands.slice(0, idx),
      fracPart: withoutThousands.slice(idx + 1),
      hasSeparator: true,
    };
  }

  if (hasComma) {
    const idx = cleaned.indexOf(",");
    return {
      intPart: cleaned.slice(0, idx),
      fracPart: cleaned.slice(idx + 1).replace(/,/g, ""),
      hasSeparator: true,
    };
  }

  if (hasDot) {
    const groups = cleaned.split(".");
    const lastGroup = groups[groups.length - 1];
    // Todo grupo antes do último precisa "fechar" como milhar: o primeiro
    // pode ter 1 a 3 dígitos ("4.550" ou "123.550"), os do meio têm que ter
    // exatamente 3 ("1.234.567"). O ÚLTIMO grupo (`lastGroup`) só conta como
    // milhar (não decimal) quando também tem exatamente 3 dígitos.
    const middleGroups = groups.slice(0, -1);
    const looksLikeThousands =
      lastGroup.length === 3 &&
      middleGroups.length > 0 &&
      middleGroups[0].length > 0 &&
      middleGroups.slice(1).every((g) => g.length === 3);
    if (looksLikeThousands) {
      return { intPart: groups.join(""), fracPart: "", hasSeparator: false };
    }
    const idx = cleaned.lastIndexOf(".");
    return {
      intPart: cleaned.slice(0, idx).replace(/\./g, ""),
      fracPart: cleaned.slice(idx + 1),
      hasSeparator: true,
    };
  }

  return { intPart: cleaned, fracPart: "", hasSeparator: false };
}

/** Sanitiza um COLAR completo em modo decimal, via `parseBrazilianAmount`. */
function sanitizePastedDecimal(raw: string, maxDecimals?: number): string {
  const cleaned = raw.replace(/[^0-9.,]/g, "");
  if (cleaned === "") return "";

  const { intPart, fracPart, hasSeparator } = parseBrazilianAmount(cleaned);
  const digitsInt = stripLeadingZeros(intPart.replace(/[^0-9]/g, ""));
  let digitsFrac = fracPart.replace(/[^0-9]/g, "");
  if (maxDecimals != null && maxDecimals >= 0) {
    digitsFrac = digitsFrac.slice(0, maxDecimals);
  }

  if (!hasSeparator) return digitsInt;
  const head = digitsInt === "" ? "0" : digitsInt;
  return `${head},${digitsFrac}`;
}

/** Remove zeros à esquerda redundantes, preservando "0" sozinho e "" vazio. */
function stripLeadingZeros(digits: string): string {
  if (digits === "") return "";
  const stripped = digits.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

export interface NumericInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  /** Valor controlado como string crua (preserva "0," durante a digitação). */
  value: string;
  /** Recebe o valor já sanitizado. */
  onValueChange: (value: string) => void;
  /** Aceita um separador decimal (vírgula). Default: false = só inteiro. */
  decimal?: boolean;
  /** Limita as casas decimais. */
  maxDecimals?: number;
}

/**
 * Input que aceita SÓ número, sem o bug do "0 travado". Por cima do Input padrão
 * (mesmo visual). Estado vive como string crua no pai; o parse pra número
 * acontece no uso/salvamento (com num()/parseIntOrNull etc.).
 *
 * Colar (Ctrl+V) em modo decimal passa pela heurística PT-BR completa
 * (`pasted: true`): "4.550" vira 4550, não 4,55. Digitação comum passa pelo
 * modo tolerante de sempre. Ver `sanitizeNumeric` para o porquê da separação.
 */
export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onValueChange, decimal = false, maxDecimals, inputMode, onPaste, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(sanitizeNumeric(e.target.value, { decimal, maxDecimals }));
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      onPaste?.(e);
      if (!decimal || e.defaultPrevented) return;
      const pastedText = e.clipboardData?.getData("text");
      if (!pastedText) return;
      e.preventDefault();
      const input = e.currentTarget;
      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? value.length;
      const merged = value.slice(0, start) + pastedText + value.slice(end);
      onValueChange(sanitizeNumeric(merged, { decimal, maxDecimals, pasted: true }));
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={inputMode ?? (decimal ? "decimal" : "numeric")}
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        {...props}
      />
    );
  },
);
NumericInput.displayName = "NumericInput";
