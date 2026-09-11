/**
 * Motor puro de parcelamento do módulo Financeiro.
 *
 * Existe por dois motivos:
 *
 * 1. **Passo mensal com clamp.** O `Date.prototype.setMonth` nativo NÃO faz
 *    clamp no fim do mês: `31/01` + 1 mês vira `03/03` (porque 31/02 "transborda"
 *    pra março). Quatro parcelas a partir de 31/01/2026 saíam
 *    `31/01, 03/03, 31/03, 01/05` em vez de `31/01, 28/02, 31/03, 30/04`.
 *    Regra-lei do projeto: mês é MÊS DE CALENDÁRIO com clamp no último dia,
 *    nunca 30 dias corridos. `date-fns/addMonths` já faz isso certo.
 *
 * 2. **Uma fonte só pras três superfícies.** A data/valor de cada parcela é
 *    calculada no preview do `TransactionFormDialog`, na gravação do
 *    `useFinancial.createTransaction` e no preview/gravação da aprovação de
 *    orçamento. Antes cada uma repetia a conta — quando divergiam, o cliente
 *    via um valor na tela e outro no extrato.
 *
 * Tudo aqui é puro: sem React, sem Supabase, sem `Date.now()` implícito.
 * Datas são strings `YYYY-MM-DD` (dia de calendário de Brasília — nunca
 * `new Date('yyyy-MM-dd')` cru nem `toISOString()`, que deslocam o fuso).
 */
import { addMonths } from 'date-fns';

/** Converte `YYYY-MM-DD` em Date ancorada ao meio-dia LOCAL (imune a DST/UTC-3). */
function parseLocalDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** Formata uma Date usando os getters LOCAIS (nunca `toISOString`). */
function formatLocalDay(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Soma `months` meses de calendário a uma data `YYYY-MM-DD`, com clamp no
 * último dia do mês de destino.
 *
 * `addMonthsISO('2026-01-31', 1)` → `'2026-02-28'` (e não `'2026-03-03'`).
 */
export function addMonthsISO(iso: string, months: number): string {
  return formatLocalDay(addMonths(parseLocalDay(iso), months));
}

/**
 * Gera as `count` datas de vencimento a partir de `firstDate`, uma por mês.
 * A primeira é sempre a própria `firstDate`.
 */
export function buildInstallmentDates(firstDate: string, count: number): string[] {
  const n = Math.max(1, Math.floor(count));
  return Array.from({ length: n }, (_, i) => addMonthsISO(firstDate, i));
}

/**
 * Rateia `total` em `count` parcelas: N-1 iguais (arredondadas ao centavo) e a
 * SOBRA na última. A soma bate com o total ao centavo, inclusive quando não
 * divide redondo (1000/3, 0,01/2, 8557,99/7).
 */
export function splitInstallmentAmounts(total: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  if (n === 1) return [round2(total)];
  const per = round2(total / n);
  const amounts = Array.from({ length: n - 1 }, () => per);
  amounts.push(round2(total - per * (n - 1)));
  return amounts;
}

export interface InstallmentPlanRow {
  /** 1-based. */
  number: number;
  /** `YYYY-MM-DD` — vira `due_date` E `transaction_date` da parcela. */
  date: string;
  amount: number;
}

/**
 * Plano completo de parcelamento: data + valor de cada parcela.
 * É o que o preview desenha e o que a gravação persiste — mesma função.
 */
export function buildInstallmentPlan(
  firstDate: string,
  total: number,
  count: number,
): InstallmentPlanRow[] {
  const dates = buildInstallmentDates(firstDate, count);
  const amounts = splitInstallmentAmounts(total, dates.length);
  return dates.map((date, i) => ({ number: i + 1, date, amount: amounts[i] }));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
