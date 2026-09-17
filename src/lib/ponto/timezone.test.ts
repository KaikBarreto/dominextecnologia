import { describe, it, expect } from 'vitest';

import {
  DEFAULT_TIME_ZONE,
  dateInTz,
  safeTimeZone,
  timeInTz,
  todayInTz,
  zonedDateTimeToUtc,
} from './timezone';

// ──────────────────────────────────────────────────────────────────────────
// Fuso do ponto eletrônico
//
// O que estes testes protegem: a conversão do relógio da empresa pro instante
// UTC. É o único ponto da série com deslocamento variável, o tipo de código que
// passa na leitura e erra na virada do dia ou do horário de verão. O resultado
// vai pro espelho de ponto, que é documento de jornada.
// ──────────────────────────────────────────────────────────────────────────

describe('zonedDateTimeToUtc', () => {
  it('converte a hora do relógio da empresa no instante UTC (Sao Paulo, UTC-3)', () => {
    expect(zonedDateTimeToUtc('2026-09-17', '08:00', 'America/Sao_Paulo')).toBe('2026-09-17T11:00:00.000Z');
  });

  it('respeita fuso de UTC-4 (Cuiaba)', () => {
    expect(zonedDateTimeToUtc('2026-09-17', '08:00', 'America/Cuiaba')).toBe('2026-09-17T12:00:00.000Z');
  });

  it('respeita fuso de UTC-5 (Rio Branco)', () => {
    expect(zonedDateTimeToUtc('2026-09-17', '08:00', 'America/Rio_Branco')).toBe('2026-09-17T13:00:00.000Z');
  });

  it('respeita fuso positivo (Lisboa, verão europeu = UTC+1)', () => {
    expect(zonedDateTimeToUtc('2026-09-17', '08:00', 'Europe/Lisbon')).toBe('2026-09-17T07:00:00.000Z');
  });

  // Borda do dia: é aqui que o bug antigo aparecia, porque o dia UTC já tinha
  // virado enquanto no Brasil ainda era o dia anterior.
  it('00:00 e 23:59 em Sao Paulo caem no dia certo', () => {
    expect(zonedDateTimeToUtc('2026-09-17', '00:00', 'America/Sao_Paulo')).toBe('2026-09-17T03:00:00.000Z');
    expect(zonedDateTimeToUtc('2026-09-17', '23:59', 'America/Sao_Paulo')).toBe('2026-09-18T02:59:00.000Z');
  });

  it('00:00 e 23:59 em Cuiaba caem no dia certo', () => {
    expect(zonedDateTimeToUtc('2026-09-17', '00:00', 'America/Cuiaba')).toBe('2026-09-17T04:00:00.000Z');
    expect(zonedDateTimeToUtc('2026-09-17', '23:59', 'America/Cuiaba')).toBe('2026-09-18T03:59:00.000Z');
  });

  it('00:00 e 23:59 em Tóquio (UTC+9) caem no dia certo', () => {
    expect(zonedDateTimeToUtc('2026-09-17', '00:00', 'Asia/Tokyo')).toBe('2026-09-16T15:00:00.000Z');
    expect(zonedDateTimeToUtc('2026-09-17', '23:59', 'Asia/Tokyo')).toBe('2026-09-17T14:59:00.000Z');
  });

  it('aceita segundos na hora', () => {
    expect(zonedDateTimeToUtc('2026-09-17', '08:00:30', 'America/Sao_Paulo')).toBe('2026-09-17T11:00:30.000Z');
  });

  // ── Horário de verão: o deslocamento não pode ficar preso ────────────────
  describe('fuso com horário de verão (America/New_York)', () => {
    it('usa EST (UTC-5) no inverno', () => {
      expect(zonedDateTimeToUtc('2026-01-15', '08:00', 'America/New_York')).toBe('2026-01-15T13:00:00.000Z');
    });

    it('usa EDT (UTC-4) no verão', () => {
      expect(zonedDateTimeToUtc('2026-07-15', '08:00', 'America/New_York')).toBe('2026-07-15T12:00:00.000Z');
    });

    it('acerta a hora logo depois da virada de primavera, onde uma passada só erra', () => {
      // 08/03/2026, 02:00 EST vira 03:00 EDT. Às 03:30 o deslocamento já é -4.
      // O primeiro palpite cai no lado EST, e só a segunda passada corrige.
      expect(zonedDateTimeToUtc('2026-03-08', '03:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z');
    });

    it('acerta a hora logo antes da virada de primavera', () => {
      expect(zonedDateTimeToUtc('2026-03-08', '01:30', 'America/New_York')).toBe('2026-03-08T06:30:00.000Z');
    });

    it('acerta os dois lados da virada de outono', () => {
      // 01/11/2026: 02:00 EDT volta pra 01:00 EST.
      expect(zonedDateTimeToUtc('2026-11-01', '00:30', 'America/New_York')).toBe('2026-11-01T04:30:00.000Z');
      expect(zonedDateTimeToUtc('2026-11-01', '08:00', 'America/New_York')).toBe('2026-11-01T13:00:00.000Z');
    });

    it('não entra em laço infinito numa hora que não existe (a hora pulada)', () => {
      const iso = zonedDateTimeToUtc('2026-03-08', '02:30', 'America/New_York');
      expect(() => new Date(iso).toISOString()).not.toThrow();
      expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
    });
  });

  it('Europe/Paris muda de UTC+1 pra UTC+2 no verão', () => {
    expect(zonedDateTimeToUtc('2026-01-15', '08:00', 'Europe/Paris')).toBe('2026-01-15T07:00:00.000Z');
    expect(zonedDateTimeToUtc('2026-07-15', '08:00', 'Europe/Paris')).toBe('2026-07-15T06:00:00.000Z');
  });

  // ── Fuso ausente ou inválido nunca derruba a tela ────────────────────────
  it('cai em America/Sao_Paulo com fuso nulo, vazio ou inválido', () => {
    const esperado = '2026-09-17T11:00:00.000Z';
    expect(zonedDateTimeToUtc('2026-09-17', '08:00', null)).toBe(esperado);
    expect(zonedDateTimeToUtc('2026-09-17', '08:00', undefined)).toBe(esperado);
    expect(zonedDateTimeToUtc('2026-09-17', '08:00', '')).toBe(esperado);
    expect(zonedDateTimeToUtc('2026-09-17', '08:00', '   ')).toBe(esperado);
    expect(zonedDateTimeToUtc('2026-09-17', '08:00', 'Fuso/Inventado')).toBe(esperado);
    expect(zonedDateTimeToUtc('2026-09-17', '08:00', 'UTC-3')).toBe(esperado);
  });

  it('recusa data ou hora malformada', () => {
    expect(() => zonedDateTimeToUtc('17/09/2026', '08:00', 'America/Sao_Paulo')).toThrow();
    expect(() => zonedDateTimeToUtc('2026-09-17', '', 'America/Sao_Paulo')).toThrow();
    expect(() => zonedDateTimeToUtc('', '08:00', 'America/Sao_Paulo')).toThrow();
  });

  // O defeito real: o admin podia estar em qualquer fuso. O que vale é o fuso
  // da empresa.
  it('o instante gravado não depende do fuso de quem lançou', () => {
    // A função não lê o fuso do aparelho em lugar nenhum, então o mesmo dia e a
    // mesma hora da empresa sempre dão o mesmo instante.
    const paraEmpresaEmSP = zonedDateTimeToUtc('2026-09-17', '08:00', 'America/Sao_Paulo');
    expect(paraEmpresaEmSP).toBe('2026-09-17T11:00:00.000Z');
    // E o espelho relê esse instante como 08:00 no fuso da empresa.
    expect(timeInTz(paraEmpresaEmSP, 'America/Sao_Paulo')).toBe('08:00');
    expect(dateInTz(paraEmpresaEmSP, 'America/Sao_Paulo')).toBe('2026-09-17');
  });

  it('ida e volta fecha em vários fusos e horas', () => {
    const fusos = ['America/Sao_Paulo', 'America/Cuiaba', 'America/New_York', 'Europe/Lisbon', 'Asia/Tokyo'];
    const dias = ['2026-01-15', '2026-03-08', '2026-07-15', '2026-11-01'];
    const horas = ['00:00', '06:15', '12:00', '18:45', '23:59'];
    for (const tz of fusos) {
      for (const dia of dias) {
        for (const hora of horas) {
          // Pula a hora que não existe na virada de primavera de Nova York.
          if (tz === 'America/New_York' && dia === '2026-03-08' && hora === '00:00') continue;
          const iso = zonedDateTimeToUtc(dia, hora, tz);
          expect(`${dateInTz(iso, tz)} ${timeInTz(iso, tz)}`).toBe(`${dia} ${hora}`);
        }
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Regressão das funções já em produção
// ──────────────────────────────────────────────────────────────────────────

describe('dateInTz', () => {
  it('devolve o dia no formato ISO YYYY-MM-DD', () => {
    expect(dateInTz('2026-09-17T11:00:00.000Z', 'America/Sao_Paulo')).toBe('2026-09-17');
  });

  it('usa o dia do fuso da empresa, não o dia UTC', () => {
    // 22:00 em Brasília do dia 17 já é dia 18 em UTC.
    const instante = '2026-09-18T01:00:00.000Z';
    expect(dateInTz(instante, 'America/Sao_Paulo')).toBe('2026-09-17');
    expect(dateInTz(instante, 'Asia/Tokyo')).toBe('2026-09-18');
    expect(dateInTz(instante, 'America/Cuiaba')).toBe('2026-09-17');
  });

  it('aceita Date, string e número', () => {
    const ms = Date.parse('2026-09-17T11:00:00.000Z');
    expect(dateInTz(new Date(ms), 'America/Sao_Paulo')).toBe('2026-09-17');
    expect(dateInTz('2026-09-17T11:00:00.000Z', 'America/Sao_Paulo')).toBe('2026-09-17');
    expect(dateInTz(ms, 'America/Sao_Paulo')).toBe('2026-09-17');
  });

  it('cai no padrão com fuso nulo, vazio ou inválido', () => {
    const instante = '2026-09-18T01:00:00.000Z';
    expect(dateInTz(instante, null)).toBe('2026-09-17');
    expect(dateInTz(instante, '')).toBe('2026-09-17');
    expect(dateInTz(instante, 'Nao/Existe')).toBe('2026-09-17');
  });

  it('recusa data inválida', () => {
    expect(() => dateInTz('não é data', 'America/Sao_Paulo')).toThrow();
  });
});

describe('todayInTz', () => {
  it('devolve hoje no fuso pedido, no formato ISO', () => {
    const hoje = todayInTz('America/Sao_Paulo');
    expect(hoje).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hoje).toBe(dateInTz(new Date(), 'America/Sao_Paulo'));
  });

  it('não lança com fuso inválido', () => {
    expect(() => todayInTz('Fuso/Inventado')).not.toThrow();
    expect(todayInTz('Fuso/Inventado')).toBe(todayInTz(DEFAULT_TIME_ZONE));
  });
});

describe('timeInTz', () => {
  it('devolve HH:mm em 24 horas', () => {
    expect(timeInTz('2026-09-17T11:00:00.000Z', 'America/Sao_Paulo')).toBe('08:00');
    expect(timeInTz('2026-09-17T22:30:00.000Z', 'America/Sao_Paulo')).toBe('19:30');
  });

  it('meia-noite sai como 00:00, nunca 24:00', () => {
    expect(timeInTz('2026-09-17T03:00:00.000Z', 'America/Sao_Paulo')).toBe('00:00');
  });

  it('muda com o fuso', () => {
    const instante = '2026-09-17T11:00:00.000Z';
    expect(timeInTz(instante, 'America/Cuiaba')).toBe('07:00');
    expect(timeInTz(instante, 'Asia/Tokyo')).toBe('20:00');
  });

  it('cai no padrão com fuso inválido', () => {
    expect(timeInTz('2026-09-17T11:00:00.000Z', 'Nao/Existe')).toBe('08:00');
  });
});

describe('safeTimeZone', () => {
  it('devolve o fuso quando é um nome IANA válido', () => {
    expect(safeTimeZone('America/Cuiaba')).toBe('America/Cuiaba');
    expect(safeTimeZone('  America/New_York  ')).toBe('America/New_York');
  });

  it('cai no padrão quando é nulo, vazio ou inválido', () => {
    expect(safeTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
    expect(safeTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
    expect(safeTimeZone('')).toBe(DEFAULT_TIME_ZONE);
    expect(safeTimeZone('UTC-3')).toBe(DEFAULT_TIME_ZONE);
    expect(safeTimeZone('Fuso/Inventado')).toBe(DEFAULT_TIME_ZONE);
  });
});
