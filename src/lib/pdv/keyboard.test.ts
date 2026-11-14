import { describe, expect, it } from 'vitest';
import {
  findPdvGridNeighbor,
  isPdvEditableTarget,
  nextPdvIndex,
  resolvePdvCommandShortcut,
  shouldNavigatePdvCatalogFromSearch,
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

  it('entra no catálogo com cima/baixo sem roubar esquerda/direita do texto', () => {
    expect(shouldNavigatePdvCatalogFromSearch('ArrowDown', 'cimento')).toBe(true);
    expect(shouldNavigatePdvCatalogFromSearch('ArrowUp', 'cimento')).toBe(true);
    expect(shouldNavigatePdvCatalogFromSearch('ArrowLeft', 'cimento')).toBe(false);
    expect(shouldNavigatePdvCatalogFromSearch('ArrowRight', 'cimento')).toBe(false);
    expect(shouldNavigatePdvCatalogFromSearch('ArrowLeft', '')).toBe(true);
    expect(shouldNavigatePdvCatalogFromSearch('ArrowRight', '')).toBe(true);
  });

  it('reconhece aliases de mercado sem capturar Alt ou teclas comuns', () => {
    expect(resolvePdvCommandShortcut({ key: 'f', metaKey: true })).toBe('search');
    expect(resolvePdvCommandShortcut({ key: 'Enter', ctrlKey: true })).toBe('payment');
    expect(resolvePdvCommandShortcut({ key: 'k', ctrlKey: true })).toBe('help');
    expect(resolvePdvCommandShortcut({ key: '=', metaKey: true })).toBe('quantity_up');
    expect(resolvePdvCommandShortcut({ key: '-', ctrlKey: true })).toBe('quantity_down');
    expect(resolvePdvCommandShortcut({ key: 'f', altKey: true, ctrlKey: true })).toBeNull();
    expect(resolvePdvCommandShortcut({ key: 'f' })).toBeNull();
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
    expect(findPdvGridNeighbor(items, 'fita', 'right')).toBe('disjuntor');
    expect(findPdvGridNeighbor(items, 'disjuntor', 'left')).toBe('fita');
  });

  it('volta circularmente entre o primeiro e o último card da grade', () => {
    const items: PdvGridItemRect[] = [
      { id: 'a', left: 0, top: 0, right: 100, bottom: 120, width: 100, height: 120 },
      { id: 'b', left: 112, top: 0, right: 212, bottom: 120, width: 100, height: 120 },
      { id: 'c', left: 0, top: 132, right: 100, bottom: 252, width: 100, height: 120 },
    ];

    expect(findPdvGridNeighbor(items, 'a', 'left')).toBe('c');
    expect(findPdvGridNeighbor(items, 'b', 'right')).toBe('c');
    expect(findPdvGridNeighbor(items, 'c', 'left')).toBe('b');
    expect(findPdvGridNeighbor(items, 'c', 'right')).toBe('a');
    expect(findPdvGridNeighbor(items, 'a', 'up')).toBe('c');
    expect(findPdvGridNeighbor(items, 'c', 'down')).toBe('a');
  });
});
