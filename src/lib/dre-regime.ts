/**
 * Motor de REGIME da DRE — caixa vs competência.
 *
 * Estas funções moravam dentro de `FinanceDRE.tsx` como funções privadas, sem
 * teste nenhum. São o coração do relatório de resultado: se elas erram, o
 * cliente manda pro contador um número errado e ninguém percebe. Vivem aqui
 * fora, puras, pra terem rede de proteção.
 *
 * ⚠️ NÃO UNIFIQUE COM `@/lib/finance-date`.
 * `getEffectiveTransactionDate`/`isTransactionInDateRange` de lá começam com
 * `if (txn.credit_card_bill_date) return txn.credit_card_bill_date;` — ou seja,
 * jogam toda compra de cartão no mês da FATURA. Essa é a data certa pras telas
 * de Movimentações/Contas a Pagar (é quando o cliente precisa ter o dinheiro),
 * mas é uma TERCEIRA data do ponto de vista da DRE: não é a da compra
 * (Competência) nem a do pagamento (Caixa).
 *
 * Cartão que fecha dia 20: compra em 25/08 → fatura de setembro → paga em
 * 15/09. O helper genérico diz "setembro"; a DRE em Competência precisa de
 * "agosto". O corte da DRE é o daqui, regido pelo regime ativo.
 */

import { PARTIAL_RECEIPT_CATEGORY } from '@/lib/finance-constants';

/**
 * Regime da DRE:
 * - 'caixa'       — o mês é o mês em que o dinheiro saiu/entrou (paid_date).
 *                   Só entra o que já foi pago/recebido.
 * - 'competencia' — o mês é o mês do fato gerador (transaction_date). Entra
 *                   pago ou não.
 */
export type DreRegime = 'caixa' | 'competencia';

/** Só o que o motor precisa ler — evita amarrar o módulo ao type completo. */
export interface DreTransactionLike {
  transaction_date?: string | null;
  paid_date?: string | null;
  amount?: number | string | null;
  amount_received?: number | string | null;
  /**
   * Valor de COMPETÊNCIA da folha (bruto do ciclo, antes do abatimento de
   * vales). Só a folha preenche; em todo o resto do banco é null e a DRE
   * continua lendo `amount`. Ver `getDreAmount`.
   */
  accrual_amount?: number | string | null;
  category?: string | null;
  transaction_type?: string | null;
  parent_transaction_id?: string | null;
  payroll_kind?: string | null;
}

export interface DreDateRange {
  from?: Date;
  to?: Date;
}

/**
 * Data que define em qual mês o lançamento entra na DRE.
 *
 * Usada nos TRÊS pontos que dependem de data (corte por `dre_start_date`,
 * filtro do período e agrupamento mensal do gráfico) — se o agrupamento usasse
 * outra data que o filtro, o gráfico discordaria da tabela no mesmo período.
 *
 * No regime Caixa cai pra `transaction_date` quando `paid_date` está vazio:
 * hoje toda transação paga tem `paid_date`, mas o fallback impede que uma linha
 * suma da DRE caso algum caminho futuro esqueça de gravar a data.
 */
export function getDreEffectiveDate(t: DreTransactionLike, regime: DreRegime): string | null {
  if (regime === 'caixa') return t.paid_date || t.transaction_date || null;
  return t.transaction_date || null;
}

/**
 * Parse local ao meio-dia pra `YYYY-MM-DD` não sofrer shift de fuso (compra do
 * dia 02 virar 01).
 */
export function parseDreDate(raw: string): Date {
  return raw.length === 10 ? new Date(raw + 'T12:00:00') : new Date(raw);
}

/**
 * Corte de período da DRE. Range vazio (preset "Todos os tempos") passa tudo.
 * Bordas são INCLUSIVAS — o `DateRangeFilter` entrega `from` no começo do dia e
 * `to` no fim do dia.
 */
export function isInDreRange(effective: string | null, range?: DreDateRange): boolean {
  if (!range?.from && !range?.to) return true;
  if (!effective) return false;
  const d = parseDreDate(effective);
  if (isNaN(d.getTime())) return false;
  if (range?.from && d < range.from) return false;
  if (range?.to && d > range.to) return false;
  return true;
}

/**
 * Linha FILHA de "Recebimento parcial"? Mesmo predicado triplo do gatilho
 * `trg_recalc_amount_received` no banco (categoria + tipo + tem mãe).
 */
