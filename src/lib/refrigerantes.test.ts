import { describe, expect, it } from 'vitest';
import { REFRIGERANTES, calcularSubresfriamento, calcularSuperaquecimento, classificarFaixa, pressaoParaTempSat, sugerirOutraUnidade, tempParaPressao, type Curva } from './refrigerantes';

describe('tabelas de saturação e SH/SC', () => {
  for (const gas of REFRIGERANTES) {
    for (const curva of (gas.temGlide ? ['bubble', 'dew'] : ['unica']) as Curva[]) {
      it(`${gas.id} ${curva}: interpolação inversa, limites e gauge coerentes`, () => {
        const tabela = curva === 'unica' ? gas.unica! : curva === 'bubble' ? gas.bubble! : gas.dew!;
        for (let i = 0; i < tabela.length; i++) {
          const ponto = tabela[i];
          expect(ponto.bar).toBeGreaterThan(-1.01325);
          expect(Math.abs(ponto.bar * 14.503773773 - ponto.psi)).toBeLessThan(0.2);
          for (const unit of ['bar', 'psi'] as const) {
            expect(pressaoParaTempSat(gas.id, ponto[unit], unit, curva)).toBeCloseTo(ponto.t, 8);
            expect(tempParaPressao(gas.id, ponto.t, unit, curva)).toBeCloseTo(ponto[unit], 8);
            if (i > 0) {
              const previous = tabela[i - 1];
              expect(ponto.t).toBeGreaterThan(previous.t);
              expect(ponto[unit]).toBeGreaterThan(previous[unit]);
              const middle = (previous.t + ponto.t) / 2;
              const p = tempParaPressao(gas.id, middle, unit, curva)!;
              expect(pressaoParaTempSat(gas.id, p, unit, curva)).toBeCloseTo(middle, 8);
            }
          }
        }
        expect(tempParaPressao(gas.id, tabela[0].t - 0.01, 'bar', curva)).toBeNull();
        expect(tempParaPressao(gas.id, tabela[tabela.length - 1].t + 0.01, 'bar', curva)).toBeNull();
        expect(pressaoParaTempSat(gas.id, tabela[0].psi - 0.01, 'psi', curva)).toBeNull();
        expect(pressaoParaTempSat(gas.id, tabela[tabela.length - 1].psi + 0.01, 'psi', curva)).toBeNull();
      });
    }
  }

  it('usa vapor/dew para SH e líquido/bubble para SC, sem confundir pressão absoluta', () => {
    // Solstice N40 TDS 7900001 (05/2026), página 3: 101 psig, bubble 46,5°F, dew 56,3°F.
    expect(pressaoParaTempSat('R-448A', 101, 'psi', 'dew')).toBeCloseTo(13.5, 8);
    expect(pressaoParaTempSat('R-448A', 101, 'psi', 'bubble')).toBeCloseTo((46.5 - 32) * 5 / 9, 8);
    expect(calcularSuperaquecimento('R-448A', 101, 'psi', 20).delta).toBeCloseTo(6.5, 8);
    expect(calcularSubresfriamento('R-448A', 101, 'psi', 3).delta).toBeCloseTo((46.5 - 32) * 5 / 9 - 3, 8);
    expect(pressaoParaTempSat('R-448A', 101 / 14.503773773, 'bar', 'dew')).toBeCloseTo(13.5, 8);
  });
  it('R-404A converte a fonte absoluta para gauge uma única vez e mantém as curvas distintas', () => {
    // National Refrigerants, guia 7ª edição, página 39: a 140°F, 418,5/416,4 psia.
    expect(tempParaPressao('R-404A', 60, 'psi', 'bubble')).toBeCloseTo(418.5 - 14.695948776, 8);
    expect(tempParaPressao('R-404A', 60, 'psi', 'dew')).toBeCloseTo(416.4 - 14.695948776, 8);
    expect(calcularSubresfriamento('R-404A', 418.5 - 14.695948776, 'psi', 54).delta).toBeCloseTo(6, 8);
    expect(calcularSuperaquecimento('R-404A', 416.4 - 14.695948776, 'psi', 66).delta).toBeCloseTo(6, 8);
  });
  it('preserva vácuo válido e rejeita leituras sem dados ou fisicamente impossíveis', () => {
    expect(pressaoParaTempSat('R-134a', 7.4 - 14.695948776, 'psi', 'unica')).toBe(-40);
    expect(calcularSuperaquecimento('R-134a', 7.4 - 14.695948776, 'psi', -35).delta).toBe(5);
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(pressaoParaTempSat('R-22', invalid, 'bar', 'unica')).toBeNull();
      expect(tempParaPressao('R-22', invalid, 'bar', 'unica')).toBeNull();
      expect(calcularSuperaquecimento('R-22', 4.83, 'bar', invalid).delta).toBeNull();
      expect(calcularSubresfriamento('R-22', 4.83, 'bar', invalid).delta).toBeNull();
      expect(classificarFaixa(invalid, { min: 4, max: 8 })).toBeNull();
    }
    expect(calcularSuperaquecimento('R-22', 4.83, 'bar', -300).delta).toBeNull();
    expect(calcularSubresfriamento('R-22', 4.83, 'bar', -300).delta).toBeNull();
    expect(pressaoParaTempSat('inexistente', 5, 'bar', 'unica')).toBeNull();
    expect(sugerirOutraUnidade('R-410A', 120, 'bar', 'unica')?.unidadeSugerida).toBe('psi');
  });
});
