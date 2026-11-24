import { goodsRejectionGuidance } from "@/lib/fiscal/goodsRejectionGuidance";
import { useEffect, useRef, useState } from 'react';
import { FileSearch, FileText, Loader2, ReceiptText, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useGoodsFiscalAccess } from '@/hooks/useGoodsFiscalAccess';
import { useGoodsFiscalDocumentAction, useGoodsFiscalDocuments, type GoodsFiscalDraft } from '@/hooks/useGoodsFiscal';
import { useGoodsFiscalSettings } from '@/hooks/useGoodsFiscalSettings';
import { pdvNfceStatus, shouldAskPdvNfce } from '@/lib/fiscal/pdvNfce';
import { GoodsFiscalWizard } from './GoodsFiscalWizard';

interface Props {
  /** Somente o ID retornado pelo servidor após a confirmação da venda. */
  orderId: string;
  confirmed?: boolean;
  /** Ative somente no resultado imediato do pagamento; histórico não abre pergunta sozinho. */
  promptAfterPayment?: boolean;
}
export function PdvNfceSaleAction(props: Props) {
  const access = useGoodsFiscalAccess();
  // Desmontar o estado local e o modal no mesmo render em qualquer mudança de autorização.
  if (!access.allowed) return <p className="text-sm text-muted-foreground">NFC-e indisponível. Confira o módulo de Notas Fiscais e sua permissão de emissão. A venda permanece concluída.</p>;
  return <PdvNfceSaleContext key={`${access.scopeId}:${props.orderId}`} {...props} />;
}
function PdvNfceSaleContext({ orderId, confirmed = true, promptAfterPayment = false }: Props) {
  const { settings, isLoading: settingsLoading, isError: settingsError } = useGoodsFiscalSettings();
  const docs = useGoodsFiscalDocuments(65, orderId);
  const action = useGoodsFiscalDocumentAction();
  const document = docs.data?.[0]; const status = String(document?.status ?? '');
  const [open, setOpen] = useState(false); const [ask, setAsk] = useState(false); const asked = useRef(false);
  const [cancel, setCancel] = useState(false); const [reason, setReason] = useState('');
  useEffect(() => {
    if (!asked.current && promptAfterPayment && !docs.isLoading && !settingsLoading && !docs.isError && !settingsError && shouldAskPdvNfce(settings.nfce.enabled, settings.nfce.afterPaymentMode, confirmed, !!document)) {
      asked.current = true; setAsk(true);
    }
  }, [promptAfterPayment, docs.isLoading, docs.isError, settingsLoading, settingsError, settings.nfce.enabled, settings.nfce.afterPaymentMode, confirmed, document]);
  const run = async (name: 'consult' | 'artifact' | 'cancel', kind?: 'xml' | 'pdf') => {
    if (typeof document?.id !== 'string' || action.isPending) return;
    try {
      const response = await action.mutateAsync({ model: 65, documentId: document.id, action: name, kind, reason: name === 'cancel' ? reason.trim() : undefined });
      if (name === 'artifact' && typeof response.url === 'string') window.open(response.url, '_blank', 'noopener,noreferrer');
      else toast.message(name === 'cancel' && response.status !== 'cancelled' ? 'Cancelamento sob consulta. Aguarde a confirmação da SEFAZ.' : `NFC-e: ${pdvNfceStatus(response.status)}.`);
      if (name === 'cancel') { setCancel(false); setReason(''); }
    } catch (e) { toast.error((e as Error).message); }
  };
  const canOpen = confirmed && settings.nfce.enabled && !settingsLoading && !settingsError && !docs.isLoading && !docs.isError && (!document || status === 'draft');
  return <div className="space-y-3" aria-label="NFC-e da venda">
    <div className="flex flex-wrap items-center gap-2"><Badge className={status === 'authorized' ? 'bg-emerald-700 text-white' : status === 'rejected' ? 'bg-red-700 text-white' : 'bg-slate-700 text-white'}>NFC-e · {pdvNfceStatus(status || null)}</Badge>{(docs.isLoading || action.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
      {(!document || status === 'draft') && <Button variant="outline" size="sm" disabled={!canOpen} onClick={() => setOpen(true)}><ReceiptText className="mr-2 h-4 w-4" />{status === 'draft' ? 'Revisar NFC-e' : 'Emitir NFC-e'}</Button>}
      {document && !['draft', 'queued', 'preparing'].includes(status) && <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => run('consult')}><FileSearch className="mr-2 h-4 w-4" />Consultar situação</Button>}
      {status === 'authorized' && <><Button variant="outline" size="sm" disabled={action.isPending} onClick={() => run('artifact', 'pdf')}><FileText className="mr-2 h-4 w-4" />DANFC-e</Button><Button variant="outline" size="sm" disabled={action.isPending} onClick={() => run('artifact', 'xml')}>XML</Button><Button variant="outline" size="sm" disabled={action.isPending} onClick={() => setCancel(true)}><XCircle className="mr-2 h-4 w-4" />Cancelar NFC-e</Button></>}
    </div>
    {(docs.isError || settingsError) && <p role="alert" className="text-sm text-destructive">Não foi possível consultar o estado fiscal. A venda permanece concluída. <button className="underline" onClick={() => docs.refetch()}>Tentar novamente</button></p>}
    {status === 'uncertain' && <p role="status" className="text-sm text-muted-foreground">A confirmação não voltou. Consulte esta mesma nota antes de tentar novamente.</p>}
    {status === 'rejected' && <p role="alert" className="text-sm text-destructive">{goodsRejectionGuidance(document?.last_error_code)} A venda permanece concluída.</p>}
    {!settings.nfce.enabled && !settingsLoading && <p className="text-sm text-muted-foreground">Ative a NFC-e nas Configurações Fiscais para emitir.</p>}
    <AlertDialog open={ask} onOpenChange={setAsk}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Emitir NFC-e desta venda?</AlertDialogTitle><AlertDialogDescription>A venda já está concluída. Revise os dados fiscais antes de emitir.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Agora não</AlertDialogCancel><AlertDialogAction onClick={() => setOpen(true)}>Revisar e emitir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <GoodsFiscalWizard open={open} onOpenChange={setOpen} model={65} direction="saida" sourceType="pdv_sale" sourceId={orderId} documentId={typeof document?.id === 'string' ? document.id : null} initialDraft={document?.draft_payload && typeof document.draft_payload === 'object' ? document.draft_payload as GoodsFiscalDraft : null} initialNature={settings.nfce.defaultOperationNature} includeIdentifiedConsumer={settings.nfce.includeIdentifiedConsumer} onSaved={async result => {
      await docs.refetch();
      if (result?.status === 'authorized' && settings.nfce.openDanfceAfterAuthorization && typeof result.id === 'string') {
        try { const artifact = await action.mutateAsync({ model: 65, documentId: result.id, action: 'artifact', kind: 'pdf' }); if (typeof artifact.url === 'string') window.open(artifact.url, '_blank', 'noopener,noreferrer'); } catch { toast.message('A nota foi autorizada. Use DANFC-e para abrir o documento quando estiver disponível.'); }
      }
    }} />
    <AlertDialog open={cancel} onOpenChange={setCancel}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancelar NFC-e</AlertDialogTitle><AlertDialogDescription>Informe uma justificativa com pelo menos 15 caracteres. O cancelamento fiscal não estorna a venda.</AlertDialogDescription></AlertDialogHeader><Input aria-label="Justificativa do cancelamento fiscal" value={reason} maxLength={255} onChange={e => setReason(e.target.value)} /><AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction disabled={reason.trim().length < 15 || action.isPending} onClick={e => { e.preventDefault(); void run('cancel'); }}>Solicitar cancelamento</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
