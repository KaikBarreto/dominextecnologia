import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  differenceInCalendarWeeks,
  format,
  startOfWeek,
} from 'date-fns';

/**
 * Recorrência de tarefas e de OS (service_orders).
 *
 * Fonte única da geração de datas de uma série, reutilizada na CRIAÇÃO e na
 * EDIÇÃO "esta e as futuras" de tarefas (useTaskSubmit) e também na criação de
 * OS recorrentes (ServiceOrderFormDialog). Não duplicar a conta em outro lugar:
 * a duplicata que existia no formulário de OS ficou sem o caso 'yearly' e criava
 * UMA OS só, calada, pra quem escolhia "Anual".
 *
 * A geração só acontece nesses dois pontos de entrada, sempre por ação explícita
 * do usuário (criar / editar série). NÃO existe cron, trigger ou edge function
 * que reprocesse séries antigas — as ocorrências já gravadas em service_orders
 * ficam como estão, qualquer mudança de regra aqui vale só pro que for gerado
 * daqui pra frente.
 *
 * Datas são manipuladas ancoradas ao MEIO-DIA local (`T12:00:00`) e formatadas
 * com `yyyy-MM-dd`. Esta âncora é FUSO-AGNÓSTICA por construção e NÃO assume
 * Brasília: entra uma data sem hora, sai uma data sem hora, e as 12h de folga
 * pra cada lado absorvem qualquer deslocamento de fuso (e o horário de verão)
 * antes que ele consiga empurrar o dia pra frente ou pra trás na conversão.
 *
 * Ou seja: não há nada a corrigir aqui quando a empresa não está em São Paulo.
 * Trocar a âncora por meia-noite (ou por `new Date(iso)` puro) é que traria o
 * defeito clássico do dia deslocado. O armazenamento é só a data (sem hora),
 * então isso mantém o dia correto na agenda em qualquer fuso.
 */

/**
 * Frequências que o motor sabe expandir. É a MESMA lista oferecida nos selects
 * (ServiceOrderFormDialog / TaskFormDialog). Opção nova na tela sem entrada aqui
 * é barrada por `findRecurrenceIssue` ANTES de salvar (e, se escapar,
 * `generateRecurrenceDates` estoura em vez de devolver uma data só em silêncio).
 */
export const SUPPORTED_RECURRENCE_TYPES = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
  'custom',
] as const;

export type RecurrenceType = (typeof SUPPORTED_RECURRENCE_TYPES)[number];

export interface RecurrenceSpec {
  /** 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom' */
  recurrence_type?: string | null;
  recurrence_interval?: number | null;
  /** yyyy-MM-dd — data limite (inclusive) da série. */
  recurrence_end_date?: string | null;
  /**
   * Dias da semana marcados na tela (0=domingo..6=sábado).
   * Vale para 'custom' (obrigatório) e para 'weekly' (opcional — vazio mantém
   * o comportamento clássico de 1 ocorrência por semana no dia da data inicial).
   */
  recurrence_weekdays?: number[] | null;
  /**
   * Série "Contínua" (sem data de término escolhida pelo usuário): true faz
   * `findRecurrenceIssue` não exigir `recurrence_end_date`, e faz
   * `generateRecurrenceDates` IGNORAR `recurrence_end_date` e materializar só
   * até o HORIZONTE de segurança (ver `RECURRENCE_INDETERMINATE_*` abaixo).
   * Um cron fora deste arquivo empurra essa janela pra frente com o tempo —
   * este módulo nunca gera além do horizonte numa chamada só.
   *
   * Campo NOVO e opcional: ausente/null/false preserva 100% o comportamento
   * anterior (série finita ou nenhuma recorrência). Hoje só a tela de Tarefa
   * oferece essa opção ao usuário — o formulário de OS não seta este campo,
   * então OS continua exigindo "até" como sempre exigiu.
   */
  recurrence_indeterminate?: boolean | null;
}

/**
 * Horizonte de materialização de uma série "Contínua" (sem fim escolhido):
 * 12 meses adiante OU 60 ocorrências, o que vier primeiro. Fora daqui, o cron
 * de renovação (dev-database) é quem estica a janela conforme o tempo passa.
 */
export const RECURRENCE_INDETERMINATE_HORIZON_MONTHS = 12;
export const RECURRENCE_INDETERMINATE_MAX_OCCURRENCES = 60;

/**
 * Motivo pelo qual a recorrência pedida NÃO geraria uma série de verdade.
 * A tela traduz o código e bloqueia o salvamento — nunca cria uma OS só e cala.
 */
export type RecurrenceIssue =
  | { code: 'missing_end_date' }
  | { code: 'custom_without_weekdays' }
  | { code: 'unsupported_type'; type: string };

