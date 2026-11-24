import { invalidatePdvOrderProjections } from '@/hooks/pdvOperationalCache';
import { useEffect, useRef } from 'react';
import { isPdvModuleFeatureEnabled, usePdvModuleFeature } from '@/hooks/usePdvModuleFeatures';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidatePdvReportCaches, usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';
import { pdvMoneyCentsFromNumber } from '@/lib/pdv/afterSaleMoney';
import { PDV_COUPONS_ROOT } from '@/hooks/usePdvCoupons';

export const PDV_AFTER_SALE_QUERY_ROOT = ['pdv-after-sale-v2'] as const;

export type PdvAfterSaleRefundStatus = 'pending' | 'settled' | 'reversed';
export type PdvAfterSaleVoucherStatus = 'active' | 'exhausted' | 'expired' | 'reversed';

export interface PdvAfterSaleAccess {
  enabled: boolean;
  canView: boolean;
  canIssueVoucher: boolean;
  canRequestRefund: boolean;
  canConfirmRefund: boolean;
  canReverseRefund: boolean;
  canReverseVoucher: boolean;
  canCreateExchange: boolean;
  canApproveCredit: boolean;
}

export interface PdvAfterSaleCapabilities {
  view: boolean;
  issueVoucher: boolean;
  requestRefund: boolean;
  confirmRefund: boolean;
  reverseRefund: boolean;
  reverseVoucher: boolean;
  createExchange: boolean;
  applyVoucher: boolean;
  searchVoucher: boolean;
  useBankAccounts: boolean;
  approveCredit: boolean;
  directSaleVoucher: boolean;
}

export interface PdvAfterSalePayment {
  paymentId: string;
  method: 'dinheiro' | 'pix' | 'transferencia' | 'debito' | 'credito';
  paidAmount: number;
  refundedAmount: number;
  availableAmount: number;
}

export interface PdvAfterSaleVoucher {
  voucherId: string;
  publicCode: string;
  issuedOn: string;
  expiresOn: string | null;
  balance: number;
  status: PdvAfterSaleVoucherStatus;
  canReverse: boolean;
}

export interface PdvAfterSaleRefund {
  refundId: string;
  method: PdvAfterSalePayment['method'];
  amount: number;
  requestedOn: string;
  status: PdvAfterSaleRefundStatus;
  canConfirm: boolean;
  requiresConfirmationReference: boolean;
  canReverse: boolean;
  confirmationReferenceRedacted: string | null;
}

export interface PdvAfterSaleExchange {
  exchangeId: string;
  newOrderId: string;
  newOrderNumber: number;
  voucherAmount: number;
  creditAmount: number;
  differenceAmount: number;
}

export interface PdvAfterSaleReturn {
  returnId: string;
  occurredOn: string;
  reason: string;
  returnedValue: number;
  allocatedValue: number;
  unallocatedAmount: number;
  reallocatableAmount: number;
  availableAmount: number;
  allocatableValue: number;
  eligiblePayments: PdvAfterSalePayment[];
  vouchers: PdvAfterSaleVoucher[];
  refunds: PdvAfterSaleRefund[];
  exchanges: PdvAfterSaleExchange[];
}

export type PdvResidualVoucher = Pick<PdvAfterSaleVoucher, 'voucherId' | 'publicCode' | 'expiresOn' | 'balance'> & {
  issuedAmount: number | null; status: PdvAfterSaleVoucherStatus | null; canReverse: boolean; eligibilityKnown: boolean;
};
export type PdvResidualRefund = Pick<PdvAfterSaleRefund, 'refundId' | 'method' | 'amount' | 'status' | 'requiresConfirmationReference' | 'canConfirm' | 'canReverse'> & { eligibilityKnown: boolean };
export interface PdvAfterSaleResidual {
  cancellationId: string; orderId: string; occurredOn: string; reason: string;
  accessMasked: boolean;
  residualAmount: number | null; reductionAmount: number | null; creditedAmount: number | null; unallocatedAmount: number | null;
  financialStatus: 'allocated' | 'pending_disposition' | null; vouchers: PdvResidualVoucher[]; refunds: PdvResidualRefund[];
}

export interface PdvAfterSaleCashOption { sessionId: string; terminalId: string; terminalName: string; accountId: string; label: string }
export interface PdvAfterSaleAccountOption { accountId: string; label: string; methods: Array<'pix' | 'transferencia'> }
export interface PdvAfterSaleExchangeCandidate { orderId: string; orderNumber: number; total: number; status: string; createdAt: string; couponRevision?: number; targetTerminalId?: string | null; targetCashSessionId?: string | null; targetCashAccountId?: string | null; targetCashLabel?: string | null }
export interface PdvAfterSaleOrderCandidate extends PdvAfterSaleExchangeCandidate { canExchange: boolean; canApplyVoucher: boolean }

