import { kindLabels } from '@/utils/pdvCashClosingReport';
import type { CashExportMovementGroup } from './types';

/** Rótulos do tipo de movimentação: reaproveita o mapa do relatório de fechamento. */
export const CASH_EXPORT_KIND_LABELS: Record<string, string> = {
  ...kindLabels,
  opening: 'Abertura',
  refund: 'Estorno em dinheiro',
  reversal: 'Estorno ou devolução',
  sale_payment: 'Venda',
  sale_without_payment: 'Venda sem pagamento',
};

export const CASH_EXPORT_PAYMENT_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  transferencia: 'Transferência',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  fiado: 'Fiado',
  pontos: 'Pontos',
  voucher: 'Voucher',
  saldo_cliente: 'Saldo do cliente',
};

/** Ordem canônica das formas de pagamento na tela e nos totais. */
export const CASH_EXPORT_PAYMENT_ORDER = [
  'dinheiro', 'pix', 'transferencia', 'debito', 'credito', 'fiado', 'saldo_cliente', 'voucher', 'pontos',
] as const;

/** Formas que a tela oferece no filtro (pontos não existe no PDV ainda). */
export const CASH_EXPORT_PAYMENT_OPTIONS: readonly string[] = [
  'dinheiro', 'pix', 'transferencia', 'debito', 'credito', 'fiado', 'saldo_cliente', 'voucher',
];

export const CASH_EXPORT_NO_PAYMENT_LABEL = 'Sem forma de pagamento';

export const CASH_EXPORT_GROUPS: { id: CashExportMovementGroup; label: string }[] = [
  { id: 'sales', label: 'Vendas' },
  { id: 'cash_movements', label: 'Recebimentos e pagamentos em dinheiro' },
  { id: 'supplies', label: 'Suprimentos' },
  { id: 'withdrawals', label: 'Sangrias' },
  { id: 'refunds', label: 'Estornos e devoluções' },
  { id: 'closing_adjustments', label: 'Ajustes de fechamento' },
];

export function cashExportKindLabel(kind: string): string {
  return CASH_EXPORT_KIND_LABELS[kind] ?? 'Outra movimentação';
}

export function cashExportPaymentLabel(method: string | null | undefined): string {
  if (!method) return CASH_EXPORT_NO_PAYMENT_LABEL;
  return CASH_EXPORT_PAYMENT_LABELS[method] ?? method;
}

/** Lida no PDF e no Excel, junto dos totais. */
export const CASH_EXPORT_TOTALS_NOTE = 'Sobra, falta e retorno ao cofre aparecem na lista, mas não entram em Entradas e Saídas.';
