/**
 * Fluxo de caixa PREVISTO, dia a dia.
 *
 * ⚠️ NÃO UNIFIQUE com `src/lib/dfc.ts`. São dois universos disjuntos:
 *
 *   | | DFC (`calculateDfc`) | Previsto (aqui) |
 *   |---|---|---|
 *   | universo | só `is_paid` | só obrigação EM ABERTO |
 *   | data | `paid_date` | vencimento (`due_date`) |
 *   | sinal da saída | negativo | POSITIVO (magnitude) |
 *   | transferência | sempre neutra | depende do perímetro do caixa |
 *
 * A divergência de SINAL é deliberada: a tela do previsto é "entradas /
 * saídas / dívidas" em colunas, como o painel do BPO. Somar um resultado no
 * outro inverte um sinal — por isso os dois shapes são diferentes de
 * propósito, pra não encaixarem por acidente.
 *
 * ── Desenho, e de onde ele vem ───────────────────────────────────────────
 * Espelha o painel que o BPO financeiro Bruno Guerra monta no Power BI
 * (reunião de 17/10/2026 + áudio de 18/10). Decisões dele, não nossas:
 *
 * 1. **A dívida é ESTOQUE, não fluxo.** Fica FORA do saldo de fechamento.
 *    Conferido na aritmética do painel dele: dia 24 abre 135.867,55, sai
 *    800,00, fecha 135.067,55 — a dívida de 10.557,38 não é subtraída.
 *    O motivo: a previsão é otimista e JÁ contou a obrigação na data de
 *    vencimento. Descontar a dívida de novo contaria a mesma conta duas vezes.
 *
 * 2. **A previsão é otimista por definição.** Nas palavras dele: "a gente vai
 *    pagar tudo e sempre vai receber tudo. Em fluxo de caixa a gente projeta
 *    o otimismo, não tem como." Consequência: para frente, NADA vira dívida
 *    nova, porque tudo que vence no dia é dado como pago naquele dia. A linha
 *    de dívida é PLANA ao longo do horizonte, mostrando só o atraso que já
 *    existia. Isso é correto e a tela precisa EXPLICAR, não esconder.
 *
 * 3. **O saldo inicial do dia é o saldo final do dia anterior**, e o primeiro
 *    começa no saldo do banco.
 *
 * 4. **O que faz virar dívida é não dar baixa.** "Se não der baixa no
 *    sistema, ele entra como dívida." Mapeia em `is_paid = false` + vencido.
 */

import { getFinancialAccountPriority } from './finance-account-priority';
import type { ForecastEvent } from './cash-flow-forecast-sources';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Conta sem `account_id` definido. Ver nota grande em `partitionEvents`. */
export const UNASSIGNED_ACCOUNT_ID = '__unassigned__';

export interface ForecastAccount {
  id: string;
  name: string;
  /** 'banco' | 'caixa' | 'cartao'. Cartão NUNCA compõe o caixa. */
  type: string;
  isCashAccount: boolean;
}

export type OverdueTreatment = 'carry' | 'reschedule';

export interface CashFlowForecastInput {
  events: readonly ForecastEvent[];
  accounts: readonly ForecastAccount[];
  /** accountId → saldo em REAIS no fim de `today`. Ver `deriveForecastOpeningBalances`. */
  openingBalances: ReadonlyMap<string, number>;
  /** YYYY-MM-DD, já resolvido no fuso da EMPRESA. O motor nunca lê relógio. */
  today: string;
  /** 15 (padrão do BPO) ou 30. O resultado tem `horizonDays + 1` dias. */
  horizonDays: number;
  /**
   * 'carry'      — o vencido fica na dívida e nunca entra em fluxo (padrão, literal ao BPO).
   * 'reschedule' — o vencido é re-datado pra hoje e entra na saída do dia 0.
   */
  overdueTreatment?: OverdueTreatment;
}

export interface ForecastAccountDay {
  accountId: string;
  name: string;
  isCashAccount: boolean;
  opening: number;
  inflow: number;
  outflow: number;
  closing: number;
}

export interface CashFlowForecastDay {
  date: string;
  isToday: boolean;
  opening: number;
  /** Sempre >= 0. */
  inflow: number;
  /** Sempre >= 0 (magnitude, não negativo). Ver nota de sinal no topo. */
  outflow: number;
  net: number;
  closing: number;
  /** ESTOQUE acumulado. NÃO entra em `closing`. */
  carriedDebtPayable: number;
  carriedDebtReceivable: number;
  byAccount: ForecastAccountDay[];
  negativeAccountIds: string[];
  events: ForecastEvent[];
}

export interface OverdueEvent extends ForecastEvent {
  daysLate: number;
}

