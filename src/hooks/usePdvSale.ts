/**
 * Fronteira Supabase da VENDA do PDV. Componente nunca chama
 * `supabase.from(...)` direto — é lei da casa.
 *
 * A venda são DOIS passos, e isso é de propósito:
 *
 *   1) `createOrder` insere `pdv_orders` + `pdv_order_items` (o carrinho vira
 *      pedido `aguardando_pagamento`).
 *   2) `settleOrder` chama `pdv_settle_order`, que numa transação só recalcula
 *      o total pelos itens GRAVADOS, valida as formas de pagamento, cria os
 *      `financial_transactions` (`origin='pdv'`), grava `pdv_order_payments`,
 *      marca o pedido como pago e (modo simples) baixa o estoque pelo Kardex.
 *
 * POR QUE SEPARADO: se o pagamento falhar (conta errada, fiado acima do
 * limite, caixa fechado), o pedido JÁ EXISTE e o retry reaproveita o mesmo
 * `order_id` + o mesmo `client_request_id`. Juntar os dois passos faria cada
 * tentativa criar um pedido novo e queimar um número de pedido por erro de
 * digitação.
 *
 * IDEMPOTÊNCIA: `p_client_request_id` é gerado NO CLIENTE, uma vez por
 * TENTATIVA DE VENDA, e reaproveitado em todo retry. Gerar chave nova no retry
 * anula a proteção. Chamar duas vezes com a mesma chave devolve o mesmo resumo
 * com `idempotente: true`, sem duplicar lançamento nem baixar estoque de novo.
 *
 * `number` e `company_id` de `pdv_orders` vêm de TRIGGER no banco
 * (`tg_set_pdv_order_number`, `set_company_id_on_insert`), então são OMITIDOS
 * do payload com cast — mesmo padrão de `projects.code` em
 * `src/hooks/useProjects.ts`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeStorageFileName } from '@/utils/storagePath';
import { currentCompanyId, tenantFileOptions } from '@/utils/tenantStorage';
import type { SettlePaymentPayload } from '@/lib/pdv/payment';

/** Uma linha do cupom. `inventoryId` nulo = serviço avulso de balcão. */
export interface PdvSaleItemInput {
  inventoryId: string | null;
  /** SNAPSHOT do nome: o cupom não pode mudar porque alguém renomeou o produto. */
  description: string;
  quantity: number;
  unitPrice: number;
  /** SNAPSHOT do custo. É o que faz o lucro real do caixa. */
  unitCost: number;
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

export function usePdvSale() {
  const queryClient = useQueryClient();

  /**
   * A venda move estoque E dinheiro: as duas famílias de query precisam
   * reagir, senão a grade do PDV segue mostrando o saldo velho e o painel do
   * caixa o total velho.
   */
  const invalidateAfterSale = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['account-balances'] });
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    queryClient.invalidateQueries({ queryKey: ['pdv-cofre-balance'] });
    queryClient.invalidateQueries({ queryKey: ['pdv-cash-session-detail'] });
    queryClient.invalidateQueries({ queryKey: ['pdv-customer-credit'] });
  };

  const createOrder = useMutation({
    mutationFn: async (input: PdvCreateOrderInput): Promise<string> => {
      if (!input.items.length) {
        throw new Error('Adicione pelo menos um produto antes de finalizar.');
      }

      const { data: order, error: orderError } = await supabase
        .from('pdv_orders')
        .insert({
          customer_id: input.customerId,
          terminal_id: input.terminalId,
          stock_id: input.stockId,
          cash_session_id: input.cashSessionId,
          status: 'aguardando_pagamento',
          discount_amount: Math.max(0, input.discountAmount || 0),
          notes: input.notes?.trim() || null,
          replaces_order_id: input.replacesOrderId ?? null,
          // `number` e `company_id` são preenchidos por trigger. Omitir da
          // tipagem com cast é o padrão já usado em `projects.code`.
        } as never)
        .select('id')
        .single();
      if (orderError) throw orderError;

      const orderId = (order as { id: string }).id;

      const rows = input.items.map((item, index) => ({
        order_id: orderId,
        inventory_id: item.inventoryId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        unit_cost: item.unitCost,
        // O desconto do PDV é do PEDIDO (um campo só na tela), não da linha.
        // Rateio por item é Onda 4 (desconto com teto por usuário).
        discount_amount: 0,
        total: Math.max(0, Math.round(item.quantity * item.unitPrice * 100) / 100),
        sort_order: index,
      }));

      const { error: itemsError } = await supabase.from('pdv_order_items').insert(rows as never);
      if (itemsError) throw itemsError;

      // Fotos são evidência do pedido e devem acompanhar a edição. Reutilizar
      // o mesmo objeto privado evita upload duplicado; cada pedido mantém sua
      // própria linha de metadados e a venda original segue auditável.
      if (input.replacesOrderId) {
        const { data: sourceAttachments, error: sourceAttachmentsError } = await supabase
          .from('pdv_order_attachments')
          .select('storage_path, file_name, mime_type, size_bytes')
          .eq('order_id', input.replacesOrderId);
        if (sourceAttachmentsError) throw sourceAttachmentsError;

        if (sourceAttachments?.length) {
          const attachmentRows = sourceAttachments.map((attachment) => ({
            order_id: orderId,
            storage_path: attachment.storage_path,
            file_name: attachment.file_name,
            mime_type: attachment.mime_type,
            size_bytes: attachment.size_bytes,
          }));
          const { error: copyAttachmentsError } = await supabase
            .from('pdv_order_attachments')
            .upsert(attachmentRows as never, {
              onConflict: 'order_id,storage_path',
              ignoreDuplicates: true,
            });
          if (copyAttachmentsError) throw copyAttachmentsError;
        }
      }

      return orderId;
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

  return { createOrder, settleOrder, invalidateAfterSale };
}

/** Bucket privado reaproveitado do Financeiro — ver migration da tabela. */
const PDV_ORDER_ATTACHMENTS_BUCKET = 'financial-receipts';

export interface PdvOrderAttachmentUploadResult {
  storagePath: string;
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
    mutationFn: async (vars: { orderId: string; file: File }): Promise<PdvOrderAttachmentUploadResult> => {
      const companyId = await currentCompanyId();
      if (!companyId) throw new Error('Empresa não encontrada para o usuário.');

      const safeName = sanitizeStorageFileName(vars.file.name);
      const storagePath = `${companyId}/pdv-orders/${vars.orderId}/${crypto.randomUUID()}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(PDV_ORDER_ATTACHMENTS_BUCKET)
        .upload(storagePath, vars.file, await tenantFileOptions({ contentType: vars.file.type || undefined }));
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('pdv_order_attachments')
        .insert({
          order_id: vars.orderId,
          storage_path: storagePath,
          file_name: vars.file.name,
          mime_type: vars.file.type || null,
          size_bytes: vars.file.size ?? null,
        } as never);

      if (insertError) {
        // best-effort: não deixa arquivo órfão no Storage se a linha falhou.
        await supabase.storage.from(PDV_ORDER_ATTACHMENTS_BUCKET).remove([storagePath]).catch(() => {});
        throw insertError;
      }

      return { storagePath };
    },
  });
}

export interface PdvCustomerCredit {
  /** `customers.credit_limit`. `null` = sem limite definido (a RPC avisa). */
  creditLimit: number | null;
  /** Saldo devedor = SOMA do `customer_credit_ledger`, nunca coluna em customers. */
  debt: number;
}

/**
 * Limite e saldo devedor do cliente selecionado, pra a tela dizer
 * "já deve R$ X e o limite é R$ Y" ANTES de o operador digitar a venda toda.
 *
 * A RPC valida de novo no servidor e é ela quem decide — isto aqui é só pra o
 * operador não descobrir o bloqueio na frente do cliente.
 */
export function usePdvCustomerCredit(customerId: string | null) {
  const query = useQuery({
    queryKey: ['pdv-customer-credit', customerId],
    enabled: !!customerId,
    queryFn: async (): Promise<PdvCustomerCredit> => {
      const [customerRes, ledgerRes] = await Promise.all([
        supabase.from('customers').select('credit_limit').eq('id', customerId).maybeSingle(),
        supabase.from('customer_credit_ledger').select('amount').eq('customer_id', customerId),
      ]);
      if (customerRes.error) throw customerRes.error;
      if (ledgerRes.error) throw ledgerRes.error;

      const limitRaw = (customerRes.data as { credit_limit: number | null } | null)?.credit_limit;
      const debt = ((ledgerRes.data ?? []) as Array<{ amount: number }>).reduce(
        (sum, row) => sum + (Number(row.amount) || 0),
        0,
      );

      return {
        creditLimit: limitRaw == null ? null : Number(limitRaw),
        debt: Math.round(debt * 100) / 100,
      };
    },
  });

  return {
    credit: query.data ?? null,
    isLoading: !!customerId && query.isLoading,
  };
}
