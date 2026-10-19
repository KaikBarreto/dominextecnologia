/**
 * Adapters do fluxo de caixa previsto: transformam as três fontes do sistema
 * (transações em aberto, faturas de cartão, projeções recorrentes) num stream
 * único de `ForecastEvent`.
 *
 * **Toda regra de inclusão/exclusão mora aqui.** O kernel
 * (`cash-flow-forecast.ts`) só sabe de dias, dívida e saldo — ele não conhece
 * o shape do Supabase. A separação existe porque a parte difícil (dívida
 * acumulada, saldo corrente, perímetro) merece teste com objeto de 6 campos,
 * não com fixture de 20 colunas.
 */

import type { FinancialTransaction } from '@/types/database';

export interface ForecastEvent {
  /** `txn:<uuid>` | `bill:<uuid>` | `proj:<key>` — único no stream inteiro. */
  id: string;
  direction: 'in' | 'out';
  /** Centavos inteiros, SEMPRE positivo. O sentido vem de `direction`. */
  amountCents: number;
  /** YYYY-MM-DD. Data esperada NO CAIXA. */
  dueDate: string;
  /** `null` = obrigação sem conta definida (48% dos casos em produção). */
  accountId: string | null;
  label: string;
  categoryName: string | null;
  /** Fatura ainda aberta ou projeção recorrente: o valor ainda pode mudar. */
  isEstimate: boolean;
}

export interface ForecastBill {
  id: string;
  account_id: string;
  due_date: string;
  closing_date: string;
  status: string;
  amount_paid: number;
  /** Derivado no client por `useAllCreditCardBills`. Não é coluna do banco. */
  total_amount?: number | null;
}

export interface ForecastProjection {
  key: string;
  dueDate: string;
  amount: number;
  label: string;
  categoryName: string | null;
}

export interface BuildForecastEventsInput {
  /** Transações EM ABERTO. Já pagas não entram (elas estão no saldo de partida). */
  openTransactions: readonly FinancialTransaction[];
  bills: readonly ForecastBill[];
  projections: readonly ForecastProjection[];
  /** YYYY-MM-DD no fuso da empresa. Decide se a fatura já fechou. */
  today: string;
}

export interface BuildForecastEventsResult {
  events: ForecastEvent[];
  warnings: string[];
}

/* ─────────────────────────── helpers ─────────────────────────── */

function normalizeIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Mesma régua de `dfc.ts:amountToCents`, INCLUSIVE o `Math.abs`: `amount` é
 * magnitude no modelo financeiro e o sentido vem de `transaction_type`. O abs
 * impede que um dado legado negativo numa saída vire entrada.
 */
function amountToCents(amount: number | string | null | undefined): number | null {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((Math.abs(parsed) + Number.EPSILON) * 100);
}

/**
 * Quanto ainda falta entrar/sair desta obrigação.
 *
 * ⚠️ NÃO reutilize `getDreAmount(t, 'caixa', hasChild)` aqui, e a razão é
 * sutil: lá o desconto de `amount_received` exige `hasPartialReceiptChild`
 * como PROVA, porque a RPC `apply_tenant_charge_payment` grava
 * `amount_received = amount` sem criar filha, e sem a prova a mãe zerava e
 * sumia do DRE em regime de caixa.
 *
 * Aqui esse cuidado é desnecessário, pelo motivo oposto: aquela mesma RPC
 * grava `is_paid = true` na MESMA UPDATE, então essa mãe já saiu do universo
 * em aberto antes de chegar nesta função. Confiar no espelho é seguro — e o
 * branch 'caixa' do `getDreAmount` mede dinheiro que SE MOVEU, não obrigação
 * EM ABERTO, que é outra pergunta.
 */
function openAmountCents(t: FinancialTransaction): number | null {
  const total = amountToCents(t.amount);
  if (total === null) return null;
  const received = amountToCents(t.amount_received ?? 0) ?? 0;
  return Math.max(0, total - received);
}

/* ─────────────────────────── adapters ─────────────────────────── */

