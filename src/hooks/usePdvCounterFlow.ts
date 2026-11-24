import { safePdvCouponError, PDV_COUPONS_ROOT } from '@/hooks/usePdvCoupons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidatePdvReportCaches } from '@/hooks/pdvReportCache';
import { PDV_CASH_V2_QUERY_ROOT } from '@/hooks/usePdvCashSessionsV2';

export type PdvWorkflowMode = 'simples' | 'balcao';
export type PdvFulfillmentMode = 'cashier' | 'dispatch';

export interface PdvWorkflowSettingsValue {
  pdvMode: PdvWorkflowMode;
  fulfillmentMode: PdvFulfillmentMode;
}

export interface PdvCounterCapability {
  mode: PdvWorkflowMode;
  fulfillmentMode: PdvFulfillmentMode;
  counterEnabled: boolean;
  dispatchEnabled: boolean;
  cashierDeliveryEnabled: boolean;
}

export interface PdvCashQueueRow {
  id: string;
  number: number;
  customerId: string | null;
  customerName: string | null;
  stockId: string;
  stockName: string | null;
  total: number;
  status: 'aguardando_pagamento';
  createdAt: string;
  reservationReady: boolean;
  couponRevision?: number;
}

export interface PdvCoveragePayment {
  method: 'dinheiro' | 'pix' | 'transferencia' | 'debito' | 'credito' | 'fiado' | 'saldo_cliente' | 'voucher';
  amount: number;
  account_id?: string | null;
  due_date?: string | null;
  due_date_mode?: 'none';
  reference_id?: string | null;
}

export interface PdvCoverOrderInput {
  orderId: string;
  terminalId: string;
  cashSessionId: string;
  cashAccountId: string;
  payments: PdvCoveragePayment[];
  attemptId: string;
  couponRevision?: number;
}

export function buildPdvCoverageRpcArgs(input: PdvCoverOrderInput): Record<string, unknown> {
  return {
    p_order_id: input.orderId,
    p_terminal_id: input.terminalId,
    p_cash_session_id: input.cashSessionId,
    p_cash_account_id: input.cashAccountId,
    p_payments: input.payments.map(({ method, amount, account_id, due_date, due_date_mode, reference_id }) => ({
      method,
      amount,
      ...(account_id ? { account_id } : {}),
      ...(due_date ? { due_date } : {}),
      ...(due_date_mode === 'none' ? { due_date_mode } : {}),
      ...(reference_id ? { reference_id } : {}),
    })),
    p_idempotency_key: input.attemptId,
    ...(input.couponRevision !== undefined ? { p_expected_coupon_revision: input.couponRevision } : {}),
  };
}

