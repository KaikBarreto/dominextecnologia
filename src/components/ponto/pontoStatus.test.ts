// Régua de tela do ponto público: qual status mostrar a partir da LISTA de
// ações permitidas que a edge devolve (`allowed_actions`).
//
// O que estes testes travam é o chamado da Imperium: depois da 1ª jornada
// fechar, a tela precisa oferecer uma ENTRADA NOVA — e ao mesmo tempo não pode
// confundir "jornada encerrada" com "dia não começou", já que as duas situações
// têm `clock_in` como próxima ação.
//
// Espelho de `public.allowed_punch_actions` (migration
// 20260930150000_ponto_multiplas_jornadas.sql) e de `allowedActionsFrom`
// (supabase/functions/_shared/ponto-kiosk.ts).

import { describe, expect, it } from 'vitest';
import { deriveStatus } from './PontoScreen';
import type { PontoTodayRecord, PunchType } from '@/hooks/usePontoPublico';

const rec = (type: PunchType, recorded_at = '2026-09-30T11:00:00Z'): PontoTodayRecord => ({
  type,
  recorded_at,
});

describe('deriveStatus', () => {
  it('dia sem batida nenhuma: nao comecou', () => {
    expect(deriveStatus(['clock_in'], [])).toBe('not_started');
  });

  it('jornada aberta (Intervalo | Saida): trabalhando', () => {
    expect(deriveStatus(['break_start', 'clock_out'], [rec('clock_in')])).toBe('working');
  });

  it('dentro do intervalo: em intervalo', () => {
    expect(
      deriveStatus(['break_end'], [rec('clock_in'), rec('break_start')]),
    ).toBe('on_break');
  });

  it('de volta do intervalo (Intervalo | Saida): trabalhando', () => {
    expect(
      deriveStatus(
        ['break_start', 'clock_out'],
        [rec('clock_in'), rec('break_start'), rec('break_end')],
      ),
    ).toBe('working');
  });

  it('jornada encerrada com batidas no dia: concluida, NAO "nao comecou"', () => {
    // Este é o caso que a assinatura antiga (next_action singular) errava:
    // `clock_in` disponível + dia com batidas virava `not_started`, e a tela
    // dizia "Você ainda não bateu o ponto hoje" depois de um dia inteiro.
    expect(
      deriveStatus(
        ['clock_in'],
        [rec('clock_in'), rec('break_start'), rec('break_end'), rec('clock_out')],
      ),
    ).toBe('finished');
  });

  it('2a jornada aberta no mesmo dia: volta a trabalhando', () => {
    expect(
      deriveStatus(
        ['break_start', 'clock_out'],
        [rec('clock_in'), rec('clock_out'), rec('clock_in')],
      ),
    ).toBe('working');
  });

  it('lista vazia: fail-safe em concluida (nao deve acontecer na pratica)', () => {
    expect(deriveStatus([], [rec('clock_in')])).toBe('finished');
    expect(deriveStatus([], [])).toBe('finished');
  });
});