export interface PdvAfterSaleWorkspace {
  order: { orderId: string; orderNumber: number; customerId: string; status: string };
  capabilities: PdvAfterSaleCapabilities;
  cashOptions: PdvAfterSaleCashOption[];
  accountOptions: PdvAfterSaleAccountOption[];
  orderCandidates: PdvAfterSaleOrderCandidate[];
  exchangeCandidates: PdvAfterSaleExchangeCandidate[];
  returns: PdvAfterSaleReturn[];
  residualCancellation?: PdvAfterSaleResidual | null;
}

export interface PdvVoucherSearchItem {
  voucherId: string;
  publicCode: string;
  customerId: string;
  customerName: string;
  balance: number;
  expiresOn: string | null;
  status: PdvAfterSaleVoucherStatus;
}

export interface PdvVoucherSearchResult { items: PdvVoucherSearchItem[]; total: number; limit: number; offset: number }
export interface PdvAfterSaleAttempt { signature: string; id: string }

type RpcError = { code?: string; message?: string; details?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const requiredText = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Contrato inválido: ${field}.`);
  return value;
};
const optionalText = (value: unknown, field: string): string | null => value === null || value === undefined ? null : requiredText(value, field);
const requiredNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Contrato inválido: ${field}.`);
  return value;
};
const couponRevisionSnapshot = (value: unknown): { couponRevision?: number } => {
  if (value === undefined) return {};
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Não foi possível conferir o desconto do pedido. Atualize o pós-venda.');
  }
  return { couponRevision: value };
};
const targetCashSnapshot = (item: Record<string, unknown>): Pick<PdvAfterSaleExchangeCandidate, 'targetTerminalId' | 'targetCashSessionId' | 'targetCashAccountId' | 'targetCashLabel'> => {
  const values = [item.target_terminal_id, item.target_cash_session_id, item.target_cash_account_id, item.target_cash_label];
  if (values.every(value => value === undefined)) return {};
  if (!values.every(value => value === null) && !values.every(value => typeof value === 'string' && value.trim())) {
    throw new Error('Não foi possível conferir o caixa de destino. Atualize o pós-venda.');
  }
  return { targetTerminalId: values[0] as string | null, targetCashSessionId: values[1] as string | null,
    targetCashAccountId: values[2] as string | null, targetCashLabel: values[3] as string | null };
};
const requiredBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`Contrato inválido: ${field}.`);
  return value;
};
const isoDate = (value: unknown, field: string): string => {
  const parsed = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(parsed) || Number.isNaN(Date.parse(parsed.length === 10 ? `${parsed}T12:00:00Z` : parsed))) throw new Error(`Contrato inválido: ${field}.`);
  return parsed;
};
const list = <T>(value: unknown, projector: (entry: unknown, index: number) => T): T[] => {
  if (!Array.isArray(value)) throw new Error('O servidor retornou uma lista inválida.');
  return value.map(projector);
};

function domainCode(error: RpcError): string {
  return /(?:^|\s)code=([a-z0-9_]+)/i.exec(error.details ?? '')?.[1]?.toLowerCase() ?? '';
}

