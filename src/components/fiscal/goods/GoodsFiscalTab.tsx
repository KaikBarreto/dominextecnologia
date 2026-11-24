import { cloneGoodsDraftForReissue, goodsDocumentRecovery } from '@/lib/fiscal/pdvNfce';
import { useGoodsFiscalAccess } from '@/hooks/useGoodsFiscalAccess';
import { goodsRejectionGuidance } from "@/lib/fiscal/goodsRejectionGuidance";
import { useEffect, useRef, useState } from "react";
import { openPendingPdfTab } from "@/utils/openPdfInTab";
import { goodsArtifactUrl, showGoodsArtifact } from "@/lib/fiscal/goodsArtifact";
import { toast } from "sonner";
import {
  AlertTriangle,
  Download,
  FileSearch,
  FileText,
  Loader2,
  Plus,
  ReceiptText,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/mobile/EmptyState";
import { formatDate, formatMoney } from "@/lib/format";
import { useAppLocaleContext } from "@/contexts/AppLocaleContext";
import {
  useGoodsFiscalDocumentAction,
  useGoodsFiscalDocuments,
  type GoodsDirection,
  type GoodsModel,
  type GoodsFiscalDraft,
} from "@/hooks/useGoodsFiscal";
import { GoodsFiscalWizard } from "./GoodsFiscalWizard";
import { GoodsInvoiceTypeSelector } from "./GoodsInvoiceTypeSelector";

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-slate-700 text-white" },
  queued: { label: "Na fila", className: "bg-blue-700 text-white" },
  preparing: { label: "Preparando", className: "bg-blue-700 text-white" },
  signed: { label: "Assinada", className: "bg-indigo-700 text-white" },
  transmitting: { label: "Enviando", className: "bg-amber-600 text-white" },
  uncertain: {
    label: "Consultando SEFAZ",
    className: "bg-amber-600 text-white",
  },
  authorized: { label: "Autorizada", className: "bg-emerald-700 text-white" },
  rejected: { label: "Rejeitada", className: "bg-red-700 text-white" },
  cancellation_pending: {
    label: "Cancelando",
    className: "bg-amber-600 text-white",
  },
  cancelled: { label: "Cancelada", className: "bg-slate-700 text-white" },
};

