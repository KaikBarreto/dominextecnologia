import { fuzzyIncludes } from '@/lib/utils';

export interface SearchableFinancialTransaction {
  description?: string | null;
  category?: string | null;
  amount: number | string;
  customer?: { name?: string | null } | null;
}

/**
 * Busca usada na tela de Movimentacoes.
 *
 * O valor cru cobre digitacao sem mascara ("1250") e o formatado cobre a
 * forma que o usuario ve na tela ("R$ 1.250,50"). O formatador e recebido por
 * parametro para respeitar moeda/locale da empresa sem acoplar este motor ao
 * React.
 */
export function matchesFinancialTransactionSearch(
  transaction: SearchableFinancialTransaction,
  query: string,
  formatAmount: (amount: number) => string,
): boolean {
  const amount = Number(transaction.amount);
  const searchableAmount = Number.isFinite(amount) ? amount : 0;

  return (
    fuzzyIncludes(transaction.description, query)
    || fuzzyIncludes(transaction.category, query)
    || fuzzyIncludes(transaction.customer?.name, query)
    || fuzzyIncludes(String(searchableAmount), query)
    || fuzzyIncludes(formatAmount(searchableAmount), query)
  );
}

export interface ReceiptBreakdownTransaction {
  id: string;
  amount: number | string;
  transaction_type: 'entrada' | 'saida';
  description?: string | null;
  is_paid?: boolean;
  parent_transaction_id?: string | null;
  tenant_charge_id?: string | null;
}

export interface ReceiptBreakdown {
  gross: number;
  fee: number;
  net: number;
}

const toCents = (value: number | string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

/**
 * Identifica somente tarifas de recebimento geradas pelos fluxos oficiais.
 * Nao usa o nome da categoria: a categoria de sistema pode ser renomeada pelo
 * tenant. O prefixo da descricao e o contrato estavel dos builders/RPCs que
 * criam essas linhas.
 */
function isReceiptFee(transaction: ReceiptBreakdownTransaction): boolean {
  if (transaction.transaction_type !== 'saida' || transaction.is_paid === false) return false;
  const description = (transaction.description ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  return description.startsWith('tarifa do recebimento')
    || description.startsWith('tarifa de recebimento');
}

/**
 * Resolve bruto, tarifa e liquido de contas a receber sem alterar nenhum dado
 * financeiro. A tarifa pode estar:
 * - diretamente sob a conta (baixa total/manual);
 * - sob uma filha de recebimento parcial (neta da conta);
 * - vinculada pela mesma tenant_charge_id, no fluxo Asaas total legado/atual.
 *
 * Toda a aritmetica e feita em centavos para nao introduzir residuos de ponto
 * flutuante na exibicao financeira.
 */
export function buildReceiptBreakdowns(
  receivables: ReceiptBreakdownTransaction[],
  allTransactions: ReceiptBreakdownTransaction[],
): Map<string, ReceiptBreakdown> {
  const childrenByParent = new Map<string, ReceiptBreakdownTransaction[]>();
  const feesByCharge = new Map<string, ReceiptBreakdownTransaction[]>();

  for (const transaction of allTransactions) {
    if (transaction.parent_transaction_id) {
      const children = childrenByParent.get(transaction.parent_transaction_id) ?? [];
      children.push(transaction);
      childrenByParent.set(transaction.parent_transaction_id, children);
    }
    if (transaction.tenant_charge_id && isReceiptFee(transaction)) {
      const fees = feesByCharge.get(transaction.tenant_charge_id) ?? [];
      fees.push(transaction);
      feesByCharge.set(transaction.tenant_charge_id, fees);
    }
  }

  const result = new Map<string, ReceiptBreakdown>();

  for (const receivable of receivables) {
    const feeRows = new Map<string, ReceiptBreakdownTransaction>();
    const pendingIds = [receivable.id];
    const visited = new Set<string>();

    while (pendingIds.length > 0) {
      const parentId = pendingIds.pop()!;
      if (visited.has(parentId)) continue;
      visited.add(parentId);

      for (const child of childrenByParent.get(parentId) ?? []) {
        pendingIds.push(child.id);
        if (isReceiptFee(child)) feeRows.set(child.id, child);
      }
    }

    if (receivable.tenant_charge_id) {
      for (const fee of feesByCharge.get(receivable.tenant_charge_id) ?? []) {
        feeRows.set(fee.id, fee);
      }
    }

    const grossCents = toCents(receivable.amount);
    const feeCents = Array.from(feeRows.values())
      .reduce((sum, fee) => sum + toCents(fee.amount), 0);

    result.set(receivable.id, {
      gross: grossCents / 100,
      fee: feeCents / 100,
      net: (grossCents - feeCents) / 100,
    });
  }

  return result;
}
