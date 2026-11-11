import { describe, expect, it } from 'vitest';
import { classifyInk, getLogoPlateTone, inkLuminance } from '../logoInk';

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
