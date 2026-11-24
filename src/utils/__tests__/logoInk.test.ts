import { describe, expect, it } from 'vitest';
import {
  classifyLogoPixels,
  classifyInk,
  detectEmbeddedLogoSurfaceTone,
  getContrastingLogoSurfaceTone,
  getLogoPlateTone,
  inkLuminance,
  resolveLogoSurfaceTone,
} from '../logoInk';

/** Monta um bloco de pixels RGBA repetindo as cores informadas. */
function pixels(colors: Array<[number, number, number, number]>, repeat = 1): Uint8ClampedArray {
  const data = new Uint8ClampedArray(colors.length * repeat * 4);
  let cursor = 0;
  for (let round = 0; round < repeat; round += 1) {
    colors.forEach(([r, g, b, a]) => {
      data[cursor] = r;
      data[cursor + 1] = g;
      data[cursor + 2] = b;
      data[cursor + 3] = a;
      cursor += 4;
    });
  }
  return data;
}

function imagePixels(
  width: number,
  height: number,
  background: [number, number, number, number],
  center: [number, number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isCenter = x >= 2 && x < width - 2 && y >= 2 && y < height - 2;
      const color = isCenter ? center : background;
      data.set(color, (y * width + x) * 4);
    }
  }
  return data;
}

const TRANSPARENT: [number, number, number, number] = [0, 0, 0, 0];
// Cores reais do logo do cliente Victor Repara: cinza-chumbo + azul.
const CHUMBO: [number, number, number, number] = [63, 74, 86, 255];
const AZUL: [number, number, number, number] = [59, 154, 225, 255];

describe('inkLuminance', () => {
  it('ignora o fundo transparente e mede só a arte', () => {
    const soArte = inkLuminance(pixels([CHUMBO], 10));
    const arteComFundo = inkLuminance(pixels([CHUMBO, TRANSPARENT, TRANSPARENT], 10));
    expect(soArte).not.toBeNull();
    expect(arteComFundo).toBeCloseTo(soArte as number, 10);
  });

  it('devolve null quando não há pixel legível', () => {
    expect(inkLuminance(pixels([TRANSPARENT], 10))).toBeNull();
    expect(inkLuminance(new Uint8ClampedArray())).toBeNull();
  });

  it('pondera pelo alfa: pixel quase apagado pesa menos que pixel cheio', () => {
    const cheio = inkLuminance(pixels([[255, 255, 255, 255], [0, 0, 0, 255]]));
    const brancoFraco = inkLuminance(pixels([[255, 255, 255, 64], [0, 0, 0, 255]]));
    expect(brancoFraco as number).toBeLessThan(cheio as number);
  });
});

describe('classifyInk', () => {
  it('logo de tinta escura sobre fundo transparente é "dark"', () => {
    // O caso que motivou a régua: chumbo + azul somem no menu escuro.
    expect(classifyInk(pixels([CHUMBO, AZUL, TRANSPARENT, TRANSPARENT], 8))).toBe('dark');
  });

  it('o azul sozinho ainda é "dark" — não é claro o bastante pro menu escuro', () => {
    expect(classifyInk(pixels([AZUL], 8))).toBe('dark');
  });

  it('logo de tinta clara é "light" e dispensa placa', () => {
    expect(classifyInk(pixels([[255, 255, 255, 255], TRANSPARENT], 8))).toBe('light');
    expect(classifyInk(pixels([[220, 235, 228, 255]], 8))).toBe('light');
  });

  it('preserva logo misto com símbolo escuro e lettering branco', () => {
    // Caso Glacial Cold: o símbolo escuro é mais denso e derruba a média, mas
    // a placa clara apagaria o nome branco — a arte foi feita para fundo escuro.
    expect(classifyInk(pixels([
      [12, 12, 12, 255],
      [12, 12, 12, 255],
      [12, 12, 12, 255],
      [255, 255, 255, 255],
    ], 8))).toBe('light');
  });

  it('não muda logo escuro por causa de um detalhe branco pequeno', () => {
    expect(classifyInk(pixels([
      [12, 12, 12, 255],
      [12, 12, 12, 255],
      [12, 12, 12, 255],
      [12, 12, 12, 255],
      [12, 12, 12, 255],
      [255, 255, 255, 255],
    ], 8))).toBe('dark');
  });

  it('sem pixel legível não arrisca palpite', () => {
    expect(classifyInk(pixels([TRANSPARENT], 8))).toBeNull();
  });
});

