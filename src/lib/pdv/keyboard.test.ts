import { describe, expect, it } from 'vitest';
import {
  findPdvGridNeighbor,
  isPdvEditableTarget,
  nextPdvIndex,
  type PdvGridItemRect,
} from '@/lib/pdv/keyboard';

describe('atalhos do PDV', () => {
  it('não captura teclas imprimíveis durante digitação', () => {
    expect(isPdvEditableTarget(document.createElement('input'))).toBe(true);
    expect(isPdvEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isPdvEditableTarget(document.createElement('button'))).toBe(false);
  });

  it('navega circularmente entre resultados', () => {
    expect(nextPdvIndex(0, 3, 1)).toBe(1);
    expect(nextPdvIndex(2, 3, 1)).toBe(0);
    expect(nextPdvIndex(0, 3, -1)).toBe(2);
    expect(nextPdvIndex(0, 0, 1)).toBe(-1);
  });

  it('navega pela posição visual da grade, não pela ordem do array', () => {
    const rect = (id: string, left: number, top: number): PdvGridItemRect => ({
      id,
      left,
      top,
      right: left + 100,
      bottom: top + 120,
      width: 100,
      height: 120,
    });
    const items = [
      rect('protetor', 0, 0),
      rect('silicone', 112, 0),
      rect('fita', 224, 0),
      rect('disjuntor', 0, 132),
      rect('terminal', 112, 132),
      rect('cabo', 224, 132),
    ];

    expect(findPdvGridNeighbor(items, 'protetor', 'down')).toBe('disjuntor');
    expect(findPdvGridNeighbor(items, 'protetor', 'right')).toBe('silicone');
    expect(findPdvGridNeighbor(items, 'terminal', 'up')).toBe('silicone');
    expect(findPdvGridNeighbor(items, 'terminal', 'left')).toBe('disjuntor');
  });

  it('mantém o card atual ao tentar atravessar a borda horizontal', () => {
    const items: PdvGridItemRect[] = [
      { id: 'a', left: 0, top: 0, right: 100, bottom: 120, width: 100, height: 120 },
      { id: 'b', left: 112, top: 0, right: 212, bottom: 120, width: 100, height: 120 },
      { id: 'c', left: 0, top: 132, right: 100, bottom: 252, width: 100, height: 120 },
    ];

    expect(findPdvGridNeighbor(items, 'b', 'right')).toBe('b');
  });
});
