import { describe, it, expect } from 'vitest';
import { addDays, addMonths, format } from 'date-fns';
import {
  generateRecurrenceDates,
  findRecurrenceIssue,
  UnsupportedRecurrenceError,
  RECURRENCE_INDETERMINATE_HORIZON_MONTHS,
  RECURRENCE_INDETERMINATE_MAX_OCCURRENCES,
  weekdaysToPersist,
  resolveEditingWeekdays,
} from './taskRecurrence';

const anchor = (date: string) => new Date(`${date}T12:00:00`);

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

  // ── "Contínua" (recurrence_indeterminate) ──────────────────────────────
  // Sem data final escolhida pelo usuário: o motor materializa só até o
  // horizonte de segurança (12 meses OU 60 ocorrências, o que vier primeiro).
  // Um cron fora deste arquivo empurra a janela pra frente com o tempo.

  it('indeterminada no diário bate o teto de 60 ocorrências antes do teto de 12 meses', () => {
    const base = '2026-01-01';
    const result = generateRecurrenceDates(base, {
      recurrence_type: 'daily',
      recurrence_interval: 1,
      recurrence_indeterminate: true,
      // Presente mas IGNORADO quando indeterminada.
      recurrence_end_date: '2099-12-31',
    });

    expect(result).toHaveLength(RECURRENCE_INDETERMINATE_MAX_OCCURRENCES);
    expect(result[0]).toBe(base);

    const expectedLast = format(
      addDays(anchor(base), RECURRENCE_INDETERMINATE_MAX_OCCURRENCES - 1),
      'yyyy-MM-dd',
    );
    expect(result[result.length - 1]).toBe(expectedLast);

    // Prova de que quem bateu foi o teto de OCORRÊNCIAS, não o de tempo:
    // a última data gerada fica bem antes do horizonte de 12 meses.
    const horizon = format(addMonths(anchor(base), RECURRENCE_INDETERMINATE_HORIZON_MONTHS), 'yyyy-MM-dd');
    expect(result[result.length - 1] < horizon).toBe(true);
  });

  it('indeterminada no mensal bate o teto de 12 meses antes do teto de 60 ocorrências', () => {
    const base = '2026-01-15';
    const result = generateRecurrenceDates(base, {
      recurrence_type: 'monthly',
      recurrence_interval: 1,
      recurrence_indeterminate: true,
    });

    // Prova de que quem bateu foi o teto de TEMPO, não o de ocorrências:
    // 13 datas (base + 12 meses) é bem menos que as 60 permitidas.
    expect(result.length).toBeLessThan(RECURRENCE_INDETERMINATE_MAX_OCCURRENCES);
    expect(result).toHaveLength(RECURRENCE_INDETERMINATE_HORIZON_MONTHS + 1);
    expect(result[0]).toBe(base);

    const expectedLast = format(addMonths(anchor(base), RECURRENCE_INDETERMINATE_HORIZON_MONTHS), 'yyyy-MM-dd');
    expect(result[result.length - 1]).toBe(expectedLast);
  });

  it('indeterminada + personalizado com dias da semana respeita o teto de 60', () => {
    const base = '2026-03-01'; // domingo
    const result = generateRecurrenceDates(base, {
      recurrence_type: 'custom',
      recurrence_weekdays: [0, 3], // domingo e quarta
      recurrence_indeterminate: true,
    });

    expect(result).toHaveLength(RECURRENCE_INDETERMINATE_MAX_OCCURRENCES);
    expect(result[0]).toBe(base);

    // Todas as datas caem em domingo (0) ou quarta (3), em ordem crescente
    // e sem repetição.
    for (let i = 0; i < result.length; i++) {
      const dow = anchor(result[i]).getDay();
      expect([0, 3]).toContain(dow);
      if (i > 0) expect(result[i] > result[i - 1]).toBe(true);
    }
  });

  it('recurrence_indeterminate false ou ausente não muda em nada o resultado com data final', () => {
    const spec = {
      recurrence_type: 'monthly',
      recurrence_interval: 1,
      recurrence_end_date: '2026-07-15',
    };
    const expected = ['2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15'];

    expect(generateRecurrenceDates('2026-03-15', spec)).toEqual(expected);
    expect(generateRecurrenceDates('2026-03-15', { ...spec, recurrence_indeterminate: false })).toEqual(expected);
    expect(generateRecurrenceDates('2026-03-15', { ...spec, recurrence_indeterminate: null })).toEqual(expected);
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

  it('indeterminada ("Contínua") dispensa a data final', () => {
    expect(
      findRecurrenceIssue({ recurrence_type: 'monthly', recurrence_indeterminate: true }),
    ).toBeNull();
  });

  it('indeterminada personalizada ainda exige pelo menos um dia da semana', () => {
    expect(
      findRecurrenceIssue({
        recurrence_type: 'custom',
        recurrence_indeterminate: true,
        recurrence_weekdays: [],
      }),
    ).toEqual({ code: 'custom_without_weekdays' });
  });

  it('indeterminada com frequência não suportada continua bloqueada', () => {
    expect(
      findRecurrenceIssue({ recurrence_type: 'quarterly', recurrence_indeterminate: true }),
    ).toEqual({ code: 'unsupported_type', type: 'quarterly' });
  });
});