export interface CashFlowForecastResult {
  today: string;
  horizonEnd: string;
  startingBalance: number;
  startingBalanceByAccount: ForecastAccountDay[];
  openingDebt: {
    payable: number;
    receivable: number;
    events: OverdueEvent[];
  };
  days: CashFlowForecastDay[];
  /**
   * Contas que NÃO compõem o caixa (poupança, investimento), com o saldo
   * atual. Não entram em nenhuma conta do fluxo, mas a tela mostra: o dono
   * precisa ver que o dinheiro continua lá. Sem isso, marcar a poupança como
   * "fora do caixa" faria o dinheiro sumir da tela, e a mensagem do cadastro
   * ("o saldo continua guardado e aparece separado") viraria mentira.
   */
  outOfPerimeter: Array<{ accountId: string; name: string; balance: number }>;
  /** Primeiro dia em que QUALQUER conta do caixa fecha negativa. O alerta do BPO. */
  firstNegativeDay: { date: string; accountId: string } | null;
  /**
   * Quanto do previsto não tem conta definida. A tela é OBRIGADA a mostrar
   * isso ao lado do alerta de conta negativa — ver nota em `partitionEvents`.
   */
  unassignedTotal: { inflow: number; outflow: number };
  warnings: string[];
}

/* ─────────────────────────── datas ─────────────────────────── */

interface DateAnchor { year: number; month: number; day: number }

function parseAnchor(iso: string): DateAnchor | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Valida de verdade: '2026-02-31' casa com o regex e não existe.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

function formatUtcDate(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Aritmética de dia ancorada em UTC, no padrão de
 * `dre-subscription-projections.ts`.
 *
 * ⚠️ NÃO use o padrão de `buildFinanceCalendarDays` (`finance-calendar.ts`),
 * que incrementa com `new Date(y, m, d + 1)` no fuso da MÁQUINA: num horizonte
 * que cruza mudança de horário de verão o laço duplica ou perde um dia. O app
 * oferece `Europe/Lisbon`, que tem DST — o bug é alcançável.
 */
function addDays(anchor: DateAnchor, days: number): string {
  return formatUtcDate(new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day) + days * DAY_MS));
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = parseAnchor(fromIso);
  const to = parseAnchor(toIso);
  if (!from || !to) return 0;
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / DAY_MS);
}

/* ─────────────────────────── centavos ─────────────────────────── */

function toCents(reais: number): number {
  return Math.round((reais + Number.EPSILON) * 100);
}

function toReais(cents: number): number {
  return cents / 100;
}

/* ─────────────────────────── partição ─────────────────────────── */

type Bucket = 'overdue' | 'scheduled' | 'dropped';

interface PartitionedEvent {
  event: ForecastEvent;
  bucket: Bucket;
  /** Data em que o evento entra no fluxo. Só para `scheduled`. */
  effectiveDate: string;
}

/**
 * Cada evento cai em EXATAMENTE um balde, numa decisão só. A garantia contra
 * contagem dupla é estrutural, não aritmética: se o evento está em `overdue`,
 * ele não está em dia nenhum; se está em `scheduled`, está em um único dia.
 * Os testes de invariante (`cash-flow-forecast.test.ts`) travam isso.
 *
 * ── Conta sem `account_id` ───────────────────────────────────────────────
 * 48% das obrigações em aberto em produção (591 de 1.218, em 9 empresas) não
 * têm conta definida — medido em 18/10/2026. Descartá-las esconderia metade
 * do previsto, então elas CONTAM no consolidado, num balde próprio.
 *
 * O preço: o alerta "a conta X fica negativa dia 23" só é confiável se todo
 * evento tiver conta. Com dinheiro no balde, o alerta pode ser falso positivo
 * (o recebível ia cair justamente lá) ou falso negativo. Por isso
 * `unassignedTotal` está no topo do resultado, e não escondido dentro de
 * `byAccount`: a tela é obrigada a mostrá-lo junto do alerta, senão o
 * relatório mente exatamente no ponto que motivou a reunião com o BPO.
 */
function partitionEvents(
  events: readonly ForecastEvent[],
  today: string,
  horizonEnd: string,
  treatment: OverdueTreatment,
): PartitionedEvent[] {
  return events.map((event) => {
    const due = event.dueDate;
    if (!parseAnchor(due)) {
      return { event, bucket: 'dropped' as const, effectiveDate: due };
    }

    // Mesmo predicado de atraso do resto do financeiro. Não escrever um
    // quarto no repositório.
    const isOverdue = getFinancialAccountPriority({ is_paid: false, due_date: due }, today) === 0;

    if (isOverdue) {
      return treatment === 'reschedule'
        ? { event, bucket: 'scheduled' as const, effectiveDate: today }
        : { event, bucket: 'overdue' as const, effectiveDate: due };
    }

    if (due > horizonEnd) {
      return { event, bucket: 'dropped' as const, effectiveDate: due };
    }

    return { event, bucket: 'scheduled' as const, effectiveDate: due };
  });
}

