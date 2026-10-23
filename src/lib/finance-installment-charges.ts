import type { CreateChargeInput, TenantChargeBillingType } from '@/hooks/useTenantCharges';

/**
 * Monta o lote de cobranças de um parcelamento que JÁ foi materializado no
 * Financeiro. Cada cobrança se liga à respectiva conta a receber por
 * `source_type = receivable`; assim a edge não cria outro lançamento e a
 * baixa do Asaas fecha exatamente a parcela correspondente.
 */
export function buildReceivableChargeRequests(args: {
  transactionIds: string[];
  plan: Array<{ number: number; date: string; amount: number }>;
  customerId: string;
  description: string;
  billingType: Exclude<TenantChargeBillingType, 'CREDIT_CARD'>;
}): CreateChargeInput[] {
  const { transactionIds, plan, customerId, description, billingType } = args;

  if (!customerId.trim()) {
    throw new Error('Selecione o cliente antes de gerar as cobranças.');
  }
  if (transactionIds.length !== plan.length || plan.length === 0) {
    throw new Error('As parcelas foram salvas, mas não foi possível relacioná-las às cobranças.');
  }

  return plan.map((installment, index) => ({
    customer_id: customerId,
    value: installment.amount,
    due_date: installment.date,
    billing_type: billingType,
    description: `${description} (${installment.number}/${plan.length})`,
    source_type: 'receivable',
    source_id: transactionIds[index],
  }));
}
