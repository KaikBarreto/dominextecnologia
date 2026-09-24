/**
 * Regras da QUITAÇÃO EM LOTE — contas a pagar E contas a receber.
 *
 * Módulo PURO (sem React, sem Supabase) de propósito: é dinheiro do cliente e
 * precisa ser testável linha a linha, igual a `finance-balance.ts`.
 *
 * ⚠️ A GUARDA DE VERDADE É O SERVIDOR. A RPC `pay_transactions_batch` recusa o
 * lote inteiro (tudo ou nada) com a mensagem em PT-BR quando qualquer linha é
 * inelegível. O que este módulo faz é ANTECIPAR essa recusa na tela: desabilita
 * o checkbox e explica o motivo ANTES do clique, em vez de deixar o usuário
 * selecionar 40 contas e descobrir no erro. Se as duas listas divergirem, quem
 * vale é a do banco — aqui é só UX.
 *
 * Fonte da verdade das regras: migrations
 * `20260924180000_pagamento_em_lote_contas_a_pagar.sql` (bloco "Elegibilidade
 * de cada linha") e `20260924200000_lote_trava_de_folha_e_contas_a_receber.sql`
 * (contas a receber + a trava de folha do lado do servidor).
 *
 * ⚠️ Este módulo é por LINHA. A regra de que um lote não mistura entrada com
 * saída é de SELEÇÃO (não é propriedade de nenhuma conta isolada) e por isso
 * mora na tela, com `batchSideOf` abaixo — e no servidor, que recusa a mistura.
 */

/** Forma mínima de uma conta (a pagar ou a receber) para as regras daqui. */
export interface BatchPayTxnLike {
  id: string;
  transaction_type: string;
  amount: number | string;
  is_paid?: boolean | null;
  cancelled_at?: string | null;
  credit_card_bill_date?: string | null;
  transfer_pair_id?: string | null;
  payroll_kind?: string | null;
  amount_received?: number | string | null;
  payment_group_id?: string | null;
  paid_date?: string | null;
  account_id?: string | null;
  /** Espelho local de cobrança no gateway (Asaas). Só existe em `entrada`. */
  tenant_charge_id?: string | null;
  asaas_payment_id?: string | null;
}

/**
 * Motivos de recusa, em chave estável (a copy em PT-BR vive no i18n).
 *
 * Todos os motivos daqui existem TAMBÉM na RPC, com o mesmo critério:
 *
 *  • `payroll` (salário/rescisão) começou como trava só de tela e hoje é do
 *    servidor também (`payroll_kind IN ('salary','rescission')`, mesma condição
 *    da linha lá embaixo). O motivo da trava não mudou: quitar salário no
 *    Dominex nunca é um UPDATE simples — passa por `pay_payroll_transaction`,
 *    que abate os vales do funcionário, grava o bruto em `accrual_amount` e
 *    registra a movimentação no RH. Pelo lote, nada disso aconteceria e o
 *    funcionário receberia o valor cheio depois de já ter recebido o vale.
 *    Se a regra mudar, muda NOS DOIS (aqui e na RPC).
 *
 *  • `gatewayCharge` é só de conta a RECEBER: título com `tenant_charge_id` ou
 *    `asaas_payment_id` é o espelho local de uma cobrança no gateway, e quem o
 *    quita é o webhook (`apply_tenant_charge_payment`), com o valor LÍQUIDO.
 *    Baixar por fora marcaria como recebido um dinheiro que o gateway ainda não
 *    liberou e faria o extrato local divergir do Asaas em silêncio.
 *
 *  • `vale` é DE PROPÓSITO mais largo aqui do que na RPC: lá o teste é
 *    `payroll_kind = 'vale'` E existir `employee_movements` apontando pra
 *    linha; aqui basta ser vale. Na prática vale sem movimentação é resíduo, e
 *    errar pro lado de bloquear o checkbox é melhor do que oferecê-lo e o
 *    servidor recusar o lote inteiro.
 */
export type BatchPayIneligibleReason =
  | 'alreadyPaid'
  | 'cancelled'
  | 'creditCard'
  | 'transfer'
  | 'cardBillPayment'
  | 'vale'
  | 'payroll'
  | 'partial'
  | 'gatewayCharge'
  | 'notPayable';

/** Lado do lote. Um lote é sempre de um lado só (ver `batchSideOf`). */
export type BatchSide = 'pay' | 'receive';

/**
 * De que lado a conta cai. `null` = nem entrada nem saída, não entra em lote.
 *
 * Existe porque a tela precisa TRAVAR o lote no lado do primeiro item marcado:
 * um grupo que somasse dinheiro que saiu com dinheiro que entrou produziria um
 * total que não corresponde a nenhuma linha de extrato, e `undo_payment_group`
 * devolveria esse mesmo número sem sentido. O servidor recusa a mistura, mas a
 * tela não pode deixar chegar lá.
 */
