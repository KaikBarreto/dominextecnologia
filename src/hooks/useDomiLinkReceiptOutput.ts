import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { assertPdvReceiptOperationCurrent, type PdvReceiptOperationGuard } from '@/hooks/usePdvReceiptOperation';
import { printDomiLinkReceipt } from '@/lib/domilink/receiptOutput';
import { readDomiLinkEnabled, readDomiLinkReceiptPrinter } from '@/lib/domilink/storage';
import { openPdfInTab } from '@/utils/openPdfInTab';

export type PdvReceiptOutput = (blob: Blob, filename: string, target: Window | null | undefined, guard: Partial<PdvReceiptOperationGuard>) => Promise<void>;

export function useDomiLinkReceiptOutput(): PdvReceiptOutput | undefined {
  const auth = useAuth();
  const { toast } = useToast();
  const [, refresh] = useState(0);
  useEffect(() => {
    const changed = () => refresh(value => value + 1);
    window.addEventListener('domilink:preferences-changed', changed);
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener('domilink:preferences-changed', changed); window.removeEventListener('storage', changed); };
  }, []);
  const userId = auth.user?.id, companyId = auth.profile?.company_id;
  const ready = !auth.loading && !auth.profileLoading && userId && auth.profile?.user_id === userId && companyId;
  const signature = JSON.stringify([ready, userId, companyId]);
  const current = useRef({ signature });
  if (current.current.signature !== signature) current.current = { signature };
  const captured = current.current;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, [signature]);
  if (!ready || !userId || !companyId || !readDomiLinkEnabled() || !readDomiLinkReceiptPrinter({ userId, companyId })) return undefined;
  return async (blob, filename, target, guard) => {
    const assertCurrent = () => {
      assertPdvReceiptOperationCurrent(guard);
      if (!mounted.current || current.current !== captured || !ready || !userId || !companyId) throw new Error('Abra o atendimento novamente para gerar o comprovante.');
    };
    assertCurrent();
    try {
      const printed = await printDomiLinkReceipt(blob, { userId: userId!, companyId: companyId! }, assertCurrent);
      assertCurrent();
      if (printed) {
        target?.close();
        toast({ title: 'Comprovante enviado à impressora' });
        return;
      }
    } catch {
      assertCurrent();
      openPdfInTab(blob, filename, target);
      toast({ title: 'Comprovante aberto em PDF', description: 'A impressão não foi confirmada. Confira a fila do DomiLink antes de imprimir outra via.' });
      return;
    }
    assertCurrent();
    openPdfInTab(blob, filename, target);
  };
}
