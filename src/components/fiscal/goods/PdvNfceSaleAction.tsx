import { Link } from 'react-router-dom';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { localizeAppPath } from '@/lib/i18n/appRouteSlugs';
import { useGoodsFiscalReadiness } from '@/hooks/useGoodsFiscalReadiness';
import { openPendingPdfTab } from '@/utils/openPdfInTab';
import { goodsArtifactUrl, showGoodsArtifact } from '@/lib/fiscal/goodsArtifact';
import { goodsRejectionGuidance } from "@/lib/fiscal/goodsRejectionGuidance";
import { useEffect, useRef, useState } from 'react';
import { FileSearch, FileText, Loader2, ReceiptText, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useGoodsFiscalAccess } from '@/hooks/useGoodsFiscalAccess';
import { useGoodsFiscalDocumentAction, useGoodsFiscalDocuments, type GoodsFiscalDraft } from '@/hooks/useGoodsFiscal';
import { useGoodsFiscalSettings } from '@/hooks/useGoodsFiscalSettings';
import { cloneGoodsDraftForReissue, goodsDocumentRecovery, pdvNfceStatus, shouldAskPdvNfce } from '@/lib/fiscal/pdvNfce';
import { GoodsFiscalWizard } from './GoodsFiscalWizard';

interface Props {
  /** Somente o ID retornado pelo servidor após a confirmação da venda. */
  orderId: string;
  confirmed?: boolean;
  /** Ative somente no resultado imediato do pagamento; histórico não abre pergunta sozinho. */
  promptAfterPayment?: boolean;
  /** Controller sempre montado fora do menu que o aciona. */
  detailsOpen?: boolean;
  onDetailsOpenChange?: (open: boolean) => void;
  contextKey?: string | null;
  onPromptShown?: () => void;
}
export function PdvNfceSaleAction(props: Props) {
  const access = useGoodsFiscalAccess();
  const prompted = useRef(new Set<string>());
  const promptKey = `${access.scopeId}:${props.contextKey ?? ''}:${props.orderId}`;
  const markPrompted = () => { prompted.current.add(promptKey); props.onPromptShown?.(); };
  const promptConsumed = () => prompted.current.has(promptKey);
  if (!access.allowed) {
    const message = access.isLoading ? 'Verificando seu acesso fiscal…' : 'A NFC-e exige o módulo de Notas Fiscais e permissão de emissão. Peça ao administrador para conferir seu acesso. A venda permanece concluída.';
    if (props.detailsOpen !== undefined) return <ResponsiveModal open={props.detailsOpen} onOpenChange={props.onDetailsOpenChange ?? (() => {})} title="NFC-e do pedido" density="compact"><p role={access.isLoading ? 'status' : 'alert'} className="text-sm text-muted-foreground">{message}</p></ResponsiveModal>;
    return <p className="text-sm text-muted-foreground">{message}</p>;
  }
  return <PdvNfceSaleContext key={`${access.scopeId}:${props.contextKey ?? ''}:${props.orderId}`} {...props} markPrompted={markPrompted} promptConsumed={promptConsumed} />;
}
function PdvNfceSaleContext({ orderId, confirmed = true, promptAfterPayment = false, detailsOpen, onDetailsOpenChange, markPrompted, promptConsumed }: Props & { markPrompted: () => void; promptConsumed: () => boolean }) {
  const { settings, isLoading: settingsLoading, isError: settingsError } = useGoodsFiscalSettings();
  const docs = useGoodsFiscalDocuments(65, orderId);
  const action = useGoodsFiscalDocumentAction();
  const document = docs.data?.[0]; const status = String(document?.status ?? '');
  const recovery = document ? goodsDocumentRecovery(document) : null;
  const readiness = useGoodsFiscalReadiness(65,!document || status === 'draft');
  const { locale } = useAppLocaleContext();
  const [open, setOpen] = useState(false); const [ask, setAsk] = useState(false);
  const [reissueDraft, setReissueDraft] = useState<GoodsFiscalDraft | null>(null);
  const [cancel, setCancel] = useState(false); const [reason, setReason] = useState('');
  const [artifact, setArtifact] = useState<{url:string;kind:'xml'|'pdf';expiresAt:number} | null>(null);
  const alive = useRef(true);
  const pendingDanfce = useRef<Window|null>(null);
  const reserveDanfce = () => { if(settings.nfce.openDanfceAfterAuthorization) pendingDanfce.current=openPendingPdfTab('Aguardando autorização da NFC-e…'); };
  const closePendingDanfce = () => { pendingDanfce.current?.close();pendingDanfce.current=null; };
  useEffect(() => { alive.current = true; return () => { alive.current = false;pendingDanfce.current?.close(); }; }, []);
  const afterSaved = async (result?:Record<string,unknown>) => {
    const pending=pendingDanfce.current;pendingDanfce.current=null;
    try { await docs.refetch(); } catch { /* A autorização conhecida não depende da atualização da lista. */ }
    if(!alive.current){pending?.close();return;}
    if(result?.status!=='authorized' || !settings.nfce.openDanfceAfterAuthorization || typeof result.id!=='string'){pending?.close();return;}
    onDetailsOpenChange?.(true);
    try{
      const response=await action.mutateAsync({model:65,documentId:result.id,action:'artifact',kind:'pdf'});
      const url=goodsArtifactUrl(response.url);
      if(!alive.current || !url){pending?.close();return;}
      setArtifact({url,kind:'pdf',expiresAt:Date.now()+Math.min(300,Number(response.expiresIn)||300)*1000});
      if(!showGoodsArtifact(pending,url))toast.message('NFC-e autorizada. Use Abrir DANFC-e para visualizar o documento.');
    }catch{pending?.close();if(alive.current)toast.message('A nota foi autorizada. Use DANFC-e para solicitar o documento quando estiver disponível.');}
  };
  useEffect(() => {
    if (!promptConsumed() && promptAfterPayment && !docs.isLoading && !settingsLoading && !docs.isError && !settingsError && readiness.data?.ready === true && shouldAskPdvNfce(settings.nfce.enabled, settings.nfce.afterPaymentMode, confirmed, !!document)) {
      markPrompted(); setAsk(true);
    }
  }, [promptAfterPayment, docs.isLoading, docs.isError, settingsLoading, settingsError, settings.nfce.enabled, settings.nfce.afterPaymentMode, confirmed, document, markPrompted, promptConsumed, readiness.data?.ready]);
  const run = async (name: 'consult' | 'artifact' | 'cancel' | 'revise' | 'resume', kind?: 'xml' | 'pdf') => {
    if (typeof document?.id !== 'string' || action.isPending) return;
    if(name === 'resume')reserveDanfce();
    const pending = name === 'artifact' ? openPendingPdfTab(kind === 'xml' ? 'Preparando XML fiscal…' : 'Preparando DANFC-e…') : null;
    try {
      const response = await action.mutateAsync({ model: 65, documentId: document.id, action: name, kind, reason: name === 'cancel' ? reason.trim() : undefined });
      if (!alive.current) { pending?.close(); return; }
      if (name === 'artifact') {
        const url = goodsArtifactUrl(response.url);
        if (!url) throw new Error('Não foi possível liberar o arquivo fiscal. Tente novamente.');
        setArtifact({url,kind:kind ?? 'pdf',expiresAt:Date.now()+Math.min(300,Number(response.expiresIn)||300)*1000});
        if (!showGoodsArtifact(pending,url)) toast.message('O navegador não abriu a nova aba. Use o link do arquivo disponível neste painel.');
      } else toast.message(name === 'cancel' && response.status !== 'cancelled' ? 'Cancelamento sob consulta. Aguarde a confirmação da SEFAZ.' : `NFC-e: ${pdvNfceStatus(response.status)}.`);
      if (name === 'cancel') { setCancel(false); setReason(''); }
      if(name === 'resume')await afterSaved({...response,id:document.id});
      if (name === 'revise') { await docs.refetch(); if(alive.current) { onDetailsOpenChange?.(false); setOpen(true); } }
    } catch (e) { pending?.close(); if(name==='resume')closePendingDanfce(); if (alive.current) toast.error((e as Error).message); }
  };
  const canOpen = confirmed && settings.nfce.enabled && !settingsLoading && !settingsError && !docs.isLoading && !docs.isError && readiness.data?.ready === true && (!document || status === 'draft');
  const openWizard = () => { setReissueDraft(null); onDetailsOpenChange?.(false); setOpen(true); };
  const reissue = () => {
    const draft = cloneGoodsDraftForReissue(document?.draft_payload) as unknown as GoodsFiscalDraft;
    setReissueDraft(draft);
    onDetailsOpenChange?.(false);
    setOpen(true);
  };
  const content = <div className="space-y-3" aria-label="NFC-e da venda">
    <div className="flex flex-wrap items-center gap-2"><Badge className={status === 'authorized' ? 'bg-emerald-700 text-white' : status === 'rejected' ? 'bg-red-700 text-white' : 'bg-slate-700 text-white'}>NFC-e · {pdvNfceStatus(status || null)}</Badge>{(docs.isLoading || action.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
      {(!document || status === 'draft') && <Button variant="outline" size="sm" disabled={!canOpen} onClick={openWizard}><ReceiptText className="mr-2 h-4 w-4" />{status === 'draft' ? 'Revisar NFC-e' : 'Emitir NFC-e'}</Button>}
      {recovery && <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => recovery.action === 'reissue' ? reissue() : run(recovery.action)}><ReceiptText className="mr-2 h-4 w-4" />{recovery.label}</Button>}
      {document && !['draft', 'queued', 'preparing', 'signed'].includes(status) && <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => run('consult')}><FileSearch className="mr-2 h-4 w-4" />Consultar situação</Button>}
      {status === 'authorized' && <><Button variant="outline" size="sm" disabled={action.isPending} onClick={() => run('artifact', 'pdf')}><FileText className="mr-2 h-4 w-4" />DANFC-e</Button><Button variant="outline" size="sm" disabled={action.isPending} onClick={() => run('artifact', 'xml')}>XML</Button><Button variant="outline" size="sm" disabled={action.isPending} onClick={() => setCancel(true)}><XCircle className="mr-2 h-4 w-4" />Cancelar NFC-e</Button></>}
    </div>
    {artifact && artifact.expiresAt > Date.now() && <p className="text-sm"><a className="font-semibold underline underline-offset-4" href={artifact.url} target="_blank" rel="noopener noreferrer">Abrir {artifact.kind === 'xml' ? 'XML' : 'DANFC-e'}</a><span className="ml-2 text-muted-foreground">Link temporário. Se expirar, solicite o arquivo novamente.</span></p>}
    {(docs.isError || settingsError) && <p role="alert" className="text-sm text-destructive">Não foi possível consultar o estado fiscal. A venda permanece concluída. <button className="underline" onClick={() => docs.refetch()}>Tentar novamente</button></p>}
    {(!document || status === 'draft') && settings.nfce.enabled && <div className="space-y-2 text-sm">
      {readiness.isLoading && <p role="status">Conferindo a configuração fiscal…</p>}
      {readiness.isError && <p role="alert">Não foi possível conferir a configuração fiscal. <button className="font-semibold underline" onClick={() => readiness.refetch()}>Tentar novamente</button></p>}
      {readiness.data && !readiness.data.ready && <div role="status" className="space-y-2"><p className="font-semibold">Antes de emitir, confira:</p><ul className="list-disc space-y-1 pl-5">{readiness.data.issues.map((issue,index) => <li key={`${issue.code}:${index}`}>{issue.message}</li>)}</ul><Link className="inline-flex font-semibold underline underline-offset-4" to={localizeAppPath('/notas-fiscais/configuracoes',locale)}>Abrir configurações fiscais</Link></div>}
    </div>}
    {status === 'uncertain' && <p role="status" className="text-sm text-muted-foreground">A confirmação não voltou. Consulte esta mesma nota antes de tentar novamente.</p>}
    {status === 'rejected' && <p role="alert" className="text-sm text-destructive">{goodsRejectionGuidance(document?.last_error_code)} A venda permanece concluída.</p>}
    {!settings.nfce.enabled && !settingsLoading && <p className="text-sm text-muted-foreground">Ative a NFC-e nas Configurações Fiscais para emitir.</p>}
  </div>;
  return <>
    {detailsOpen === undefined ? content : <ResponsiveModal open={detailsOpen} onOpenChange={onDetailsOpenChange ?? (() => {})} title="NFC-e do pedido" description="A situação fiscal é independente do pagamento da venda." density="compact">{content}</ResponsiveModal>}
    <AlertDialog open={ask} onOpenChange={setAsk}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Emitir NFC-e desta venda?</AlertDialogTitle><AlertDialogDescription>A venda já está concluída. Revise os dados fiscais antes de emitir.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Agora não</AlertDialogCancel><AlertDialogAction onClick={openWizard}>Revisar e emitir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <GoodsFiscalWizard open={open} onOpenChange={next => { setOpen(next); if (!next) setReissueDraft(null); }} model={65} direction="saida" sourceType="pdv_sale" sourceId={orderId} documentId={reissueDraft ? null : typeof document?.id === 'string' ? document.id : null} initialDraft={reissueDraft ?? (document?.draft_payload && typeof document.draft_payload === 'object' ? document.draft_payload as GoodsFiscalDraft : null)} initialNature={settings.nfce.defaultOperationNature} includeIdentifiedConsumer={settings.nfce.includeIdentifiedConsumer} onBeforeEmit={reserveDanfce} onEmitFailure={closePendingDanfce} onSaved={afterSaved} />
    <AlertDialog open={cancel} onOpenChange={setCancel}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancelar NFC-e</AlertDialogTitle><AlertDialogDescription>Informe uma justificativa com pelo menos 15 caracteres. O cancelamento fiscal não estorna a venda.</AlertDialogDescription></AlertDialogHeader><Input aria-label="Justificativa do cancelamento fiscal" value={reason} maxLength={255} onChange={e => setReason(e.target.value)} /><AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction disabled={reason.trim().length < 15 || action.isPending} onClick={e => { e.preventDefault(); void run('cancel'); }}>Solicitar cancelamento</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
