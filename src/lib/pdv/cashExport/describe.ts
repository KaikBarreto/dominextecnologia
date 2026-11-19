import { CASH_EXPORT_GROUPS, CASH_EXPORT_PAYMENT_OPTIONS, cashExportPaymentLabel } from './labels';
import type { CashExportFilters } from './types';

/** yyyy-MM-dd para dd/MM/yyyy, sem passar por Date (nada de virar o dia por fuso). */
export function civilDateToBr(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function describeCashExportPeriod(from: string, to: string): string {
  return from === to ? civilDateToBr(from) : `${civilDateToBr(from)} a ${civilDateToBr(to)}`;
}

/** Texto curto dos filtros para o cabeçalho do PDF e do Excel. */
export function describeCashExportFilters(filters: CashExportFilters): string {
  const allGroups = CASH_EXPORT_GROUPS.every((group) => filters.groups.includes(group.id));
  const groups = allGroups
    ? 'todos os tipos de movimentação'
    : CASH_EXPORT_GROUPS.filter((group) => filters.groups.includes(group.id)).map((group) => group.label).join(', ');
  const allPayments = CASH_EXPORT_PAYMENT_OPTIONS.every((method) => filters.paymentMethods.includes(method));
  const payments = allPayments
    ? 'todas as formas de pagamento'
    : CASH_EXPORT_PAYMENT_OPTIONS.filter((method) => filters.paymentMethods.includes(method)).map(cashExportPaymentLabel).join(', ');
  const cancelled = filters.includeCancelled ? 'com vendas canceladas' : 'sem vendas canceladas';
  return `${groups}; ${payments}; ${cancelled}`;
}