export function mapPdvAfterSaleError(error: unknown): Error {
  const raw = record(error) as RpcError;
  const code = domainCode(raw);
  const messages: Record<string, string> = {
    pdv_voucher_checkout_required: 'Escolha os vouchers ao receber o pedido no caixa, junto das demais formas de pagamento.',
    pdv_coupon_atomic_coverage_required: 'Este pedido usa cupom. Aplique os vouchers ao finalizar o pagamento no caixa.',
    pdv_coupon_order_total_zero: 'O desconto precisa deixar um valor a receber. Escolha outro cupom ou remova o cupom para continuar.',
    pdv_coupon_ineligible: 'Este cupom não pode mais ser usado. Revise o desconto do novo pedido antes de concluir a troca.',
    pdv_coupon_conflict: 'O desconto do novo pedido mudou. Atualize os dados antes de concluir a troca.',
    pdv_coupon_order_state: 'O novo pedido não está disponível para alterar o cupom.',
    pdv_coupon_invalid: 'Confira o cupom e o desconto do novo pedido.',
    pdv_return_value_not_available: 'O valor disponível desta devolução mudou. Atualize antes de continuar.',
    pdv_voucher_amount_invalid: 'Informe um valor de voucher válido, com no máximo duas casas decimais.',
    pdv_voucher_not_reversible: 'Este voucher já foi usado, venceu ou foi estornado.',
    pdv_refund_original_payment_invalid: 'A forma escolhida ainda não foi liquidada no pedido original.',
    pdv_refund_payment_amount_exceeded: 'O valor supera o saldo reembolsável desta forma de pagamento.',
    pdv_refund_cash_session_invalid: 'Escolha uma gaveta aberta e disponível para devolver o dinheiro.',
    pdv_refund_cash_session_forbidden: 'Você não pode usar a gaveta de outro operador.',
    pdv_refund_cash_insufficient: 'A gaveta não possui dinheiro suficiente para este reembolso.',
    pdv_refund_confirmation_reference_required: 'Informe a referência da confirmação feita no provedor.',
    pdv_exchange_target_cash_required: 'Atualize o pós-venda e confirme o caixa de destino antes de concluir a troca.',
    pdv_exchange_target_cash_denied: 'O caixa de destino mudou ou não está disponível para seu perfil. Atualize o pós-venda.',
    pdv_exchange_order_invalid: 'Escolha um novo pedido do mesmo cliente que ainda aguarde pagamento.',
    pdv_exchange_reservation_missing: 'O novo pedido precisa estar totalmente reservado antes da troca.',
    pdv_exchange_stock_insufficient: 'O estoque disponível mudou. Confira os materiais do novo pedido antes de concluir a troca.',
    pdv_exchange_coverage_mismatch: 'Voucher, saldo e diferença não fecham o total do novo pedido.',
    pdv_exchange_voucher_invalid: 'O voucher venceu, não pertence ao cliente ou não possui saldo suficiente.',
    pdv_voucher_insufficient: 'O voucher não possui saldo suficiente.',
    pdv_voucher_expired: 'Este voucher está vencido.',
    pdv_voucher_customer_inactive: 'O cliente deste voucher está inativo. Revise o cadastro antes de continuar.',
  };
  if (messages[code]) return new Error(messages[code]);
  if (raw.code === '42501' || /denied|forbidden|disabled/.test(code)) return new Error('Seu perfil não permite realizar esta ação.');
  if (raw.code === '55000' || /processing|in_progress/.test(code)) return new Error('Esta operação ainda está sendo processada. Aguarde e tente novamente.');
  if (!raw.code && /fetch|network|connection/i.test(raw.message ?? '')) return new Error('Não foi possível acessar o servidor. Verifique sua conexão.');
  return new Error('Não foi possível concluir esta ação. Atualize os dados e tente novamente.');
}

async function call(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpc(name, args);
  if (error) throw mapPdvAfterSaleError(error);
  return data;
}

export function stablePdvAfterSaleAttempt(previous: PdvAfterSaleAttempt | null, signature: string, createId: () => string): PdvAfterSaleAttempt {
  return previous?.signature === signature ? previous : { signature, id: createId() };
}

export function isPdvAfterSaleFeatureEnabled(payload: unknown, companyId: string | null | undefined): boolean {
  return isPdvModuleFeatureEnabled(payload, companyId, 'after_sale');
}

export function derivePdvAfterSaleAccess(input: { featureEnabled: boolean; privileged: boolean; hasPermissionRecord: boolean; permissions: readonly string[] }): PdvAfterSaleAccess {
  const allowed = (permission: string) => input.featureEnabled && (input.privileged || (input.hasPermissionRecord && (input.permissions.includes('*') || input.permissions.includes(permission))));
  return {
    enabled: input.featureEnabled,
    canView: allowed('fn:view_pdv_after_sale'),
    canIssueVoucher: allowed('fn:issue_pdv_voucher'),
    canRequestRefund: allowed('fn:refund_pdv_return'),
    canConfirmRefund: allowed('fn:confirm_pdv_refund'),
    canReverseRefund: allowed('fn:reverse_pdv_refund'),
    canReverseVoucher: allowed('fn:reverse_pdv_after_sale'),
    canCreateExchange: allowed('fn:cover_pdv_exchange'),
    canApproveCredit: allowed('fn:approve_pdv_credit'),
  };
}

export function getPdvVoucherOrderCandidates(workspace: PdvAfterSaleWorkspace): PdvAfterSaleOrderCandidate[] {
  return workspace.orderCandidates.filter((candidate) => candidate.canApplyVoucher);
}

export function getPdvExchangeOrderCandidates(workspace: PdvAfterSaleWorkspace): PdvAfterSaleExchangeCandidate[] {
  const exchangeIds = new Set(workspace.orderCandidates.filter((candidate) => candidate.canExchange).map((candidate) => candidate.orderId));
  return workspace.exchangeCandidates.filter((candidate) => exchangeIds.has(candidate.orderId));
}

