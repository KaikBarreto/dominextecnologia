import type { ClipboardEvent } from 'react';

/**
 * Interpreta um texto COLADO (não digitado) como um valor monetário em
 * notação PT-BR ou internacional e devolve o total em CENTAVOS (inteiro).
 *
 * Existe porque a máscara de dinheiro usada em ~15 campos desta base
 * (`ChargeDialog`, `AccountFormDialog`, `TransactionFormDialog`,
 * `EmployeeFormDialog` etc: ver `handleAmountChange`/`currencyMask`) trata
 * TODO dígito recebido como centavos — "os 2 últimos dígitos são os
 * centavos" — o que é o comportamento CERTO pra digitação (`4550` digitado
 * dígito a dígito vira R$ 45,50, como o usuário espera) mas o comportamento
 * ERRADO pra um COLAR de valor pronto: colar "4.550" (quatro mil e
 * quinhentos, sem centavos, copiado de uma planilha) cai na mesma regra e
 * vira R$ 45,50 — cem vezes menor. Não é o bug de "mil vezes" do
 * `<input type="number">` (esse já não existe mais aqui: a máscara nunca lê
 * ponto como separador decimal do HTML), mas ainda é dinheiro errado.
 *
 * A leitura de COLAR precisa entender o texto como um valor de verdade (com
 * separador de milhar/decimal), não como uma sequência de dígitos pra
 * empurrar da direita. É a MESMA heurística de `parseBrazilianAmount` em
 * `src/components/ui/numeric-input.tsx` (não duplicar a DECISÃO, só a
 * leitura — esse arquivo está congelado nesta leva e não pode ser tocado
 * nem para exportar a função). Ver o comentário completo lá para a régua
 * inteira; resumo:
 *
 * 1. Tem "." E "," → o que aparece por ÚLTIMO no texto é o decimal; o outro
 *    é milhar. Cobre BR ("1.234.567,89") e formato internacional
 *    ("1,234,567.89").
 * 2. Só "," → é sempre decimal em notação BR ("1,5" → 1,50).
 * 3. Só "." → ponto seguido de EXATAMENTE 3 dígitos (com dígito antes) é
 *    milhar, porque ninguém representa dinheiro com 3 casas decimais em BRL
 *    ("4.550" → 4550,00). Qualquer outra contagem (1, 2, 4+) é decimal
 *    ("4.55" → 4,55).
 * 4. Sem separador → dígitos puros são REAIS inteiros, sem centavos
 *    ("4550" colado de uma planilha → 4550,00, não 45,50 — essa é a
 *    diferença de intenção entre colar e digitar).
 *
 * Retorna `null` quando não há nenhum dígito no texto colado (nada a
 * interpretar — quem chama decide se ignora o paste ou deixa cair na
 * digitação normal).
 */
export function centsFromPastedAmount(text: string): number | null {
  const cleaned = text.replace(/[^0-9.,]/g, '');
  if (!cleaned) return null;

  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');

  let intPart: string;
  let fracPart: string;

  if (hasDot && hasComma) {
    const lastDotIdx = cleaned.lastIndexOf('.');
    const lastCommaIdx = cleaned.lastIndexOf(',');
    const decimalChar = lastCommaIdx > lastDotIdx ? ',' : '.';
    const thousandsChar = decimalChar === ',' ? '.' : ',';
    const withoutThousands = cleaned.split(thousandsChar).join('');
    const idx = withoutThousands.lastIndexOf(decimalChar);
    intPart = withoutThousands.slice(0, idx);
    fracPart = withoutThousands.slice(idx + 1);
  } else if (hasComma) {
    const idx = cleaned.indexOf(',');
    intPart = cleaned.slice(0, idx);
    fracPart = cleaned.slice(idx + 1).replace(/,/g, '');
  } else if (hasDot) {
    const groups = cleaned.split('.');
    const lastGroup = groups[groups.length - 1];
    const middleGroups = groups.slice(0, -1);
    const looksLikeThousands =
      lastGroup.length === 3 &&
      middleGroups.length > 0 &&
      middleGroups[0].length > 0 &&
      middleGroups.slice(1).every((g) => g.length === 3);
    if (looksLikeThousands) {
      intPart = groups.join('');
      fracPart = '';
    } else {
      const idx = cleaned.lastIndexOf('.');
      intPart = cleaned.slice(0, idx).replace(/\./g, '');
      fracPart = cleaned.slice(idx + 1);
    }
  } else {
    intPart = cleaned;
    fracPart = '';
  }

  const digitsInt = (intPart.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')) || '0';
  const digitsFrac = (fracPart.replace(/[^0-9]/g, '') + '00').slice(0, 2);

  return parseInt(digitsInt, 10) * 100 + parseInt(digitsFrac, 10);
}

/**
 * Handler de `onPaste` pronto pra plugar nos campos de dinheiro com máscara
 * de centavos. Lê o texto colado, resolve os centavos via
 * `centsFromPastedAmount` e, se conseguir, cancela o comportamento padrão do
 * paste (que cairia no `onChange` de sempre e aplicaria a regra errada de
 * "2 últimos dígitos = centavos" em cima de um valor que já é um valor
 * pronto). Devolve `null` sem mexer em nada quando não há texto ou nada
 * reconhecível pra ler — a digitação/paste comum segue seu fluxo normal.
 */
export function readPastedCents(e: ClipboardEvent<HTMLInputElement>): number | null {
  const text = e.clipboardData?.getData('text');
  if (!text) return null;
  const cents = centsFromPastedAmount(text);
  if (cents == null) return null;
  e.preventDefault();
  return cents;
}
