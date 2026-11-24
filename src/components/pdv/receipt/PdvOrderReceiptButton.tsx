import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { fetchPdvOrderReceiptSnapshot } from '@/hooks/usePdvOrderReceiptSnapshot';
import { generatePdvReceiptPdf, preparePdvReceiptSnapshotLogo } from '@/lib/pdv/receipt/pdf';
import { receiptFilename, type PdvReceiptFormat, type PdvReceiptDocumentKind, type PdvReceiptSnapshot } from '@/lib/pdv/receipt/model';
import { openPdfInTab, openPendingPdfTab } from '@/utils/openPdfInTab';

export interface PdvOrderReceiptButtonProps {
  orderId: string;
  format: PdvReceiptFormat;
  label?: string;
  className?: string;
  documentKind?: 'sale' | 'pickup';
}

export function resolvePdvOrderReceiptKind(snapshot: PdvReceiptSnapshot): PdvReceiptDocumentKind {
  const status = snapshot.fulfillment?.status.toLocaleLowerCase('pt-BR');
  return snapshot.fulfillment?.mode === 'retirada' && status && /liberad|aguard|parcial/.test(status) ? 'pickup' : 'sale';
}

export async function openPdvOrderReceipt(orderId: string, format: PdvReceiptFormat, options?: { target?: Window | null; copies?: 1 | 2 | 3; documentKind?: 'sale' | 'pickup' }): Promise<void> {
  const target = options && 'target' in options ? options.target : openPendingPdfTab('Gerando comprovante não fiscal...');
  try {
    const savedSnapshot = await fetchPdvOrderReceiptSnapshot(orderId);
    const snapshot = await preparePdvReceiptSnapshotLogo({ ...savedSnapshot, documentKind: options?.documentKind ?? resolvePdvOrderReceiptKind(savedSnapshot) });
    const blob = options?.copies ? generatePdvReceiptPdf(snapshot, format, { copies: options.copies }) : generatePdvReceiptPdf(snapshot, format);
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
  documentKind,
}: PdvOrderReceiptButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      await openPdvOrderReceipt(orderId, format, documentKind ? { documentKind } : undefined);
    } catch {
      toast({
        title: 'Não foi possível gerar o comprovante',
        description: 'Tente novamente pelo botão do comprovante.',
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