export class UnsupportedRecurrenceError extends Error {
  constructor(public readonly type: string) {
    super(`Frequência de recorrência não suportada: ${type}`);
    this.name = 'UnsupportedRecurrenceError';
  }
}

function isSupported(type: string): type is RecurrenceType {
  return (SUPPORTED_RECURRENCE_TYPES as readonly string[]).includes(type);
}

/**
 * Valida a recorrência ANTES de gerar/salvar. Retorna `null` quando está tudo
 * certo (inclusive quando não há recorrência nenhuma) ou o motivo do bloqueio.
 */
export function findRecurrenceIssue(spec: RecurrenceSpec): RecurrenceIssue | null {
  const type = spec.recurrence_type;
  if (!type) return null; // sem recorrência: nada a validar

  if (!isSupported(type)) return { code: 'unsupported_type', type };
  // "Contínua" dispensa a data final — o motor materializa até o horizonte.
  if (!spec.recurrence_end_date && !spec.recurrence_indeterminate) return { code: 'missing_end_date' };
  if (type === 'custom' && !(spec.recurrence_weekdays && spec.recurrence_weekdays.length > 0)) {
    return { code: 'custom_without_weekdays' };
  }
  return null;
}

const anchor = (date: string) => new Date(`${date}T12:00:00`);

/**
 * Semana começa no DOMINGO — mesma convenção da agenda deste app
 * (WeeklyCalendar / MonthlyCalendar usam `weekStartsOn: 0`). É o que define
 * quais semanas "contam" quando a repetição semanal tem intervalo maior que 1.
 */
const WEEK_STARTS_ON = 0 as const;

/**
 * Salto a partir da DATA INICIAL (não da ocorrência anterior).
 *
 * Ancorar no início é o que impede o escorregão de fim de mês: somando
 * cumulativamente, 31/01 vira 28/02 e ficava preso no dia 28 pra sempre
 * (28/03, 28/04...). Ancorado, cada ocorrência é `dataInicial + k meses`, e o
 * `addMonths` do date-fns encurta pro ÚLTIMO DIA do mês quando o dia não existe
 * naquele mês, sem perder a âncora: 31/01 → 28/02 → 31/03 → 30/04 → 31/05.
 * Mesma coisa em 29/02 de ano bissexto no anual (29/02/2024 → 28/02/2025 →
 * ... → 29/02/2028).
 *
 * Para diário/semanal/quinzenal o resultado é idêntico ao cumulativo (não há
 * encurtamento de mês envolvido). Frequência desconhecida estoura.
 */
function occurrenceAt(start: Date, type: RecurrenceType, interval: number, k: number): Date {
  switch (type) {
    case 'daily': return addDays(start, interval * k);
    case 'weekly': return addWeeks(start, interval * k);
    case 'biweekly': return addWeeks(start, 2 * interval * k);
    case 'monthly': return addMonths(start, interval * k);
    case 'yearly': return addYears(start, interval * k);
    // 'custom' não passa por aqui (tem varredura própria por dia da semana).
    default: throw new UnsupportedRecurrenceError(type);
  }
}

/**
 * Varredura dia a dia nos dias da semana marcados, do dia SEGUINTE à data
 * inicial até a data final (a data inicial já entrou na lista antes).
 *
 * `weekInterval` = de quantas em quantas semanas repete. Padrão de calendário
 * (iCal RRULE FREQ=WEEKLY;INTERVAL=n;BYDAY=...): conta-se a SEMANA DE CALENDÁRIO,
 * a partir da semana que contém a data inicial. Ou seja, começando numa
 * quarta-feira com "a cada 2 semanas" nas segundas/quartas/sextas, a segunda
 * anterior à data inicial não entra (é passado), quarta e sexta da mesma semana
 * entram, a semana seguinte é pulada inteira, e a próxima volta com as três.
 */
function scanWeekdays(
  base: string,
  endDate: Date,
  weekdays: number[],
  weekInterval: number,
): string[] {
  const found: string[] = [];
  const startDate = anchor(base);
  const startWeek = startOfWeek(startDate, { weekStartsOn: WEEK_STARTS_ON });

  let current = addDays(startDate, 1);
  while (current <= endDate) {
    if (weekdays.includes(current.getDay())) {
      const weeksApart = differenceInCalendarWeeks(current, startWeek, { weekStartsOn: WEEK_STARTS_ON });
      if (weekInterval <= 1 || weeksApart % weekInterval === 0) {
        found.push(format(current, 'yyyy-MM-dd'));
      }
    }
    current = addDays(current, 1);
  }
  return found;
}