export function buildForecastEvents(input: BuildForecastEventsInput): BuildForecastEventsResult {
  const { openTransactions, bills, projections, today } = input;
  const events: ForecastEvent[] = [];
  const warnings: string[] = [];

  // Guarda dupla contra contagem dupla: a fatura já representa o dinheiro, e
  // `amount_paid` já representa o que foi quitado dela. Qualquer transação
  // amarrada a uma fatura (perna de pagamento) não pode virar evento.
  const billIds = new Set(bills.map((b) => b.id));

  /* ── 1. transações em aberto ─────────────────────────────────── */

  for (const t of openTransactions) {
    if (t.is_paid === true) continue;        // já realizado: está no saldo de partida
    if (t.cancelled_at) continue;

    // Compra de cartão é COMPETÊNCIA, não caixa. O caixa se move quando a
    // fatura vence — e a fatura entra como evento próprio logo abaixo. Contar
    // as duas coisas dobraria a saída (uma compra em 12x viraria 12 saídas
    // além da fatura).
    if (t.credit_card_bill_date) continue;

    const billId = (t as { bill_id?: string | null }).bill_id;
    if (billId && billIds.has(billId)) continue;

    // Filha de recebimento parcial nasce paga, então o filtro acima já a
    // removeu. Esta trava é só defesa: se alguma filha nascer em aberto, ela
    // duplicaria o valor que a mãe ainda deve.
    if (t.parent_transaction_id) continue;

    const amountCents = openAmountCents(t);
    if (amountCents === null) {
      warnings.push(`Lançamento "${t.description ?? t.id}" ficou de fora: valor ilegível.`);
      continue;
    }
    if (amountCents === 0) continue;         // já recebido por inteiro via filhas

    const dueDate = normalizeIsoDate(t.due_date) ?? normalizeIsoDate(t.transaction_date);
    if (!dueDate) {
      warnings.push(`Lançamento "${t.description ?? t.id}" ficou de fora: sem data de vencimento.`);
      continue;
    }

    // ⚠️ Transferência NÃO é descartada aqui, diferente do DFC.
    //
    // No previsto cada perna é avaliada SOZINHA, pela conta dela, sem
    // pareamento. O kernel descarta o que estiver fora do perímetro do caixa.
    // O efeito cai sozinho no lugar certo:
    //   caixa → caixa      : as duas pernas contam, cancelam no total
    //   caixa → poupança   : só a saída conta  → saída real do caixa  ✅
    //   poupança → caixa   : só a entrada conta → aporte de volta      ✅
    // E a perna de ENTRADA do pagamento de fatura cai numa conta tipo cartão,
    // que nunca está no perímetro, então some sozinha — sem depender da string
    // 'Pagamento de Fatura' nem de `bill_id`, como o DFC precisa fazer.
    if (t.transfer_pair_id && !t.account_id) {
      warnings.push('Uma transferência ficou de fora: perna sem conta definida.');
      continue;
    }

    events.push({
      id: `txn:${t.id}`,
      direction: t.transaction_type === 'entrada' ? 'in' : 'out',
      amountCents,
      dueDate,
      accountId: t.account_id ?? null,
      label: t.description ?? 'Lançamento',
      categoryName: t.category ?? null,
      isEstimate: false,
    });
  }

  /* ── 2. faturas de cartão ────────────────────────────────────── */

  for (const bill of bills) {
    if (bill.status === 'paid') continue;

    const total = amountToCents(bill.total_amount ?? 0) ?? 0;
    const paid = amountToCents(bill.amount_paid ?? 0) ?? 0;

    // Mesma régua de `FinanceContas.tsx`: fatura sem conteúdo não vira linha.
    if (total === 0 && paid === 0) continue;

    const remaining = Math.max(0, total - paid);
    if (remaining === 0) continue;

    const dueDate = normalizeIsoDate(bill.due_date);
    if (!dueDate) {
      warnings.push('Uma fatura de cartão ficou de fora: vencimento ilegível.');
      continue;
    }

    const closingDate = normalizeIsoDate(bill.closing_date);
    // Fatura ainda ABERTA subestima: ela continua recebendo compras até
    // fechar. Marcamos como estimativa e a tela avisa. NÃO inflamos por média
    // das faturas anteriores — fluxo de caixa não inventa dinheiro.
    const isOpen = !closingDate || today < closingDate;

    events.push({
      id: `bill:${bill.id}`,
      direction: 'out',
      amountCents: remaining,
      dueDate,
      // A conta PAGADORA só é conhecida no pagamento. A fatura não sai da
      // conta do cartão (cartão não é caixa), então vai para o balde de
      // "sem conta definida".
      accountId: null,
      label: isOpen ? 'Fatura do cartão (ainda aberta)' : 'Fatura do cartão',
      categoryName: 'Fatura de cartão',
      isEstimate: isOpen,
    });
  }

  /* ── 3. projeções recorrentes ────────────────────────────────── */

  for (const p of projections) {
    const amountCents = amountToCents(p.amount);
    if (amountCents === null || amountCents === 0) continue;

    const dueDate = normalizeIsoDate(p.dueDate);
    if (!dueDate) continue;

    events.push({
      id: `proj:${p.key}`,
      direction: 'in',
      amountCents,
      dueDate,
      accountId: null,
      label: p.label,
      categoryName: p.categoryName,
      isEstimate: true,
    });
  }

  return { events, warnings };
}

