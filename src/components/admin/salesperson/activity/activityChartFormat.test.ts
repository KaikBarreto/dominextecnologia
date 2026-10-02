import { describe, expect, it } from 'vitest';
import { axisTickInterval, formatShortDateBR, shouldRotateAxisLabels } from './activityChartFormat';

describe('formatShortDateBR', () => {
  it('formata yyyy-MM-dd em dd/MM', () => {
    expect(formatShortDateBR('2026-09-28')).toBe('28/09');
    expect(formatShortDateBR('2026-01-05')).toBe('05/01');
  });

  it('chave inválida devolve a própria chave em vez de quebrar', () => {
    expect(formatShortDateBR('lixo')).toBe('lixo');
    expect(formatShortDateBR('')).toBe('');
  });
});

describe('axisTickInterval', () => {
  it('intervalo curto mostra todos os labels (interval 0)', () => {
    expect(axisTickInterval(5)).toBe(0);
    expect(axisTickInterval(15)).toBe(0);
  });

  it('intervalo longo pula labels pra nunca passar de ~15 visíveis', () => {
    // 30 pontos / 15 = 2 -> interval 1 (mostra 1 a cada 2) = 15 labels.
    expect(axisTickInterval(30)).toBe(1);
    // 250 pontos (~1 ano útil) -> interval 16 (mostra 1 a cada 17) ~= 15 labels.
    expect(axisTickInterval(250)).toBe(16);
  });
});

describe('shouldRotateAxisLabels', () => {
  it('não rotaciona intervalo curto', () => {
    expect(shouldRotateAxisLabels(5)).toBe(false);
    expect(shouldRotateAxisLabels(10)).toBe(false);
  });

  it('rotaciona a partir de 11 pontos', () => {
    expect(shouldRotateAxisLabels(11)).toBe(true);
    expect(shouldRotateAxisLabels(60)).toBe(true);
  });
});
