import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  RefreshCw,
  FileText,
  FileCode,
  Ban,
  Loader2,
  History,
  ArrowLeft,
} from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatBRL } from '@/utils/currency';
import { useNfse, useNfseEvents, type NfseEmission } from '@/hooks/useNfse';
import { NfseStatusBadge } from './nfseStatus';

/** Ação que pode ser auto-disparada ao abrir (vinda do menu da linha/card). */
export type NfseDetailAction = 'refresh' | 'cancel' | 'pdf' | 'xml';

interface NfseDetailModalProps {
  emission: NfseEmission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dispara automaticamente uma ação ao abrir (deep-link do menu da lista). */
  initialAction?: NfseDetailAction | null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Extrai uma mensagem legível do payload do evento (PT-BR), se houver. */
function eventMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const candidate = p.message ?? p.mensagem ?? p.motivo ?? p.descricao;
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
}

export function NfseDetailModal({ emission, open, onOpenChange, initialAction }: NfseDetailModalProps) {
  const { refreshStatus, isRefreshingStatus, cancel, isCancelling } = useNfse();
  const { data: events = [], isLoading: eventsLoading } = useNfseEvents(
    open ? emission?.id ?? null : null,
  );

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState('');
  // Viewer dedicado: NUNCA abre PDF/XML em nova aba.
  const [viewer, setViewer] = useState<{ url: string; kind: 'pdf' | 'xml' } | null>(null);

  const [didInitial, setDidInitial] = useState(false);

  const handleRefresh = async () => {
    if (!emission) return;
    const res = await refreshStatus(emission.id);
    if (!res.ok) {
      toast.error(res.message ?? 'Não foi possível atualizar o status.');
      return;
    }
    toast.success(res.message ?? 'Status atualizado.');
  };

  // Deep-link de ação vinda do menu da lista: ao abrir, dispara a ação 1x.
  useEffect(() => {
    if (!open) {
      setDidInitial(false);
      setViewer(null);
      return;
    }
    if (didInitial || !initialAction || !emission) return;
    setDidInitial(true);
    if (initialAction === 'cancel' && emission.status === 'autorizada') {
      setConfirmCancelOpen(true);
    } else if (initialAction === 'pdf' && emission.pdf_url) {
      setViewer({ url: emission.pdf_url, kind: 'pdf' });
    } else if (initialAction === 'xml' && emission.xml_url) {
      setViewer({ url: emission.xml_url, kind: 'xml' });
    } else if (initialAction === 'refresh') {
      void handleRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialAction, emission, didInitial]);

  if (!emission) return null;

  const canCancel = emission.status === 'autorizada';

  const handleConfirmCancel = async () => {
    const res = await cancel({ emissionId: emission.id, motivo: cancelMotivo.trim() || undefined });
    setConfirmCancelOpen(false);
    setCancelMotivo('');
    if (!res.ok) {
      toast.error(res.message ?? 'Não foi possível cancelar a nota.');
      return;
    }
    toast.success(res.message ?? 'Cancelamento solicitado.');
    onOpenChange(false);
  };

  // ----- Viewer dedicado (substitui o conteúdo do modal) -----
  if (viewer) {
    return (
      <ResponsiveModal
        open={open}
        onOpenChange={(v) => {
          if (!v) setViewer(null);
          onOpenChange(v);
        }}
        title={viewer.kind === 'pdf' ? 'PDF da nota' : 'XML da nota'}
        className="sm:max-w-[900px]"
      >
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => setViewer(null)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <iframe
            title={viewer.kind === 'pdf' ? 'PDF da nota fiscal' : 'XML da nota fiscal'}
            src={viewer.url}
            className="w-full h-[70vh] rounded-lg border bg-background"
          />
        </div>
      </ResponsiveModal>
    );
  }

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={emission.numero_nfse ? `Nota nº ${emission.numero_nfse}` : 'Nota fiscal'}
      >
        <div className="space-y-5 py-1">
          {/* Status + atualizar */}
          <div className="flex items-center justify-between gap-2">
            <NfseStatusBadge status={emission.status} />
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshingStatus}
              className="gap-2"
            >
              {isRefreshingStatus ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Atualizar status
            </Button>
          </div>

          {/* Dados */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Valor do serviço" value={emission.valor_servico != null ? formatBRL(emission.valor_servico) : '—'} />
            <Field label="ISS" value={emission.valor_iss != null ? formatBRL(emission.valor_iss) : '—'} />
            <Field label="Emitida em" value={formatDateTime(emission.emitida_em)} />
            <Field label="Criada em" value={formatDateTime(emission.created_at)} />
            <Field label="Protocolo" value={emission.protocolo || '—'} />
            <Field label="Chave de acesso" value={emission.chave_acesso || '—'} className="col-span-2 break-all" />
            <Field label="Descrição" value={emission.descricao_servico || '—'} className="col-span-2" />
          </div>

          {emission.error_message && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {emission.error_message}
            </div>
          )}

          {/* Documentos (viewer dedicado) */}
          {(emission.pdf_url || emission.xml_url) && (
            <div className="flex flex-wrap gap-2">
              {emission.pdf_url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setViewer({ url: emission.pdf_url!, kind: 'pdf' })}
                >
                  <FileText className="h-4 w-4" /> Ver PDF
                </Button>
              )}
              {emission.xml_url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setViewer({ url: emission.xml_url!, kind: 'xml' })}
                >
                  <FileCode className="h-4 w-4" /> Ver XML
                </Button>
              )}
            </div>
          )}

          {/* Cancelar (destructive) */}
          {canCancel && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => setConfirmCancelOpen(true)}
              disabled={isCancelling}
            >
              <Ban className="h-4 w-4" /> Cancelar nota
            </Button>
          )}

          {/* Histórico */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-muted-foreground" /> Histórico
            </div>
            {eventsLoading ? (
              <p className="text-xs text-muted-foreground">Carregando histórico…</p>
            ) : events.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum evento registrado ainda.</p>
            ) : (
              <ul className="space-y-2">
                {events.map((ev) => {
                  const message = eventMessage(ev.payload);
                  return (
                    <li key={ev.id} className="rounded-lg border bg-muted/30 p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{ev.event_type || ev.status || 'Evento'}</span>
                        <span className="text-muted-foreground shrink-0">{formatDateTime(ev.created_at)}</span>
                      </div>
                      {message && <p className="mt-1 text-muted-foreground">{message}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </ResponsiveModal>

      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta nota fiscal?</AlertDialogTitle>
            <AlertDialogDescription>
              O cancelamento é registrado junto à prefeitura e não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-1">
            <Label className="text-xs">Motivo (opcional)</Label>
            <Textarea
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              placeholder="Ex: Serviço não realizado / valor incorreto..."
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmCancel();
              }}
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCancelling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Ban className="h-4 w-4 mr-2" />}
              Cancelar nota
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}