describe('placa incorporada ao arquivo', () => {
  it('reconhece o retângulo preto opaco de um logo com lettering claro', () => {
    const logo = imagePixels(12, 8, [8, 8, 8, 255], [226, 184, 74, 255]);

    expect(detectEmbeddedLogoSurfaceTone(logo, 12, 8)).toBe('dark');
    expect(classifyLogoPixels(logo, 12, 8)).toBe('light');
    expect(resolveLogoSurfaceTone('auto', classifyLogoPixels(logo, 12, 8))).toBe('dark');
  });

  it('reconhece placa clara incorporada e mantém faixa clara no automático', () => {
    const logo = imagePixels(12, 8, [250, 250, 250, 255], [18, 18, 18, 255]);

    expect(detectEmbeddedLogoSurfaceTone(logo, 12, 8)).toBe('light');
    expect(classifyLogoPixels(logo, 12, 8)).toBe('dark');
  });

  it('não confunde transparência com placa incorporada', () => {
    const logo = imagePixels(12, 8, TRANSPARENT, [255, 255, 255, 255]);

    expect(detectEmbeddedLogoSurfaceTone(logo, 12, 8)).toBeNull();
    expect(classifyLogoPixels(logo, 12, 8)).toBe('light');
  });

  it('não força placa quando as bordas opacas têm várias cores', () => {
    const logo = imagePixels(12, 8, [8, 8, 8, 255], [255, 255, 255, 255]);
    for (let x = 0; x < 12; x += 1) {
      logo.set([230, 40, 40, 255], x * 4);
    }

    expect(detectEmbeddedLogoSurfaceTone(logo, 12, 8)).toBeNull();
  });
});

describe('getLogoPlateTone', () => {
  it.each([
    { ink: 'dark' as const, surface: 'light' as const, plate: null },
    { ink: 'dark' as const, surface: 'dark' as const, plate: 'light' },
    { ink: 'light' as const, surface: 'light' as const, plate: 'dark' },
    { ink: 'light' as const, surface: 'dark' as const, plate: null },
  ])('tinta $ink sobre superfície $surface usa placa $plate', ({ ink, surface, plate }) => {
    expect(getLogoPlateTone(ink, surface)).toBe(plate);
  });

  it('não arrisca placa quando a tinta não pôde ser medida', () => {
    expect(getLogoPlateTone(null, 'light')).toBeNull();
    expect(getLogoPlateTone(null, 'dark')).toBeNull();
  });
});

describe('getContrastingLogoSurfaceTone', () => {
  it.each([
    { ink: 'dark' as const, expected: 'light' },
    { ink: 'light' as const, expected: 'dark' },
  ])('tinta $ink usa a faixa $expected', ({ ink, expected }) => {
    expect(getContrastingLogoSurfaceTone(ink)).toBe(expected);
  });

  it('não força uma faixa enquanto a tinta ainda não foi medida', () => {
    expect(getContrastingLogoSurfaceTone(null)).toBeNull();
  });
});

describe('resolveLogoSurfaceTone', () => {
  it('mantém a detecção da tinta no modo automático', () => {
    expect(resolveLogoSurfaceTone('auto', 'dark')).toBe('light');
    expect(resolveLogoSurfaceTone('auto', 'light')).toBe('dark');
  });

  it('não força fundo quando a preferência acompanha o sistema', () => {
    expect(resolveLogoSurfaceTone('system', 'light')).toBeNull();
  });

  it.each(['light', 'dark'] as const)('respeita o override manual %s', (tone) => {
    expect(resolveLogoSurfaceTone(tone, tone === 'light' ? 'dark' : 'light')).toBe(tone);
    expect(resolveLogoSurfaceTone(tone, null)).toBe(tone);
  });

  it('trata preferência antiga/ausente como automática', () => {
    expect(resolveLogoSurfaceTone(null, 'light')).toBe('dark');
    expect(resolveLogoSurfaceTone(undefined, 'dark')).toBe('light');
  });
});
