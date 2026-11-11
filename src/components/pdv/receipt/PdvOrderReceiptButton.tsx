import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { fetchPdvOrderReceiptSnapshot } from '@/hooks/usePdvOrderReceiptSnapshot';
import { generatePdvReceiptPdf, preparePdvReceiptSnapshotLogo } from '@/lib/pdv/receipt/pdf';
import { receiptFilename, type PdvReceiptFormat } from '@/lib/pdv/receipt/model';
import { openPdfInTab, openPendingPdfTab } from '@/utils/openPdfInTab';

export interface PdvOrderReceiptButtonProps {
  orderId: string;
  format: PdvReceiptFormat;
  label?: string;
  className?: string;
}

export async function openPdvOrderReceipt(orderId: string, format: PdvReceiptFormat): Promise<void> {
  const target = openPendingPdfTab('Gerando comprovante não fiscal...');
  try {
    const savedSnapshot = await fetchPdvOrderReceiptSnapshot(orderId);
    const snapshot = await preparePdvReceiptSnapshotLogo(savedSnapshot);
    const blob = generatePdvReceiptPdf(snapshot, format);
    openPdfInTab(blob, receiptFilename(snapshot, format), target);
  } catch (error) {
    target?.close();
    throw error;
  }
}

export function PdvOrderReceiptButton({
  orderId,
  format,
  label = 'Reimprimir comprovante',
  className,
}: PdvOrderReceiptButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      await openPdvOrderReceipt(orderId, format);
    } catch (error) {
      toast({
        title: 'Não foi possível gerar o comprovante',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={loading}
      onClick={() => void open()}
    >
      <Printer className="mr-2 h-4 w-4" />
      {loading ? 'Gerando...' : label}
    </Button>
  );
}