const methods = new Set<PdvAfterSalePayment['method']>(['dinheiro', 'pix', 'transferencia', 'debito', 'credito']);
const voucherStatuses = new Set<PdvAfterSaleVoucherStatus>(['active', 'exhausted', 'expired', 'reversed']);
const refundStatuses = new Set<PdvAfterSaleRefundStatus>(['pending', 'settled', 'reversed']);

export function projectPdvResidualAfterSale(payload: unknown, orderId: string): PdvAfterSaleResidual | null {
  if (payload === null || payload === undefined) return null;
  const item = record(payload);
  if (item.order_id !== orderId || item.source_kind !== 'order_residual_cancellation_v3'
    || (item.access_masked !== undefined && typeof item.access_masked !== 'boolean')) throw new Error('Contrato inválido: residual.source.');
  const basic = { cancellationId: requiredText(item.cancellation_id, 'cancellation_id'), orderId,
    occurredOn: isoDate(item.occurred_on, 'occurred_on'), reason: requiredText(item.reason, 'reason') };
  if (item.access_masked === true) return { ...basic, accessMasked: true, residualAmount: null, reductionAmount: null,
    creditedAmount: null, unallocatedAmount: null, financialStatus: null, vouchers: [], refunds: [] };
  const money = (value: unknown): number => {
    const amount = requiredNumber(value, 'residual.amount');
    if (pdvMoneyCentsFromNumber(amount) === null) throw new Error('Contrato inválido: residual.amount.');
    return amount;
  };
  if (item.order_id !== orderId || item.source_kind !== 'order_residual_cancellation_v3'
    || !['allocated', 'pending_disposition'].includes(String(item.financial_status))) throw new Error('Contrato inválido: residual.source.');
  const residualAmount = money(item.residual_amount); const unallocatedAmount = money(item.unallocated_amount);
  if (unallocatedAmount > residualAmount || (item.financial_status === 'allocated') !== (unallocatedAmount === 0)) throw new Error('Contrato inválido: residual.allocation.');
  const dispositions = list(item.dispositions, entry => { const d = record(entry); const amount = requiredNumber(d.amount, 'disposition.amount'); if (pdvMoneyCentsFromNumber(Math.abs(amount)) === null) throw new Error('Contrato inválido: disposition.amount.'); return { kind: requiredText(d.disposition_kind, 'disposition_kind'), amount }; });
  const total = (kind: string) => Math.round(dispositions.filter(d => d.kind === kind).reduce((sum, d) => sum + d.amount, 0) * 100) / 100;
  return {
    ...basic, accessMasked: false, residualAmount, unallocatedAmount, reductionAmount: total('receivable_reduction'), creditedAmount: total('customer_credit'),
    financialStatus: item.financial_status as PdvAfterSaleResidual['financialStatus'],
    vouchers: list(item.vouchers, entry => {
      const v = record(entry); const known = v.can_reverse !== undefined && v.status !== undefined && v.issued_amount !== undefined;
      if (known && !voucherStatuses.has(v.status as PdvAfterSaleVoucherStatus)) throw new Error('Contrato inválido: voucher.status.');
      return { voucherId: requiredText(v.voucher_id, 'voucher_id'), publicCode: requiredText(v.public_code, 'public_code'),
        expiresOn: optionalText(v.expires_on, 'expires_on'), balance: money(v.balance),
        status: known ? v.status as PdvAfterSaleVoucherStatus : null, issuedAmount: known ? money(v.issued_amount) : null,
        eligibilityKnown: known, canReverse: known && requiredBoolean(v.can_reverse, 'can_reverse') };
    }),
    refunds: list(item.refunds, entry => {
      const r = record(entry); const known = r.can_confirm !== undefined && r.can_reverse !== undefined && r.requires_confirmation_reference !== undefined;
      if (!methods.has(r.method as PdvAfterSalePayment['method']) || !refundStatuses.has(r.status as PdvAfterSaleRefundStatus)) throw new Error('Contrato inválido: residual.refund.');
      return { refundId: requiredText(r.refund_id, 'refund_id'), method: r.method as PdvAfterSalePayment['method'], amount: money(r.amount), status: r.status as PdvAfterSaleRefundStatus,
        eligibilityKnown: known, canConfirm: known && requiredBoolean(r.can_confirm, 'can_confirm'), canReverse: known && requiredBoolean(r.can_reverse, 'can_reverse'),
        requiresConfirmationReference: known && requiredBoolean(r.requires_confirmation_reference, 'requires_confirmation_reference') };
    }),
  };
}

