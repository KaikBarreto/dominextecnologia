import { describe, expect, it } from 'vitest';
import { nfseFiscalToday } from './nfseDates';

describe('nfseFiscalToday', () => {
  it('não antecipa a competência na virada do dia UTC', () => {
    expect(nfseFiscalToday('2026-11-11T00:30:00.000Z')).toBe('2026-11-10');
  });

  it('vira o dia quando o relógio fiscal de Brasília chega à meia-noite', () => {
    expect(nfseFiscalToday('2026-11-11T03:00:00.000Z')).toBe('2026-11-11');
  });
});
