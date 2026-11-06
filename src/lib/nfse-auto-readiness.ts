/**
 * Prontidão mínima da NFS-e automática por contrato.
 *
 * A automação não inventa valor: ela só consegue criar uma nota quando existe
 * uma parcela de receita do contrato para a competência. Esta regra fica pura
 * para ser compartilhada pelo detalhe do contrato e pela fila fiscal.
 */

export interface NfseAutoReadinessTransaction {
  id?: string;
  contract_id: string | null;
  tenant_charge_id?: string | null;
  transaction_type: string;
  amount: number | null;
  due_date: string | null;
  transaction_date: string | null;
  cancelled_at: string | null;
  parent_transaction_id: string | null;
  category: string | null;
}

export interface NfseAutoReadinessContract {
  id: string;
  name: string;
}

export interface NfseAutoReadinessSubscription {
  id?: string;
  source_id: string | null;
  status: string;
  next_due_date: string | null;
  value: number | null;
  hasFinanceSyncError?: boolean;
}

export type NfseAutoReadinessState =
  | 'ready_installment'
  | 'waiting_asaas_cycle'
  | 'missing_source'
  | 'sync_error';

export interface ContractNfseAutoReadiness {
  contract: NfseAutoReadinessContract;
  state: NfseAutoReadinessState;
  source: 'asaas' | 'contract' | null;
  nextDate: string | null;
  amount: number | null;
  subscriptionStatus: string | null;
}

/** Primeiro dia do mês da empresa, sem converter por UTC. */
export function nfseReadinessMonthStart(todayIso: string): string {
  return `${todayIso.slice(0, 7)}-01`;
}

/**
 * Parcela que pode fornecer valor e competência para uma nota atual ou futura.
 * Espelha as guardas dos produtores de `nfse_auto_jobs`.
 */
export function isCurrentOrFutureNfseInstallment(
  transaction: NfseAutoReadinessTransaction,
  todayIso: string,
): boolean {
  if (!transaction.contract_id) return false;
  if (transaction.transaction_type !== 'entrada') return false;
  if (transaction.cancelled_at || transaction.parent_transaction_id) return false;
  if (transaction.category === 'Recebimento parcial') return false;
  if (!(Number(transaction.amount) > 0)) return false;

  const competenceDate = transaction.due_date || transaction.transaction_date;
  return !!competenceDate && competenceDate >= nfseReadinessMonthStart(todayIso);
}

export function contractsWithoutCurrentOrFutureNfseInstallment(
  contracts: NfseAutoReadinessContract[],
  transactions: NfseAutoReadinessTransaction[],
  todayIso: string,
): NfseAutoReadinessContract[] {
  const readyContractIds = new Set(
    transactions
      .filter((transaction) => isCurrentOrFutureNfseInstallment(transaction, todayIso))
      .map((transaction) => transaction.contract_id as string),
  );

  return contracts.filter((contract) => !readyContractIds.has(contract.id));
}

/**
 * Classifica a origem real do valor da próxima nota sem induzir o usuário a
 * cadastrar uma segunda recorrência quando o Asaas já é a fonte canônica.
 */
export function classifyContractNfseAutoReadiness(
  contract: NfseAutoReadinessContract,
  transactions: NfseAutoReadinessTransaction[],
  subscriptions: NfseAutoReadinessSubscription[],
  todayIso: string,
): ContractNfseAutoReadiness {
  const installment = transactions
    .filter((transaction) =>
      transaction.contract_id === contract.id &&
      isCurrentOrFutureNfseInstallment(transaction, todayIso))
    .sort((a, b) => {
      const dateA = a.due_date || a.transaction_date || '';
      const dateB = b.due_date || b.transaction_date || '';
      return dateA.localeCompare(dateB);
    })[0];

  const contractSubscriptions = subscriptions.filter((item) =>
    item.source_id === contract.id && item.status !== 'cancelled');
  const subscription = contractSubscriptions.find((item) => item.hasFinanceSyncError)
    ?? contractSubscriptions[0]
    ?? null;

  if (subscription?.hasFinanceSyncError || contractSubscriptions.length > 1) {
    return {
      contract,
      state: 'sync_error',
      source: 'asaas',
      nextDate: subscription?.next_due_date ?? null,
      amount: subscription?.value == null ? null : Number(subscription.value),
      subscriptionStatus: subscription?.status ?? null,
    };
  }

  if (installment) {
    return {
      contract,
      state: 'ready_installment',
      source: subscription ? 'asaas' : 'contract',
      nextDate: installment.due_date || installment.transaction_date,
      amount: Number(installment.amount),
      subscriptionStatus: subscription?.status ?? null,
    };
  }

  if (!subscription) {
    return {
      contract,
      state: 'missing_source',
      source: null,
      nextDate: null,
      amount: null,
      subscriptionStatus: null,
    };
  }

  const waitingForFutureCycle =
    subscription.status === 'active' &&
    !!subscription.next_due_date &&
    subscription.next_due_date > todayIso;

  return {
    contract,
    state: waitingForFutureCycle ? 'waiting_asaas_cycle' : 'sync_error',
    source: 'asaas',
    nextDate: subscription.next_due_date,
    amount: subscription.value == null ? null : Number(subscription.value),
    subscriptionStatus: subscription.status,
  };
}

export function classifyNfseAutoReadiness(
  contracts: NfseAutoReadinessContract[],
  transactions: NfseAutoReadinessTransaction[],
  subscriptions: NfseAutoReadinessSubscription[],
  todayIso: string,
): ContractNfseAutoReadiness[] {
  return contracts.map((contract) =>
    classifyContractNfseAutoReadiness(contract, transactions, subscriptions, todayIso));
}
