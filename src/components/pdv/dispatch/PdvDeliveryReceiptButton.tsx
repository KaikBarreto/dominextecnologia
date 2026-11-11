import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchPdvDeliveryReceipt } from '@/hooks/usePdvDispatch';
import { openPendingPdfTab } from '@/utils/openPdfInTab';
import { previewPdvDeliveryReceipt } from '@/lib/pdv/deliveryReceiptPdf';
import { useToast } from '@/hooks/use-toast';

export function PdvDeliveryReceiptButton({ deliveryId }: { deliveryId: string }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function open() {
    const target = openPendingPdfTab();
    setLoading(true);
    try {
      const result = await fetchPdvDeliveryReceipt(deliveryId);
      previewPdvDeliveryReceipt(result, target);
    } catch (error) {
      target?.close();
      toast({ title: 'Não foi possível abrir o comprovante', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return <Button type="button" variant="outline" onClick={() => void open()} disabled={loading}><>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Comprovante</></Button>;
}
