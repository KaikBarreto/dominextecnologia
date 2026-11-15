import { PdvReceiptCompanyTooltip } from '@/components/pdv/receipt/PdvReceiptCompanyTooltip';
import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchPdvDeliveryReceipt } from '@/hooks/usePdvDispatch';
import { openPendingPdfTab } from '@/utils/openPdfInTab';
import { previewPdvDeliveryReceipt, toPdvDeliveryReceiptSnapshot } from '@/lib/pdv/deliveryReceiptPdf';
import { preparePdvReceiptSnapshotLogo } from '@/lib/pdv/receipt/pdf';
import { useToast } from '@/hooks/use-toast';
import { usePdvReceiptSettings } from '@/hooks/usePdvReceiptSettings';
import { usePdvReceiptCompany, PDV_RECEIPT_COMPANY_PENDING } from '@/hooks/usePdvReceiptCompany';
import { readDeviceReceiptFormat } from '@/lib/pdv/receipt/devicePreference';
import { resolvePdvReceiptStagePolicy } from '@/lib/pdv/receipt/stagePolicy';
import type { PdvReceiptFormat, PdvReceiptSnapshot } from '@/lib/pdv/receipt/model';

export async function openPdvDeliveryReceipt(deliveryId: string, format: PdvReceiptFormat, options: { company: PdvReceiptSnapshot['company'] | null; target?: Window | null; copies?: 1 | 2 | 3 }) {
  if (!options.company) { options.target?.close(); throw new Error(PDV_RECEIPT_COMPANY_PENDING); }
  const target = 'target' in options ? options.target : openPendingPdfTab('Gerando comprovante de retirada...');
  try {
    const result = await fetchPdvDeliveryReceipt(deliveryId);
    const prepared = await preparePdvReceiptSnapshotLogo(toPdvDeliveryReceiptSnapshot(result, { company: options.company }));
    previewPdvDeliveryReceipt(result, target, { company: prepared.company, format, copies: options.copies });
  } catch (error) { target?.close(); throw error; }
}

export function PdvDeliveryReceiptButton({ deliveryId }: { deliveryId: string }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const settings = usePdvReceiptSettings();
  const company = usePdvReceiptCompany();
  const format = readDeviceReceiptFormat() ?? resolvePdvReceiptStagePolicy(settings.data, 'delivery').format;

  async function open() {
    if (!company) {
      toast({ title: 'Identificação da empresa indisponível', description: PDV_RECEIPT_COMPANY_PENDING });
      return;
    }
    setLoading(true);
    try {
      await openPdvDeliveryReceipt(deliveryId, format, { company });
    } catch {
      toast({ title: 'Não foi possível abrir o comprovante', description: 'Tente novamente pelo botão da retirada.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return <PdvReceiptCompanyTooltip ready={!!company} message={PDV_RECEIPT_COMPANY_PENDING}><Button type="button" variant="outline" onClick={() => void open()} disabled={loading || !company}><>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Comprovante</></Button></PdvReceiptCompanyTooltip>;
}