/**
 * Prova do bug corrigido: `service_orders.recurrence_weekdays` nunca era
 * gravado no payload de insert/update (só era usado na hora de calcular as
 * datas e jogado fora). `weekdaysToPersist` é a fonte única do valor que vai
 * pro banco — testada isoladamente porque `submitTask`/`handleCreateSubmit`
 * dependem de Supabase/React Query real. Compartilhada entre tarefa
 * (useTaskSubmit) e OS (ServiceOrderFormDialog).
 */
describe('weekdaysToPersist', () => {
  it('grava os dias marcados quando a frequência é personalizada', () => {
    expect(
      weekdaysToPersist({ recurrence_type: 'custom', recurrence_weekdays: [1, 3, 5] }),
    ).toEqual([1, 3, 5]);
  });

  it('grava os dias marcados quando a frequência é semanal', () => {
    expect(
      weekdaysToPersist({ recurrence_type: 'weekly', recurrence_weekdays: [0, 6] }),
    ).toEqual([0, 6]);
  });

  it('grava null (nunca []) quando a frequência usa dias mas nenhum foi marcado', () => {
    expect(weekdaysToPersist({ recurrence_type: 'weekly', recurrence_weekdays: [] })).toBeNull();
    expect(weekdaysToPersist({ recurrence_type: 'weekly', recurrence_weekdays: undefined })).toBeNull();
  });

  it('grava null quando a frequência não usa dia da semana (não se aplica)', () => {
    expect(weekdaysToPersist({ recurrence_type: 'daily', recurrence_weekdays: [1, 2] })).toBeNull();
    expect(weekdaysToPersist({ recurrence_type: 'biweekly', recurrence_weekdays: [1] })).toBeNull();
    expect(weekdaysToPersist({ recurrence_type: 'monthly', recurrence_weekdays: [1] })).toBeNull();
    expect(weekdaysToPersist({ recurrence_type: 'yearly', recurrence_weekdays: [1] })).toBeNull();
  });

  it('grava null quando não há recorrência nenhuma', () => {
    expect(weekdaysToPersist({ recurrence_type: undefined, recurrence_weekdays: [1] })).toBeNull();
  });
});

/**
 * Prova do bug corrigido: quem editava uma série "Personalizada" (tarefa OU
 * OS) abria o formulário com o estado de dias remontado a partir de UM dia
 * chutado da data agendada (`new Date(...).getDay()`), em vez dos dias
 * realmente gravados na série. Salvar "esta e as futuras" sem tocar no
 * seletor colapsava a série inteira pro dia chutado — destrutivo e silencioso.
 *
 * Este é exatamente o cenário medido em produção: séries `custom` reais
 * (100 linhas em {segunda, sábado} + 14 linhas em {quarta}) só sobreviveram
 * porque nunca foram reabertas para edição com este bug ativo.
 */
describe('resolveEditingWeekdays', () => {
  it('sem série (não é edição de recorrência), volta vazio e não é caso legado', () => {
    expect(resolveEditingWeekdays(null)).toEqual({ weekdays: [], legacyCustomWithoutWeekdays: false });
    expect(resolveEditingWeekdays({ recurrence_group_id: null })).toEqual({
      weekdays: [],
      legacyCustomWithoutWeekdays: false,
    });
  });

  it('remonta os dias gravados de uma série personalizada com 2+ dias (cenário destrutivo)', () => {
    // Grupo de 100 OS reais em produção: segunda (1) e sábado (6).
    expect(
      resolveEditingWeekdays({
        recurrence_group_id: 'grupo-1',
        recurrence_type: 'custom',
        recurrence_weekdays: [1, 6],
      }),
    ).toEqual({ weekdays: [1, 6], legacyCustomWithoutWeekdays: false });
  });

  it('remonta os dias gravados de uma série semanal', () => {
    expect(
      resolveEditingWeekdays({
        recurrence_group_id: 'grupo-2',
        recurrence_type: 'weekly',
        recurrence_weekdays: [0, 6],
      }),
    ).toEqual({ weekdays: [0, 6], legacyCustomWithoutWeekdays: false });
  });

  it('série legada personalizada sem dias gravados (null) abre vazia e é sinalizada como legada', () => {
    expect(
      resolveEditingWeekdays({
        recurrence_group_id: 'grupo-3',
        recurrence_type: 'custom',
        recurrence_weekdays: null,
      }),
    ).toEqual({ weekdays: [], legacyCustomWithoutWeekdays: true });
  });

  it('série legada personalizada sem dias gravados (campo ausente) abre vazia e é sinalizada como legada', () => {
    expect(
      resolveEditingWeekdays({ recurrence_group_id: 'grupo-4', recurrence_type: 'custom' }),
    ).toEqual({ weekdays: [], legacyCustomWithoutWeekdays: true });
  });

  it('série semanal sem dias gravados abre vazia mas NÃO é sinalizada como legada (vazio é válido pra semanal)', () => {
    expect(
      resolveEditingWeekdays({
        recurrence_group_id: 'grupo-5',
        recurrence_type: 'weekly',
        recurrence_weekdays: null,
      }),
    ).toEqual({ weekdays: [], legacyCustomWithoutWeekdays: false });
  });
});
