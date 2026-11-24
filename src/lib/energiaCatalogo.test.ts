import { describe, expect, it } from 'vitest';
import { calcularEnergiaCatalogo } from './energiaCatalogo';

describe('consumo de energia do catálogo sem inventar condições de ensaio', () => {
  it.each([0, 1, 8, 12, 24])('não deduz potência nem escala16kWh/mês por %sh/dia sem metadados', (horasDia) => {
    const result = calcularEnergiaCatalogo({ consumoKwhMes: 16, horasDia, tarifa: 0.9 });
    expect(result).toEqual({ referenciaKwhMes: 16, gastoReferenciaMes: 14.4, estimativaNominal: null });
  });
  it('usa só potência elétrica na simulação e respeita a tarifa', () => {
    expect(calcularEnergiaCatalogo({ potenciaW: 900, horasDia: 8, tarifa: 0.9 })).toEqual({
      referenciaKwhMes: null, gastoReferenciaMes: null,
      estimativaNominal: { kwhHora: 0.9, kwhMes: 216, gastoHora: 0.81, gastoMes: 194.4, horasDia: 8 },
    });
  });
  it('separa referência mensal da simulação nominal quando ambas existem', () => {
    const result = calcularEnergiaCatalogo({ potenciaW: 900, consumoKwhMes: 16, horasDia: 8, tarifa: 1 });
    expect(result.referenciaKwhMes).toBe(16);
    expect(result.estimativaNominal?.kwhMes).toBe(216);
    expect(result.estimativaNominal?.kwhHora).toBe(0.9);
  });
  it('não infere consumo horário de referência de geladeira; simulação24h só se potência existe', () => {
    expect(calcularEnergiaCatalogo({ consumoKwhMes: 30, continuo: true, horasDia: 8, tarifa: 1 }).estimativaNominal).toBeNull();
    const nominal = calcularEnergiaCatalogo({ potenciaW: 100, continuo: true, horasDia: 8, tarifa: 1 }).estimativaNominal;
    expect(nominal).toMatchObject({ kwhHora: 0.1, horasDia: 24 });
    expect(nominal?.kwhMes).toBeCloseTo(72, 8);
  });
  it('aceita zero horas e tarifa zero como escolhas explícitas', () => {
    expect(calcularEnergiaCatalogo({ potenciaW: 900, horasDia: 0, tarifa: 0 }).estimativaNominal).toMatchObject({ kwhMes: 0, gastoHora: 0, gastoMes: 0 });
  });
  it.each([NaN, Infinity, -1, 0])('não estima com potência inválida %s', (potenciaW) => {
    expect(calcularEnergiaCatalogo({ potenciaW, horasDia: 8, tarifa: 1 }).estimativaNominal).toBeNull();
  });
  it.each([NaN, Infinity, -1, 25])('não estima com horas inválidas %s', (horasDia) => {
    expect(calcularEnergiaCatalogo({ potenciaW: 900, horasDia, tarifa: 1 }).estimativaNominal).toBeNull();
  });
  it.each([NaN, Infinity, -1])('não anuncia custo com tarifa inválida %s', (tarifa) => {
    const result = calcularEnergiaCatalogo({ potenciaW: 900, consumoKwhMes: 16, horasDia: 8, tarifa });
    expect(result.gastoReferenciaMes).toBeNull();
    expect(result.estimativaNominal?.gastoMes).toBeNull();
  });
  it('não gera Infinity quando consumo, potência ou custo ultrapassa o intervalo numérico', () => {
    expect(Number.isFinite(calcularEnergiaCatalogo({ potenciaW: Number.MAX_VALUE, horasDia: 24, tarifa: 1 }).estimativaNominal?.kwhMes)).toBe(true);
    expect(calcularEnergiaCatalogo({ consumoKwhMes: Number.MAX_VALUE, horasDia: 8, tarifa: Number.MAX_VALUE }).gastoReferenciaMes).toBeNull();
    expect(calcularEnergiaCatalogo({ consumoKwhMes: Infinity, horasDia: 8, tarifa: 1 }).referenciaKwhMes).toBeNull();
  });
});
