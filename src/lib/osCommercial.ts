export interface OsCommercialItem {
  id?: string;
  item_type: 'servico' | 'mao_de_obra' | 'material';
  description: string;
  quantity: number;
  unit_price: number;
  total_price?: number;
  inventory_id?: string | null;
  service_type_id?: string | null;
}
export interface OsCommercialSummary {
  currency?: string;
  items: OsCommercialItem[];
  adjustment: number;
  total: number;
}
export interface OsReceipt {
  currency?: string;
  order_number?: number;
  scope?: 'consolidated' | 'payment';
  is_partial?: boolean;
  source_description?: string;
  source_total?: number | null;
  received_total?: number | null;
  remaining?: number | null;
  items?: { description: string; quantity: number; unit_price?: number; total_price?: number }[];
  received: number;
  company: { name: string; document?: string; address?: string; phone?: string; email?: string; logo_url?: string };
  customer: { name: string; document?: string };
  payments: { reference: string; amount: number; paid_date: string; method?: string }[];
}
export interface OsCommercialDocument { summary: OsCommercialSummary | null; receipt: OsReceipt | null }
export interface OsFieldBudget {
  is_billed?: boolean;
  revision: number;
  items: OsCommercialItem[];
  show_values: boolean;
  adjustment: number;
  total: number;
  can_price: boolean;
}
export interface OsFieldDraft {
  requestId: string;
  revision: number;
  items: OsCommercialItem[];
  show_values: boolean;
}
export const osCommercialLineTotal = (item: OsCommercialItem) => Math.round(item.quantity * Math.round(item.unit_price * 100)) / 100;
export function osCommercialError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === 'OSC01') return 'O orçamento mudou em outro dispositivo. Seu rascunho foi preservado. Confira a versão atual antes de reenviar.';
  if (code === 'OSC02') return 'Esta OS foi encerrada ou faturada. Reabra a OS ou ajuste o financeiro antes de alterar os itens.';
  if (code === '42501') return 'Você não tem permissão para esta alteração. Peça ao responsável pela empresa para revisar seu acesso.';
  if (code === 'OSC03' || code?.startsWith('22') || code?.startsWith('23')) return 'Confira a descrição, a quantidade e os valores dos itens antes de salvar.';
  return 'Não foi possível confirmar o salvamento. Seu rascunho continua neste aparelho. Tente novamente com internet.';
}
export const osFieldDraftKey = (companyId: string, userId: string, osId: string) => `dominex.osCommercial.v1.${companyId}.${userId}.${osId}`;
export function readOsFieldDraft(key: string): OsFieldDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return value && typeof value.requestId === 'string' && Number.isInteger(value.revision) && Array.isArray(value.items) ? value : null;
  } catch { return null; }
}

export function osBillingError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === 'OSC01') return 'O saldo ou o orçamento mudou. Confira os pagamentos atualizados antes de tentar novamente.';
  if (code === 'OSC02') return 'Esta OS já tem uma cobrança ou está cancelada. Confira a situação no Financeiro.';
  if (code === '42501') return 'Você não tem permissão para faturar ou receber nesta conta. Peça ao responsável para revisar seu acesso.';
  if (code === 'OSC03' || code?.startsWith('22') || code?.startsWith('23')) return 'Confira o valor, a categoria, a conta, a forma de pagamento e a data do recebimento.';
  return 'Não foi possível confirmar o recebimento. Confira os pagamentos atualizados. Ao tentar novamente com os mesmos dados, o sistema verifica o pedido anterior.';
}

/** Seleção nunca usa um pagamento antigo em cache após estorno. */
export function selectReceiptPayment(receipt: OsReceipt, reference: string): OsReceipt {
  if (reference === 'all') return receipt;
  const payment = receipt.payments.find(row => row.reference === reference);
  if (!payment || !(payment.amount > 0)) throw new Error('Recebimento indisponível.');
  return { ...receipt, scope: 'payment', payments: [payment], received: payment.amount,
    received_total: receipt.received_total ?? receipt.received,
    is_partial: receipt.is_partial === true || payment.amount < (receipt.source_total ?? receipt.received) };
}