export function GoodsFiscalTab({ model }: { model: GoodsModel }) {
  const access = useGoodsFiscalAccess();
  if (!access.allowed) return <p role={access.isLoading ? 'status' : 'alert'} className="py-6 text-sm text-muted-foreground">{access.isLoading ? 'Verificando acesso fiscal…' : 'Você precisa de permissão para emitir notas fiscais de mercadorias. Peça ao administrador para conferir seu acesso.'}</p>;
  return <GoodsFiscalTabContext key={`${access.scopeId}:${model}`} model={model} />;
}
function GoodsFiscalTabContext({ model }: { model: GoodsModel }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{id:string | null;draft:GoodsFiscalDraft} | null>(null);
  const [artifact,setArtifact] = useState<{documentId:string;url:string;kind:'xml'|'pdf';expiresAt:number} | null>(null);
  const alive = useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const [typeSelectorOpen, setTypeSelectorOpen] = useState(false);
  const [direction, setDirection] = useState<GoodsDirection>("saida");
  const [cancelDocumentId, setCancelDocumentId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const documents = useGoodsFiscalDocuments(model);
  const action = useGoodsFiscalDocumentAction();
  const { locale, timezone } = useAppLocaleContext();
  const label = model === 65 ? "NFC-e" : "NF-e";
  const startNew = () => {
    setEditing(null);
    if (model === 55) setTypeSelectorOpen(true);
    else {
      setDirection("saida");
      setOpen(true);
    }
  };

  const runAction = async (
    documentId: string,
    name: "consult" | "artifact",
    kind?: "xml" | "pdf",
  ) => {
    if (action.isPending) return;
    const pending = name === 'artifact' ? openPendingPdfTab(kind === 'xml' ? 'Preparando XML fiscal…' : `Preparando ${model === 55 ? 'DANFE' : 'DANFC-e'}…`) : null;
    try {
      const result = await action.mutateAsync({
        model,
        documentId,
        action: name,
        kind,
      });
      if (!alive.current) { pending?.close(); return; }
      if (name === 'artifact') {
        const url = goodsArtifactUrl(result.url);
        if (!url) throw new Error('Não foi possível liberar o arquivo fiscal. Tente novamente.');
        setArtifact({documentId,url,kind:kind ?? 'pdf',expiresAt:Date.now()+Math.min(300,Number(result.expiresIn)||300)*1000});
        if (!showGoodsArtifact(pending,url)) toast.message('O navegador não abriu a nova aba. Use o link disponível na nota.');
      } else toast.message('Situação fiscal consultada.');
    } catch (error) {
      pending?.close();
      if (alive.current) toast.error((error as Error).message);
    }
  };

  const confirmCancellation = async () => {
    if (!cancelDocumentId || cancelReason.trim().length < 15) return;
    try {
      const result = await action.mutateAsync({
        model,
        documentId: cancelDocumentId,
        action: "cancel",
        reason: cancelReason.trim(),
      });
      if (!alive.current) return;
      toast.message(
        result.status === "cancelled"
          ? "Cancelamento confirmado pela SEFAZ."
          : "Cancelamento enviado e mantido sob consulta.",
      );
      setCancelDocumentId(null);
      setCancelReason("");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">{label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {model === 65
              ? "Cupons eletrônicos e DANFC-e."
              : "Entradas, saídas, XML e DANFE."}
          </p>
        </div>
        <Button
          className="h-12 gap-2 px-5 text-base font-bold"
          onClick={startNew}
        >
          <Plus className="h-5 w-5" />
          Nova {label}
        </Button>
      </div>

      {documents.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : documents.isError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive p-4 text-destructive">
          <AlertTriangle className="mt-0.5 h-5 w-5" />
          <div>
            <p className="font-bold">Não foi possível carregar as notas</p>
            <p className="text-sm">
              Tente novamente. Nenhuma emissão foi iniciada.
            </p>
          </div>
        </div>
      ) : documents.data?.length === 0 ? (
        <EmptyState
          icon={
            model === 65 ? (
              <ReceiptText className="h-10 w-10" />
            ) : (
              <FileText className="h-10 w-10" />
            )
          }
          title={`Nenhuma ${label} por aqui`}
          description="Crie manualmente ou importe uma venda/compra já registrada."
          action={{ label: `Nova ${label}`, onClick: startNew }}
        />
      ) : (
        <div className="grid gap-3">
          {documents.data?.map((document) => {
            const status = STATUS[String(document.status)] ?? STATUS.draft;
            const payload =
              document.draft_payload &&
              typeof document.draft_payload === "object"
                ? (document.draft_payload as Record<string, unknown>)
                : {};
            const total = Array.isArray(payload.items)
              ? payload.items.reduce((sum, item) => {
                  const row =
                    item && typeof item === "object"
                      ? (item as Record<string, unknown>)
                      : {};
                  return sum + Number(row.total || 0);
                }, 0)
              : 0;
            const id = String(document.id);
            const recovery = goodsDocumentRecovery(document);
            const isAuthorized = document.status === "authorized";
            return (
              <article
                key={id}
                className="grid gap-4 rounded-2xl border p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  {model === 65 ? (
                    <ReceiptText className="h-6 w-6" />
                  ) : (
                    <FileText className="h-6 w-6" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">
                      {document.number
                        ? `${label} nº ${document.number}`
                        : `${label} em rascunho`}
                    </h3>
                    <Badge className={status.className}>{status.label}</Badge>
                    <Badge variant="outline">
                      {Number(document.environment) === 1
                        ? "Produção"
                        : "Homologação"}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {String(payload.nature || "Operação fiscal")} ·{" "}
                    {formatDate(String(document.created_at), locale, timezone)}
                  </p>
                  {document.last_error_message ? (
                    <p className="mt-2 text-sm font-medium text-destructive">
                      {goodsRejectionGuidance(document.last_error_code)}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recovery && <Button size="sm" variant="outline" disabled={action.isPending} onClick={async()=>{
                      try {
                        if (recovery.action === 'reissue') {
                          const cloned = cloneGoodsDraftForReissue(payload) as unknown as GoodsFiscalDraft;
                          setEditing({id:null,draft:cloned});
                          setDirection(cloned.direction === 'entrada' ? 'entrada' : 'saida');
                          setOpen(true);
                          return;
                        }
                        await action.mutateAsync({model,documentId:id,action:recovery.action});
                        if(!alive.current)return;
                        await documents.refetch();
                        if(!alive.current)return;
                        if(recovery.action==='revise'){setEditing({id,draft:payload as unknown as GoodsFiscalDraft});setDirection(payload.direction==='entrada'?'entrada':'saida');setOpen(true);}
                        else toast.message('Emissão retomada. Acompanhe a situação desta mesma nota.');
                      }catch(error){if(alive.current)toast.error((error as Error).message);}
                    }}><ReceiptText className="mr-2 h-4 w-4" />{recovery.label}</Button>}

                    {document.status === 'draft' && <Button size="sm" variant="outline" onClick={()=>{
                      const draft = payload as unknown as GoodsFiscalDraft;
                      setEditing({id,draft});setDirection(draft.direction === 'entrada' ? 'entrada' : 'saida');setOpen(true);
                    }}><FileText className="mr-2 h-4 w-4" />Continuar rascunho</Button>}
                    {document.access_key && document.status !== 'signed' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={action.isPending}
                        onClick={() => void runAction(id, "consult")}
                      >
                        <FileSearch className="mr-2 h-4 w-4" />
                        Consultar
                      </Button>
                    ) : null}
                    {document.processed_xml_path ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={action.isPending}
                        onClick={() => void runAction(id, "artifact", "xml")}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        XML
                      </Button>
                    ) : null}
                    {document[
                      model === 55 ? "danfe_pdf_path" : "danfce_pdf_path"
                    ] ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={action.isPending}
                        onClick={() => void runAction(id, "artifact", "pdf")}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {model === 55 ? "DANFE" : "DANFC-e"}
                      </Button>
                    ) : null}
                    {isAuthorized ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={action.isPending}
                        onClick={() => setCancelDocumentId(id)}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                  {artifact?.documentId === id && artifact.expiresAt > Date.now() && <p className="mt-2 text-sm"><a href={artifact.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">Abrir {artifact.kind === 'xml' ? 'XML' : model === 55 ? 'DANFE' : 'DANFC-e'}</a></p>}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Total
                  </p>
                  <strong className="text-lg">
                    {formatMoney(total, "BRL", locale)}
                  </strong>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <GoodsInvoiceTypeSelector
        open={typeSelectorOpen}
        onOpenChange={setTypeSelectorOpen}
        onSelect={(selectedDirection) => {
          setDirection(selectedDirection);
          setOpen(true);
        }}
      />
      <GoodsFiscalWizard
        model={model}
        direction={direction}
        documentId={editing?.id}
        initialDraft={editing?.draft}
        sourceType={editing?.draft.sourceType && editing.draft.sourceType !== 'manual' ? editing.draft.sourceType : undefined}
        sourceId={editing?.draft.sourceId}
        open={open}
        onOpenChange={setOpen}
        onSaved={() => documents.refetch()}
      />
      <AlertDialog
        open={cancelDocumentId !== null}
        onOpenChange={(value) => {
          if (!value) {
            setCancelDocumentId(null);
            setCancelReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar {label} na SEFAZ?</AlertDialogTitle>
            <AlertDialogDescription>
              A situação oficial será consultada antes do envio. Essa operação
              fiscal não pode ser desfeita depois de confirmada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="goods-cancel-reason">Justificativa</Label>
            <Textarea
              id="goods-cancel-reason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              maxLength={255}
              placeholder="Explique o motivo com pelo menos 15 caracteres"
            />
            <p className="text-xs text-muted-foreground">
              {cancelReason.trim().length}/15 caracteres mínimos
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelReason.trim().length < 15 || action.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmCancellation();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {action.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
