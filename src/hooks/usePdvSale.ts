import { invalidatePdvCatalogCaches, invalidatePdvOrderProjections } from '@/hooks/pdvOperationalCache';
/**
 * Operações históricas do PDV: liquidação de pedido existente, substituição
 * atômica e anexos. Novas vendas pertencem a usePdvDirectSaleV2 e são criadas
 * com itens, pagamento e estoque em uma única transação idempotente.
 *
 * O criador antigo permanece como barreira explícita para chamadas antigas:
 * nunca grava um cabeçalho separado dos itens. Leitura e operações históricas
 * continuam disponíveis sem converter nem regravar o histórico financeiro.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRef } from 'react';
import { usePdvAuthorizedQueryScope, invalidatePdvReportCaches } from '@/hooks/pdvReportCache';
import { sanitizeStorageFileName } from '@/utils/storagePath';
import { currentCompanyId, tenantFileOptions } from '@/utils/tenantStorage';
import type { SettlePaymentPayload } from '@/lib/pdv/payment';
import type { Json } from '@/integrations/supabase/types';

/** Uma linha do cupom. `inventoryId` nulo = serviço avulso de balcão. */
export interface PdvSaleItemInput {
  inventoryId: string | null;
  /** SNAPSHOT do nome: o cupom não pode mudar porque alguém renomeou o produto. */
  description: string;
  quantity: number;
  /** Snapshot da unidade comercial exibida no cupom e no historico. */
  unit: string;
  unitPrice: number;
  /** SNAPSHOT do custo. É o que faz o lucro real do caixa. */
  unitCost: number;
  /** Desconto absoluto total da linha. */
  discountAmount: number;
}

export interface PdvCreateOrderInput {
  customerId: string | null;
  terminalId: string | null;
  stockId: string | null;
  cashSessionId: string | null;
  discountAmount: number;
  items: PdvSaleItemInput[];
  /** `pdv_orders.notes` — observação livre do pedido, pedido do CEO 2026-10-19. */
  notes?: string | null;
  /** Venda cancelada que originou este novo pedido pelo fluxo de edição. */
  replacesOrderId?: string | null;
}

export interface PdvReplaceOrderInput extends Omit<PdvCreateOrderInput, 'replacesOrderId'> {
  sourceOrderId: string;
  payments: SettlePaymentPayload[];
  clientRequestId: string;
  transactionDate?: string | null;
}

/** Resumo que `pdv_settle_order` devolve. */
export interface PdvSettleResult {
  order_id: string;
  numero: number;
  status: string;
  total: number;
  subtotal: number;
  desconto: number;
  itens: number;
  pagamentos: Array<{
    payment_id: string;
    method: string;
    amount: number;
    change_amount: number;
    account_id: string | null;
    transaction_id: string | null;
    received_at: string;
  }>;
  estoque: {
    baixado?: boolean;
    ja_baixado?: boolean;
    movimentos?: Array<{
      inventory_id: string | null;
      descricao: string;
      quantidade: number;
      stock_before: number;
      stock_after: number;
    }>;
  } | null;
  /** `local_nao_e_de_loja`, `cliente_sem_limite_definido`, `saldo_negativo`… */
  avisos: Array<string | Record<string, unknown>>;
  /** `true` quando esta chamada era um retry da mesma `client_request_id`. */
  idempotente: boolean;
  modo?: string;
}

export async function invalidatePdvSaleCaches(queryClient: QueryClient) {
  await Promise.all([
    invalidatePdvOrderProjections(queryClient),
    invalidatePdvCatalogCaches(queryClient),
    queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] }),
    queryClient.invalidateQueries({ queryKey: ['inventory-movements'] }),
    queryClient.invalidateQueries({ queryKey: ['financial-accounts'] }),
    queryClient.invalidateQueries({ queryKey: ['account-balances'] }),
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] }),
    queryClient.invalidateQueries({ queryKey: ['pdv-cofre-balance'] }),
    queryClient.invalidateQueries({ queryKey: ['pdv-cash-session-detail'] }),
    queryClient.invalidateQueries({ queryKey: ['pdv-customer-credit'] }),
    queryClient.invalidateQueries({ queryKey: ['pdv-customer-payment-options'] }),
    queryClient.invalidateQueries({ queryKey: ['party-account-v2'] }),
    invalidatePdvReportCaches(queryClient),
  ]);
}

