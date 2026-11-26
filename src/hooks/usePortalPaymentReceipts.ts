import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { paymentReceiptError } from '@/hooks/usePaymentReceipt';
import type { OsReceipt } from '@/lib/osCommercial';
import { downloadOsReceipt } from '@/utils/osReceiptPdf';
export interface PortalPayment {
  id: string; kind: 'charge' | 'transaction'; description: string; amount: number; paid_date: string; method: string;
  public_short_code?: string | null;
}
export function usePortalPaymentReceipts(token: string, sessionToken: string | null) {
  const { toast } = useToast();
  const scope = `${token}:${sessionToken ?? ''}`;
  const currentScope = useRef<string | null>(scope);
  currentScope.current = scope;
  useEffect(() => { currentScope.current = scope; return () => { currentScope.current = null; }; }, [scope]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['portal-payments', token, sessionToken], enabled: !!token, retry: false, refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_customer_portal_payments', { p_token: token, p_session_token: sessionToken || null });
      if (error) throw error;
      return data as unknown as PortalPayment[];
    } });
  const download = async (payment: PortalPayment) => {
    if (downloading) return;
    setDownloading(payment.id);
    try {
      const { data, error } = await supabase.rpc('get_customer_portal_payment_receipt', { p_token: token, p_session_token: sessionToken || null, p_kind: payment.kind, p_id: payment.id });
      if (error) throw error;
      if (currentScope.current !== scope) return;
      await downloadOsReceipt(data as unknown as OsReceipt, () => currentScope.current === scope);
    } catch (error) { toast({ variant: 'destructive', title: 'Recibo indisponível', description: paymentReceiptError(error) }); }
    finally { setDownloading(null); }
  };
  return { ...query, downloading, download };
}