/* ─────────────────────────── perímetro ─────────────────────────── */

/**
 * A conta compõe o caixa operacional?
 *
 * ⚠️ A ordem importa: `type !== 'cartao'` vem ANTES da flag. A coluna
 * `is_cash_account` nasce com DEFAULT true, então um cartão herdaria `true` e
 * injetaria saldo falso no caixa.
 */
export function isInCashPerimeter(account: ForecastAccount | undefined): boolean {
  if (!account) return false;
  if (account.type === 'cartao') return false;
  return account.isCashAccount === true;
}

/* ─────────────────────────── motor ─────────────────────────── */

export function buildCashFlowForecast(input: CashFlowForecastInput): CashFlowForecastResult {
  const { events, accounts, openingBalances, today, horizonDays } = input;
  const treatment = input.overdueTreatment ?? 'carry';
  const warnings: string[] = [];

  const anchor = parseAnchor(today);
  if (!anchor) {
    throw new TypeError(`Data de hoje inválida no fluxo de caixa: "${today}". Use YYYY-MM-DD.`);
  }
  if (!Number.isInteger(horizonDays) || horizonDays < 1) {
    throw new RangeError(`Horizonte do fluxo de caixa inválido: ${horizonDays}.`);
  }

  const horizonEnd = addDays(anchor, horizonDays);
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // Contas do perímetro + o balde de "sem conta", que também é caixa.
  const perimeterIds = accounts.filter(isInCashPerimeter).map((a) => a.id);
  const trackedIds = [...perimeterIds, UNASSIGNED_ACCOUNT_ID];

  const nameOf = (id: string) =>
    id === UNASSIGNED_ACCOUNT_ID ? 'Sem conta definida' : accountById.get(id)?.name ?? id;

  /** Em que balde o dinheiro deste evento cai. `null` = fora do caixa. */
  const bucketOf = (event: ForecastEvent): string | null => {
    if (event.accountId === null) return UNASSIGNED_ACCOUNT_ID;
    const account = accountById.get(event.accountId);
    return isInCashPerimeter(account) ? event.accountId : null;
  };

  // Saldo de partida, só do perímetro. O balde "sem conta" começa em zero:
  // não existe saldo bancário sem conta.
  const openingCentsById = new Map<string, number>();
  for (const id of trackedIds) {
    openingCentsById.set(id, id === UNASSIGNED_ACCOUNT_ID ? 0 : toCents(openingBalances.get(id) ?? 0));
  }
  const startingCents = [...openingCentsById.values()].reduce((a, b) => a + b, 0);

  const startingBalanceByAccount: ForecastAccountDay[] = trackedIds.map((id) => {
    const opening = toReais(openingCentsById.get(id) ?? 0);
    return {
      accountId: id,
      name: nameOf(id),
      isCashAccount: id === UNASSIGNED_ACCOUNT_ID ? true : isInCashPerimeter(accountById.get(id)),
      opening,
      inflow: 0,
      outflow: 0,
      closing: opening,
    };
  });

  const partitioned = partitionEvents(events, today, horizonEnd, treatment);

  for (const p of partitioned) {
    if (p.bucket === 'dropped' && !parseAnchor(p.event.dueDate)) {
      warnings.push(`Lançamento "${p.event.label}" ficou de fora: data de vencimento ilegível.`);
    }
  }

  /* ── dívida de abertura ─────────────────────────────────────────── */

  const overdueEvents: OverdueEvent[] = [];
  let openingDebtPayableCents = 0;
  let openingDebtReceivableCents = 0;

  for (const p of partitioned) {
    if (p.bucket !== 'overdue') continue;
    // A dívida só conta se o dinheiro passaria pelo caixa. Obrigação numa
    // conta fora do perímetro não é dívida DESTE fluxo.
    if (bucketOf(p.event) === null) continue;

    overdueEvents.push({ ...p.event, daysLate: daysBetween(p.event.dueDate, today) });
    if (p.event.direction === 'out') openingDebtPayableCents += p.event.amountCents;
    else openingDebtReceivableCents += p.event.amountCents;
  }

  overdueEvents.sort((a, b) => b.daysLate - a.daysLate || a.label.localeCompare(b.label, 'pt-BR'));

  /* ── dias ───────────────────────────────────────────────────────── */

  const scheduledByDate = new Map<string, ForecastEvent[]>();
  for (const p of partitioned) {
    if (p.bucket !== 'scheduled') continue;
    const list = scheduledByDate.get(p.effectiveDate);
    if (list) list.push(p.event);
    else scheduledByDate.set(p.effectiveDate, [p.event]);
  }

  const runningCentsById = new Map(openingCentsById);
  const days: CashFlowForecastDay[] = [];
  let firstNegativeDay: { date: string; accountId: string } | null = null;
  let unassignedInflowCents = 0;
  let unassignedOutflowCents = 0;

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const date = addDays(anchor, offset);
    const dayEvents = scheduledByDate.get(date) ?? [];

    const openingByAccount = new Map(runningCentsById);
    const inflowByAccount = new Map<string, number>();
    const outflowByAccount = new Map<string, number>();

    let inflowCents = 0;
    let outflowCents = 0;

    for (const event of dayEvents) {
      const bucket = bucketOf(event);
      // Fora do perímetro: o dinheiro não passa pelo caixa operacional.
      // É aqui que a transferência pra poupança deixa de ser neutra — a perna
      // de dentro conta, a de fora não. Ver `cash-flow-forecast-sources.ts`.
      if (bucket === null) continue;

      if (event.direction === 'in') {
        inflowCents += event.amountCents;
        inflowByAccount.set(bucket, (inflowByAccount.get(bucket) ?? 0) + event.amountCents);
        if (bucket === UNASSIGNED_ACCOUNT_ID) unassignedInflowCents += event.amountCents;
      } else {
        outflowCents += event.amountCents;
        outflowByAccount.set(bucket, (outflowByAccount.get(bucket) ?? 0) + event.amountCents);
        if (bucket === UNASSIGNED_ACCOUNT_ID) unassignedOutflowCents += event.amountCents;
      }
    }

    const byAccount: ForecastAccountDay[] = [];
    const negativeAccountIds: string[] = [];

    for (const id of trackedIds) {
      const opening = openingByAccount.get(id) ?? 0;
      const inflow = inflowByAccount.get(id) ?? 0;
      const outflow = outflowByAccount.get(id) ?? 0;
      const closing = opening + inflow - outflow;
      runningCentsById.set(id, closing);

      byAccount.push({
        accountId: id,
        name: nameOf(id),
        isCashAccount: id === UNASSIGNED_ACCOUNT_ID ? true : isInCashPerimeter(accountById.get(id)),
        opening: toReais(opening),
        inflow: toReais(inflow),
        outflow: toReais(outflow),
        closing: toReais(closing),
      });

      // O balde "sem conta" não representa uma conta bancária de verdade, e
      // naturalmente fica negativo quando há saída sem conta definida. Marcá-lo
      // como conta negativa seria alarme falso.
      if (closing < 0 && id !== UNASSIGNED_ACCOUNT_ID) {
        negativeAccountIds.push(id);
        if (!firstNegativeDay) firstNegativeDay = { date, accountId: id };
      }
    }

    const openingCents = [...openingByAccount.values()].reduce((a, b) => a + b, 0);
    const closingCents = openingCents + inflowCents - outflowCents;

    days.push({
      date,
      isToday: offset === 0,
      opening: toReais(openingCents),
      inflow: toReais(inflowCents),
      outflow: toReais(outflowCents),
      net: toReais(inflowCents - outflowCents),
      closing: toReais(closingCents),
      // Plana para frente, de propósito. Ver nota 2 no topo do arquivo.
      carriedDebtPayable: toReais(openingDebtPayableCents),
      carriedDebtReceivable: toReais(openingDebtReceivableCents),
      byAccount,
      negativeAccountIds,
      events: dayEvents,
    });
  }

  if (unassignedInflowCents > 0 || unassignedOutflowCents > 0) {
    warnings.push(
      'Parte do previsto não tem conta definida, então o alerta de conta negativa pode não refletir a realidade.',
    );
  }

  const outOfPerimeter = accounts
    .filter((a) => a.type !== 'cartao' && !isInCashPerimeter(a))
    .map((a) => ({ accountId: a.id, name: a.name, balance: openingBalances.get(a.id) ?? 0 }))
    .sort((a, b) => b.balance - a.balance);

  return {
    today,
    horizonEnd,
    outOfPerimeter,
    startingBalance: toReais(startingCents),
    startingBalanceByAccount,
    openingDebt: {
      payable: toReais(openingDebtPayableCents),
      receivable: toReais(openingDebtReceivableCents),
      events: overdueEvents,
    },
    days,
    firstNegativeDay,
    unassignedTotal: {
      inflow: toReais(unassignedInflowCents),
      outflow: toReais(unassignedOutflowCents),
    },
    warnings,
  };
}
