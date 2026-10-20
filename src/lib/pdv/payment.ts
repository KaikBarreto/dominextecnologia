/**
 * Motor do PAGAMENTO do PDV. Função pura, sem React e sem Supabase, de
 * propósito: é a parte onde erro vira DINHEIRO ERRADO, então tem que ser
 * testável isolada do componente (que muda de forma a cada onda).
 *
 * O que mora aqui:
 *  • a soma das formas de pagamento e o QUANTO FALTA até o total;
 *  • o troco do dinheiro (e a regra de que troco NÃO entra no valor aplicado);
 *  • a validação que a tela mostra ANTES de chamar o servidor (fiado sem
 *    cliente, dinheiro sem caixa aberto, conta obrigatória no Pix/cartão);
 *  • o vencimento default do fiado (hoje + 1 MÊS CALENDÁRIO, lei da casa);
 *  • a tradução das linhas da tela pro payload de `pdv_settle_order`.
 *
 * ESTA VALIDAÇÃO NÃO É A AUTORIDADE. Quem decide é sempre a RPC
 * `pdv_settle_order`, que recalcula o total pelos ITENS gravados e revalida
 * tudo no servidor. O motor aqui existe pra o operador não descobrir o
 * problema depois de o cliente já ter entregado o dinheiro, e pra as mensagens
 * do servidor serem a exceção e não a regra.
 *
 * ESPELHO DA RPC (divergir daqui faz a tela brigar com o servidor):
 *  • tolerância de 1 centavo entre a soma dos pagamentos e o total
 *    (`abs(soma - total) > 0.01` é o que a RPC recusa);
 *  • `amount` é o valor LÍQUIDO aplicado ao pedido; `change_amount` é só o
 *    troco impresso no comprovante. Somar troco no `amount` estouraria a
 *    conferência da gaveta e o total do pedido;
 *  • `dinheiro` IGNORA conta escolhida: vai sempre pra conta cofre;
 *  • `pontos` é recusado com mensagem (Onda 4), nunca ignorado em silêncio.
 */

import { addMonths } from 'date-fns';
import { round2 } from '@/lib/pdv/cash';

/** Tolerância da RPC entre a soma dos pagamentos e o total do pedido. */
export const PAYMENT_TOLERANCE = 0.01;

/**
 * Formas que a RPC aceita. `pontos` fica FORA de propósito: a funcionalidade
 * não existe ainda e a RPC recusa com mensagem. Oferecer na tela seria
 * prometer o que não entrega.
 */
export const PDV_PAYMENT_METHODS = [
  'dinheiro',
  'pix',
  'debito',
  'credito',
  'transferencia',
  'fiado',
] as const;

export type PdvPaymentMethod = (typeof PDV_PAYMENT_METHODS)[number];

/** Formas que exigem conta bancária/caixa escolhida na tela. */
const METHODS_REQUIRING_ACCOUNT: PdvPaymentMethod[] = ['pix', 'debito', 'credito', 'transferencia'];

export function requiresAccount(method: PdvPaymentMethod): boolean {
  return METHODS_REQUIRING_ACCOUNT.indexOf(method) >= 0;
}

/** Uma linha de pagamento na tela (pagamento misto é regra, não exceção). */
export interface PaymentRow {
  /** Chave local da linha (React key). Não vai pro servidor. */
  id: string;
  method: PdvPaymentMethod;
  /** Valor LÍQUIDO aplicado ao pedido. Nunca inclui troco. */
  amount: number;
  /**
   * Só `dinheiro`: quanto o cliente entregou na mão. `0` = não informado (o
   * operador recebeu exatamente o valor e não há troco).
   */
  tendered: number;
  /** Conta que recebe (Pix, transferência, débito, crédito). */
  accountId: string | null;
  /** Vencimento do fiado, em `yyyy-MM-dd`. */
  dueDate: string | null;
}