/**
 * Gera todas as datas (yyyy-MM-dd) de uma série a partir de `startDate` (inclusive)
 * até `recurrence_end_date`. Sem recorrência ou sem data-final (e sem
 * `recurrence_indeterminate`), retorna só a própria `startDate` — por isso o
 * chamador DEVE rodar `findRecurrenceIssue` antes e avisar o usuário, em vez
 * de salvar uma ocorrência só sem aviso.
 *
 * Com `recurrence_indeterminate: true` ("Contínua"), `recurrence_end_date` é
 * IGNORADO e a série é materializada só até o HORIZONTE de segurança:
 * `RECURRENCE_INDETERMINATE_HORIZON_MONTHS` meses adiante OU
 * `RECURRENCE_INDETERMINATE_MAX_OCCURRENCES` ocorrências, o que vier primeiro.
 * Quem estica a janela com o passar do tempo é um cron fora deste arquivo —
 * esta função nunca materializa além do horizonte numa chamada só.
 *
 * A data inicial é SEMPRE a primeira ocorrência, mesmo que o dia da semana dela
 * não esteja entre os marcados (vale para 'weekly' e 'custom'): quem escolheu a
 * data não pode vê-la desaparecer.
 *
 * Frequência fora de `SUPPORTED_RECURRENCE_TYPES` lança `UnsupportedRecurrenceError`.
 */
export function generateRecurrenceDates(startDate: string, spec: RecurrenceSpec): string[] {
  const base = startDate;
  const dates: string[] = [base];

  if (!spec.recurrence_type) {
    return dates;
  }
  const indeterminate = !!spec.recurrence_indeterminate;
  if (!indeterminate && !spec.recurrence_end_date) {
    return dates;
  }
  if (!isSupported(spec.recurrence_type)) {
    throw new UnsupportedRecurrenceError(spec.recurrence_type);
  }

  const start = anchor(base);
  // Determinada: endDate = a data final escolhida, sem teto de ocorrências
  // (Infinity == comportamento idêntico ao loop `for (;;)` de antes).
  // Indeterminada: endDate = horizonte de tempo; maxOccurrences = horizonte
  // de contagem. Vale o que vier primeiro.
  const endDate = indeterminate
    ? addMonths(start, RECURRENCE_INDETERMINATE_HORIZON_MONTHS)
    : anchor(spec.recurrence_end_date!);
  const maxOccurrences = indeterminate ? RECURRENCE_INDETERMINATE_MAX_OCCURRENCES : Infinity;

  const interval = spec.recurrence_interval || 1;
  const weekdays = spec.recurrence_weekdays || [];

  if (spec.recurrence_type === 'custom') {
    // Personalizado = varredura em TODAS as semanas nos dias marcados.
    // O campo "a cada N" segue ignorado aqui (comportamento histórico, mantido
    // de propósito para não mexer em série personalizada que já existe).
    // Sem nenhum dia marcado não há série: `findRecurrenceIssue` já barrou.
    if (weekdays.length > 0) {
      dates.push(...scanWeekdays(base, endDate, weekdays, 1));
    }
  } else if (spec.recurrence_type === 'weekly' && weekdays.length > 0) {
    // Semanal COM dias marcados = a cada N semanas, em cada dia marcado.
    // Sem nenhum dia marcado cai no passo simples abaixo (1 por semana no dia
    // da data inicial), que é como a semanal sempre funcionou.
    dates.push(...scanWeekdays(base, endDate, weekdays, interval));
  } else {
    for (let k = 1; dates.length < maxOccurrences; k++) {
      const current = occurrenceAt(start, spec.recurrence_type, interval, k);
      if (current > endDate) break;
      dates.push(format(current, 'yyyy-MM-dd'));
    }
  }

  // Teto de ocorrências só existe no modo indeterminado (Infinity nunca corta
  // nada no modo determinado). Cobre também os ramos 'custom'/'weekly' com
  // varredura, que não respeitam o teto sozinhos.
  return indeterminate ? dates.slice(0, maxOccurrences) : dates;
}

/**
 * Dias da semana a gravar em `service_orders.recurrence_weekdays`. Convenção
 * 0=domingo..6=sábado (a mesma do `Date.getDay()` e do `EXTRACT(DOW)` do
 * Postgres — não inverter). `null` quando a frequência não usa dia da semana
 * (daily/biweekly/monthly/yearly) OU quando nenhum dia foi marcado: nunca
 * gravamos `[]`, que seria ambíguo entre "não se aplica" e "vazio de propósito".
 *
 * Compartilhada entre tarefa (`useTaskSubmit`) e OS (`ServiceOrderFormDialog`)
 * — as duas entram como linhas de `service_orders` (`entry_type` diferente),
 * então a mesma regra de gravação vale pras duas. Extraída pra cá (em vez de
 * duplicada) depois que a duplicata do motor de datas já tinha causado bug
 * (ver docstring do topo deste arquivo, caso 'yearly').
 */