export function batchSideOf(txn: BatchPayTxnLike): BatchSide | null {
  if (txn.transaction_type === 'saida') return 'pay';
  if (txn.transaction_type === 'entrada') return 'receive';
  return null;
}

/** Contexto que só a tela consegue montar (vem de outras tabelas). */
export interface BatchPayEligibilityContext {
  /** Ids de contas que JÁ têm filha de baixa parcial (espelha o teste da RPC). */
  partialParentIds?: Set<string>;
  /** Ids de lançamentos que são o pagamento de uma fatura de cartão. */
  cardBillPaymentIds?: Set<string>;
}

/**
 * Por que a conta não pode entrar no lote. `null` = pode entrar.
 *
 * A ordem dos testes espelha a da RPC: o primeiro motivo encontrado é o que o
 * usuário vê, então "já quitada" vence "de cartão", etc. Quem diverge da ordem
 * mostra na tela um motivo diferente do que o servidor daria no clique.
 */
export function getBatchPayIneligibility(
  txn: BatchPayTxnLike,
  ctx: BatchPayEligibilityContext = {},
): BatchPayIneligibleReason | null {
  // O lote cobre os dois lados: 'saida' (a pagar) e 'entrada' (a receber).
  // Qualquer outro tipo não é dinheiro a quitar.
  if (batchSideOf(txn) === null) return 'notPayable';
  if (txn.is_paid) return 'alreadyPaid';
  if (txn.cancelled_at) return 'cancelled';
  if (txn.credit_card_bill_date) return 'creditCard';
  if (txn.transfer_pair_id) return 'transfer';
  if (ctx.cardBillPaymentIds?.has(txn.id)) return 'cardBillPayment';
  // Baixa parcial fica fora dos DOIS lados, e o corte é pela existência da
  // FILHA, que chega em `partialParentIds`. `amount_received > 0` sozinho NÃO
  // é critério: há RPC que grava `amount_received = amount` numa quitação
  // total, sem filha nenhuma.
  if (ctx.partialParentIds?.has(txn.id)) return 'partial';
  if (txn.payroll_kind === 'vale') return 'vale';
  if (txn.payroll_kind === 'salary' || txn.payroll_kind === 'rescission') return 'payroll';
  // Só do lado do recebimento: quem baixa o espelho da cobrança é o webhook do
  // gateway, com o valor líquido (ver comentário do tipo acima).
  if (
    txn.transaction_type === 'entrada'
    && (txn.tenant_charge_id || txn.asaas_payment_id)
  ) return 'gatewayCharge';
  return null;
}

/** Atalho: a conta pode ser selecionada para o lote? */
export function isBatchPayEligible(
  txn: BatchPayTxnLike,
  ctx: BatchPayEligibilityContext = {},
): boolean {
  return getBatchPayIneligibility(txn, ctx) === null;
}

/** Contagem + soma da seleção. Soma em `Number` sobre `numeric` do banco. */
export function summarizeBatchSelection(txns: BatchPayTxnLike[]): { count: number; total: number } {
  let total = 0;
  for (const t of txns) total += Number(t.amount);
  // Duas casas: a soma de vários `numeric` vira dízima em ponto flutuante
  // (0.1 + 0.2). O valor exibido tem que bater com o que o banco somou.
  return { count: txns.length, total: Number(total.toFixed(2)) };
}

// ---------------------------------------------------------------------------
// Grupos já quitados (leitura)
// ---------------------------------------------------------------------------

export interface PaymentGroupSummary {
  groupId: string;
  /** Linhas do grupo presentes na lista analisada. */
  memberIds: string[];
  count: number;
  total: number;
  paidDate: string | null;
  accountId: string | null;
}

/**
 * Indexa as linhas por `payment_group_id`.
 *
 * O total do lote é SEMPRE derivado (soma das linhas do grupo) — não existe
 * transação-mãe guardando o valor. É exatamente isso que impede o saldo de
 * contar o mesmo dinheiro duas vezes, e o motivo de nunca "cachearmos" o total
 * em lugar nenhum.
 */
export function buildPaymentGroupIndex(txns: BatchPayTxnLike[]): Map<string, PaymentGroupSummary> {
  const map = new Map<string, PaymentGroupSummary>();
  for (const t of txns) {
    const gid = t.payment_group_id;
    if (!gid) continue;
    const entry = map.get(gid);
    if (entry) {
      entry.memberIds.push(t.id);
      entry.count += 1;
      entry.total = Number((entry.total + Number(t.amount)).toFixed(2));
    } else {
      map.set(gid, {
        groupId: gid,
        memberIds: [t.id],
        count: 1,
        total: Number(Number(t.amount).toFixed(2)),
        paidDate: t.paid_date ?? null,
        accountId: t.account_id ?? null,
      });
    }
  }
  return map;
}