export function projectPdvAfterSaleWorkspace(payload: unknown): PdvAfterSaleWorkspace {
  const root = record(payload);
  const order = record(root.order);
  const capabilities = record(root.capabilities);
  const capability = (key: string) => requiredBoolean(capabilities[key], `capabilities.${key}`);
  return {
    order: {
      orderId: requiredText(order.order_id, 'order.order_id'),
      orderNumber: requiredNumber(order.order_number, 'order.order_number'),
      customerId: requiredText(order.customer_id, 'order.customer_id'),
      status: requiredText(order.status, 'order.status'),
    },
    capabilities: {
      view: capability('view'), issueVoucher: capability('issue_voucher'), requestRefund: capability('request_refund'),
      confirmRefund: capability('confirm_refund'), reverseRefund: capability('reverse_refund'), reverseVoucher: capability('reverse_voucher'),
      createExchange: capability('create_exchange'), applyVoucher: capability('apply_voucher'), searchVoucher: capability('search_voucher'),
      useBankAccounts: capability('use_bank_accounts'), approveCredit: capability('approve_credit'), directSaleVoucher: capability('direct_sale_voucher'),
    },
    cashOptions: list(root.cash_options, (entry, index) => {
      const item = record(entry);
      return { sessionId: requiredText(item.session_id, `cash_options.${index}.session_id`), terminalId: requiredText(item.terminal_id, `cash_options.${index}.terminal_id`), terminalName: requiredText(item.terminal_name, `cash_options.${index}.terminal_name`), accountId: requiredText(item.account_id, `cash_options.${index}.account_id`), label: requiredText(item.label, `cash_options.${index}.label`) };
    }),
    accountOptions: list(root.account_options, (entry, index) => {
      const item = record(entry);
      const allowedMethods = list(item.methods, (method) => {
        if (method !== 'pix' && method !== 'transferencia') throw new Error(`Contrato inválido: account_options.${index}.methods.`);
        return method;
      });
      return { accountId: requiredText(item.account_id, `account_options.${index}.account_id`), label: requiredText(item.label, `account_options.${index}.label`), methods: allowedMethods };
    }),
    orderCandidates: list(root.order_candidates, (entry, index) => {
      const item = record(entry);
      return {
        orderId: requiredText(item.order_id, `order_candidates.${index}.order_id`),
        orderNumber: requiredNumber(item.order_number, `order_candidates.${index}.order_number`),
        total: requiredNumber(item.total, `order_candidates.${index}.total`),
        status: requiredText(item.status, `order_candidates.${index}.status`),
        createdAt: isoDate(item.created_at, `order_candidates.${index}.created_at`),
        ...couponRevisionSnapshot(item.coupon_revision),
        ...targetCashSnapshot(item),
        canExchange: requiredBoolean(item.can_exchange, `order_candidates.${index}.can_exchange`),
        canApplyVoucher: requiredBoolean(item.can_apply_voucher, `order_candidates.${index}.can_apply_voucher`),
      };
    }),
    exchangeCandidates: list(root.exchange_candidates, (entry, index) => {
      const item = record(entry);
      return { orderId: requiredText(item.order_id, `exchange_candidates.${index}.order_id`), orderNumber: requiredNumber(item.order_number, `exchange_candidates.${index}.order_number`), total: requiredNumber(item.total, `exchange_candidates.${index}.total`), status: requiredText(item.status, `exchange_candidates.${index}.status`), createdAt: isoDate(item.created_at, `exchange_candidates.${index}.created_at`), ...couponRevisionSnapshot(item.coupon_revision), ...targetCashSnapshot(item) };
    }),
    residualCancellation: projectPdvResidualAfterSale(root.residual_cancellation, requiredText(order.order_id, 'order.order_id')),
    returns: list(root.returns, (entry, index) => {
      const item = record(entry);
      const unallocatedAmount = requiredNumber(item.unallocated_amount, `returns.${index}.unallocated_amount`);
      const reallocatableAmount = requiredNumber(item.reallocatable_amount, `returns.${index}.reallocatable_amount`);
      const availableAmount = requiredNumber(item.available_amount, `returns.${index}.available_amount`);
      const allocatableValue = requiredNumber(item.allocatable_value, `returns.${index}.allocatable_value`);
      const returnedValue = requiredNumber(item.returned_value, `returns.${index}.returned_value`);
      const allocatedValue = requiredNumber(item.allocated_value, `returns.${index}.allocated_value`);
      const unallocatedCents = pdvMoneyCentsFromNumber(unallocatedAmount);
      const reallocatableCents = pdvMoneyCentsFromNumber(reallocatableAmount);
      const availableCents = pdvMoneyCentsFromNumber(availableAmount);
      const legacyCents = pdvMoneyCentsFromNumber(allocatableValue);
      const returnedCents = pdvMoneyCentsFromNumber(returnedValue);
      const allocatedCents = pdvMoneyCentsFromNumber(allocatedValue);
      if (unallocatedCents === null || reallocatableCents === null || availableCents === null || legacyCents === null || returnedCents === null || allocatedCents === null || reallocatableCents !== availableCents || availableCents !== legacyCents || unallocatedCents > availableCents || allocatedCents !== returnedCents - availableCents) {
        throw new Error(`Contrato inválido: returns.${index}.available_amount.`);
      }
      return {
        returnId: requiredText(item.return_id, `returns.${index}.return_id`), occurredOn: isoDate(item.occurred_on, `returns.${index}.occurred_on`), reason: requiredText(item.reason, `returns.${index}.reason`),
        returnedValue, allocatedValue,
        unallocatedAmount, reallocatableAmount, availableAmount, allocatableValue,
        eligiblePayments: list(item.eligible_payments, (paymentEntry, paymentIndex) => {
          const payment = record(paymentEntry);
          if (!methods.has(payment.method as PdvAfterSalePayment['method'])) throw new Error(`Contrato inválido: returns.${index}.eligible_payments.${paymentIndex}.method.`);
          return { paymentId: requiredText(payment.payment_id, 'payment_id'), method: payment.method as PdvAfterSalePayment['method'], paidAmount: requiredNumber(payment.paid_amount, 'paid_amount'), refundedAmount: requiredNumber(payment.refunded_amount, 'refunded_amount'), availableAmount: requiredNumber(payment.available_amount, 'available_amount') };
        }),
        vouchers: list(item.vouchers, (voucherEntry) => {
          const voucher = record(voucherEntry);
          if (!voucherStatuses.has(voucher.status as PdvAfterSaleVoucherStatus)) throw new Error('Contrato inválido: voucher.status.');
          return { voucherId: requiredText(voucher.voucher_id, 'voucher_id'), publicCode: requiredText(voucher.public_code, 'public_code'), issuedOn: isoDate(voucher.issued_on, 'issued_on'), expiresOn: optionalText(voucher.expires_on, 'expires_on'), balance: requiredNumber(voucher.balance, 'balance'), status: voucher.status as PdvAfterSaleVoucherStatus, canReverse: requiredBoolean(voucher.can_reverse, 'can_reverse') };
        }),
        refunds: list(item.refunds, (refundEntry) => {
          const refund = record(refundEntry);
          if (!methods.has(refund.method as PdvAfterSalePayment['method']) || !refundStatuses.has(refund.status as PdvAfterSaleRefundStatus)) throw new Error('Contrato inválido: refund.');
          return { refundId: requiredText(refund.refund_id, 'refund_id'), method: refund.method as PdvAfterSalePayment['method'], amount: requiredNumber(refund.amount, 'amount'), requestedOn: isoDate(refund.requested_on, 'requested_on'), status: refund.status as PdvAfterSaleRefundStatus, canConfirm: requiredBoolean(refund.can_confirm, 'can_confirm'), requiresConfirmationReference: requiredBoolean(refund.requires_confirmation_reference, 'requires_confirmation_reference'), canReverse: requiredBoolean(refund.can_reverse, 'can_reverse'), confirmationReferenceRedacted: optionalText(refund.confirmation_reference_redacted, 'confirmation_reference_redacted') };
        }),
        exchanges: list(item.exchanges, (exchangeEntry) => {
          const exchange = record(exchangeEntry);
          return { exchangeId: requiredText(exchange.exchange_id, 'exchange_id'), newOrderId: requiredText(exchange.new_order_id, 'new_order_id'), newOrderNumber: requiredNumber(exchange.new_order_number, 'new_order_number'), voucherAmount: requiredNumber(exchange.voucher_amount, 'voucher_amount'), creditAmount: requiredNumber(exchange.credit_amount, 'credit_amount'), differenceAmount: requiredNumber(exchange.difference_amount, 'difference_amount') };
        }),
      };
    }),
  };
}

