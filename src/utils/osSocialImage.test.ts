import { describe, expect, it } from 'vitest';
import {
  calculateSocialLogoRect,
  chooseSocialBackground,
  chooseSocialPalette,
} from './osSocialImage';

function pixelsFromGrid(grid: Array<Array<[number, number, number, number]>>): Uint8ClampedArray {
  return new Uint8ClampedArray(grid.flat(2));
}

describe('chooseSocialBackground', () => {
  it('escolhe fundo claro para logo escuro', () => {
    expect(chooseSocialBackground(new Uint8ClampedArray([12, 18, 16, 255]))).toBe('#f4f8f6');
  });

  it('escolhe fundo escuro para logo claro', () => {
    expect(chooseSocialBackground(new Uint8ClampedArray([245, 248, 247, 255]))).toBe('#0d1714');
  });

  it('ignora pixels transparentes', () => {
    expect(chooseSocialBackground(new Uint8ClampedArray([
      255, 255, 255, 0,
      20, 20, 20, 255,
    ]))).toBe('#f4f8f6');
  });
});

describe('chooseSocialPalette', () => {
  it('estende o fundo preto sólido do próprio logo e usa a cor interna como detalhe', () => {
    const black: [number, number, number, number] = [0, 0, 0, 255];
    const gold: [number, number, number, number] = [239, 177, 91, 255];
    const pixels = pixelsFromGrid(Array.from({ length: 8 }, (_, y) => (
      Array.from({ length: 8 }, (_, x) => (x >= 2 && x <= 5 && y >= 2 && y <= 5 ? gold : black))
    )));

    expect(chooseSocialPalette(pixels, 8, 8, '#00c597')).toEqual({
      background: '#000000',
      accent: '#efb15b',
      extendsLogoEdge: true,
    });
  });

  it('não transforma os traços de um logo transparente em fundo sólido', () => {
    const transparent: [number, number, number, number] = [0, 0, 0, 0];
    const dark: [number, number, number, number] = [18, 18, 18, 255];
    const pixels = pixelsFromGrid(Array.from({ length: 8 }, (_, y) => (
      Array.from({ length: 8 }, (_, x) => (x === 3 && y >= 1 && y <= 6 ? dark : transparent))
    )));

    expect(chooseSocialPalette(pixels, 8, 8, '#00c597')).toMatchObject({
      background: '#f4f8f6',
      extendsLogoEdge: false,
    });
  });
});

describe('calculateSocialLogoRect', () => {
  it('mantém um logo horizontal inteiro dentro do recorte quadrado central', () => {
    const rect = calculateSocialLogoRect(1200, 300, { compactSafeArea: true });

    expect(rect).toEqual({ x: 315, y: 243.75, width: 570, height: 142.5 });
    expect(rect.x).toBeGreaterThanOrEqual(285);
    expect(rect.x + rect.width).toBeLessThanOrEqual(915);
  });

  it('preserva a composição mais larga quando a área segura é desligada', () => {
    const rect = calculateSocialLogoRect(1200, 300, { compactSafeArea: false });

    expect(rect).toEqual({ x: 220, y: 220, width: 760, height: 190 });
  });

  it('limita a escala compacta a 100% para não escapar do quadrado', () => {
    const rect = calculateSocialLogoRect(800, 800, {
      compactSafeArea: true,
      logoScale: 1.4,
    });

    expect(rect).toEqual({ x: 390, y: 105, width: 420, height: 420 });
  });
});
