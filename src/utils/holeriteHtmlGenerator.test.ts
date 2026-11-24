import { describe, expect, it } from 'vitest';
import { buildHoleriteData, generateHoleriteHtml, type HoleriteSnapshot } from './holeriteHtmlGenerator';

const baseSnapshot: HoleriteSnapshot = {
  mode: 'clt', competencia: '11/2026',
  proventos: { salary: 3000, adicional: 0, bonus: 0 },
  descontos: { inss: 253.41, irrf: 0, vt: 0, faltas: 0, vales: 100 },
  bases: { inss: 3000, irrf: 2746.59, fgts: 3000, fgtsValor: 240 },
  liquido: 2646.59,
};
const identity = { company: { name: 'Empresa Teste' }, employeeName: 'Luciana' };

describe('payslip variable items', () => {
  it('renders overtime and weekly rest separately and totals every line', () => {
    const data = buildHoleriteData({
      ...baseSnapshot,
      proventosExtras: [
        { label: 'Horas extras 50%', valor: 300, incideEncargos: true },
        { label: 'DSR sobre horas extras', valor: 60, incideEncargos: true },
      ],
      descontosExtras: [{ label: 'Empréstimo', valor: 40 }],
      liquido: 2966.59,
    }, identity);

    expect(data.proventos.map((item) => item.label)).toEqual([
      'SALÁRIO BASE', 'HORAS EXTRAS 50%', 'DSR SOBRE HORAS EXTRAS',
    ]);
    expect(data.descontos.map((item) => item.label)).toContain('EMPRÉSTIMO');
    expect(data.totalProventos).toBe(3360);
    expect(data.totalDescontos).toBe(393.41);
    const html = generateHoleriteHtml(data);
    expect(html).toContain('HORAS EXTRAS 50%');
    expect(html).toContain('DSR SOBRE HORAS EXTRAS');
  });

  it('ignores empty or zero-value items', () => {
    const data = buildHoleriteData({
      ...baseSnapshot,
      proventosExtras: [{ label: '', valor: 50 }, { label: 'Comissão', valor: 0 }],
      descontosExtras: [{ label: '', valor: 10 }],
    }, identity);
    expect(data.proventos).toHaveLength(1);
    expect(data.descontos.every((item) => item.label !== '')).toBe(true);
    expect(data.totalProventos).toBe(3000);
  });

  it('remains compatible with old snapshots without variable-item arrays', () => {
    const data = buildHoleriteData(baseSnapshot, identity);
    expect(data.totalProventos).toBe(3000);
    expect(data.totalDescontos).toBe(353.41);
    expect(() => generateHoleriteHtml(data)).not.toThrow();
  });
});
