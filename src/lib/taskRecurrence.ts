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
 * Datas são manipuladas ancoradas ao meio-dia local (`T12:00:00`) e formatadas
 * com `yyyy-MM-dd`, evitando que o fuso (America/Sao_Paulo, UTC-3) empurre a
 * data um dia pra trás na conversão. O armazenamento é só a data (sem hora),
 * então isso mantém o dia correto na agenda.
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
}

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
  if (!spec.recurrence_end_date) return { code: 'missing_end_date' };
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
 * até `recurrence_end_date`. Sem recorrência ou sem data-final, retorna só a
 * própria `startDate` — por isso o chamador DEVE rodar `findRecurrenceIssue`
 * antes e avisar o usuário, em vez de salvar uma ocorrência só sem aviso.
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

  if (!spec.recurrence_type || !spec.recurrence_end_date) {
    return dates;
  }
  if (!isSupported(spec.recurrence_type)) {
    throw new UnsupportedRecurrenceError(spec.recurrence_type);
  }

  const endDate = anchor(spec.recurrence_end_date);
  const interval = spec.recurrence_interval || 1;
  const weekdays = spec.recurrence_weekdays || [];

  if (spec.recurrence_type === 'custom') {
    // Personalizado = varredura em TODAS as semanas nos dias marcados.
    // O campo "a cada N" segue ignorado aqui (comportamento histórico, mantido
    // de propósito para não mexer em série personalizada que já existe).
    // Sem nenhum dia marcado não há série: `findRecurrenceIssue` já barrou.
    if (weekdays.length === 0) return dates;
    dates.push(...scanWeekdays(base, endDate, weekdays, 1));
    return dates;
  }

  if (spec.recurrence_type === 'weekly' && weekdays.length > 0) {
    // Semanal COM dias marcados = a cada N semanas, em cada dia marcado.
    // Sem nenhum dia marcado cai no passo simples abaixo (1 por semana no dia
    // da data inicial), que é como a semanal sempre funcionou.
    dates.push(...scanWeekdays(base, endDate, weekdays, interval));
    return dates;
  }

  const start = anchor(base);
  for (let k = 1; ; k++) {
    const current = occurrenceAt(start, spec.recurrence_type, interval, k);
    if (current > endDate) break;
    dates.push(format(current, 'yyyy-MM-dd'));
  }

  return dates;
}
