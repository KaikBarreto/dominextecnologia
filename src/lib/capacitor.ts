/**
 * Formatação compartilhada das referências elétricas.
 *
 * A seleção de capacitância depende do modelo e do circuito do fabricante.
 * BTU/h e LRA isolados não determinam um capacitor: as antigas fórmulas
 * empíricas foram removidas para não oferecer uma especificação falsa.
 */
export function formatarNumero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumSignificantDigits: 6, notation: valor !== 0 && (Math.abs(valor) >= 1e9 || Math.abs(valor) < 0.000001) ? 'scientific' : 'standard' });
}
