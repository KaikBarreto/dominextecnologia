// O campo de data guarda `yyyy-MM-dd` e o calendário trabalha com `Date`. A
// conversão entre os dois é onde mora a armadilha: `new Date('2026-09-19')` é
// lido como meia-noite UTC e, no fuso do Brasil (UTC-3), volta como dia 18 —
// a data escolhida pelo usuário mudaria sozinha.
import { describe, it, expect } from 'vitest';
import { parseIsoDate, toIsoDate } from './DatePicker';

describe('parseIsoDate', () => {
  it('mantém o dia escolhido, sem deslocar pelo fuso', () => {
    const d = parseIsoDate('2026-09-19')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // setembro
    expect(d.getDate()).toBe(19);
  });

  it('primeiro dia do mês não volta pro mês anterior', () => {
    const d = parseIsoDate('2026-01-01')!;
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
    expect(d.getFullYear()).toBe(2026);
  });

  it('devolve undefined pra valor vazio ou fora do formato', () => {
    expect(parseIsoDate('')).toBeUndefined();
    expect(parseIsoDate('19/09/2026')).toBeUndefined();
    expect(parseIsoDate('2026-9-1')).toBeUndefined();
    expect(parseIsoDate(undefined as any)).toBeUndefined();
  });
});

describe('toIsoDate', () => {
  it('escreve a data local, não a UTC', () => {
    expect(toIsoDate(new Date(2026, 8, 19))).toBe('2026-09-19');
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toIsoDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('ida e volta preserva o dia', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2026-09-19', '2026-12-31']) {
      expect(toIsoDate(parseIsoDate(iso)!)).toBe(iso);
    }
  });
});
