import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { OsReceipt } from '@/lib/osCommercial';
import { downloadOsReceipt } from '@/utils/osReceiptPdf';
import type { FinancialTransaction } from '@/types/database';

export function canDownloadPaymentReceipt(row: Pick<FinancialTransaction, 'transaction_type' | 'is_paid' | 'paid_date' | 'amount' | 'amount_received' | 'cancelled_at' | 'transfer_pair_id'>) {
  return row.transaction_type === 'entrada' && row.is_paid && !!row.paid_date && !row.cancelled_at
    && !row.transfer_pair_id && Number(row.amount) - Number(row.amount_received || 0) > 0;
}
export function paymentReceiptError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === '42501') return 'Seu acesso a este recebimento não está disponível. Atualize a página ou peça ao responsável para revisar seu acesso.';
  if (code === 'ORC01') return 'Este recebimento não está disponível para recibo. Confira o pagamento e seu histórico; ele pode ter sido estornado.';
  return 'Não foi possível gerar o recibo. Confira sua conexão e tente novamente.';
}
export async function fetchPaymentReceipt(id: string, kind: 'transaction' | 'charge' = 'transaction'): Promise<OsReceipt> {
  const { data, error } = await supabase.rpc(kind === 'charge' ? 'get_charge_payment_receipt' : 'get_financial_payment_receipt',
    kind === 'charge' ? { p_charge_id: id } : { p_transaction_id: id });
  if (error) throw error;
  return data as unknown as OsReceipt;
}
export function usePaymentReceipt() {
  const { user, profile } = useAuth();
  const scope = `${user?.id ?? ''}:${profile?.company_id ?? ''}`;
  const currentScope = useRef<string | null>(scope);
  currentScope.current = scope;
  useEffect(() => { currentScope.current = scope; return () => { currentScope.current = null; }; }, [scope]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const { toast } = useToast();
  const download = async (id: string, kind: 'transaction' | 'charge' = 'transaction') => {
    if (downloading) return;
    setDownloading(id);
    try { const receipt = await fetchPaymentReceipt(id, kind); if (currentScope.current !== scope) return; await downloadOsReceipt(receipt, () => currentScope.current === scope); }
    catch (error) { toast({ variant: 'destructive', title: 'Recibo indisponível', description: paymentReceiptError(error) }); }
    finally { setDownloading(null); }
  };
  return { download, downloading };
}
