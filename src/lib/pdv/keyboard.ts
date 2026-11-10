/** Verdadeiro quando uma tecla imprimível deve continuar pertencendo ao campo. */
export function isPdvEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable
    || target.closest('[role="combobox"]') != null;
}

/** Navegação circular usada por resultados e rascunhos do PDV. */
export function nextPdvIndex(current: number, length: number, delta: number): number {
  if (length <= 0) return -1;
  const safeCurrent = current >= 0 && current < length ? current : 0;
  return (safeCurrent + delta + length) % length;
}

export type PdvGridDirection = 'up' | 'down' | 'left' | 'right';

export interface PdvGridItemRect {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * Encontra o vizinho VISUAL de um card na grade do PDV.
 *
 * A grade muda de 2 a 5 colunas conforme o viewport e ainda é separada em
 * seções. Portanto, navegar por índice (`+1`/`-1`) não representa "baixo" e
 * "cima": o próximo item do array normalmente continua na mesma linha. Esta
 * função usa os retângulos já calculados pelo browser e escolhe primeiro a
 * fileira/coluna imediatamente adjacente; dentro dela, o card mais alinhado ao
 * eixo do card atual.
 */
export function findPdvGridNeighbor(
  items: PdvGridItemRect[],
  currentId: string,
  direction: PdvGridDirection,
): string | null {
  const current = items.find((item) => item.id === currentId);
  if (!current) return items[0]?.id ?? null;

  const currentX = current.left + current.width / 2;
  const currentY = current.top + current.height / 2;
  const vertical = direction === 'up' || direction === 'down';

  const candidates = items
    .filter((item) => item.id !== currentId)
    .map((item) => {
      const x = item.left + item.width / 2;
      const y = item.top + item.height / 2;
      const primary = vertical
        ? direction === 'down' ? y - currentY : currentY - y
        : direction === 'right' ? x - currentX : currentX - x;
      const cross = vertical ? Math.abs(x - currentX) : Math.abs(y - currentY);
      return { item, primary, cross };
    })
    .filter(({ item, primary }) => {
      if (primary <= 4) return false;
      if (vertical) return true;

      // Esquerda/direita permanecem na mesma fileira. Sem este limite, ao
      // chegar na borda direita a seta poderia saltar diagonalmente para uma
      // seção inferior apenas porque ainda existe um card mais à direita.
      const rowTolerance = Math.max(current.height, item.height) * 0.55;
      return Math.abs((item.top + item.height / 2) - currentY) <= rowTolerance;
    });

  if (candidates.length === 0) return currentId;

  // Primeiro encontra a fileira/coluna mais próxima. Uma tolerância pequena
  // absorve diferenças de altura entre cards da mesma fileira sem misturar a
  // fileira seguinte.
  const nearestPrimary = Math.min(...candidates.map(({ primary }) => primary));
  const adjacent = candidates.filter(({ primary }) => primary <= nearestPrimary + 12);
  adjacent.sort((a, b) => a.cross - b.cross || a.primary - b.primary);

  return adjacent[0]?.item.id ?? currentId;
}
