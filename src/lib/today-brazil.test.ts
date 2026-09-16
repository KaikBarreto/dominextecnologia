import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { todayInBrazil, isPaidDateAllowed } from './today-brazil';

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

/**
 * O bug que este helper mata: o print do sócio mostrava "Já foi pago" ligado
 * com data de pagamento no FUTURO (16/10/2026) — e esse pagamento futuro já
 * entrava como realizado no DRE em Regime de Caixa, num período que ainda não
 * aconteceu. "Já foi pago" é sempre passado, por definição.
 */
describe('isPaidDateAllowed', () => {
  beforeEach(() => {
    // Ancora "hoje" em 16/09/2026 meio-dia em Brasília.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T15:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hoje passa', () => {
    expect(isPaidDateAllowed('2026-09-16')).toBe(true);
  });

  it('ontem passa', () => {
    expect(isPaidDateAllowed('2026-09-15')).toBe(true);
  });

  it('amanhã não passa', () => {
    expect(isPaidDateAllowed('2026-09-17')).toBe(false);
  });

  it('data vazia passa (campo opcional, só é validado quando is_paid está ligado)', () => {
    expect(isPaidDateAllowed('')).toBe(true);
    expect(isPaidDateAllowed(null)).toBe(true);
    expect(isPaidDateAllowed(undefined)).toBe(true);
  });

  it('dado legado: data futura IGUAL à já gravada passa — editar um lançamento antigo não pode travar num erro que o usuário não criou', () => {
    expect(isPaidDateAllowed('2026-09-17', '2026-09-17')).toBe(true);
  });

  it('mudar para OUTRA data futura continua barrado, mesmo com dado legado futuro', () => {
    expect(isPaidDateAllowed('2026-09-20', '2026-09-17')).toBe(false);
  });

  it('corrigir o dado legado para hoje (ou antes) sempre passa', () => {
    expect(isPaidDateAllowed('2026-09-16', '2026-09-17')).toBe(true);
  });
});
