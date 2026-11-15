import { describe, expect, it } from 'vitest';
import { calcularCargaTermica, formatarBtus } from './cargaTermica';
import { calcularCaboEletrico, correnteNominalInterpolada } from './caboEletrico';
import { correnteNominalPorCV, dimensionarContator } from './contator';
import { calcularDiluicao, formatarDiluicao } from './diluicao';
import { formatarNumero } from './capacitor';

const room = { altura: 3, largura: 4, comprimento: 5, pessoas: 2, eletronicos: 1, janelas: 1, ensolarado: false };

describe('carga térmica aproximada', () => {
  it('soma área e cargas adicionais em BTU/h sem misturar com TR', () => {
    expect(calcularCargaTermica(room)).toBe(14400);
    expect(calcularCargaTermica({ ...room, altura: 4, ensolarado: true })).toBe(21200);
  });
  it.each([
    { largura: -4, comprimento: -5 }, { altura: 0 }, { pessoas: -1 },
    { pessoas: 1.5 }, { eletronicos: 0.5 }, { janelas: -1 }, { largura: Infinity },
    { comprimento: NaN }, { largura: Number.MAX_VALUE, comprimento: 5 },
  ])('rejeita entradas inválidas em vez de mostrar capacidade válida: %j', (patch) => {
    expect(calcularCargaTermica({ ...room, ...patch })).toBeNull();
  });
  it('formata capacidade e decimais de forma legível', () => {
    expect(formatarBtus(14400)).toBe('14.400');
    expect(formatarBtus(1e100).length).toBeLessThan(15);
  });
});

describe('estimativa elétrica de cabo', () => {
  it('usa tensão real e corrente de referência na queda de ida e volta', () => {
    const result = calcularCaboEletrico(12000, '220', 40);
    expect(result).toMatchObject({ tensao: 220, secaoMM2: 6, disjuntorA: 16, correnteProjeto: 10.25, quedaPct: 1.4 });
    expect(calcularCaboEletrico(12000, '127', 40)).toMatchObject({ tensao: 127, secaoMM2: 10, disjuntorA: 16, correnteProjeto: 12.5, quedaPct: 1.8 });
  });
  it('interpola só dentro da faixa, sem limitar correntes de capacidades maiores', () => {
    expect(correnteNominalInterpolada(22000, '220')?.corrente).toBe(13);
    expect(correnteNominalInterpolada(120000, '220')).toBeNull();
    expect(correnteNominalInterpolada(24000, '127')).toBeNull();
    expect(correnteNominalInterpolada(1000, '220')).toBeNull();
  });
  it.each([NaN, Infinity, -5, 0])('rejeita valor inválido %s', (value) => {
    expect(calcularCaboEletrico(value, '220', 40)).toBeNull();
    expect(calcularCaboEletrico(12000, '220', value)).toBeNull();
    expect(correnteNominalInterpolada(value, '220')).toBeNull();
  });
  it('marca distância além da linha sem afirmar que atende', () => {
    expect(calcularCaboEletrico(12000, '220', 10000)?.foraDeAlcance).toBe(true);
    expect(calcularCaboEletrico(12000, '500', 40)).toBeNull();
    expect(calcularCaboEletrico(12000, '220', 40)?.correnteEstimada).toBe(true);
  });
});

describe('referência trifásica', () => {
  it('calcula corrente de potência mecânica com eficiência e fator de potência', () => {
    expect(correnteNominalPorCV(1, 220, 0.828, 0.82)).toBeCloseTo(2.8429, 3);
  });
  it.each([0, -1, 1.01, Infinity, NaN])('rejeita eficiência ou fator de potência inválido %s', (n) => {
    expect(correnteNominalPorCV(1, 220, n, 0.82)).toBeNull();
    expect(correnteNominalPorCV(1, 220, 0.828, n)).toBeNull();
  });
  it('escolhe o próximo contator sem arredondar a corrente para baixo', () => {
    expect(dimensionarContator(9.004 / 1.15)?.contatorAC3).toBe(12);
    expect(dimensionarContator(2.9)?.contatorAC3).toBe(9);
    expect(dimensionarContator(100)).toMatchObject({ contatorAC3: null, acimaDaLinha: true });
  });
  it('preserva correntes pequenas positivas sem arredondá-las para zero', () => {
    expect(dimensionarContator(0.001)).toMatchObject({ correnteNominal: 0.001, releTermico: 0.001 });
    expect(dimensionarContator(0.001)?.correnteEmprego).toBeCloseTo(0.00115, 10);
  });
  it.each([NaN, Infinity, -1, 0, Number.MAX_VALUE])('não gera número recomendado para corrente inválida %s', (n) => {
    expect(dimensionarContator(n)).toBeNull();
  });
});

describe('diluição produto:água', () => {
  it('divide volume total em N+1 partes, e não em N', () => {
    expect(calcularDiluicao('preparar', 1100, 10)).toEqual({ produto: 100, agua: 1000, volumeFinal: 1100 });
    expect(calcularDiluicao('tenho', 100, 10)).toEqual({ produto: 100, agua: 1000, volumeFinal: 1100 });
  });
  it('suporta produto puro e proporção decimal sem trocar unidades', () => {
    expect(calcularDiluicao('preparar', 1, 0)).toEqual({ produto: 1, agua: 0, volumeFinal: 1 });
    expect(calcularDiluicao('tenho', 2, 0.5)).toEqual({ produto: 2, agua: 1, volumeFinal: 3 });
  });
  it.each([NaN, Infinity, -1])('rejeita proporção inválida %s', (n) => {
    expect(calcularDiluicao('preparar', 1, n)).toBeNull();
    expect(calcularDiluicao('tenho', 1, n)).toBeNull();
  });
  it.each([NaN, Infinity, -1, 0])('rejeita quantidade inválida %s', (n) => {
    expect(calcularDiluicao('preparar', n, 10)).toBeNull();
    expect(calcularDiluicao('tenho', n, 10)).toBeNull();
  });
  it('interrompe overflow e não arredonda pequenas doses a zero', () => {
    expect(calcularDiluicao('tenho', Number.MAX_VALUE, 10)).toBeNull();
    expect(formatarDiluicao(1 / 1001)).not.toBe('0');
    expect(formatarDiluicao(0.000999)).toBe('0,000999');
    expect(formatarDiluicao(1e100).length).toBeLessThan(15);
    expect(formatarNumero(1e100).length).toBeLessThan(15);
  });
});
