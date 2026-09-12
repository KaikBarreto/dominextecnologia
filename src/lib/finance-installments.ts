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

// ─────────────────────────────────────────────────────────────────────────────
// Crédito parcelado: COMO O CLIENTE PAGA ≠ COMO O DINHEIRO ENTRA
//
// São duas coisas diferentes que o sistema tratava como uma só:
//
//   • O cliente parcelar em 10x é assunto dele com a operadora do cartão.
//   • O que entra no CONTAS A RECEBER da empresa é quando o dinheiro cai na
//     conta dela, que só é mês a mês se ela NÃO antecipar.
//
// Uma venda de R$ 789,00 em 10x virava 10 recebíveis de R$ 78,90. Se a empresa
// antecipa, isso é falso: ela recebe R$ 789,00 (menos taxa) de uma vez só.
//
// Decisão do CEO: NÃO existe padrão nem configuração salva. O formulário
// pergunta toda vez, sem opção pré-marcada (`mode` só chega aqui já escolhido).
//
// Invariante que os dois modos respeitam: a soma das linhas é SEMPRE o valor
// da venda, uma vez só. Nenhum modo pode somar duas vezes a mesma receita.
// ─────────────────────────────────────────────────────────────────────────────

/** Como o dinheiro da venda no crédito parcelado entra na conta da empresa. */
export type CardReceiptMode =
  /** Antecipa: 1 recebível com o valor cheio. */
  | 'anticipated'
  /** Não antecipa: N recebíveis, um por parcela do cliente. */
  | 'as_customer_pays';

/**
 * Quantas linhas o Contas a Receber recebe de verdade.
 *
 * `mode: null` = a pergunta não se aplica (despesa, à vista, outra forma de
 * pagamento) e nada muda em relação ao comportamento histórico.
 */
export function receivableInstallmentCount(args: {
  /** Em quantas vezes o CLIENTE parcelou. */
  installmentCount: number;
  mode: CardReceiptMode | null;
}): number {
  const n = Math.max(1, Math.floor(Number(args.installmentCount) || 1));
  return args.mode === 'anticipated' ? 1 : n;
}

/**
 * As linhas que vão cair no Contas a Receber. Mesma função no preview da tela
 * e no que é enviado pra gravação (via `receivableInstallmentCount`), pra tela
 * e extrato nunca divergirem.
 *
 * - `anticipated`: 1 linha com o valor cheio na data do lançamento.
 * - `as_customer_pays`: N linhas mensais (com clamp de fim de mês e sobra na
 *   última), exatamente o que `buildInstallmentPlan` já fazia.
 */
export function buildCardReceivablePlan(args: {
  firstDate: string;
  total: number;
  installmentCount: number;
  mode: CardReceiptMode;
}): InstallmentPlanRow[] {
  const { firstDate, total, installmentCount, mode } = args;
  const count = receivableInstallmentCount({ installmentCount, mode });
  return buildInstallmentPlan(firstDate, total, count);
}

// ─────────────────────────────────────────────────────────────────────────────
// REPETIÇÃO ≠ PARCELAMENTO
//
// São dois conceitos que o financeiro trata de formas opostas e que o texto
// "(2/48)" na descrição confundia:
//
//   • PARCELAMENTO: um TOTAL dividido em N (R$ 1.000 em 10x de R$ 100). A soma
//     das linhas é o total. É o que `buildInstallmentPlan` faz.
//   • REPETIÇÃO: o MESMO valor cobrado N vezes (48 mensalidades de R$ 180, que
//     somam R$ 8.640). É o que um contrato PMOC gera. Nada é dividido.
//
// Passar uma mensalidade de contrato por `buildInstallmentPlan` esmigalharia os
// R$ 180 em 48 pedacinhos de R$ 3,75 — por isso a repetição tem motor próprio.
// O que os dois compartilham é o passo mensal com clamp de fim de mês
// (`addMonthsISO`): mês é MÊS DE CALENDÁRIO, nunca 30 dias corridos.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plano de REPETIÇÃO: `count` lançamentos do MESMO `amount`, espaçados de
 * `intervalMonths` meses (1 = mensal, 3 = trimestral, 12 = anual).
 *
 * `intervalMonths: 0` (frequência "única") devolve todas as ocorrências na
 * mesma data — na prática só é usado com `count: 1`.
 */
export function buildRepetitionPlan(args: {
  firstDate: string;
  amount: number;
  count: number;
  intervalMonths: number;
}): InstallmentPlanRow[] {
  const n = Math.max(1, Math.floor(Number(args.count) || 1));
  const step = Math.max(0, Math.floor(Number(args.intervalMonths) || 0));
  const amount = round2(Number(args.amount) || 0);
  return Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    date: addMonthsISO(args.firstDate, i * step),
    amount,
  }));
}

/**
 * Quanto o plano de repetição soma no fim (valor x ocorrências). Serve pro
 * preview deixar explícito que 48x R$ 180 é R$ 8.640 e NÃO R$ 180 fatiados.
 */
export function repetitionTotal(amount: number, count: number): number {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  return round2((Number(amount) || 0) * n);
}
