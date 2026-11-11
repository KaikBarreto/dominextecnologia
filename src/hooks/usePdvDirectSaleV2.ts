import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SettlePaymentPayload } from '@/lib/pdv/payment';
import { invalidatePdvReportCaches } from '@/hooks/pdvReportCache';
import { PDV_CASH_V2_QUERY_ROOT } from '@/hooks/usePdvCashSessionsV2';

type RpcError = { code?: string; message?: string; details?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const callRpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

export interface PdvDirectSaleCapabilityV2 { enabled: boolean; contractVersion: 2 }
export type PdvDirectSaleContract = 'legacy' | 'v2' | 'blocked';
export interface PdvDirectSaleAvailabilityV2 {
  stockId: string; availableQuantity: number; hasConflict: boolean;
}
export interface PdvDirectSaleMaterialV2 {
  id: string; name: string; sku: string | null; barcode: string | null;
  unit: string; salePrice: number | null; imageUrl: string | null; groupId: string | null;
  availableByStock: PdvDirectSaleAvailabilityV2[];
}
export interface PdvDirectSaleOptionV2 { id: string; name: string }
export interface PdvDirectSaleTerminalV2 extends PdvDirectSaleOptionV2 { stockId: string }
export interface PdvDirectSaleSessionV2 {
  id: string; terminalId: string; cashAccountId: string; openedAt: string;
}
export interface PdvDirectSaleBankAccountV2 extends PdvDirectSaleOptionV2 {
  type: string; color: string | null; institutionCode: number | null;
  institutionName: string | null; bankName: string | null;
}
export interface PdvDirectSaleCatalogV2 {
  materials: PdvDirectSaleMaterialV2[]; customers: PdvDirectSaleOptionV2[];
  terminals: PdvDirectSaleTerminalV2[]; sessions: PdvDirectSaleSessionV2[];
  cashAccount: PdvDirectSaleOptionV2 | null; bankAccounts: PdvDirectSaleBankAccountV2[];
}
export interface PdvDirectSaleItemV2 {
  inventoryId: string; stockId: string; quantity: number;
  unitPrice: number | null; discountAmount: number;
}
export interface PdvCompleteDirectSaleV2Input {
  attemptId: string; terminalId: string; cashSessionId: string; cashAccountId: string;
  customerId: string | null; items: PdvDirectSaleItemV2[];
  orderDiscountAmount: number; notes?: string | null; transactionDate?: string | null;
  payments: SettlePaymentPayload[];
}
export interface PdvCompleteDirectSaleV2Result {
  orderId: string; orderNumber: number; deliveryId: string;
  subtotal: number; discountAmount: number; total: number; idempotent: boolean;
}
export interface PdvDirectSaleAttemptV2 { signature: string; id: string }

export class PdvDirectSaleV2Error extends Error {
  constructor(message: string, public readonly domainCode: string) { super(message); }
}

const text = (value: unknown) => typeof value === 'string' ? value : null;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const list = (value: unknown) => Array.isArray(value) ? value : [];

function detailCode(error: RpcError): string {
  return /(?:^|\s)code=([a-z0-9_]+)/i.exec(error.details ?? '')?.[1] ?? 'pdv_direct_sale_unknown';
}

export function mapPdvDirectSaleV2Error(error: RpcError): PdvDirectSaleV2Error {
  const code = detailCode(error);
  const messages: Record<string, string> = {
    pdv_direct_sale_rollout_disabled: 'A nova venda direta ainda não está liberada para esta empresa.',
    pdv_direct_sale_screen_denied: 'Você não tem permissão para operar a venda do PDV.',
    pdv_direct_sale_forbidden: 'Você não tem permissão para concluir esta venda.',
    pdv_direct_sale_context_required: 'Abra um caixa v2 neste terminal antes de finalizar.',
    pdv_direct_sale_terminal_invalid: 'O terminal ou local de estoque não está disponível.',
    pdv_direct_sale_stock_mismatch: 'Use o local de estoque configurado neste terminal.',
    pdv_direct_sale_session_invalid: 'Use um caixa v2 aberto por você neste terminal.',
    pdv_direct_sale_customer_invalid: 'Cliente não encontrado nesta empresa.',
    pdv_direct_sale_inventory_invalid: 'Um material não está disponível neste local.',
    pdv_direct_sale_bank_forbidden: 'Você não tem permissão para receber em conta bancária.',
    pdv_direct_sale_bank_invalid: 'A conta bancária selecionada não está disponível.',
    pdv_direct_sale_credit_customer_required: 'Venda no fiado exige um cliente identificado.',
    pdv_direct_sale_credit_forbidden: 'Você não tem permissão para aprovar venda no fiado.',
    pdv_direct_sale_credit_limit_exceeded: 'O limite disponível do cliente não cobre esta venda.',
    pdv_direct_sale_due_date_invalid: 'O vencimento do fiado não pode estar no passado.',
    pdv_direct_sale_coverage_mismatch: 'A soma das formas de pagamento deve ser igual ao total.',
    pdv_direct_sale_in_progress: 'Esta venda já está em processamento. Aguarde e tente novamente.',
    pdv_direct_sale_payload_invalid: 'Revise os itens e as formas de pagamento.',
    pdv_direct_sale_cart_invalid: 'Revise as quantidades dos itens.',
    pdv_direct_sale_cart_header_invalid: 'Revise o desconto, a data e as observações da venda.',
    pdv_direct_sale_cart_header_value_invalid: 'Revise o desconto e a data da venda.',
    pdv_direct_sale_cart_shape_invalid: 'Um item da venda possui dados inválidos.',
    pdv_direct_sale_payments_invalid: 'Revise as formas de pagamento.',
    pdv_direct_sale_future_date: 'A data da venda não pode estar no futuro.',
    pdv_direct_sale_line_discount_exceeded: 'O desconto de um item é maior que seu valor.',
    pdv_direct_sale_order_discount_exceeded: 'O desconto geral é maior que o valor dos itens.',
    pdv_direct_sale_price_override_forbidden: 'Você não tem permissão para alterar o preço de venda.',
    pdv_direct_sale_discount_forbidden: 'Você não tem permissão para aplicar desconto.',
    pdv_direct_sale_backdate_forbidden: 'Você não tem permissão para alterar a data da venda.',
  };
  return new PdvDirectSaleV2Error(
    messages[code] ?? 'Não foi possível concluir a venda. Revise os dados e tente novamente.', code,
  );
}

export function projectPdvDirectSaleCapabilityV2(payload: unknown): PdvDirectSaleCapabilityV2 {
  const value = object(payload);
  if (typeof value?.enabled !== 'boolean' || value.contract_version !== 2) {
    throw new PdvDirectSaleV2Error(
      'Não foi possível confirmar a versão segura da venda. Atualize a tela e tente novamente.',
      'pdv_direct_sale_capability_invalid',
    );
  }
  return { enabled: value.enabled, contractVersion: 2 };
}

export function selectPdvSaleContract(input: {
  loading: boolean; error: unknown; capability?: PdvDirectSaleCapabilityV2;
}): PdvDirectSaleContract {
  if (input.loading || input.error || !input.capability) return 'blocked';
  return input.capability.enabled ? 'v2' : 'legacy';
}

export function shouldUseLegacyPdvRoute(search: string): boolean {
  return new URLSearchParams(search).has('editar');
}

export function canonicalizePdvDirectSalePayments(payments: SettlePaymentPayload[]) {
  return payments
    .map((payment) => ({
      method: payment.method,
      amount: payment.amount,
      change_amount: payment.change_amount ?? 0,
      account_id: payment.account_id ?? null,
      due_date: payment.due_date ?? null,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function resolvePdvDirectSaleAttemptV2(
  current: PdvDirectSaleAttemptV2 | null,
  signature: string,
  createId: () => string = () => crypto.randomUUID(),
): PdvDirectSaleAttemptV2 {
  return current?.signature === signature ? current : { signature, id: createId() };
}

export function projectPdvDirectSaleCatalogV2(payload: unknown): PdvDirectSaleCatalogV2 {
  const value = object(payload);
  const options = (items: unknown) => list(items).flatMap((raw) => {
    const item = object(raw); const id = text(item?.id); const name = text(item?.name);
    return id && name ? [{ id, name }] : [];
  });
  return {
    materials: list(value?.materials).flatMap((raw) => {
      const item = object(raw); const id = text(item?.id); const name = text(item?.name);
      if (!id || !name) return [];
      return [{
        id, name, sku: text(item?.sku), barcode: text(item?.barcode),
        unit: text(item?.unit) ?? 'un', salePrice: number(item?.sale_price), imageUrl: text(item?.image_url),
        groupId: text(item?.group_id),
        availableByStock: list(item?.available_by_stock).flatMap((rawStock) => {
          const stock = object(rawStock); const stockId = text(stock?.stock_id);
          const availableQuantity = number(stock?.available_quantity);
          return stockId && availableQuantity != null
            ? [{ stockId, availableQuantity, hasConflict: stock?.has_conflict === true }] : [];
        }),
      }];
    }),
    customers: options(value?.customers),
    terminals: list(value?.terminals).flatMap((raw) => {
      const item = object(raw); const id = text(item?.id); const name = text(item?.name); const stockId = text(item?.stock_id);
      return id && name && stockId ? [{ id, name, stockId }] : [];
    }),
    sessions: list(value?.sessions).flatMap((raw) => {
      const item = object(raw); const id = text(item?.id); const terminalId = text(item?.terminal_id);
      const cashAccountId = text(item?.cash_account_id); const openedAt = text(item?.opened_at);
      return id && terminalId && cashAccountId && openedAt ? [{ id, terminalId, cashAccountId, openedAt }] : [];
    }),
    cashAccount: options(value?.cash_account ? [value.cash_account] : [])[0] ?? null,
    bankAccounts: list(value?.bank_accounts).flatMap((raw) => {
      const item = object(raw); const id = text(item?.id); const name = text(item?.name); const type = text(item?.type);
      return id && name && type ? [{ id, name, type, color: text(item?.color),
        institutionCode: number(item?.institution_code), institutionName: text(item?.institution_name),
        bankName: text(item?.bank_name) }] : [];
    }),
  };
}

export function buildPdvDirectSaleV2RpcPayload(input: PdvCompleteDirectSaleV2Input, idempotencyKey: string) {
  return {
    p_terminal_id: input.terminalId,
    p_cash_session_id: input.cashSessionId,
    p_cash_account_id: input.cashAccountId,
    p_customer_id: input.customerId,
    p_cart: {
      items: input.items.map((item) => ({
        inventory_id: item.inventoryId, stock_id: item.stockId, quantity: item.quantity,
        unit_price: item.unitPrice, discount_amount: item.discountAmount,
      })),
      order_discount_amount: input.orderDiscountAmount,
      notes: input.notes?.trim() || null,
      transaction_date: input.transactionDate || null,
    },
    p_payments: input.payments.map((payment) => ({
      method: payment.method, amount: payment.amount,
      ...(payment.change_amount ? { change_amount: payment.change_amount } : {}),
      ...(payment.account_id ? { account_id: payment.account_id } : {}),
      ...(payment.due_date ? { due_date: payment.due_date } : {}),
    })),
    p_idempotency_key: idempotencyKey,
  };
}

function projectResult(payload: unknown): PdvCompleteDirectSaleV2Result {
  const value = object(payload); const orderId = text(value?.order_id); const orderNumber = number(value?.order_number);
  const deliveryId = text(value?.delivery_id); const total = number(value?.total);
  if (!orderId || orderNumber == null || !deliveryId || total == null) {
    throw new PdvDirectSaleV2Error('O servidor retornou uma venda inválida.', 'pdv_direct_sale_invalid_response');
  }
  return { orderId, orderNumber, deliveryId, total,
    subtotal: number(value?.subtotal) ?? total,
    discountAmount: number(value?.discount_amount) ?? 0,
    idempotent: value?.idempotent === true };
}

export function usePdvDirectSaleV2() {
  const queryClient = useQueryClient();
  const attemptKeys = useRef(new Map<string, string>());
  const capability = useQuery({
    queryKey: ['pdv-direct-sale-v2', 'capability'],
    queryFn: async () => { const { data, error } = await callRpc('pdv_get_direct_sale_capability_v2');
      if (error) throw mapPdvDirectSaleV2Error(error); return projectPdvDirectSaleCapabilityV2(data); },
    staleTime: 30_000,
  });
  const catalog = useQuery({
    queryKey: ['pdv-direct-sale-v2', 'catalog'], enabled: capability.data?.enabled === true,
    queryFn: async () => { const { data, error } = await callRpc('pdv_get_direct_sale_catalog_v2');
      if (error) throw mapPdvDirectSaleV2Error(error); return projectPdvDirectSaleCatalogV2(data); },
    staleTime: 15_000,
  });
  const complete = useMutation({
    mutationFn: async (input: PdvCompleteDirectSaleV2Input) => {
      let key = attemptKeys.current.get(input.attemptId);
      if (!key) { key = `direct-sale-${crypto.randomUUID()}`; attemptKeys.current.set(input.attemptId, key); }
      const { data, error } = await callRpc('pdv_complete_direct_sale_rollout_v2', buildPdvDirectSaleV2RpcPayload(input, key));
      if (error) throw mapPdvDirectSaleV2Error(error); return projectResult(data);
    },
    onSuccess: async () => {
      const invalidations = ([['inventory'],['inventory-stock-levels'],['inventory-movements'],
        ['pdv-stock-reservations'],['pdv-stock-availability'],['financial-accounts'],
        ['account-balances'],['financial-transactions'],['financial-summary'],['pdv-cofre-balance'],
        ['pdv-cash-sessions'],['pdv-cash-session-detail'],['pdv-customer-credit'],['pdv-orders'],
        ['pdv-direct-sale-v2'],PDV_CASH_V2_QUERY_ROOT] as const).map((key) => queryClient.invalidateQueries({ queryKey: [...key] }));
      await Promise.all([...invalidations, invalidatePdvReportCaches(queryClient)]);
    },
  });
  return {
    capability, catalog, complete,
    contract: selectPdvSaleContract({ loading: capability.isLoading, error: capability.error, capability: capability.data }),
    releaseAttempt: (attemptId: string) => attemptKeys.current.delete(attemptId),
  };
}
