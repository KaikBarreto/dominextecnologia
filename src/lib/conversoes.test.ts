import { describe, expect, it } from 'vitest';
import { CONVERSAO_CATEGORIAS, converter, formatarResultado, lerValorConversao } from './conversoes';

describe('conversões do técnico', () => {
  it('separa HP mecânico da referência comercial de refrigeração', () => {
    expect(converter('potencia', 'HP', 'W', 1)).toBeCloseTo(745.699872, 6);
    expect(converter('potencia', 'HP', 'BTU/h', 1)).toBeCloseTo(2544.433853, 5);
    expect(converter('potencia', 'HP_ref', 'BTU/h', 1)).toBeCloseTo(9000, 6);
    expect(converter('potencia', 'BTU/h', 'HP_ref', 18000)).toBeCloseTo(2, 6);
  });
  it('mantém a referência comercial consistente também para kW térmico e TR', () => {
    expect(converter('potencia', 'HP_ref', 'kW', 1)).toBeCloseTo(2.63764, 4);
    expect(converter('potencia', 'HP_ref', 'TR', 1)).toBeCloseTo(0.75, 5);
    expect(converter('potencia', 'HP', 'cv', 1)).toBeCloseTo(1.0138697, 5);
  });
  it('não interpreta o agrupamento brasileiro do resultado como fração', () => {
    for (const value of [9000, 2544.433853, -12345.5, 0.25]) {
      expect(lerValorConversao(formatarResultado(value))).toBeCloseTo(value, 6);
    }
    expect(lerValorConversao('1.234,56')).toBe(1234.56);
    expect(lerValorConversao('1.5')).toBe(1.5);
    expect(lerValorConversao('abc')).toBeNaN();
    expect(lerValorConversao('1.2,3')).toBeNaN();
    expect(lerValorConversao('0x10')).toBeNaN();
    expect(lerValorConversao(',5')).toBe(0.5);
    expect(lerValorConversao('')).toBeNaN();
  });
  it('preserva conversões de pressão, temperatura e comprimento', () => {
    expect(converter('pressao', 'bar', 'psi', 1)).toBeCloseTo(14.50377, 4);
    expect(converter('temperatura', 'C', 'F', -40)).toBe(-40);
    expect(converter('comprimento', 'pol', 'mm', 1)).toBe(25.4);
    expect(converter('potencia', 'desconhecida', 'W', 1)).toBeNaN();
  });
  it('mantém a grandeza na ida e volta de todos os pares de unidades', () => {
    for (const categoria of ['pressao', 'temperatura', 'potencia', 'comprimento'] as const) {
      for (const de of CONVERSAO_CATEGORIAS[categoria].unidades) {
        for (const para of CONVERSAO_CATEGORIAS[categoria].unidades) {
          for (const valor of [0, 1.25, 1234.5]) {
            const destino = converter(categoria, de.code, para.code, valor);
            expect(converter(categoria, para.code, de.code, destino)).toBeCloseTo(valor, 7);
          }
        }
      }
    }
  });
  it('bloqueia temperaturas abaixo do zero absoluto sem rejeitar a fronteira', () => {
    expect(converter('temperatura', 'C', 'K', -273.15)).toBe(0);
    expect(converter('temperatura', 'F', 'C', -459.67)).toBeCloseTo(-273.15, 6);
    expect(converter('temperatura', 'K', 'C', -1)).toBeNaN();
    expect(converter('temperatura', 'C', 'F', -274)).toBeNaN();
  });
  it('não arredonda um resultado pequeno não nulo para zero', () => {
    expect(formatarResultado(1e-9)).toBe('1E-9');
    expect(lerValorConversao(formatarResultado(1.25e-9))).toBe(1.25e-9);
  });
});
