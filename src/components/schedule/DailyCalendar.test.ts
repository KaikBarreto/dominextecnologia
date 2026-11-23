import { describe, expect, it } from 'vitest';
import { shouldUseCompactDailyEventCard } from './dailyCalendarDensity';

describe('shouldUseCompactDailyEventCard', () => {
  it('preserva o card completo quando ha espaco', () => {
    expect(shouldUseCompactDailyEventCard(1, 112, false)).toBe(false);
    expect(shouldUseCompactDailyEventCard(2, 112, false)).toBe(false);
  });

  it('compacta duracoes curtas e horarios cheios no desktop', () => {
    expect(shouldUseCompactDailyEventCard(1, 56, false)).toBe(true);
    expect(shouldUseCompactDailyEventCard(3, 112, false)).toBe(true);
  });

  it('compacta dois eventos simultaneos no espaco estreito do celular', () => {
    expect(shouldUseCompactDailyEventCard(2, 112, true)).toBe(true);
  });
});