export function weekdaysToPersist(
  data: Pick<RecurrenceSpec, 'recurrence_type' | 'recurrence_weekdays'>,
): number[] | null {
  const usesWeekdays = data.recurrence_type === 'custom' || data.recurrence_type === 'weekly';
  if (!usesWeekdays) return null;
  return data.recurrence_weekdays && data.recurrence_weekdays.length > 0 ? data.recurrence_weekdays : null;
}

/**
 * Deriva, a partir do registro em edição (tarefa OU OS — ambas linhas de
 * `service_orders`), quais dias da semana marcar no seletor e se é uma série
 * "Personalizada" legada (sem dias gravados, criada antes de
 * `recurrence_weekdays` existir). Extraída como função pura para dar pra
 * testar sem montar o formulário inteiro (hooks de perfil, time, cliente etc.).
 *
 * Sem série (`recurrence_group_id` nulo) sempre volta vazio: não é o caso de
 * remontar nada. Com série, os dias vêm 1:1 do que foi gravado — nunca
 * inventamos um dia a partir da data agendada.
 */
export function resolveEditingWeekdays(
  record: { recurrence_group_id?: string | null; recurrence_type?: string | null; recurrence_weekdays?: number[] | null } | null | undefined,
): { weekdays: number[]; legacyCustomWithoutWeekdays: boolean } {
  const hasSeries = !!record?.recurrence_group_id;
  if (!hasSeries) return { weekdays: [], legacyCustomWithoutWeekdays: false };

  const savedWeekdays = Array.isArray(record?.recurrence_weekdays) ? record!.recurrence_weekdays! : [];
  return {
    weekdays: savedWeekdays,
    legacyCustomWithoutWeekdays: record?.recurrence_type === 'custom' && savedWeekdays.length === 0,
  };
}

/**
 * Colapsa uma lista de tarefas (linhas de `service_orders`, `entry_type='tarefa'`)
 * agrupando cada série recorrente (`recurrence_group_id`) numa ÚNICA linha: a
 * próxima ocorrência ainda pendente. Sem isso, o card do CRM (Onda E1) e a aba
 * Tarefas (Onda E2) virariam uma lista de dezenas de linhas da mesma cobrança
 * semanal — em produção, 411 das 475 tarefas fazem parte de série.
 *
 * Regra de escolha dentro do grupo:
 *  - Considera só as ocorrências NÃO concluídas (`status !== 'concluida'`).
 *  - Se nenhuma sobrou (série 100% concluída), o grupo inteiro é omitido —
 *    não há "próxima pendente" pra mostrar.
 *  - Entre as pendentes, escolhe a de MENOR data (atrasada entra antes de
 *    futura, porque `yyyy-MM-dd` ordena como string). Sem data fica por
 *    último dentro do grupo (mas isso é raríssimo: recorrência exige data —
 *    ver `findRecurrenceIssue` / TaskFormDialog).
 *
 * Tarefas SEM `recurrence_group_id` (avulsas) passam direto, uma a uma.
 *
 * Função PURA e compartilhada: usada tanto pelo card da oportunidade quanto
 * pela aba Tarefas da tela do CRM, pra as duas nunca divergirem sobre "qual
 * ocorrência mostrar" de uma mesma série (risco 3 do plano da Onda E).
 */
export interface CollapsibleTask {
  id: string;
  recurrence_group_id?: string | null;
  scheduled_date?: string | null;
  status?: string | null;
  [key: string]: unknown;
}

export function collapseRecurringOccurrences<T extends CollapsibleTask>(
  tasks: T[],
): Array<T & { _isRecurring?: boolean; _occurrenceCount?: number }> {
  const singles: T[] = [];
  const groups = new Map<string, T[]>();

  tasks.forEach((task) => {
    if (task.recurrence_group_id) {
      const arr = groups.get(task.recurrence_group_id) || [];
      arr.push(task);
      groups.set(task.recurrence_group_id, arr);
    } else {
      singles.push(task);
    }
  });

  const collapsed: Array<T & { _isRecurring?: boolean; _occurrenceCount?: number }> = [...singles];

  groups.forEach((occurrences) => {
    const pending = occurrences.filter((o) => o.status !== 'concluida');
    if (pending.length === 0) return; // série inteira concluída: nada a mostrar

    const [next] = [...pending].sort((a, b) => {
      if (!a.scheduled_date) return 1;
      if (!b.scheduled_date) return -1;
      return a.scheduled_date.localeCompare(b.scheduled_date);
    });

    collapsed.push({ ...next, _isRecurring: true, _occurrenceCount: occurrences.length });
  });

  return collapsed;
}
