import { describe, it, expect, afterEach, vi } from 'vitest';
import { getDateRangeFromPreset } from './DateRangeFilter';

/**
 * O corte de período tem que respeitar o fuso do Brasil (America/Sao_Paulo),
 * não o fuso do dispositivo/servidor rodando o app. Caso real: dispositivo em
 * UTC (ou usuário viajando) às 21h30 de 31/01 no horário de Brasília — nesse
 * instante já é 01/02 em UTC. Se o preset "Este mês" usasse `new Date()` cru,
 * resolveria pra fevereiro e o relatório mostraria o mês errado sem aviso.
 * Ver src/lib/today-brazil.ts para a peça que resolve isso.
 */
describe('getDateRangeFromPreset — âncora no fuso do Brasil', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('"este mês" às 21h30 de 31/01 em Brasília continua em janeiro, mesmo com o instante já em 01/02 UTC', () => {
    // 31/01/2026 21:30 em Brasília (UTC-3) = 01/02/2026 00:30 em UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:30:00.000Z'));

    const { from, to } = getDateRangeFromPreset('this_month');

    expect(from?.getMonth()).toBe(0); // janeiro (0-indexed)
    expect(from?.getFullYear()).toBe(2026);
    expect(to?.getMonth()).toBe(0);
  });

  it('"mês passado" na mesma virada de fuso resolve pra dezembro/2025, não janeiro/2026', () => {
    // 31/01/2026 21:30 em Brasília = 01/02/2026 00:30 em UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:30:00.000Z'));

    const { from, to } = getDateRangeFromPreset('last_month');

    expect(from?.getFullYear()).toBe(2025);
    expect(from?.getMonth()).toBe(11); // dezembro
    expect(to?.getMonth()).toBe(11);
  });

  it('"hoje" acompanha o dia de Brasília, não o dia UTC', () => {
    // 15/03/2026 23:00 UTC = 15/03/2026 20:00 em Brasília (mesmo dia).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T23:00:00.000Z'));

    const { from, to } = getDateRangeFromPreset('today');

    expect(from?.getDate()).toBe(15);
    expect(to?.getDate()).toBe(15);
  });
});
