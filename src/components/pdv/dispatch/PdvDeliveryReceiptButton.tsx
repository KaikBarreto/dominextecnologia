import { PdvReceiptCompanyTooltip } from '@/components/pdv/receipt/PdvReceiptCompanyTooltip';
import { useDomiLinkReceiptOutput, type PdvReceiptOutput } from '@/hooks/useDomiLinkReceiptOutput';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchPdvDeliveryReceipt } from '@/hooks/usePdvDispatch';
import { openPendingPdfTab } from '@/utils/openPdfInTab';
import { previewPdvDeliveryReceipt, toPdvDeliveryReceiptSnapshot } from '@/lib/pdv/deliveryReceiptPdf';
import { generatePdvReceiptPdf, preparePdvReceiptSnapshotLogo } from '@/lib/pdv/receipt/pdf';
import { receiptFilename } from '@/lib/pdv/receipt/model';
import { useToast } from '@/hooks/use-toast';
import { usePdvReceiptSettings } from '@/hooks/usePdvReceiptSettings';
import { usePdvReceiptCompany, PDV_RECEIPT_COMPANY_PENDING } from '@/hooks/usePdvReceiptCompany';
import { readDeviceReceiptFormat } from '@/lib/pdv/receipt/devicePreference';
import { resolvePdvReceiptStagePolicy } from '@/lib/pdv/receipt/stagePolicy';
import type { preparePdvStageReceiptAuto } from '@/lib/pdv/receipt/stageAuto';
import type { PdvReceiptFormat, PdvReceiptSnapshot } from '@/lib/pdv/receipt/model';

export async function openPdvDeliveryReceipt(deliveryId: string, format: PdvReceiptFormat, options: { company: PdvReceiptSnapshot['company'] | null; target?: Window | null; copies?: 1 | 2 | 3; signal?: AbortSignal; isCurrent?: () => boolean; output?: PdvReceiptOutput }) {
  if (!options.company) { options.target?.close(); throw new Error(PDV_RECEIPT_COMPANY_PENDING); }
  const assertCurrent = () => {
    if (options.signal?.aborted || options.isCurrent?.() === false) {
      throw new Error('O contexto do comprovante mudou. Abra a retirada novamente.');
    }
  };
  try { assertCurrent(); } catch (error) { options.target?.close(); throw error; }
  const target = 'target' in options ? options.target : openPendingPdfTab('Gerando comprovante de retirada...');
  const close = () => target?.close();
  options.signal?.addEventListener('abort', close, { once: true });
  try {
    const result = options.signal ? await fetchPdvDeliveryReceipt(deliveryId, options.signal) : await fetchPdvDeliveryReceipt(deliveryId);
    assertCurrent();
    const prepared = await preparePdvReceiptSnapshotLogo(toPdvDeliveryReceiptSnapshot(result, { company: options.company }));
    assertCurrent();
    if (options.output) await options.output(generatePdvReceiptPdf(prepared, format, { copies: options.copies }), receiptFilename(prepared, format), target, options);
    else previewPdvDeliveryReceipt(result, target, { company: prepared.company, format, copies: options.copies });
  } catch (error) { close(); throw error; }
  finally { options.signal?.removeEventListener('abort', close); }
}

/** Captura o contexto no início da operação, inclusive antes do writer confirmar. */
export function usePdvDeliveryReceiptOpener(entityId?: string | null) {
  const company = usePdvReceiptCompany();
  const output = useDomiLinkReceiptOutput();
  const scope = usePdvAuthorizedQueryScope();
  const { roles, permissions, hasPermissionRecord } = useAuth();
  const canRead = roles.some(role => ['admin', 'gestor', 'super_admin'].includes(role))
    || (hasPermissionRecord === true && (permissions.includes('*') || permissions.includes('screen:pdv_dispatch')));
  const signature = JSON.stringify([scope.key, canRead, entityId ?? null]);
  const current = useRef({ signature });
  if (current.current.signature !== signature) current.current = { signature };
  const requestScope = current.current;
  const pending = useRef(new Set<AbortController>());
  const attempts = useRef(new Set<() => void>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const requests = pending.current;
    const prepared = attempts.current;
    return () => {
      mounted.current = false;
      for (const request of requests) request.abort();
      requests.clear();
      for (const cancel of prepared) cancel();
      prepared.clear();
    };
  }, [signature]);
  const isCurrent = () => mounted.current && current.current === requestScope && scope.ready && canRead;
  return {
    ready: scope.ready && canRead && Boolean(company),
    isCurrent,
    guardAttempt(attempt: ReturnType<typeof preparePdvStageReceiptAuto>) {
      const cancel = () => attempt.cancel();
      attempts.current.add(cancel);
      return {
        isCurrent,
        cancel() { attempts.current.delete(cancel); cancel(); },
        async commit(...args: Parameters<typeof attempt.commit>) {
          try {
            if (!isCurrent()) { cancel(); return; }
            await attempt.commit(...args);
          } finally { attempts.current.delete(cancel); }
        },
      };
    },
    async open(deliveryId: string, format: PdvReceiptFormat, options: { target?: Window | null; copies?: 1 | 2 | 3 } = {}) {
      if (!isCurrent()) { options.target?.close(); return; }
      const controller = new AbortController();
      pending.current.add(controller);
      try {
        await openPdvDeliveryReceipt(deliveryId, format, { ...options, company, signal: controller.signal, isCurrent, output });
      } catch (error) {
        // O evento continua confirmado; uma resposta obsoleta não publica PDF nem
        // erro em outra empresa. Falha real no mesmo contexto segue ao chamador.
        if (isCurrent() && !controller.signal.aborted) throw error;
      } finally { pending.current.delete(controller); }
    },
  };
}

export function PdvDeliveryReceiptButton({ deliveryId }: { deliveryId: string }) {
  const opener = usePdvDeliveryReceiptOpener(deliveryId);
  const [loadingScope, setLoadingScope] = useState<typeof opener.isCurrent | null>(null);
  const loading = loadingScope?.() === true;
  const { toast } = useToast();
  const settings = usePdvReceiptSettings();
  const format = readDeviceReceiptFormat() ?? resolvePdvReceiptStagePolicy(settings.data, 'delivery').format;

  async function open() {
    if (!opener.ready) return;
    setLoadingScope(() => opener.isCurrent);
    try { await opener.open(deliveryId, format); }
    catch {
      if (opener.isCurrent()) toast({ title: 'Não foi possível abrir o comprovante', description: 'Tente novamente pelo botão da retirada.', variant: 'destructive' });
    } finally {
      if (opener.isCurrent()) setLoadingScope(null);
    }
  }

  return <PdvReceiptCompanyTooltip ready={opener.ready} message={PDV_RECEIPT_COMPANY_PENDING}><Button type="button" variant="outline" onClick={() => void open()} disabled={loading || !opener.ready}><>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Comprovante</></Button></PdvReceiptCompanyTooltip>;
}
