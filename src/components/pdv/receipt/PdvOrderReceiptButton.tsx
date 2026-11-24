import { useState } from 'react';
import { useDomiLinkReceiptOutput, type PdvReceiptOutput } from '@/hooks/useDomiLinkReceiptOutput';
import { assertPdvReceiptOperationCurrent, usePdvReceiptOperation, withPdvReceiptTarget, type PdvReceiptOperationGuard } from '@/hooks/usePdvReceiptOperation';
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

export async function openPdvOrderReceipt(orderId: string, format: PdvReceiptFormat, options?: { target?: Window | null; copies?: 1 | 2 | 3; documentKind?: 'sale' | 'pickup'; output?: PdvReceiptOutput } & Partial<PdvReceiptOperationGuard>): Promise<void> {
  try { assertPdvReceiptOperationCurrent(options); } catch (error) { options?.target?.close(); throw error; }
  const target = options && 'target' in options ? options.target : openPendingPdfTab('Gerando comprovante não fiscal...');
  await withPdvReceiptTarget(target, options, async () => {
    const savedSnapshot = options?.signal ? await fetchPdvOrderReceiptSnapshot(orderId, options.signal) : await fetchPdvOrderReceiptSnapshot(orderId);
    assertPdvReceiptOperationCurrent(options);
    const snapshot = await preparePdvReceiptSnapshotLogo({ ...savedSnapshot, documentKind: options?.documentKind ?? resolvePdvOrderReceiptKind(savedSnapshot) });
    assertPdvReceiptOperationCurrent(options);
    const blob = options?.copies ? generatePdvReceiptPdf(snapshot, format, { copies: options.copies }) : generatePdvReceiptPdf(snapshot, format);
    if (options?.output) await options.output(blob, receiptFilename(snapshot, format), target, options);
    else openPdfInTab(blob, receiptFilename(snapshot, format), target);
  });
}

export function usePdvOrderReceiptOpener(entityId?: string | null) {
  const operation = usePdvReceiptOperation(entityId);
  const output = useDomiLinkReceiptOutput();
  return { ...operation, open: async (orderId: string, format: PdvReceiptFormat, options?: Parameters<typeof openPdvOrderReceipt>[2]) => {
    if (!operation.isCurrent()) { options?.target?.close(); return; }
    await operation.run(guard => openPdvOrderReceipt(orderId, format, { output, ...options, ...guard }));
  } };
}

export function PdvOrderReceiptButton({
  orderId,
  format,
  label = 'Reimprimir comprovante',
  className,
  documentKind,
}: PdvOrderReceiptButtonProps) {
  const { toast } = useToast();
  const opener = usePdvOrderReceiptOpener(orderId);
  const [loadingScope, setLoadingScope] = useState<typeof opener.isCurrent | null>(null);
  const loading = loadingScope?.() === true;

  async function open() {
    if (!opener.ready) return;
    setLoadingScope(() => opener.isCurrent);
    try {
      await opener.open(orderId, format, documentKind ? { documentKind } : undefined);
    } catch {
      if (opener.isCurrent()) toast({
        title: 'Não foi possível gerar o comprovante',
        description: 'Tente novamente pelo botão do comprovante.',
        variant: 'destructive',
      });
    } finally {
      if (opener.isCurrent()) setLoadingScope(null);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={loading || !opener.ready}
      onClick={() => void open()}
    >
      <Printer className="mr-2 h-4 w-4" />
      {loading ? 'Gerando...' : label}
    </Button>
  );
}