export interface SettlePaymentPayload {
  method: PdvPaymentMethod;
  amount: number;
  change_amount?: number;
  account_id?: string;
  due_date?: string;
}

/** `Date` → `yyyy-MM-dd` pelos componentes LOCAIS (nunca via UTC, que volta o dia). */
function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Vencimento default do fiado: hoje + 1 MÊS CALENDÁRIO, nunca 30 dias (lei da
 * casa, e é o mesmo `CURRENT_DATE + interval '1 month'` que a RPC usa quando a
 * tela não manda `due_date`). `addMonths` do date-fns clampa fim de mês: 31/01
 * + 1 mês = 28/02, igual ao Postgres.
 */
export function defaultFiadoDueDate(today: Date = new Date()): string {
  return toIsoDate(addMonths(today, 1));
}

let rowSeq = 0;

/**
 * Cria uma linha de pagamento. `crypto.randomUUID` não é usado aqui de
 * propósito: esta chave é só a key do React e a função precisa rodar em
 * ambiente de teste sem Web Crypto.
 */
export function newPaymentRow(
  method: PdvPaymentMethod,
  amount: number,
  options: { today?: Date; accountId?: string | null } = {},
): PaymentRow {
  rowSeq += 1;
  return {
    id: `pay-${rowSeq}`,
    method,
    amount: round2(Math.max(0, amount)),
    // Dinheiro nasce como "recebido exatamente": o operador enxerga o valor
    // cheio e só altera quando precisa calcular troco.
    tendered: method === 'dinheiro' ? round2(Math.max(0, amount)) : 0,
    accountId: requiresAccount(method) ? (options.accountId ?? null) : null,
    dueDate: method === 'fiado' ? defaultFiadoDueDate(options.today) : null,
  };
}

/**
 * Completa automaticamente pagamentos mistos com 2 ou 3 formas.
 *
 * A forma editada por último permanece estável. O restante vai primeiro para
 * uma forma ainda não editada; quando todas já foram tocadas, vai para a mais
 * antiga da fila. É a mesma regra operacional da EcoSistema e evita que o
 * operador tenha de fechar a soma manualmente a cada alteração.
 */
export function autofillPaymentRemainder(
  total: number,
  rows: PaymentRow[],
  editOrder: string[],
  tenderedEditedIds: ReadonlySet<string> = new Set(),
): PaymentRow[] {
  if (rows.length < 2) return rows;

  const activeIds = new Set(rows.map((row) => row.id));
  const editedActive = editOrder.filter((id) => activeIds.has(id));
  const editedIds = new Set(editedActive);
  const untouched = rows.filter((row) => !editedIds.has(row.id));
  const targetId = untouched[0]?.id ?? editedActive[0] ?? null;
  if (!targetId) return rows;

  const fixedSum = rows
    .filter((row) => row.id !== targetId)
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const amount = Math.max(0, round2((Number(total) || 0) - fixedSum));

  return rows.map((row) => {
    if (row.id !== targetId || row.amount === amount) return row;
    return {
      ...row,
      amount,
      tendered:
        row.method === 'dinheiro' && !tenderedEditedIds.has(row.id)
          ? amount
          : row.tendered,
    };
  });
}

