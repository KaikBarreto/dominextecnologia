/** Volumes na mesma unidade. 1:N significa produto:água, e não produto:total. */
export interface ResultadoDiluicao {
  produto: number;
  agua: number;
  volumeFinal: number;
}

export function calcularDiluicao(
  modo: 'preparar' | 'tenho',
  quantidade: number,
  partesAgua: number,
): ResultadoDiluicao | null {
  if (!Number.isFinite(quantidade) || quantidade <= 0 || !Number.isFinite(partesAgua) || partesAgua < 0) return null;
  const produto = modo === 'preparar' ? quantidade / (partesAgua + 1) : quantidade;
  const agua = modo === 'preparar' ? quantidade - produto : produto * partesAgua;
  const volumeFinal = modo === 'preparar' ? quantidade : produto + agua;
  if (![produto, agua, volumeFinal].every(Number.isFinite) || produto <= 0) return null;
  return { produto, agua, volumeFinal };
}

/** Preserva pequenas doses em litros sem arredondá-las visualmente para zero. */
export function formatarDiluicao(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumSignificantDigits: 6, notation: valor !== 0 && (Math.abs(valor) >= 1e9 || Math.abs(valor) < 0.000001) ? 'scientific' : 'standard' });
}