type RpcError = { code?: string; message?: string; details?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

const ROOT = ['pdv-counter'] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function codeOf(error: RpcError): string {
  return /(?:^|\s)code=([a-z0-9_]+)/i.exec(error.details ?? '')?.[1] ?? '';
}

export function mapPdvCounterError(error: unknown): Error {
  const raw = record(error) as RpcError;
  const code = codeOf(raw);
  if (code.startsWith('pdv_coupon_')) return safePdvCouponError(raw);
  const messages: Record<string, string> = {
    pdv_counter_mode_disabled: 'O fluxo de balcão não está ativo nas configurações do PDV.',
    pdv_counter_order_not_coverable: 'Este pedido não está mais aguardando pagamento.',
    pdv_counter_order_already_covered: 'Este pedido já recebeu pagamento ou fiado aprovado.',
    pdv_counter_session_invalid: 'Use um caixa v2 aberto por você neste terminal.',
    pdv_counter_terminal_invalid: 'Abra o caixa no mesmo local de estoque do pedido.',
    pdv_counter_reservation_conflict: 'O estoque deste pedido precisa ser reconciliado antes do recebimento.',
    pdv_counter_credit_limit_exceeded: 'O limite disponível do cliente não cobre este pedido.',
    pdv_counter_credit_forbidden: 'Seu perfil não permite aprovar venda no fiado.',
    pdv_fiado_due_date_invalid: 'Revise o vencimento do fiado.',
    pdv_fiado_installments_due_required: 'Informe o primeiro vencimento para parcelar o fiado.',
    pdv_counter_voucher_invalid: 'O voucher escolhido venceu, pertence a outro cliente ou não possui saldo suficiente.',
    pdv_counter_customer_balance_insufficient: 'O saldo disponível do cliente não cobre este valor.',
    pdv_counter_stored_value_customer_required: 'Selecione um cliente para usar saldo ou voucher.',
    pdv_counter_coverage_in_progress: 'Este recebimento ainda está sendo processado. Tente novamente em instantes.',
    pdv_counter_mode_invalid: 'Escolha uma forma válida de atendimento.',
    pdv_counter_fulfillment_invalid: 'Escolha se a retirada acontece no caixa ou na expedição.',
    pdv_counter_settings_missing: 'As configurações da empresa não estão disponíveis. Recarregue a página.',
    pdv_counter_active_flow_blocks_simple: 'Conclua ou cancele os atendimentos do balcão antes de ativar a venda direta.',
    pdv_counter_active_dispatch_blocks_cashier: 'Conclua as retiradas em andamento antes de entregar diretamente no caixa.',
    pdv_dispatch_disabled_for_cashier: 'Nesta empresa, a retirada acontece diretamente no caixa.',
  };
  if (messages[code]) return new Error(messages[code]);
  if (raw.code === '42501') return new Error('Seu perfil não permite esta ação no caixa.');
  if (!raw.code && /fetch|network|connection/i.test(raw.message ?? '')) {
    return new Error('Não foi possível acessar o servidor. Verifique sua conexão.');
  }
  return new Error('Não foi possível concluir o recebimento. Atualize a fila e tente novamente.');
}

async function call(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpc(name, args);
  if (error) throw mapPdvCounterError(error);
  return data;
}

export function projectPdvCounterCapability(payload: unknown): PdvCounterCapability {
  const value = record(payload);
  const mode: PdvWorkflowMode = value.mode === 'balcao' ? 'balcao' : 'simples';
  const fulfillmentMode: PdvFulfillmentMode = value.fulfillment_mode === 'cashier' ? 'cashier' : 'dispatch';
  return {
    mode,
    fulfillmentMode,
    counterEnabled: mode === 'balcao' && value.counter_enabled === true,
    dispatchEnabled: mode === 'balcao' && fulfillmentMode === 'dispatch' && value.dispatch_enabled === true,
    cashierDeliveryEnabled: mode === 'balcao' && fulfillmentMode === 'cashier' && value.cashier_delivery_enabled === true,
  };
}

export function projectPdvWorkflowSettings(payload: unknown): PdvWorkflowSettingsValue {
  const value = record(payload);
  return {
    pdvMode: value.pdv_mode === 'balcao' ? 'balcao' : 'simples',
    fulfillmentMode: value.fulfillment_mode === 'cashier' ? 'cashier' : 'dispatch',
  };
}

export function buildPdvWorkflowSaveArgs(settings: PdvWorkflowSettingsValue): Record<string, unknown> {
  return {
    p_pdv_mode: settings.pdvMode,
    p_fulfillment_mode: settings.fulfillmentMode,
  };
}

export function projectPdvCashQueue(payload: unknown): PdvCashQueueRow[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry) => {
    const value = record(entry);
    const id = text(value.id);
    const stockId = text(value.stock_id);
    const status = text(value.status);
    if (!id || !stockId || status !== 'aguardando_pagamento') return [];
    return [{
      id,
      number: numberValue(value.number),
      customerId: text(value.customer_id),
      customerName: text(value.customer_name),
      stockId,
      stockName: text(value.stock_name),
      total: numberValue(value.total),
      status: 'aguardando_pagamento' as const,
      createdAt: text(value.created_at) ?? '',
      reservationReady: value.reservation_ready === true,
      couponRevision: typeof value.coupon_revision === 'number' && Number.isSafeInteger(value.coupon_revision) && value.coupon_revision >= 0 ? value.coupon_revision : 0,
    }];
  });
}

export function usePdvCounterCapability() {
  return useQuery({
    queryKey: [...ROOT, 'capability'],
    queryFn: async () => projectPdvCounterCapability(await call('pdv_get_counter_capability_v2')),
    staleTime: 30_000,
  });
}

export function usePdvWorkflowSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...ROOT, 'settings'],
    queryFn: async () => projectPdvWorkflowSettings(await call('pdv_get_workflow_settings_v2')),
  });
  const save = useMutation({
    mutationFn: async (settings: PdvWorkflowSettingsValue) => projectPdvWorkflowSettings(
      await call('pdv_save_workflow_settings_v3', buildPdvWorkflowSaveArgs(settings)),
    ),
    onSuccess: async (data) => {
      queryClient.setQueryData([...ROOT, 'settings'], data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company-settings'] }),
        queryClient.invalidateQueries({ queryKey: ROOT }),
        queryClient.invalidateQueries({ queryKey: ['pdv-dispatch'] }),
        queryClient.invalidateQueries({ queryKey: ['pdv-orders'] }),
      ]);
    },
  });
  return { ...query, save };
}

export function usePdvCashQueue(cashSessionId: string | null, terminalId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...ROOT, 'cash-queue', cashSessionId, terminalId],
    queryFn: async () => projectPdvCashQueue(await call('pdv_list_cash_queue_v3', {
      p_cash_session_id: cashSessionId,
      p_terminal_id: terminalId,
    })),
    enabled: enabled && !!cashSessionId && !!terminalId,
    staleTime: 10_000,
  });
}

export function usePdvCoverOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PdvCoverOrderInput) => record(await call(input.couponRevision === undefined ? 'pdv_cover_existing_order_v2' : 'pdv_cover_existing_order_coupon_v1', buildPdvCoverageRpcArgs(input))),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...ROOT, 'cash-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['pdv-dispatch'] }),
        queryClient.invalidateQueries({ queryKey: ['pdv-cash'] }),
        queryClient.invalidateQueries({ queryKey: ['pdv-orders'] }),
        queryClient.invalidateQueries({ queryKey: PDV_COUPONS_ROOT }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['financial-transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['financial-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['pdv-customer-payment-options'] }),
        queryClient.invalidateQueries({ queryKey: ['party-account-v2'] }),
        queryClient.invalidateQueries({ queryKey: PDV_CASH_V2_QUERY_ROOT }),
        invalidatePdvReportCaches(queryClient),
      ]);
    },
  });
}
