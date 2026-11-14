import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { getErrorMessage } from '@/utils/errorMessages';
import { MATERIAL_PURCHASE_REPORT_QUERY_KEY } from '@/hooks/useMaterialPurchaseReport';
import type { PdvPurchaseCashContext } from '@/components/pdv/caixa-v2/pdvPurchaseContext';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';

const CASH_PURCHASE_ERROR_MESSAGES: Record<string, string> = {
  PDV_CASH_PURCHASE_CONTEXT_REQUIRED: 'Volte ao Caixa e abra esta compra novamente.',
  PDV_CASH_PURCHASE_CONTEXT_MISMATCH: 'Esta compra pertence a outro caixa ou local de estoque.',
  PDV_CASH_PURCHASE_ITEMS_REQUIRED: 'Adicione ao menos um material para concluir a compra.',
  PDV_CASH_PURCHASE_ITEMS_LIMIT: 'Uma compra aceita no máximo 100 materiais.',
  PDV_CASH_PURCHASE_ITEMS_INVALID: 'Revise os materiais, as quantidades e os valores informados.',
  PDV_CASH_PURCHASE_ACCOUNT_MISMATCH: 'Pagamento em dinheiro deve usar a conta deste caixa.',
  PDV_CASH_PURCHASE_PAYMENT_MISMATCH: 'Escolha outra conta para pagamentos que não saem em dinheiro deste caixa.',
  PDV_CASH_PURCHASE_DATE_INVALID: 'Compra paga com o dinheiro do caixa deve usar a data de hoje.',
  PDV_CASH_CUSTODY_INSUFFICIENT: 'O caixa não possui dinheiro suficiente para esta compra.',
  PDV_CASH_PURCHASE_IN_PROGRESS: 'Esta compra ainda está sendo processada. Aguarde e tente novamente.',
  PDV_CASH_PURCHASE_CONTEXT_REUSED: 'Esta compra já foi registrada fora deste caixa.',
  PDV_CASH_PURCHASE_FINANCIAL_MISSING: 'Não foi possível concluir o lançamento financeiro. Nenhum dado foi salvo.',
};

export function getDirectMaterialPurchaseErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const details = 'details' in error && typeof error.details === 'string' ? error.details : '';
    const code = Object.keys(CASH_PURCHASE_ERROR_MESSAGES).find((candidate) => details.includes(candidate));
    if (code) return CASH_PURCHASE_ERROR_MESSAGES[code];
  }
  return getErrorMessage(error);
}

export interface DirectMaterialPurchaseItemInput {
  inventory_id: string;
  quantity: number;
  unit_price: number;
}

export interface DirectMaterialPurchaseInput {
  clientRequestId: string;
  stockId: string;
  supplierId: string;
  items: DirectMaterialPurchaseItemInput[];
  purchaseDate: string;
  accountId: string;
  categoryId: string;
  isPaid: boolean;
  paidDate?: string | null;
  dueDate?: string | null;
  paymentMethod?: string | null;
  description?: string | null;
  notes?: string | null;
  cashContext?: PdvPurchaseCashContext | null;
}

export interface ConfirmedPdvPurchaseCashContext extends PdvPurchaseCashContext {
  terminalName: string;
  cashAccountId: string;
  cashAccountName: string;
  openedAt: string;
}

type DirectPurchaseRpcArgs =
  Database['public']['Functions']['registrar_compra_material_direta']['Args'];

function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function fetchPdvPurchaseCashContext(
  context: PdvPurchaseCashContext,
): Promise<ConfirmedPdvPurchaseCashContext> {
  const { data, error } = await supabase.rpc('pdv_get_purchase_cash_context_v2', {
    p_cash_session_id: context.sessionId,
    p_terminal_id: context.terminalId,
    p_stock_id: context.stockId,
  });
  if (error) throw error;
  const row = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const confirmed = {
    sessionId: requiredText(row.session_id),
    terminalId: requiredText(row.terminal_id),
    stockId: requiredText(row.stock_id),
    terminalName: requiredText(row.terminal_name),
    cashAccountId: requiredText(row.cash_account_id),
    cashAccountName: requiredText(row.cash_account_name),
    openedAt: requiredText(row.opened_at),
  };
  if (!confirmed.sessionId || !confirmed.terminalId || !confirmed.stockId
      || !confirmed.terminalName || !confirmed.cashAccountId || !confirmed.openedAt
      || confirmed.sessionId !== context.sessionId
      || confirmed.terminalId !== context.terminalId
      || confirmed.stockId !== context.stockId) {
    throw new Error('O contexto do caixa não pôde ser confirmado.');
  }
  return { ...confirmed, cashAccountName: confirmed.cashAccountName ?? 'Conta do caixa' };
}

export function usePdvPurchaseCashContext(context: PdvPurchaseCashContext | null) {
  const scope = usePdvAuthorizedQueryScope();
  return useQuery({
    queryKey: ['pdv-cash-purchase-context', ...scope.key, context?.sessionId, context?.terminalId, context?.stockId],
    enabled: scope.ready && context != null,
    queryFn: () => fetchPdvPurchaseCashContext(context as PdvPurchaseCashContext),
    retry: false,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    gcTime: 0,
  });
}

export function useDirectMaterialPurchase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.directPurchase;

  const registerPurchase = useMutation({
    mutationFn: async (input: DirectMaterialPurchaseInput) => {
      const args: DirectPurchaseRpcArgs = {
        p_client_request_id: input.clientRequestId,
        p_stock_id: input.stockId,
        p_supplier_id: input.supplierId,
        p_items: input.items as unknown as Json,
        p_purchase_date: input.purchaseDate,
        p_account_id: input.accountId,
        p_category_id: input.categoryId,
        p_is_paid: input.isPaid,
        p_paid_date: input.isPaid ? (input.paidDate ?? null) : null,
        p_due_date: input.isPaid ? null : (input.dueDate ?? null),
        p_payment_method: input.paymentMethod ?? null,
        p_description: input.description ?? null,
        p_notes: input.notes ?? null,
      };
      const result = input.cashContext
        ? await supabase.rpc('pdv_registrar_compra_material_direta_v2', {
            p_cash_session_id: input.cashContext.sessionId,
            p_terminal_id: input.cashContext.terminalId,
            ...args,
          })
        : await supabase.rpc('registrar_compra_material_direta', args);
      const { data, error } = result;
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['compra-ordens'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-cofre-balance'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-cash-session-detail'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-cash-sessions-v2'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-cash-purchase-context'] });
      queryClient.invalidateQueries({ queryKey: MATERIAL_PURCHASE_REPORT_QUERY_KEY });
      toast({ title: t.successTitle, description: t.successDescription });
    },
    onError: (error) => {
      toast({
        title: t.errorTitle,
        description: getDirectMaterialPurchaseErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  return { registerPurchase };
}
