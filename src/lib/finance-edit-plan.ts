/**
 * Motor puro de EDIÇÃO de lançamento financeiro.
 *
 * Existe por causa de um bug que apagava dinheiro em silêncio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ACONTECIA
 *
 * Editar um lançamento tinha dois caminhos: UPDATE simples, ou "recriar"
 * (apaga o original e cria do zero). O "recriar" ligava quando o usuário
 * trocava a forma de pagamento OU transformava um lançamento à vista em
 * parcelado. Só que o "recriar" era aplicado também a uma PARCELA de um grupo
 * já existente, e aí três coisas davam errado de uma vez:
 *
 *  1. O formulário semeava `installment_count` com o `installment_total` da
 *     linha (ex.: 10) e mandava o `amount` DA PARCELA (ex.: R$ 100). O motor de
 *     parcelamento então DIVIDIA os R$ 100 em 10 — a venda de R$ 1.000 voltava
 *     como 10 parcelas de R$ 10. Perda de 90%, sem erro e sem alerta.
 *  2. O delete varria o grupo inteiro (`.eq('installment_group_id', ...)`),
 *     enquanto o aviso na tela falava em remover "a transação original", no
 *     singular. Dez linhas sumiam com o usuário achando que mexeu em uma.
 *  3. A linha recriada nascia órfã: `customer_id`, `service_order_id` e
 *     `contract_id` não eram reinjetados, então o lançamento sumia do
 *     financeiro do cliente e do relatório dele.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A REGRA QUE ESTE MÓDULO IMPÕE
 *
 *  • EDITAR UMA PARCELA MEXE SÓ NAQUELA PARCELA. Linha que pertence a um grupo
 *    NUNCA entra no caminho "recriar" — nem trocando a forma de pagamento. O
 *    valor da parcela é FATIA, nunca total, então nada pode redividí-lo.
 *  • O caminho "recriar" apaga NO MÁXIMO UMA linha, a própria. Não existe
 *    delete por `installment_group_id` a partir de uma edição.
 *  • Quem recria carrega os vínculos da original (cliente, OS, contrato,
 *    funcionário/folha). Lançamento recriado não perde de quem ele é.
 *
 * Refazer um parcelamento inteiro (mudar 10x para 6x, por exemplo) é outra
 * operação, destrutiva e explícita: excluir as parcelas e lançar de novo. Não
 * pode ser efeito colateral de um "Salvar" numa parcela.
 *
 * Puro de propósito: sem React, sem Supabase. É onde dinheiro pode sumir, então
 * precisa ser testável sem subir a tela.
 */

/** Só o que a decisão precisa enxergar da transação em edição. */
export interface EditableTransactionSnapshot {
  amount?: number | null;
  payment_method?: string | null;
  installment_group_id?: string | null;
  installment_total?: number | null;
  /** Perna de transferência entre contas / pagamento de fatura. */
  transfer_pair_id?: string | null;
  /** Linha filha (tarifa da maquininha, recebimento parcial). */
  parent_transaction_id?: string | null;
}

/** O que o formulário está pedindo. */
export interface EditFormIntent {
  payment_method?: string | null;
  /** Quantas parcelas o formulário pediu. */
  installment_count?: number | null;
}

export type TransactionEditAction = 'update' | 'replace';

export type TransactionEditReason =
  /** Nada estrutural mudou: UPDATE na própria linha. */
  | 'none'
  /** À vista virou parcelado: só o create consegue montar as N linhas. */
  | 'became_installments'
  /** Forma de pagamento mudou num lançamento avulso. */
  | 'payment_method'
  /** A linha pertence a um grupo de parcelas: edição fica restrita a ela. */
  | 'locked_installment_row'
  /** Perna de transferência ou linha filha: recriar quebraria o par. */
  | 'locked_linked_row';

export interface TransactionEditPlan {
  action: TransactionEditAction;
  reason: TransactionEditReason;
  /**
   * `installment_count` que pode ir pro payload. Em `update` é SEMPRE 1: o
   * `amount` da linha é o valor dela, nunca um total a dividir.
   */
  installmentCount: number;
  /**
   * Quantas linhas a operação pode apagar. Invariante: 0 ou 1, nunca o grupo.
   */
  rowsToDelete: 0 | 1;
  /** A linha faz parte de um parcelamento (a edição vale só pra ela). */
  belongsToInstallmentGroup: boolean;
}

/** A linha é uma parcela de um grupo? */
export function belongsToInstallmentGroup(t: EditableTransactionSnapshot): boolean {
  return !!t.installment_group_id || Number(t.installment_total ?? 1) > 1;
}

/**
 * A linha tem par/mãe no banco? Perna de transferência e filha de recebimento
 * não podem ser recriadas: o delete deixaria o outro lado órfão.
 */