export function projectPdvVoucherSearch(payload: unknown): PdvVoucherSearchResult {
  const root = record(payload);
  return {
    items: list(root.items, (entry) => {
      const item = record(entry);
      if (!voucherStatuses.has(item.status as PdvAfterSaleVoucherStatus)) throw new Error('Contrato inválido: voucher.status.');
      return { voucherId: requiredText(item.voucher_id, 'voucher_id'), publicCode: requiredText(item.public_code, 'public_code'), customerId: requiredText(item.customer_id, 'customer_id'), customerName: requiredText(item.customer_name, 'customer_name'), balance: requiredNumber(item.balance, 'balance'), expiresOn: optionalText(item.expires_on, 'expires_on'), status: item.status as PdvAfterSaleVoucherStatus };
    }),
    total: requiredNumber(root.total, 'total'), limit: requiredNumber(root.limit, 'limit'), offset: requiredNumber(root.offset, 'offset'),
  };
}

export function usePdvAfterSaleFeature(companyId: string | null | undefined) {
  return usePdvModuleFeature(companyId, 'after_sale', PDV_AFTER_SALE_QUERY_ROOT);
}

export function usePdvAfterSaleWorkspace(orderId: string | null, enabled: boolean) {
  const scope = usePdvAuthorizedQueryScope();
  const ready = Boolean(orderId) && enabled && scope.ready;
  const signature = JSON.stringify([scope.key, orderId, ready]);
  const current = useRef<{ signature: string; epoch: string; mounted: boolean } | null>(null);
  if (!current.current || current.current.signature !== signature) current.current = { signature, epoch: crypto.randomUUID(), mounted: true };
  const token = current.current;
  useEffect(() => { token.mounted = true; return () => { token.mounted = false; }; }, [token]);
  const isCurrent = () => ready && token.mounted && current.current === token;
  const query = useQuery({
    queryKey: [...PDV_AFTER_SALE_QUERY_ROOT, ...scope.key, 'workspace', orderId, token.epoch], enabled: ready,
    staleTime: 5_000, gcTime: 0, placeholderData: () => undefined,
    queryFn: async ({ signal }) => {
      const request = rpc('pdv_get_after_sale_workspace_v2', { p_order_id: orderId }) as Promise<RpcResult> & { abortSignal?: (signal: AbortSignal) => Promise<RpcResult> };
      const result = await (request.abortSignal ? request.abortSignal(signal) : request);
      if (!isCurrent() || signal.aborted) throw new Error('O contexto do pedido mudou.');
      if (result.error) throw mapPdvAfterSaleError(result.error);
      const data = projectPdvAfterSaleWorkspace(result.data);
      if (data.order.orderId !== orderId) throw new Error('Não foi possível conferir os dados deste pedido.');
      return data;
    },
  });
  return { ...query, data: ready && isCurrent() ? query.data : undefined, scopeKey: token.epoch, isCurrent };
}