/* ─────────────────────────── saldo de partida ─────────────────────────── */

export interface RealizedBalanceTxn {
  account_id?: string | null;
  transaction_type: string;
  amount: number;
  is_paid?: boolean | null;
  cancelled_at?: string | null;
  credit_card_bill_date?: string | null;
  paid_date?: string | null;
}

export interface BalanceAccount {
  id: string;
  type: string;
  initial_balance: number;
}

/**
 * Saldo de partida do fluxo previsto, com régua PRÓPRIA e explícita.
 *
 * Existe porque o saldo hoje é calculado em dois lugares com TRÊS
 * divergências entre si (medidas em 18/10/2026):
 *
 *   |   | `balancesQuery` (useFinancialAccounts) | `walkAccountBalance` |
 *   |---|---|---|
 *   | 1 | NÃO exclui `credit_card_bill_date`     | exclui |
 *   | 2 | exclui `cancelled_at`                   | NÃO exclui |
 *   | 3 | sem corte de `paid_date` → conta pagamento com data FUTURA | idem |
 *
 * E `FinanceMovimentacoes` ancora a segunda na primeira. O previsto não pode
 * herdar essa confusão, então deriva o próprio número com a régua abaixo —
 * que é a única testada.
 *
 * ⚠️ `Ajuste de saldo` nasce `is_paid` e TEM que entrar: é justamente o
 * lançamento que faz o saldo do sistema bater com o do banco. Não excluir por
 * categoria.
 *
 * Retorna todas as contas não-cartão, dentro e fora do perímetro: a tela
 * precisa poder mostrar a poupança separada.
 */
export function deriveForecastOpeningBalances(
  accounts: readonly BalanceAccount[],
  realized: readonly RealizedBalanceTxn[],
  today: string,
): { balances: Map<string, number>; warnings: string[] } {
  const warnings: string[] = [];
  const centsById = new Map<string, number>();

  for (const account of accounts) {
    if (account.type === 'cartao') continue;
    centsById.set(account.id, amountToCents(account.initial_balance) ?? 0);
  }

  let futurePaidCount = 0;

  for (const t of realized) {
    if (t.is_paid !== true) continue;
    if (t.cancelled_at) continue;
    if (t.credit_card_bill_date) continue;
    if (!t.account_id) continue;
    if (!centsById.has(t.account_id)) continue;

    const paidDate = normalizeIsoDate(t.paid_date);
    if (!paidDate) continue;
    if (paidDate > today) {
      // Dado real em produção: `isPaidDateAllowedInTz` barra entradas NOVAS
      // com data futura, mas libera o que já estava gravado. Esse dinheiro
      // ainda não se moveu, então não pode compor o saldo de hoje.
      futurePaidCount += 1;
      continue;
    }

    const cents = amountToCents(t.amount);
    if (cents === null) continue;

    const signed = t.transaction_type === 'entrada' ? cents : -cents;
    centsById.set(t.account_id, (centsById.get(t.account_id) ?? 0) + signed);
  }

  if (futurePaidCount > 0) {
    warnings.push(
      `${futurePaidCount} lançamento(s) estão marcados como pagos com data futura e ficaram de fora do saldo. Vale conferir.`,
    );
  }

  const balances = new Map<string, number>();
  for (const [id, cents] of centsById) balances.set(id, cents / 100);

  return { balances, warnings };
}
