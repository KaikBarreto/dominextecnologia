/**
 * Tamanho de fonte do VALOR num chip de KPI financeiro no mobile.
 *
 * Régua do CEO (2026-10-09): valor em dinheiro nunca é cortado — a informação
 * da tela é o número. Em vez de `truncate`, a fonte degrada por faixa de
 * comprimento da string já formatada.
 *
 * Calibragem: o chip mede 168px de largura com `p-3`, logo 144px úteis. Dígito
 * tabular mede ~0,6em, então 144px comportam ~13 caracteres em `text-lg`.
 * O tamanho sai do MAIOR valor do conjunto, não de cada chip — senão os cards
 * lado a lado ficam cada um com uma fonte. `truncate` continua no markup só
 * como backstop pra texto absurdamente longo.
 */
export function kpiValueSizeClass(formattedValues: string[]): string {
  const longest = formattedValues.reduce((max, value) => Math.max(max, value.length), 0);
  if (longest <= 9) return 'text-xl';
  if (longest <= 12) return 'text-lg';
  if (longest <= 15) return 'text-base';
  return 'text-sm';
}
