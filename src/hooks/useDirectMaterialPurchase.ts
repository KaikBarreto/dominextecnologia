import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { getErrorMessage } from '@/utils/errorMessages';

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
}

type DirectPurchaseRpcArgs =
  Database['public']['Functions']['registrar_compra_material_direta']['Args'];

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
      const { data, error } = await supabase.rpc('registrar_compra_material_direta', args);
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
      toast({ title: t.successTitle, description: t.successDescription });
    },
    onError: (error) => {
      toast({
        title: t.errorTitle,
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  return { registerPurchase };
}
