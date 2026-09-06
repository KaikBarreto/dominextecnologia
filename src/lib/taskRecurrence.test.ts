import { describe, it, expect } from 'vitest';
import {
  generateRecurrenceDates,
  findRecurrenceIssue,
  UnsupportedRecurrenceError,
} from './taskRecurrence';

/**
 * Prova de execução do motor de recorrência (OS e tarefas).
 *
 * O caso 'yearly' existe por causa de um bug real: a cópia da conta que vivia
 * dentro do ServiceOrderFormDialog tinha um `else break` que engolia "Anual" e
 * criava UMA OS só, sem aviso nenhum.
 */
describe('generateRecurrenceDates', () => {
  it('anual gera uma ocorrência por ano até a data final (inclusive)', () => {
    expect(
      generateRecurrenceDates('2026-03-10', {
        recurrence_type: 'yearly',
        recurrence_interval: 1,
        recurrence_end_date: '2030-03-10',
      }),
    ).toEqual(['2026-03-10', '2027-03-10', '2028-03-10', '2029-03-10', '2030-03-10']);
  });

  it('anual a cada 2 anos respeita o intervalo', () => {
    expect(
      generateRecurrenceDates('2026-01-31', {
        recurrence_type: 'yearly',
        recurrence_interval: 2,
        recurrence_end_date: '2032-12-31',
      }),
    ).toEqual(['2026-01-31', '2028-01-31', '2030-01-31', '2032-01-31']);
  });

  it('mensal gera mês a mês', () => {
    expect(
      generateRecurrenceDates('2026-03-15', {
        recurrence_type: 'monthly',
        recurrence_interval: 1,
        recurrence_end_date: '2026-07-15',
      }),
    ).toEqual(['2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15']);
  });

  // Fim de mês: o passo é ancorado na DATA INICIAL, não na ocorrência anterior.
  // Antes era cumulativo e a série começada em 31 encurtava pra 28 em fevereiro
  // e ficava presa no dia 28 pra sempre (28/03, 28/04...).
  it('mensal iniciado em 31/01 volta pro fim de cada mês (sem escorregar)', () => {
    expect(
      generateRecurrenceDates('2026-01-31', {
        recurrence_type: 'monthly',
        recurrence_interval: 1,
        recurrence_end_date: '2026-05-31',
      }),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('mensal iniciado em 31/01 de ano bissexto passa por 29/02 e mantém a âncora', () => {
    expect(
      generateRecurrenceDates('2028-01-31', {
        recurrence_type: 'monthly',
        recurrence_interval: 1,
        recurrence_end_date: '2028-06-30',
      }),
    ).toEqual(['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30', '2028-05-31', '2028-06-30']);
  });

  it('mensal iniciado em 29/02 de ano bissexto encurta nos meses de 30 e volta ao 29', () => {
    // Mês com 30 dias (abril/junho) não tem dia 31, mas tem 29 — a âncora 29 é
    // preservada; só fevereiro não-bissexto encurta (28).
    expect(
      generateRecurrenceDates('2028-02-29', {
        recurrence_type: 'monthly',
        recurrence_interval: 1,
        recurrence_end_date: '2028-06-30',
      }),
    ).toEqual(['2028-02-29', '2028-03-29', '2028-04-29', '2028-05-29', '2028-06-29']);
  });

  it('mensal iniciado em 31 de mês com 31 dias encurta só onde o mês é menor', () => {
    // 31/03 → abril tem 30 → 30/04, e maio volta pro 31 (não fica preso no 30).
    expect(
      generateRecurrenceDates('2026-03-31', {
        recurrence_type: 'monthly',
        recurrence_interval: 1,
        recurrence_end_date: '2026-07-31',
      }),
    ).toEqual(['2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31']);
  });

  it('anual em 29/02 de ano bissexto reencontra o 29 no bissexto seguinte', () => {
    expect(
      generateRecurrenceDates('2024-02-29', {
        recurrence_type: 'yearly',
        recurrence_interval: 1,
        recurrence_end_date: '2028-12-31',
      }),
    ).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('personalizado gera nos dias da semana marcados', () => {
    // 2026-03-02 é uma segunda-feira. Marcados: segunda (1) e quarta (3).
    expect(
      generateRecurrenceDates('2026-03-02', {
        recurrence_type: 'custom',
        recurrence_interval: 1,
        recurrence_end_date: '2026-03-16',
        recurrence_weekdays: [1, 3],
      }),
    ).toEqual([
      '2026-03-02', '2026-03-04', '2026-03-09', '2026-03-11', '2026-03-16',
    ]);
  });

  it('semanal e quinzenal seguem o intervalo', () => {
    expect(
      generateRecurrenceDates('2026-03-02', {
        recurrence_type: 'weekly',
        recurrence_interval: 1,
        recurrence_end_date: '2026-03-30',
      }),
    ).toEqual(['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30']);

    expect(
      generateRecurrenceDates('2026-03-02', {
        recurrence_type: 'biweekly',
        recurrence_interval: 1,
        recurrence_end_date: '2026-03-30',
      }),
    ).toEqual(['2026-03-02', '2026-03-16', '2026-03-30']);
  });

  // ── Semanal com dias da semana marcados ────────────────────────────────
  // Antes, só 'custom' olhava os dias marcados: quem escolhia Semanal e marcava
  // segunda, quarta e sexta recebia 1 tarefa por semana. A tela oferecia a
  // escolha e o motor descartava.

  it('semanal com 3 dias marcados gera as 3 ocorrências por semana', () => {
    // 2026-03-02 é segunda. Marcados: segunda (1), quarta (3) e sexta (5).
    expect(
      generateRecurrenceDates('2026-03-02', {
        recurrence_type: 'weekly',
        recurrence_interval: 1,
        recurrence_end_date: '2026-03-20',
        recurrence_weekdays: [1, 3, 5],
      }),
    ).toEqual([
      '2026-03-02', '2026-03-04', '2026-03-06',
      '2026-03-09', '2026-03-11', '2026-03-13',
      '2026-03-16', '2026-03-18', '2026-03-20',
    ]);
  });

  it('semanal SEM nenhum dia marcado continua 1 por semana (comportamento antigo)', () => {
    const esperado = ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30'];
    expect(
      generateRecurrenceDates('2026-03-02', {
        recurrence_type: 'weekly',
        recurrence_interval: 1,
        recurrence_end_date: '2026-03-30',
        recurrence_weekdays: [],
      }),
    ).toEqual(esperado);
    // Campo ausente/nulo = mesma coisa (série antiga não muda de forma).
    expect(
      generateRecurrenceDates('2026-03-02', {
        recurrence_type: 'weekly',
        recurrence_interval: 1,
        recurrence_end_date: '2026-03-30',
      }),
    ).toEqual(esperado);
  });

  it('semanal com 1 dia marcado igual ao da data inicial = 1 por semana', () => {
    // É o caso da série já existente reaberta na edição (o seletor volta
    // marcando só o dia desta ocorrência): o resultado tem que ser idêntico.
    expect(
      generateRecurrenceDates('2026-03-02', {
        recurrence_type: 'weekly',
        recurrence_interval: 1,
        recurrence_end_date: '2026-03-30',
        recurrence_weekdays: [1],
      }),
    ).toEqual(['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30']);
  });

  it('semanal a cada 2 semanas com dias marcados pula a semana do meio', () => {
    // Início segunda 02/03. Marcados seg (1), qua (3), sex (5), a cada 2 semanas.
    // Semana de 01–07/03 conta; 08–14/03 é pulada; 15–21/03 conta; e assim vai.
    expect(
      generateRecurrenceDates('2026-03-02', {
        recurrence_type: 'weekly',
        recurrence_interval: 2,
        recurrence_end_date: '2026-04-10',
        recurrence_weekdays: [1, 3, 5],
      }),
    ).toEqual([
      '2026-03-02', '2026-03-04', '2026-03-06',
      '2026-03-16', '2026-03-18', '2026-03-20',
      '2026-03-30', '2026-04-01', '2026-04-03',
    ]);
  });

  it('semanal a cada 2 semanas começando no meio da semana conta a semana do calendário', () => {
    // Início quarta 04/03, marcados seg/qua/sex. A segunda 02/03 é passado e não
    // entra; qua 04 e sex 06 fecham a semana; 08–14/03 pulada; 15–21/03 volta
    // com as três (seg 16, qua 18, sex 20). Padrão iCal, semana do calendário.
    expect(
      generateRecurrenceDates('2026-03-04', {
        recurrence_type: 'weekly',
        recurrence_interval: 2,
        recurrence_end_date: '2026-03-31',
        recurrence_weekdays: [1, 3, 5],
      }),
    ).toEqual([
      '2026-03-04', '2026-03-06',
      '2026-03-16', '2026-03-18', '2026-03-20',
      '2026-03-30',
    ]);
  });

  it('semanal mantém a data inicial mesmo se o dia dela não estiver marcado', () => {
    // Início segunda 02/03 com só terça (2) e quinta (4) marcadas: quem escolheu
    // a data não pode vê-la sumir.
    expect(
      generateRecurrenceDates('2026-03-02', {
        recurrence_type: 'weekly',
        recurrence_interval: 1,
        recurrence_end_date: '2026-03-12',
        recurrence_weekdays: [2, 4],
      }),
    ).toEqual(['2026-03-02', '2026-03-03', '2026-03-05', '2026-03-10', '2026-03-12']);
  });

  it('frequência desconhecida estoura em vez de devolver uma data só', () => {
    expect(() =>
      generateRecurrenceDates('2026-03-02', {
        recurrence_type: 'quarterly',
        recurrence_end_date: '2026-12-31',
      }),
    ).toThrow(UnsupportedRecurrenceError);
  });
});

describe('findRecurrenceIssue', () => {
  it('sem recorrência não é problema', () => {
    expect(findRecurrenceIssue({})).toBeNull();
  });

  it('recorrência sem data final é bloqueada', () => {
    expect(findRecurrenceIssue({ recurrence_type: 'monthly' })).toEqual({ code: 'missing_end_date' });
  });

  it('personalizado sem nenhum dia da semana é bloqueado', () => {
    expect(
      findRecurrenceIssue({
        recurrence_type: 'custom',
        recurrence_end_date: '2026-12-31',
        recurrence_weekdays: [],
      }),
    ).toEqual({ code: 'custom_without_weekdays' });
  });

  it('frequência fora da lista suportada é bloqueada', () => {
    expect(
      findRecurrenceIssue({ recurrence_type: 'quarterly', recurrence_end_date: '2026-12-31' }),
    ).toEqual({ code: 'unsupported_type', type: 'quarterly' });
  });

  it('anual válida passa', () => {
    expect(
      findRecurrenceIssue({ recurrence_type: 'yearly', recurrence_end_date: '2030-01-01' }),
    ).toBeNull();
  });
});
