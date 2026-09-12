import { describe, it, expect, afterEach, vi } from 'vitest';
import { todayInBrazil } from './today-brazil';

/**
 * O bug que este helper mata: `toISOString().split('T')[0]` devolve a data em
 * UTC. No Brasil (UTC-3) qualquer ação a partir das 21h locais grava a data de
 * amanhã — a movimentação pula pro mês seguinte.
 */
describe('todayInBrazil', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('devolve YYYY-MM-DD', () => {
    expect(todayInBrazil()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('às 21h de Brasília ainda é HOJE (o UTC cru já viraria amanhã)', () => {
    // 31/01/2026 21:30 em Brasília = 01/02/2026 00:30 em UTC.
    const instant = new Date('2026-02-01T00:30:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(instant);

    expect(instant.toISOString().split('T')[0]).toBe('2026-02-01'); // o jeito errado
    expect(todayInBrazil()).toBe('2026-01-31'); // o jeito certo
  });

  it('vira o dia só depois da meia-noite de Brasília', () => {
    // 01/02/2026 00:05 em Brasília = 01/02/2026 03:05 em UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T03:05:00.000Z'));
    expect(todayInBrazil()).toBe('2026-02-01');
  });

  it('não é afetado pelo fuso da máquina (ancora em America/Sao_Paulo)', () => {
    // 15/03/2026 23:00 UTC = 15/03/2026 20:00 em Brasília.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T23:00:00.000Z'));
    expect(todayInBrazil()).toBe('2026-03-15');
  });

  it('meio do dia no Brasil bate com a data UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T15:00:00.000Z')); // 12h em Brasília
    expect(todayInBrazil()).toBe('2026-07-10');
  });
});
