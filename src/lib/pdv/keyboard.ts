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

export type PdvCommandShortcutAction =
  | 'search'
  | 'payment'
  | 'help'
  | 'quantity_up'
  | 'quantity_down';

/** Aliases de mercado; Alt nunca participa para preservar atalhos do SO. */
export function resolvePdvCommandShortcut(input: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): PdvCommandShortcutAction | null {
  if (input.altKey || (!input.ctrlKey && !input.metaKey)) return null;
  const key = input.key.toLocaleLowerCase('pt-BR');
  if (key === 'f') return 'search';
  if (key === 'enter') return 'payment';
  if (key === 'k') return 'help';
  if (key === '+' || key === '=') return 'quantity_up';
  if (key === '-') return 'quantity_down';
  return null;
}

/**
 * Decide quando uma seta sai da busca e entra no catálogo.
 *
 * Com texto digitado, esquerda/direita continuam movendo o cursor no campo.
 * Cima/baixo sempre entram nos produtos; com a busca vazia, qualquer seta
 * pode iniciar a navegação do catálogo.
 */
export function shouldNavigatePdvCatalogFromSearch(
  key: string,
  searchValue: string,
): boolean {
  if (key === 'ArrowUp' || key === 'ArrowDown') return true;
  if (key === 'ArrowLeft' || key === 'ArrowRight') return searchValue.length === 0;
  return false;
}

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
  const readingOrder = [...items].sort((a, b) => {
    const rowTolerance = Math.max(a.height, b.height) * 0.55;
    const aY = a.top + a.height / 2;
    const bY = b.top + b.height / 2;
    if (Math.abs(aY - bY) <= rowTolerance) return a.left - b.left;
    return a.top - b.top;
  });

  // Esquerda/direita percorrem a lista visual inteira. Assim, a direita no
  // último card de uma linha desce para o primeiro da próxima e a esquerda no
  // primeiro sobe para o último da anterior, inclusive entre seções.
  if (!vertical) {
    const index = readingOrder.findIndex((item) => item.id === currentId);
    return readingOrder[nextPdvIndex(index, readingOrder.length, direction === 'right' ? 1 : -1)]?.id ?? currentId;
  }

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

  if (candidates.length === 0) {
    const edgeItems = [...items]
      .filter((item) => item.id !== currentId)
      .sort((a, b) => {
        const aY = a.top + a.height / 2;
        const bY = b.top + b.height / 2;
        const edgeOrder = direction === 'up' ? bY - aY : aY - bY;
        if (Math.abs(edgeOrder) > 4) return edgeOrder;

        const aX = a.left + a.width / 2;
        const bX = b.left + b.width / 2;
        return Math.abs(aX - currentX) - Math.abs(bX - currentX);
      });

    return edgeItems[0]?.id ?? currentId;
  }

  // Primeiro encontra a fileira/coluna mais próxima. Uma tolerância pequena
  // absorve diferenças de altura entre cards da mesma fileira sem misturar a
  // fileira seguinte.
  const nearestPrimary = Math.min(...candidates.map(({ primary }) => primary));
  const adjacent = candidates.filter(({ primary }) => primary <= nearestPrimary + 12);
  adjacent.sort((a, b) => a.cross - b.cross || a.primary - b.primary);

  return adjacent[0]?.item.id ?? currentId;
}
