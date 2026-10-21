import { describe, it, expect } from 'vitest';
import { buildHourRange, DEFAULT_FIRST_HOUR, DEFAULT_LAST_HOUR } from './scheduleHours';

describe('buildHourRange', () => {
  it('mantém 07:00–20:00 quando não há nada fora da janela', () => {
    const hours = buildHourRange([
      { scheduled_time: '08:00:00', duration_minutes: 60 },
      { scheduled_time: '13:05:00', duration_minutes: 120 },
    ]);
    expect(hours[0]).toBe(DEFAULT_FIRST_HOUR);
    expect(hours[hours.length - 1]).toBe(DEFAULT_LAST_HOUR);
  });

  it('estica pra cima: OS às 06:00 não pode cair acima da grade', () => {
    const hours = buildHourRange([{ scheduled_time: '06:00:00', duration_minutes: 60 }]);
    expect(hours[0]).toBe(6);
  });

  it('estica pra baixo: OS às 22:00 não pode cair abaixo da grade', () => {
    const hours = buildHourRange([{ scheduled_time: '22:00:00', duration_minutes: 60 }]);
    expect(hours[hours.length - 1]).toBe(22);
  });

  it('considera a duração: 20:00 + 2h precisa de linha até as 21h', () => {
    const hours = buildHourRange([{ scheduled_time: '20:00:00', duration_minutes: 120 }]);
    expect(hours[hours.length - 1]).toBe(21);
  });

  it('OS que termina na hora cheia não cria linha extra', () => {
    const hours = buildHourRange([{ scheduled_time: '09:00:00', duration_minutes: 60 }]);
    expect(hours[hours.length - 1]).toBe(DEFAULT_LAST_HOUR);
  });

  it('nunca estoura 00h–23h nem quebra com hora inválida ou lista vazia', () => {
    expect(buildHourRange([{ scheduled_time: '23:30:00', duration_minutes: 600 }]).at(-1)).toBe(23);
    expect(buildHourRange([{ scheduled_time: null }, { scheduled_time: 'abc' }])).toEqual(
      buildHourRange([]),
    );
    expect(buildHourRange([])).toHaveLength(DEFAULT_LAST_HOUR - DEFAULT_FIRST_HOUR + 1);
  });

  it('sem duration_minutes assume 120 min', () => {
    const hours = buildHourRange([{ scheduled_time: '21:00:00' }]);
    expect(hours.at(-1)).toBe(22);
  });
});
