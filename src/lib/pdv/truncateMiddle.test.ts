import { describe, expect, it } from 'vitest';
import { measureTextWidth, truncateForTwoLines, truncateMiddle } from './truncateMiddle';

describe('truncateMiddle', () => {
  it('nome curto passa inteiro, sem reticência', () => {
    expect(truncateMiddle('Capacitor', 10, 8)).toBe('Capacitor');
    expect(truncateMiddle('Mangueira', 10, 8)).not.toContain('…');
  });

  it('nome longo mantém começo e fim, cortando no meio', () => {
    const name = 'Capacitor de partida eletrolítico 35 microfarads industrial';
    const result = truncateMiddle(name, 10, 8);
    expect(result).toContain('…');
    expect(result.startsWith(name.slice(0, 10))).toBe(true);
    expect(result.endsWith(name.slice(-8))).toBe(true);
  });

  it('distingue os dois capacitores reais do catálogo pela medida no fim', () => {
    const a = truncateMiddle('Capacitor de partida 35uF', 10, 8);
    const b = truncateMiddle('Capacitor de partida 45uF', 10, 8);
    expect(a).not.toBe(b);
    expect(a).toContain('35uF');
    expect(b).toContain('45uF');
  });

  it('não quebra com acento e aspas no nome', () => {
    const a = truncateMiddle('Abraçadeira metálica tipo "U" reforçada industrial', 10, 8);
    expect(a).toContain('…');
    expect(() => truncateMiddle('Abraçadeira metálica tipo "U"', 10, 8)).not.toThrow();

    const b = truncateMiddle('Tubo de cobre 1/2" (vara 5m) reforçado premium', 10, 8);
    expect(b).toContain('…');
    expect(() => truncateMiddle('Tubo de cobre 1/2" (vara 5m)', 10, 8)).not.toThrow();
  });

  it('nunca inclui mais de uma reticência', () => {
    const result = truncateMiddle('Capacitor de partida eletrolítico 35 microfarads industrial', 10, 8);
    expect(result.split('…')).toHaveLength(2);
  });

  it('usa a reticência de verdade (um único caractere "…"), não três pontos', () => {
    const result = truncateMiddle('Capacitor de partida eletrolítico 35 microfarads industrial', 10, 8);
    expect(result).toContain('…');
    expect(result).not.toContain('...');
  });

  it('limite 0 não estoura e não gera string absurda', () => {
    expect(() => truncateMiddle('Capacitor de partida 35uF', 0, 0)).not.toThrow();
    expect(truncateMiddle('Capacitor de partida 35uF', 0, 0)).toBe('…');
  });

  it('limite 1 não estoura', () => {
    const result = truncateMiddle('Capacitor de partida 35uF', 1, 1);
    expect(() => result).not.toThrow();
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('limite 2 não estoura', () => {
    const result = truncateMiddle('Capacitor de partida 35uF', 2, 2);
    expect(result).toBe('Ca…uF');
  });

  it('limite negativo é tratado como 0 (não gera cauda inválida)', () => {
    expect(() => truncateMiddle('Capacitor de partida 35uF', -5, -5)).not.toThrow();
    expect(truncateMiddle('Capacitor de partida 35uF', -5, -5)).toBe('…');
  });

  it('nome vazio ou indefinido não quebra', () => {
    expect(truncateMiddle('', 10, 8)).toBe('');
    expect(truncateMiddle(undefined as unknown as string, 10, 8)).toBe('');
  });

  it('string exatamente no limite (headChars + tailChars + 1) passa inteira', () => {
    const name = '1234567890123456789'; // 19 chars = 10 + 8 + 1
    expect(truncateMiddle(name, 10, 8)).toBe(name);
  });

  it('string com 1 caractere a mais que o limite já corta', () => {
    const name = '12345678901234567890'; // 20 chars
    const result = truncateMiddle(name, 10, 8);
    expect(result).toContain('…');
    expect(result.length).toBeLessThan(name.length);
  });
});

describe('measureTextWidth', () => {
  it('devolve número positivo pra texto não vazio', () => {
    expect(measureTextWidth('Capacitor', '14px sans-serif')).toBeGreaterThan(0);
  });

  it('texto mais longo mede mais largo que texto mais curto na mesma fonte', () => {
    const short = measureTextWidth('Capa', '14px sans-serif');
    const long = measureTextWidth('Capacitor de partida 35uF', '14px sans-serif');
    expect(long).toBeGreaterThan(short);
  });

  it('fonte maior mede mais largo pro MESMO texto (heurística lê o tamanho do shorthand)', () => {
    const small = measureTextWidth('Capacitor', '10px sans-serif');
    const big = measureTextWidth('Capacitor', '30px sans-serif');
    expect(big).toBeGreaterThan(small);
  });

  it('texto vazio não quebra', () => {
    expect(() => measureTextWidth('', '14px sans-serif')).not.toThrow();
    expect(measureTextWidth('', '14px sans-serif')).toBe(0);
  });

  it('font shorthand sem "px" não quebra (cai no fallback de 14px)', () => {
    expect(() => measureTextWidth('Capacitor', 'bold sans-serif')).not.toThrow();
  });
});

describe('truncateForTwoLines', () => {
  const FONT = '14px sans-serif';

  it('largura <= 0 (ainda não mediu) devolve o nome INTEIRO, nunca corta por falta de medição', () => {
    expect(truncateForTwoLines('Capacitor de partida 35uF', 0, FONT)).toBe('Capacitor de partida 35uF');
    expect(truncateForTwoLines('Capacitor de partida 35uF', -10, FONT)).toBe('Capacitor de partida 35uF');
  });

  it('container BEM largo não corta nome nenhum (2 linhas sobram de sobra)', () => {
    const name = 'Capacitor de partida 35uF';
    expect(truncateForTwoLines(name, 5000, FONT)).toBe(name);
  });

  it('nome curto não leva reticência mesmo em container estreito', () => {
    const result = truncateForTwoLines('Capacitor', 200, FONT);
    expect(result).toBe('Capacitor');
  });

  it('container BEM estreito corta e preserva início e fim', () => {
    const name = 'Capacitor de partida eletrolítico industrial 35 microfarads reforçado';
    const result = truncateForTwoLines(name, 60, FONT);
    expect(result).toContain('…');
    expect(result.length).toBeLessThan(name.length);
  });

  it('em container estreito, os dois capacitores reais do catálogo continuam DIFERENTES entre si', () => {
    const a = truncateForTwoLines('Capacitor de partida 35uF', 60, FONT);
    const b = truncateForTwoLines('Capacitor de partida 45uF', 60, FONT);
    expect(a).not.toBe(b);
  });

  it('nome vazio não quebra', () => {
    expect(truncateForTwoLines('', 200, FONT)).toBe('');
  });

  it('nunca inclui mais de uma reticência quando corta', () => {
    const name = 'Capacitor de partida eletrolítico industrial 35 microfarads reforçado';
    const result = truncateForTwoLines(name, 60, FONT);
    if (result.includes('…')) {
      expect(result.split('…')).toHaveLength(2);
    }
  });
});
