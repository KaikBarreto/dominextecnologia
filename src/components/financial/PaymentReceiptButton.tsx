import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePaymentReceipt } from '@/hooks/usePaymentReceipt';

export function PaymentReceiptButton({ id, kind = 'transaction' }: { id: string; kind?: 'transaction' | 'charge' }) {
  const receipt = usePaymentReceipt();
  return <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" disabled={!!receipt.downloading} onClick={() => void receipt.download(id, kind)}>
    {receipt.downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}Gerar recibo
  </Button>;
}