/** Soma do valor LÍQUIDO de todas as linhas (sem troco). */
export function sumPayments(rows: PaymentRow[]): number {
  return round2((rows || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
}

/**
 * Quanto FALTA até o total. Positivo = falta receber; negativo = passou do
 * total (o operador digitou mais do que a venda vale).
 */
export function computeRemaining(total: number, rows: PaymentRow[]): number {
  return round2((Number(total) || 0) - sumPayments(rows));
}

/**
 * Troco da linha de dinheiro. É `entregue − aplicado`, e só isso: nunca sai do
 * valor aplicado ao pedido. Linha que não é dinheiro não tem troco.
 */
export function computeRowChange(row: PaymentRow): number {
  if (!row || row.method !== 'dinheiro') return 0;
  const tendered = Number(row.tendered) || 0;
  if (tendered <= 0) return 0;
  return round2(Math.max(0, tendered - (Number(row.amount) || 0)));
}

/** Troco total da venda (soma do troco de todas as linhas de dinheiro). */
export function computeTotalChange(rows: PaymentRow[]): number {
  return round2((rows || []).reduce((sum, row) => sum + computeRowChange(row), 0));
}

/** A soma dos pagamentos fecha com o total, dentro da tolerância da RPC? */
export function isBalanced(total: number, rows: PaymentRow[]): boolean {
  return Math.abs(computeRemaining(total, rows)) <= PAYMENT_TOLERANCE;
}

export type PaymentIssueCode =
  /** Nenhuma forma de pagamento informada. */
  | 'sem_pagamento'
  /** Pedido sem item: a RPC recusa. */
  | 'sem_itens'
  /** Total zerado (desconto comeu a venda inteira). */
  | 'total_zero'
  /** A soma dos pagamentos é menor que o total. */
  | 'falta_valor'
  /** A soma dos pagamentos passou do total. */
  | 'valor_excede'
  /** Linha com valor <= 0. */
  | 'valor_invalido'
  /** Pix/transferência/débito/crédito sem conta escolhida. */
  | 'conta_obrigatoria'
  /** Dinheiro recebido menor que o valor aplicado na linha. */
  | 'recebido_menor'
  /** Fiado sem cliente identificado no pedido. */
  | 'fiado_sem_cliente'
  /** Fiado sem vencimento. */
  | 'fiado_sem_vencimento'
  /** Venda em dinheiro sem caixa aberto. */
  | 'dinheiro_sem_caixa'
  /** Venda em dinheiro sem conta de cofre configurada. */
  | 'cofre_nao_configurado'
  /** Fiado passaria do limite de crédito do cliente. */
  | 'fiado_acima_do_limite';

export type PaymentWarningCode =
  /** Cliente sem `credit_limit`: a venda passa, mas sem teto nenhum. */
  | 'cliente_sem_limite_definido';

export interface PaymentIssue {
  code: PaymentIssueCode;
  /** Linha que causou o problema, quando é problema de linha. */
  rowId?: string;
}

export interface PaymentContext {
  /** Total do pedido (subtotal − desconto), vindo do carrinho. */
  total: number;
  /** Quantidade de linhas no carrinho. */
  itemCount: number;
  /** Há cliente identificado no pedido? (obrigatório pro fiado) */
  hasCustomer: boolean;
  /** Há sessão de caixa ABERTA? (obrigatório pra receber em dinheiro) */
  hasOpenCashSession: boolean;
  /** A empresa aponta uma conta de cofre em Configurações do PDV? */
  hasCofreAccount: boolean;
  /** `customers.credit_limit`. `null` = sem limite definido (vira aviso). */
  customerCreditLimit?: number | null;
  /** Saldo devedor atual do cliente (soma do `customer_credit_ledger`). */
  customerDebt?: number;
}

export interface PaymentValidation {
  /** Dá pra chamar `pdv_settle_order`? */
  ok: boolean;
  /** Problemas que BLOQUEIAM a finalização. */
  issues: PaymentIssue[];
  /** Avisos que NÃO bloqueiam (espelham os `avisos[]` da RPC). */
  warnings: PaymentWarningCode[];
}

function has(rows: PaymentRow[], method: PdvPaymentMethod): boolean {
  return (rows || []).some((row) => row.method === method);
}

/** Soma só das linhas de fiado (é o que o limite de crédito limita). */
export function sumFiado(rows: PaymentRow[]): number {
  return round2(
    (rows || [])
      .filter((row) => row.method === 'fiado')
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
  );
}

/**
 * Valida as formas de pagamento contra o contexto da venda. A ordem dos
 * problemas é a ordem em que a tela deve mostrá-los: primeiro o que impede
 * qualquer venda, depois linha por linha, depois a conferência da soma.
 */
export function validatePayments(rows: PaymentRow[], ctx: PaymentContext): PaymentValidation {
  const issues: PaymentIssue[] = [];
  const warnings: PaymentWarningCode[] = [];
  const list = rows || [];
  const total = Number(ctx.total) || 0;

  if (!ctx.itemCount) issues.push({ code: 'sem_itens' });
  if (total <= 0) issues.push({ code: 'total_zero' });
  if (list.length === 0) issues.push({ code: 'sem_pagamento' });

  for (const row of list) {
    if (!(Number(row.amount) > 0)) {
      issues.push({ code: 'valor_invalido', rowId: row.id });
    }
    if (requiresAccount(row.method) && !row.accountId) {
      issues.push({ code: 'conta_obrigatoria', rowId: row.id });
    }
    if (row.method === 'dinheiro') {
      const tendered = Number(row.tendered) || 0;
      // `tendered = 0` é "recebi exatamente o valor", não erro. Só avisa quando
      // o operador DIGITOU um valor recebido menor que o aplicado.
      if (tendered > 0 && round2(tendered) < round2(Number(row.amount) || 0)) {
        issues.push({ code: 'recebido_menor', rowId: row.id });
      }
    }
    if (row.method === 'fiado' && !row.dueDate) {
      issues.push({ code: 'fiado_sem_vencimento', rowId: row.id });
    }
  }

  // Dinheiro: as duas condições que a RPC recusa, antecipadas na tela pra o
  // operador não digitar a venda inteira pra só então descobrir.
  if (has(list, 'dinheiro')) {
    if (!ctx.hasOpenCashSession) issues.push({ code: 'dinheiro_sem_caixa' });
    if (!ctx.hasCofreAccount) issues.push({ code: 'cofre_nao_configurado' });
  }

  const fiado = sumFiado(list);
  if (fiado > 0) {
    if (!ctx.hasCustomer) {
      issues.push({ code: 'fiado_sem_cliente' });
    } else if (ctx.customerCreditLimit == null) {
      warnings.push('cliente_sem_limite_definido');
    } else if (round2((Number(ctx.customerDebt) || 0) + fiado) > round2(ctx.customerCreditLimit)) {
      issues.push({ code: 'fiado_acima_do_limite' });
    }
  }

  const remaining = computeRemaining(total, list);
  if (list.length > 0) {
    if (remaining > PAYMENT_TOLERANCE) issues.push({ code: 'falta_valor' });
    else if (remaining < -PAYMENT_TOLERANCE) issues.push({ code: 'valor_excede' });
  }

  return { ok: issues.length === 0, issues, warnings };
}

/**
 * Traduz as linhas da tela pro `p_payments` de `pdv_settle_order`.
 *
 * `amount` é o líquido aplicado e `change_amount` é só o troco: o servidor usa
 * o primeiro pra conferir o total e o segundo pro comprovante. Campo que não
 * se aplica à forma é OMITIDO em vez de ir `null`, porque a RPC lê
 * `NULLIF(valor, '')::uuid` e `null` de JSON chegaria como a string `"null"`
 * em alguns caminhos de serialização.
 */
export function toSettlePayload(rows: PaymentRow[]): SettlePaymentPayload[] {
  return (rows || []).map((row) => {
    const payload: SettlePaymentPayload = {
      method: row.method,
      amount: round2(Number(row.amount) || 0),
    };
    if (row.method === 'dinheiro') {
      const change = computeRowChange(row);
      if (change > 0) payload.change_amount = change;
    } else if (requiresAccount(row.method)) {
      if (row.accountId) payload.account_id = row.accountId;
    } else if (row.method === 'fiado') {
      if (row.dueDate) payload.due_date = row.dueDate;
    }
    return payload;
  });
}