export function usePdvVoucherSearch(input: { query: string; customerId: string | null; limit?: number; offset?: number; enabled: boolean }) {
  const scope = usePdvAuthorizedQueryScope();
  return useQuery({ queryKey: [...PDV_AFTER_SALE_QUERY_ROOT, ...scope.key, 'vouchers', input.query, input.customerId, input.limit ?? 20, input.offset ?? 0], queryFn: () => call('pdv_search_vouchers_v2', { p_query: input.query.trim() || null, p_customer_id: input.customerId, p_limit: input.limit ?? 20, p_offset: input.offset ?? 0 }).then(projectPdvVoucherSearch), enabled: input.enabled && Boolean(input.customerId) && scope.ready, staleTime: 10_000, gcTime: 0 });
}

async function invalidateAfterSale(client: QueryClient, orderId: string | null) {
  await Promise.all([
    invalidatePdvOrderProjections(client),
    client.invalidateQueries({ queryKey: ['pdv-preorders', 'catalog'] }),
    client.invalidateQueries({ queryKey: PDV_AFTER_SALE_QUERY_ROOT }), client.invalidateQueries({ queryKey: ['pdv-returns'] }),
    client.invalidateQueries({ queryKey: ['party-account'] }), client.invalidateQueries({ queryKey: ['party-account-v2'] }),
    client.invalidateQueries({ queryKey: ['pdv-cash-sessions-v2'] }), client.invalidateQueries({ queryKey: ['pdv-cash-sessions'] }),
    client.invalidateQueries({ queryKey: ['financial-transactions'] }), client.invalidateQueries({ queryKey: ['pdv-orders'] }),
    client.invalidateQueries({ queryKey: ['pdv-dispatch'] }), client.invalidateQueries({ queryKey: PDV_COUPONS_ROOT }), invalidatePdvReportCaches(client),
    ...['pdv-stock-reservations', 'pdv-stock-availability', 'pdv-direct-sale-v2', 'pdv-counter', 'inventory', 'inventory-stock-levels', 'inventory-movements'].map(root => client.invalidateQueries({ queryKey: [root] })),
    ...(orderId ? [client.invalidateQueries({ queryKey: [...PDV_AFTER_SALE_QUERY_ROOT, 'workspace', orderId] })] : []),
  ]);
}