export function usePdvSale() {
  const queryClient = useQueryClient();

  /**
   * A venda move estoque E dinheiro: as duas famílias de query precisam
   * reagir, senão a grade do PDV segue mostrando o saldo velho e o painel do
   * caixa o total velho.
   */
  const invalidateAfterSale = () => invalidatePdvSaleCaches(queryClient);

  /** @deprecated Novas vendas devem usar usePdvDirectSaleV2.complete. */
  const createOrder = useMutation({
    mutationFn: async (_input: PdvCreateOrderInput): Promise<string> => {
      throw new Error('Atualize a página e use a venda atual do PDV. Nenhum pedido foi criado.');
    },
  });

  const settleOrder = useMutation({
    mutationFn: async (vars: {
      orderId: string;
      payments: SettlePaymentPayload[];
      clientRequestId: string;
      /**
       * Retrodata a COMPETÊNCIA do lançamento (transaction_date/paid_date),
       * NÃO onde o dinheiro está — ele continua contando na gaveta de hoje
       * (ver NoticeBanner no diálogo de Opções avançadas). `null`/omitido =
       * comportamento idêntico ao histórico (hoje, no fuso da empresa). O
       * servidor recusa data futura com mensagem PT-BR já pronta.
       */
      transactionDate?: string | null;
    }): Promise<PdvSettleResult> => {
      const { data, error } = await supabase.rpc('pdv_settle_order', {
        p_order_id: vars.orderId,
        p_payments: vars.payments as never,
        p_client_request_id: vars.clientRequestId,
        p_transaction_date: vars.transactionDate || null,
      });
      if (error) throw error;
      return data as unknown as PdvSettleResult;
    },
    onSuccess: invalidateAfterSale,
  });

  /**
   * Substitui uma venda paga sem janela inconsistente: preflight, estorno da
   * original, criação da substituta, pagamentos e estoque acontecem na MESMA
   * transação do servidor. Retry usa a chave persistida no rascunho.
   */
  const replaceOrder = useMutation({
    mutationFn: async (input: PdvReplaceOrderInput): Promise<PdvSettleResult> => {
      const orderPayload = {
        customer_id: input.customerId,
        terminal_id: input.terminalId,
        stock_id: input.stockId,
        cash_session_id: input.cashSessionId,
        discount_amount: Math.max(0, input.discountAmount || 0),
        notes: input.notes?.trim() || null,
      };
      const itemsPayload = input.items.map((item) => ({
        inventory_id: item.inventoryId,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit.trim() || 'un',
        unit_price: item.unitPrice,
        unit_cost: item.unitCost,
        discount_amount: Math.max(0, item.discountAmount || 0),
      }));

      const { data, error } = await supabase.rpc('pdv_replace_order', {
        p_source_order_id: input.sourceOrderId,
        p_order: orderPayload,
        p_items: itemsPayload,
        p_payments: input.payments as unknown as Json,
        p_client_request_id: input.clientRequestId,
        p_transaction_date: input.transactionDate || null,
      });
      if (error) throw error;
      return data as unknown as PdvSettleResult;
    },
    onSuccess: invalidateAfterSale,
  });

  return { createOrder, settleOrder, replaceOrder, invalidateAfterSale };
}

/** Bucket privado reaproveitado do Financeiro — ver migration da tabela. */
const PDV_ORDER_ATTACHMENTS_BUCKET = 'financial-receipts';

export interface PdvOrderAttachmentUploadResult {
  storagePath: string;
}

export interface PdvOrderAttachmentUploadInput {
  orderId: string;
  file: File;
  /** Identidade estável da intenção. Reusar no retry preserva path e linha. */
  clientAttachmentId?: string;
}

export async function uploadPdvOrderAttachment(
  vars: PdvOrderAttachmentUploadInput,
): Promise<PdvOrderAttachmentUploadResult> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('Empresa não encontrada para o usuário.');

  const safeName = sanitizeStorageFileName(vars.file.name);
  const stableId = vars.clientAttachmentId?.replace(/[^a-zA-Z0-9-]/g, '') || crypto.randomUUID();
  const storagePath = `${companyId}/pdv-orders/${vars.orderId}/${stableId}_${safeName}`;
  const stableRetry = Boolean(vars.clientAttachmentId);

  const { error: uploadError } = await supabase.storage
    .from(PDV_ORDER_ATTACHMENTS_BUCKET)
    .upload(storagePath, vars.file, await tenantFileOptions({
      contentType: vars.file.type || undefined,
      ...(stableRetry ? { upsert: true } : {}),
    }));
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase
    .from('pdv_order_attachments')
    .upsert({
      order_id: vars.orderId,
      storage_path: storagePath,
      file_name: vars.file.name,
      mime_type: vars.file.type || null,
      size_bytes: vars.file.size ?? null,
    } as never, {
      onConflict: 'order_id,storage_path',
      ignoreDuplicates: true,
    });

  if (insertError) {
    // Em retry idempotente a resposta do INSERT pode se perder depois do
    // commit. Não apague o objeto estável: a próxima tentativa reconcilia a
    // mesma linha pelo índice único. No fluxo legado aleatório, a limpeza
    // best-effort continua evitando órfão.
    if (!stableRetry) {
      await supabase.storage.from(PDV_ORDER_ATTACHMENTS_BUCKET).remove([storagePath]).catch(() => {});
    }
    throw insertError;
  }

  return { storagePath };
}