export function isPartialReceiptChild(t: DreTransactionLike): boolean {
  return (
    !!t.parent_transaction_id &&
    t.category === PARTIAL_RECEIPT_CATEGORY &&
    t.transaction_type === 'entrada'
  );
}

/**
 * Linha de VALE (adiantamento de salário)?
 *
 * O vale é dinheiro que sai hoje por conta de uma folha futura: é EVENTO DE
 * CAIXA contra uma obrigação, não fato gerador novo — exatamente o papel da
 * filha de "Recebimento parcial", só que do lado da saída. O fato gerador é a
 * folha do ciclo, que vale o BRUTO (ver `accrual_amount`).
 *
 * Em Competência ele é excluído: contar vale + folha bruta dobraria o custo do
 * funcionário. Em Caixa ele fica (é o dinheiro que saiu no mês dele) e a folha
 * entra pelo líquido, que é o que sobrou pra sair.
 *
 * Predicado deliberadamente simples (`payroll_kind` + tipo), sem depender de
 * vínculo com a folha: o vale nasce antes de a folha do ciclo existir em vários
 * casos, e amarrar a exclusão a um `parent_transaction_id` faria o corte falhar
 * em silêncio justamente nesses.
 */
export function isPayrollAdvance(t: DreTransactionLike): boolean {
  return t.payroll_kind === 'vale' && t.transaction_type === 'saida';
}

/**
 * Valor que a linha vale NA DRE, por regime.
 *
 * Existe por causa do recebimento parcial. Modelo do banco: a conta MÃE guarda
 * o valor cheio (`amount`) pra sempre; cada recebimento vira uma linha filha
 * "Recebimento parcial" e o gatilho só acumula a soma delas em
 * `amount_received` (e liga `is_paid` quando cobrem o total). Ou seja, quando
 * há filhas o mesmo dinheiro está representado DUAS vezes.
 *
 * - Competência: o fato gerador é a mãe. Ela vale `amount` cheio e as filhas
 *   são excluídas do conjunto (não são fato novo, são caixa).
 * - Caixa: o que conta é o dinheiro que se moveu. Cada filha vale o que ela
 *   recebeu; a mãe vale só o RESTO que não veio por filha
 *   (`amount - amount_received`). Sem esse desconto:
 *     · mãe quitada por filhas → mãe 1000 + filhas 1000 = 2000 (dobra);
 *     · mãe com 300 em filhas e o resto quitado pelo botão "marcar como pago"
 *       (que NÃO cria filha) → excluir a mãe inteira perderia os 700.
 *   O desconto acerta os dois casos com a mesma conta.
 *
 * Linha sem recebimento parcial (`amount_received` ausente ou 0) devolve
 * exatamente `amount` — nada muda pra 99% do banco.
 *
 * FOLHA DE PAGAMENTO — mesma doença, remédio espelhado. Aqui o campo que muda
 * de valor é o `amount`: ele nasce com o salário previsto e, no pagamento, é
 * reescrito pro LÍQUIDO (salário + bônus − faltas − vales; no CLT, o líquido do
 * holerite). Isso é o certo pro CAIXA — é o dinheiro que de fato saiu da conta,
 * e é o mesmo número que o saldo bancário e o extrato leem. Mas é errado pra
 * COMPETÊNCIA: o custo do ciclo não diminui porque parte dele já saiu como
 * vale. Por isso a folha grava o bruto do ciclo em `accrual_amount`, e a
 * Competência lê esse campo quando ele existe:
 *
 *   vale 800 (out) + folha líquida 2.200 (nov)     → Caixa       = 3.000 ✓
 *   vale excluído  + folha accrual 3.000 (nov)     → Competência = 3.000 ✓
 *
 * `accrual_amount` ausente (todo o resto do banco, e toda folha que ainda não
 * foi paga — que já carrega o bruto no próprio `amount`) devolve `amount`.
 */
export function getDreAmount(t: DreTransactionLike, regime: DreRegime): number {
  const amount = Number(t.amount ?? 0);
  if (regime !== 'caixa') {
    const accrual = Number(t.accrual_amount ?? NaN);
    return Number.isFinite(accrual) && accrual > 0 ? accrual : amount;
  }
  const received = Number(t.amount_received ?? 0);
  if (!Number.isFinite(received) || received <= 0) return amount;
  const net = Number((amount - received).toFixed(2));
  return net > 0 ? net : 0;
}
