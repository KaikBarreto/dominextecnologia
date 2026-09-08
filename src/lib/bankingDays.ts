// ─────────────────────────────────────────────────────────────────────────────
// bankingDays — helper PURO (sem React, sem fetch, sem Supabase) do calendário
// bancário brasileiro. Responde uma pergunta só: "em que dia esse dinheiro
// realmente cai na conta?".
//
// Usado pelo simulador da Asaas (`asaasFeeSimulator`) para converter um prazo
// D+N em uma DATA que o cliente pode conferir no extrato.
//
// ── Por que NACIONAL apenas ──────────────────────────────────────────────────
// Quem liquida é o SPB (Sistema de Pagamentos Brasileiro). Feriado municipal ou
// estadual fecha a agência, não o sistema: a TED/liquidação roda igual e o
// crédito cai. Considerar feriado de cidade nos daria uma data ERRADA (atrasada)
// e ainda dependeria de saber a cidade da empresa — que aqui não temos.
//
// ── Ajustes sobre `getNationalHolidays` (src/utils/holidays.ts) ──────────────
// Aquela lista é do calendário CIVIL (usada na agenda). Pro banco ela precisa
// de quatro correções:
//
//   • REMOVE Páscoa           — é sempre domingo; já cai na regra de fim de semana.
//   • REMOVE Quarta de Cinzas — banco abre ao meio-dia, então É dia útil bancário.
//   • ADICIONA a segunda de Carnaval — banco fechado o dia inteiro, e a lista
//     civil só traz a terça (Páscoa − 47). A segunda é a própria terça − 1 dia
//     (Páscoa − 48); derivamos dela, sem recalcular a Páscoa.
//   • ADICIONA 31/12 — por convenção Febraban não há expediente bancário.
//
// ── ⚠️ Só a DATA rola, o custo NÃO ───────────────────────────────────────────
// Este módulo mexe exclusivamente em CALENDÁRIO. O custo da antecipação da Asaas
// continua sendo pro-rata sobre DIAS CORRIDOS (fórmula provada contra
// POST /v3/anticipations/simulate — ver cabeçalho de `asaasFeeSimulator.ts`).
// Rolar a data para o próximo dia útil não pode alterar nenhum centavo.
//
// ── Fuso ─────────────────────────────────────────────────────────────────────
// Toda aritmética é feita em UTC (`Date.UTC` / `setUTCDate`) a partir de strings
// `YYYY-MM-DD`. Nada de `new Date('2026-09-08')` interpretado no fuso local, que
// no Brasil (UTC-3) volta um dia.
// ─────────────────────────────────────────────────────────────────────────────

import { getNationalHolidays } from '@/utils/holidays';

/** Formato aceito em toda a API pública: YYYY-MM-DD. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Teto de segurança pra rolagem (nenhuma emenda bancária chega perto disso). */
const MAX_ROLL_DAYS = 30;

/** Cache por ano do conjunto de feriados bancários. */
const holidayCache = new Map<number, ReadonlySet<string>>();

/** `YYYY-MM-DD` → Date em UTC puro (meia-noite UTC). */
function parseIsoUtc(iso: string): Date {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

/** Date → `YYYY-MM-DD` (lendo em UTC, nunca no fuso local). */
function toIsoUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Soma N dias CORRIDOS a um ISO curto, em UTC. */
function shiftIso(iso: string, days: number): string {
  const d = parseIsoUtc(iso);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return toIsoUtc(d);
}

/**
 * Conjunto de feriados BANCÁRIOS nacionais do ano, em `YYYY-MM-DD`.
 * Cacheado por ano (o cálculo da Páscoa não muda no meio da sessão).
 */
export function bankingHolidaysOfYear(year: number): ReadonlySet<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const civil = getNationalHolidays(year);
  const dates = new Set<string>();

  for (const holiday of civil) {
    // Páscoa é sempre domingo e Quarta de Cinzas é dia útil bancário (ver cabeçalho).
    if (holiday.name === 'Páscoa' || holiday.name === 'Quarta de Cinzas') continue;
    dates.add(holiday.date);

    // A lista civil só traz a TERÇA de Carnaval; a segunda também é feriado bancário.
    if (holiday.name === 'Carnaval') dates.add(shiftIso(holiday.date, -1));
  }

  // Febraban: 31/12 sem expediente bancário.
  dates.add(`${year}-12-31`);

  const frozen: ReadonlySet<string> = dates;
  holidayCache.set(year, frozen);
  return frozen;
}

/**
 * A data é dia útil bancário? (não é sábado, não é domingo, não é feriado
 * nacional bancário). `iso` em `YYYY-MM-DD`.
 */
export function isBankingDay(iso: string): boolean {
  if (!ISO_DATE_RE.test(iso)) return false;

  const date = parseIsoUtc(iso);
  if (Number.isNaN(date.getTime())) return false;

  const weekday = date.getUTCDay(); // 0 = domingo, 6 = sábado
  if (weekday === 0 || weekday === 6) return false;

  return !bankingHolidaysOfYear(date.getUTCFullYear()).has(iso);
}

/**
 * Próximo dia útil bancário a partir de `iso` (inclusive).
 * IDEMPOTENTE: se `iso` já for dia útil, devolve a própria data.
 */
export function nextBankingDay(iso: string): string {
  if (!ISO_DATE_RE.test(iso)) return iso;

  let current = iso;
  for (let i = 0; i < MAX_ROLL_DAYS && !isBankingDay(current); i += 1) {
    current = shiftIso(current, 1);
  }
  return current;
}

/**
 * Soma `days` dias CORRIDOS a `baseIso` e, se cair em fim de semana ou feriado,
 * rola PRA FRENTE até o próximo dia útil bancário.
 *
 * É assim que a Asaas credita: o prazo é contado em dias corridos, mas o
 * dinheiro só entra na conta em dia de expediente bancário.
 */
export function addCalendarDaysToBankingDay(baseIso: string, days: number): string {
  if (!ISO_DATE_RE.test(baseIso)) return baseIso;
  return nextBankingDay(shiftIso(baseIso, days));
}
