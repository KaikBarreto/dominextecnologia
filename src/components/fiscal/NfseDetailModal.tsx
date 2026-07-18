import { useEffect, useMemo, useState } from 'react';
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
import { formatMoney, formatDateTime as formatDateTimeLib } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  useNfse,
  useNfseEvents,
  useNfseStatusPolling,
  type NfseEmission,
} from '@/hooks/useNfse';
import { NfseStatusBadge, isNfseTerminal } from './nfseStatus';

/** Ação que pode ser auto-disparada ao abrir (vinda do menu da linha/card). */
export type NfseDetailAction = 'refresh' | 'cancel' | 'pdf' | 'xml';

interface NfseDetailModalProps {
  emission: NfseEmission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dispara automaticamente uma ação ao abrir (deep-link do menu da lista). */
  initialAction?: NfseDetailAction | null;
}

/** Extrai uma mensagem legível do payload do evento, se houver. */
function eventMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const candidate = p.message ?? p.mensagem ?? p.motivo ?? p.descricao;
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
}

export function NfseDetailModal({ emission: emissionProp, open, onOpenChange, initialAction }: NfseDetailModalProps) {
  const { emissions, refreshStatus, isRefreshingStatus, cancel, isCancelling } = useNfse();
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;

  // O `emissionProp` é um snapshot do momento em que a lista abriu o modal.
  // Re-derivamos do dataset fresco (invalidado pelo polling) pra o detalhe
  // refletir status/PDF/XML que chegarem enquanto o modal está aberto.
  const emission = useMemo(
    () => emissions.find((e) => e.id === emissionProp?.id) ?? emissionProp,
    [emissions, emissionProp],
  );

  // Polling automático: só enquanto o modal está aberto e a nota é NÃO-terminal.
  const terminal = emission ? isNfseTerminal(emission.status) : true;
  const { isPolling, timedOut } = useNfseStatusPolling(
    emission?.id ?? null,
    open && !!emission && !terminal,
  );

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
      toast.error(res.message ?? t.detail.toasts.refreshError);
      return;
    }
    toast.success(res.message ?? t.detail.toasts.refreshSuccess);
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
      toast.error(res.message ?? t.detail.toasts.cancelError);
      return;
    }
    toast.success(res.message ?? t.detail.toasts.cancelSuccess);
    onOpenChange(false);
  };

  // ----- Viewer dedicado (substitui o conteúdo do modal) -----
  if (viewer) {
    const viewerTitle =
      viewer.kind === 'pdf' ? t.detail.viewerTitlePdf : t.detail.viewerTitleXml;
    return (
      <ResponsiveModal
        open={open}
        onOpenChange={(v) => {
          if (!v) setViewer(null);
          onOpenChange(v);
        }}
        title={viewerTitle}
        className="sm:max-w-[900px]"
      >
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => setViewer(null)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> {t.detail.back}
          </Button>
          <iframe
            title={viewerTitle}
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
        title={
          emission.numero_nfse
            ? `${t.detail.notePrefix} ${emission.numero_nfse}`
            : t.detail.titleFallback
        }
      >
        <div className="space-y-5 py-1">
          {/* Status + atualizar */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <NfseStatusBadge status={emission.status} />
              {isPolling && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t.detail.processing}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshingStatus || isPolling}
              className="gap-2"
            >
              {isRefreshingStatus || isPolling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t.detail.refreshStatus}
            </Button>
          </div>

          {timedOut && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshingStatus}
              className="w-full rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-left text-xs text-amber-700 dark:text-amber-300"
            >
              {t.detail.stillProcessing}
            </button>
          )}

          {/* Dados */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field
              label={t.detail.fields.serviceValue}
              value={
                emission.valor_servico != null
                  ? formatMoney(emission.valor_servico, currency, locale)
                  : '—'
              }
            />
            <Field
              label={t.detail.fields.iss}
              value={
                emission.valor_iss != null
                  ? formatMoney(emission.valor_iss, currency, locale)
                  : '—'
              }
            />
            <Field
              label={t.detail.fields.issuedAt}
              value={emission.emitida_em ? formatDateTimeLib(emission.emitida_em, locale, timezone) : '—'}
            />
            <Field
              label={t.detail.fields.createdAt}
              value={emission.created_at ? formatDateTimeLib(emission.created_at, locale, timezone) : '—'}
            />
            <Field label={t.detail.fields.protocol} value={emission.protocolo || '—'} />
            <Field
              label={t.detail.fields.accessKey}
              value={emission.chave_acesso || '—'}
              className="col-span-2 break-all"
            />
            <Field
              label={t.detail.fields.description}
              value={emission.descricao_servico || '—'}
              className="col-span-2"
            />
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
                  <FileText className="h-4 w-4" /> {t.detail.viewPdf}
                </Button>
              )}
              {emission.xml_url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setViewer({ url: emission.xml_url!, kind: 'xml' })}
                >
                  <FileCode className="h-4 w-4" /> {t.detail.viewXml}
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
              <Ban className="h-4 w-4" /> {t.detail.cancelNote}
            </Button>
          )}

          {/* Histórico */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-muted-foreground" /> {t.detail.history.title}
            </div>
            {eventsLoading ? (
              <p className="text-xs text-muted-foreground">{t.detail.history.loading}</p>
            ) : events.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t.detail.history.empty}</p>
            ) : (
              <ul className="space-y-2">
                {events.map((ev) => {
                  const message = eventMessage(ev.payload);
                  return (
                    <li key={ev.id} className="rounded-lg border bg-muted/30 p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {ev.event_type || ev.status || t.detail.history.eventFallback}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {ev.created_at
                            ? formatDateTimeLib(ev.created_at, locale, timezone)
                            : '—'}
                        </span>
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
            <AlertDialogTitle>{t.detail.confirmCancel.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.detail.confirmCancel.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-1">
            <Label className="text-xs">{t.detail.confirmCancel.motivoLabel}</Label>
            <Textarea
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              placeholder={t.detail.confirmCancel.motivoPlaceholder}
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>
              {t.detail.confirmCancel.backBtn}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmCancel();
              }}
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Ban className="h-4 w-4 mr-2" />
              )}
              {t.detail.confirmCancel.confirmBtn}
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