function mutation<T extends { orderId: string }>(client: QueryClient, fn: (input: T) => Promise<unknown>) {
  return { mutationFn: fn, onSuccess: async (_: unknown, input: T) => invalidateAfterSale(client, input.orderId) };
}

export function usePdvIssueVoucher() { const client = useQueryClient(); return useMutation(mutation(client, (input: { orderId: string; returnId: string; amount: string; expiresOn: string | null; attemptId: string }) => call('pdv_issue_return_voucher_v2', { p_return_id: input.returnId, p_amount: input.amount, p_expires_on: input.expiresOn, p_idempotency_key: input.attemptId }))); }
export function usePdvRequestRefund() { const client = useQueryClient(); return useMutation(mutation(client, (input: { orderId: string; returnId: string; paymentId: string; amount: string; reason: string; accountId: string | null; cashSessionId: string | null; attemptId: string }) => call('pdv_request_return_refund_v2', { p_return_id: input.returnId, p_original_payment_id: input.paymentId, p_amount: input.amount, p_reason: input.reason.trim(), p_account_id: input.accountId, p_cash_session_id: input.cashSessionId, p_idempotency_key: input.attemptId }))); }
export function usePdvConfirmRefund() { const client = useQueryClient(); return useMutation(mutation(client, (input: { orderId: string; refundId: string; accountId: string; confirmationReference: string; attemptId: string }) => call('pdv_confirm_return_refund_v2', { p_refund_id: input.refundId, p_account_id: input.accountId, p_confirmation_reference: input.confirmationReference.trim(), p_idempotency_key: input.attemptId }))); }
export function usePdvReverseRefund() { const client = useQueryClient(); return useMutation(mutation(client, (input: { orderId: string; refundId: string; reason: string; attemptId: string }) => call('pdv_reverse_return_refund_v2', { p_refund_id: input.refundId, p_reason: input.reason.trim(), p_idempotency_key: input.attemptId }))); }
export function usePdvReverseVoucher() { const client = useQueryClient(); return useMutation(mutation(client, (input: { orderId: string; voucherId: string; reason: string; attemptId: string }) => call('pdv_reverse_return_voucher_v2', { p_voucher_id: input.voucherId, p_reason: input.reason.trim(), p_idempotency_key: input.attemptId }))); }
export interface PdvExchangeCoverageInput {
  orderId: string; returnId: string; newOrderId: string; voucherId: string | null;
  voucherAmount: string; creditAmount: string; differenceMethod: string | null;
  differenceAccountId: string | null; cashSessionId: string | null; attemptId: string;
  couponRevision?: number; targetCashSessionId?: string | null;
}
export function buildPdvExchangeCoverageRpc(input: PdvExchangeCoverageInput) {
  if (!input.targetCashSessionId || input.couponRevision === undefined) throw new Error('Atualize o pós-venda e confirme o caixa de destino antes de concluir a troca.');
  couponRevisionSnapshot(input.couponRevision);
  return {
    name: 'pdv_cover_exchange_order_coupon_v2',
    args: {
      p_return_id: input.returnId, p_new_order_id: input.newOrderId, p_voucher_id: input.voucherId,
      p_voucher_amount: input.voucherAmount, p_credit_amount: input.creditAmount,
      p_difference_method: input.differenceMethod, p_difference_account_id: input.differenceAccountId,
      p_cash_session_id: input.cashSessionId, p_idempotency_key: input.attemptId,
      p_expected_coupon_revision: input.couponRevision, p_target_cash_session_id: input.targetCashSessionId,
    },
  };
}
export function usePdvCoverExchange() {
  const client = useQueryClient();
  return useMutation(mutation(client, (input: PdvExchangeCoverageInput) => {
    const operation = buildPdvExchangeCoverageRpc(input);
    return call(operation.name, operation.args);
  }));
}
export function usePdvApplyVoucherToOrder() { const client = useQueryClient(); return useMutation(mutation(client, (input: { orderId: string; voucherId: string; amount: string; attemptId: string }) => call('pdv_apply_voucher_to_order_v2', { p_order_id: input.orderId, p_voucher_id: input.voucherId, p_amount: input.amount, p_idempotency_key: input.attemptId }))); }