export function belongsToLinkedPair(t: EditableTransactionSnapshot): boolean {
  return !!t.transfer_pair_id || !!t.parent_transaction_id;
}

/** Normaliza a contagem de parcelas pedida pelo formulário. */
function requestedInstallments(intent: EditFormIntent): number {
  const n = Math.floor(Number(intent.installment_count ?? 1));
  return Number.isFinite(n) && n > 1 ? n : 1;
}

/**
 * Decide o que fazer com o "Salvar" de uma transação em edição.
 *
 * A ordem das guardas importa: o bloqueio por grupo/par vem ANTES de qualquer
 * gatilho de "recriar". É esse pedaço que impede a perda de 90% do valor.
 */
export function planTransactionEdit(args: {
  original: EditableTransactionSnapshot;
  intent: EditFormIntent;
}): TransactionEditPlan {
  const { original, intent } = args;

  // ── Guarda 1: parcela de um grupo ─────────────────────────────────────────
  // Recriar aqui dividiria a FATIA como se fosse o TOTAL e varreria as irmãs.
  // Editar uma parcela altera só ela, e ponto.
  if (belongsToInstallmentGroup(original)) {
    return {
      action: 'update',
      reason: 'locked_installment_row',
      installmentCount: 1,
      rowsToDelete: 0,
      belongsToInstallmentGroup: true,
    };
  }

  // ── Guarda 2: perna de transferência / linha filha ────────────────────────
  if (belongsToLinkedPair(original)) {
    return {
      action: 'update',
      reason: 'locked_linked_row',
      installmentCount: 1,
      rowsToDelete: 0,
      belongsToInstallmentGroup: false,
    };
  }

  // ── Daqui pra baixo: lançamento avulso, sem irmãs e sem par ───────────────
  const count = requestedInstallments(intent);

  // À vista virou parcelado: o `amount` da linha É o total da venda, então
  // dividir está correto. Uma linha sai, N entram.
  if (count > 1) {
    return {
      action: 'replace',
      reason: 'became_installments',
      installmentCount: count,
      rowsToDelete: 1,
      belongsToInstallmentGroup: false,
    };
  }

  // Forma de pagamento mudou (PIX → cartão vira lançamento de fatura): o
  // UPDATE plano não monta a fatura, então recria — uma linha por uma linha.
  const methodChanged = (original.payment_method ?? null) !== (intent.payment_method ?? null);
  if (methodChanged) {
    return {
      action: 'replace',
      reason: 'payment_method',
      installmentCount: 1,
      rowsToDelete: 1,
      belongsToInstallmentGroup: false,
    };
  }

  return {
    action: 'update',
    reason: 'none',
    installmentCount: 1,
    rowsToDelete: 0,
    belongsToInstallmentGroup: false,
  };
}

/**
 * Vínculos que o formulário NÃO conhece e que o `createTransaction` só recebe
 * se alguém reinjetar. Sem isto, um recebimento que veio de orçamento aprovado
 * some do financeiro do cliente ao ter a forma de pagamento corrigida.
 */
export const CARRIED_OVER_LINK_FIELDS = [
  'customer_id',
  'service_order_id',
  'contract_id',
  'employee_id',
  'payroll_period',
  'payroll_kind',
] as const;

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

export interface CarryOverOptions {
  /**
   * Cliente "dono da tela" (a ficha do cliente em que a edição aconteceu).
   * Último recurso: só entra se nem o formulário nem a transação original
   * tiverem cliente. Nunca sobrescreve vínculo existente.
   */
  fallbackCustomerId?: string | null;
}

/**
 * Devolve o payload do formulário com os vínculos da transação original
 * preenchidos. O que o formulário mandou tem prioridade — só campo vazio é
 * herdado.
 *
 * A regra de fallback de cliente mora aqui, e não na tela, porque é a mesma
 * família de decisão ("de quem é este lançamento?") e porque aqui ela é
 * testável sem subir React.
 */
export function carryOverTransactionLinks<T extends Record<string, any>>(
  formData: T,
  original: Record<string, any> | null | undefined,
  options?: CarryOverOptions,
): T {
  const fallbackCustomerId = options?.fallbackCustomerId;
  if (!original && isEmptyValue(fallbackCustomerId)) return formData;

  const merged: Record<string, any> = { ...formData };
  if (original) {
    for (const field of CARRIED_OVER_LINK_FIELDS) {
      if (isEmptyValue(merged[field]) && !isEmptyValue(original[field])) {
        merged[field] = original[field];
      }
    }
  }
  // Lançamento antigo sem cliente, editado de dentro da ficha de um cliente:
  // adota aquele cliente. Sem isto, o recriado sumiria da ficha de onde o
  // usuário acabou de editá-lo.
  if (isEmptyValue(merged.customer_id) && !isEmptyValue(fallbackCustomerId)) {
    merged.customer_id = fallbackCustomerId;
  }
  return merged as T;
}
