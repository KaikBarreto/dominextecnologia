import * as React from "react";

import { Input } from "@/components/ui/input";

export interface SanitizeNumericOptions {
  /** Permite um separador decimal (vírgula). Default: false = só inteiro. */
  decimal?: boolean;
  /** Limita a quantidade de casas decimais. Sem limite quando undefined. */
  maxDecimals?: number;
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
 * - Decimal: aceita "," e "." na entrada, normaliza pra "," na exibição; só UM
 *   separador ("12,,3" → "12,3"; "1.2.3" → "1,23").
 */
export function sanitizeNumeric(raw: string, opts: SanitizeNumericOptions = {}): string {
  const { decimal = false, maxDecimals } = opts;
  if (raw == null) return "";

  if (!decimal) {
    const digits = raw.replace(/[^0-9]/g, "");
    return stripLeadingZeros(digits);
  }

  // Modo decimal: normaliza qualquer separador pra ".", mantém só dígitos + ".".
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
 */
export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onValueChange, decimal = false, maxDecimals, inputMode, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(sanitizeNumeric(e.target.value, { decimal, maxDecimals }));
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={inputMode ?? (decimal ? "decimal" : "numeric")}
        value={value}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
NumericInput.displayName = "NumericInput";