/**
 * Sobe UMA foto (já comprimida por `processImageFile`, ver
 * `src/utils/imageConvert.ts`) pro bucket `financial-receipts`, em
 * `<company_id>/pdv-orders/<order_id>/<uuid>_<arquivo>`, e grava a linha em
 * `pdv_order_attachments`.
 *
 * A foto é do PEDIDO, não de uma `financial_transaction` (venda com
 * pagamento misto gera várias pernas — pendurar a foto numa delas seria
 * arbitrário). `company_id`/`uploaded_by` nascem de trigger/DEFAULT no banco,
 * por isso ficam de fora do payload (mesmo padrão de `pdv_orders.number`).
 */
export function useUploadPdvOrderAttachment() {
  return useMutation({
    mutationFn: uploadPdvOrderAttachment,
  });
}

export interface PdvCustomerCredit {
  /** Limite cadastrado. A conclusão sempre revalida no servidor. */
  creditLimit: number | null;
  /** Dívida assinada do extrato canônico v2, a mesma usada pelo limite no servidor. */
  debt: number;
}

/**
 * Limite e saldo devedor do cliente selecionado, pra a tela dizer
 * "já deve R$ X e o limite é R$ Y" ANTES de o operador digitar a venda toda.
 *
 * A RPC valida de novo no servidor e é ela quem decide — isto aqui é só pra o
 * operador não descobrir o bloqueio na frente do cliente.
 */
export function pdvCustomerCreditErrorMessage(error: unknown): string {
  const details = error && typeof error === 'object' && 'details' in error && typeof error.details === 'string' ? error.details.toLowerCase() : '';
  if (details.includes('auth_required')) return 'Sua sessão expirou. Entre novamente para consultar o cliente.';
  if (details.includes('user_inactive') || details.includes('profile_inactive')) return 'Seu acesso está desativado. Peça ao responsável para conferir seu cadastro.';
  if (details.includes('customer_not_found')) return 'Este cliente não está disponível neste atendimento. Selecione o cliente novamente.';
  if (details.includes('subscription_denied') || details.includes('entitlement_denied')) return 'O acesso ao PDV está indisponível. Peça ao responsável para conferir a assinatura.';
  if (details.includes('forbidden') || details.includes('screen_denied') || details.includes('module_denied') || details.includes('company_required')) return 'Seu perfil não permite consultar o crédito neste atendimento. Peça ao responsável para conferir seu acesso.';
  return 'Não foi possível conferir a dívida e o limite deste cliente. Tente novamente.';
}

export function usePdvCustomerCredit(customerId: string | null, enabled = true) {
  const scope = usePdvAuthorizedQueryScope();
  const signature = JSON.stringify([...scope.key, customerId]);
  const current = useRef(signature);
  current.current = signature;
  const query = useQuery({
    queryKey: ['pdv-customer-credit', ...scope.key, customerId],
    enabled: enabled && scope.ready && Boolean(customerId),
    queryFn: async ({ signal }): Promise<PdvCustomerCredit> => {
      if (!enabled || !scope.ready || !customerId) throw new Error('Selecione um cliente para consultar o crédito.');
      const { data, error } = await supabase.rpc('pdv_get_customer_credit_summary_v3', { p_customer_id: customerId }).single();
      if (signal.aborted || current.current !== signature) throw new Error('O atendimento mudou. Consulte o cliente novamente.');
      if (error) throw new Error(pdvCustomerCreditErrorMessage(error));
      const row = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
      if (!row || typeof row.debt !== 'number' || !Number.isFinite(row.debt)
        || (row.credit_limit !== null && (typeof row.credit_limit !== 'number' || !Number.isFinite(row.credit_limit)))) {
        throw new Error('Não foi possível conferir a dívida e o limite deste cliente. Tente novamente.');
      }
      return { creditLimit: row.credit_limit as number | null, debt: row.debt };
    },
    retry: false,
    staleTime: 15_000,
    gcTime: 0,
  });
  return {
    credit: enabled && scope.ready && customerId && !query.isError && !query.isFetching ? query.data ?? null : null,
    isLoading: enabled && Boolean(customerId) && (!scope.ready || query.isPending || query.isFetching),
    isError: enabled && Boolean(customerId) && scope.ready && query.isError,
    errorMessage: enabled && scope.ready && query.isError ? query.error.message : null,
    refetch: query.refetch,
  };
}
