import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Lock,
  HelpCircle,
  RefreshCw,
  ShieldOff,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { EmptyState } from '@/components/mobile/EmptyState';
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
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  useNfseAutoJobs,
  nfseAutoRetryErrorMessage,
  type NfseAutoJobRow,
  type NfseAutoJobStatus,
} from '@/hooks/useNfseAutoJobs';
import { useNfseEmission } from '@/hooks/useNfseEmission';
import { NfseAutoStatusBadge } from '@/components/fiscal/nfseAutoStatus';
import { NfseDetailModal } from '@/components/fiscal/NfseDetailModal';
import type { NfseEmission } from '@/hooks/useNfse';

/**
 * "Emissões automáticas" — Fiscal → onde a pendência da NFS-e automática
 * (por contrato recorrente, `nfse_auto_jobs`) fica VISÍVEL.
 *
 * Regra de existência desta tela (invariante do plano-pai, §4.4): falha é
 * visível, nunca silenciosa. Se uma nota não saiu, o dono da empresa descobre
 * AQUI, com o motivo em PT-BR leigo e o que fazer, não no mês seguinte pelo
 * contador.
 *
 * NUNCA escreve em `nfse_auto_jobs` (nem insert, nem update) — a fila é
 * escriturada só por trigger/cron/RPC. A única ação desta tela é a RPC
 * `nfse_auto_enfileirar` (via `useNfseAutoJobs().retry`), que já valida
 * permissão/posse e devolve a mensagem certa em PT-BR — mostrada como veio,
 * nunca reescrita por cima.
 */
export function AutoEmissoesTab() {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse.auto;

  const { jobs, isLoading, isError, refetch, retry, isRetrying } = useNfseAutoJobs();

  const fmtMoney = (value: number | null | undefined) =>
    value == null ? null : formatMoney(value, currency, locale);
  const fmtDate = (value: string | null | undefined) =>
    value ? formatDate(value, locale, timezone) : null;
  /** "set/2026" — mesmo padrão enxuto usado na listagem de notas. */
  const fmtMonthYear = (value: string | null | undefined) => {
    if (!value) return null;
    const month = formatDate(value, locale, timezone, {
      day: undefined,
      year: undefined,
      month: 'short',
    }).replace(/\.$/, '');
    const year = formatDate(value, locale, timezone, { day: undefined, month: undefined, year: 'numeric' });
    return `${month}/${year}`;
  };

  // ─── Agrupamento por situação (régua: falha visível primeiro) ───────────
  const GROUP_ORDER: {
    key: 'blocked' | 'failed' | 'waitingDecision' | 'inProgress' | 'issued' | 'cancelled';
    statuses: NfseAutoJobStatus[];
    icon: LucideIcon;
    iconClass: string;
  }[] = [
    { key: 'blocked', statuses: ['bloqueada_assinatura', 'bloqueada_modulo', 'bloqueada_cota'], icon: Lock, iconClass: 'text-orange-500' },
    { key: 'failed', statuses: ['falhou'], icon: AlertTriangle, iconClass: 'text-red-600' },
    { key: 'waitingDecision', statuses: ['aguardando_decisao'], icon: HelpCircle, iconClass: 'text-sky-500' },
    { key: 'inProgress', statuses: ['pendente', 'processando'], icon: Clock, iconClass: 'text-amber-500' },
    { key: 'issued', statuses: ['emitida'], icon: CheckCircle2, iconClass: 'text-emerald-500' },
    { key: 'cancelled', statuses: ['cancelada'], icon: Ban, iconClass: 'text-muted-foreground' },
  ];

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((g) => ({
      ...g,
      rows: jobs
        .filter((j) => g.statuses.includes(j.status))
        .sort((a, b) => (a.scheduled_for < b.scheduled_for ? 1 : -1)),
    })).filter((g) => g.rows.length > 0);
  }, [jobs]);

  // ─── Ação "tentar de novo" / "emitir mesmo assim" ────────────────────────
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [emitAnywayJob, setEmitAnywayJob] = useState<NfseAutoJobRow | null>(null);

  const runRetry = async (job: NfseAutoJobRow) => {
    setRetryingId(job.id);
    try {
      await retry({ financialTransactionId: job.financial_transaction_id });
      toast.success(t.toasts.retrySuccess);
    } catch (err) {
      // A RPC já devolve a frase pronta em PT-BR leigo — mostrada como veio.
      toast.error(nfseAutoRetryErrorMessage(err, t.toasts.retryGenericError));
    } finally {
      setRetryingId(null);
    }
  };

  const confirmEmitAnyway = async () => {
    if (!emitAnywayJob) return;
    const job = emitAnywayJob;
    setEmitAnywayJob(null);
    await runRetry(job);
  };

  // ─── "Ver nota" (job emitido) ─────────────────────────────────────────────
  const [viewEmissionId, setViewEmissionId] = useState<string | null>(null);
  const { emission: viewEmissionFull } = useNfseEmission(viewEmissionId);
  const viewEmission: NfseEmission | null = viewEmissionFull
    ? { ...viewEmissionFull, status: viewEmissionFull.status }
    : null;

  // ─── Motivo exibido no card ───────────────────────────────────────────────
  const jobReason = (job: NfseAutoJobRow): string | null => {
    if (job.last_error && job.last_error.trim()) return job.last_error.trim();
    switch (job.status) {
      case 'bloqueada_assinatura':
        return t.reasons.bloqueada_assinatura;
      case 'bloqueada_modulo':
        return t.reasons.bloqueada_modulo;
      case 'bloqueada_cota':
        return t.reasons.bloqueada_cota;
      case 'aguardando_decisao':
        return t.reasons.aguardando_decisao;
      default:
        return null;
    }
  };

  const customerLabel = (job: NfseAutoJobRow) =>
    job.customer_company_name || job.customer_name || t.card.customerFallback;

  const canRetry = (status: NfseAutoJobStatus) =>
    status === 'falhou' ||
    status === 'cancelada' ||
    status === 'bloqueada_assinatura' ||
    status === 'bloqueada_modulo' ||
    status === 'bloqueada_cota';

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert className="bg-card border-border [&>svg]:text-destructive">
        <ShieldOff className="h-4 w-4" />
        <AlertDescription className="space-y-2 text-xs">
          <p className="font-bold text-destructive">{t.loadErrorTitle}</p>
          <p>{t.loadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            {t.retryBtn}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={<RefreshCw className="h-10 w-10" />}
        title={t.empty.title}
        description={t.empty.description}
      />
    );
  }

  return (
    <div className="space-y-6 min-w-0 w-full">
      {grouped.map((group) => {
        const GroupIcon = group.icon;
        return (
          <div key={group.key} className="space-y-2 min-w-0">
            <div className="flex items-center gap-2">
              <GroupIcon className={cn('h-4 w-4 shrink-0', group.iconClass)} />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                {t.groups[group.key]}
              </span>
              <span className="text-[11px] text-muted-foreground/60">({group.rows.length})</span>
            </div>

            <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border/60">
              {group.rows.map((job) => {
                const reason = jobReason(job);
                const competence = fmtMonthYear(job.competencia);
                const scheduled = fmtDate(job.scheduled_for);

                return (
                  <div key={job.id} className="flex flex-col gap-2 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate leading-tight">
                          {customerLabel(job)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {job.contract_name || t.card.contractFallback}
                        </p>
                      </div>
                      {job.transaction_amount != null && (
                        <p className="font-bold text-sm whitespace-nowrap text-primary shrink-0">
                          {fmtMoney(job.transaction_amount)}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                      {competence && (
                        <span>
                          {t.card.competencePrefix}: {competence}
                        </span>
                      )}
                      {competence && scheduled && <span className="text-muted-foreground/50">·</span>}
                      {scheduled && (
                        <span>
                          {t.card.scheduledForPrefix}: {scheduled}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <NfseAutoStatusBadge status={job.status} />

                      <div className="flex items-center gap-2">
                        {job.status === 'emitida' && job.nfse_emission_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => setViewEmissionId(job.nfse_emission_id)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {t.actions.viewInvoice}
                          </Button>
                        )}

                        {job.status === 'aguardando_decisao' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={isRetrying && retryingId === job.id}
                            onClick={() => setEmitAnywayJob(job)}
                          >
                            {isRetrying && retryingId === job.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <HelpCircle className="h-3.5 w-3.5" />
                            )}
                            {t.actions.emitAnyway}
                          </Button>
                        )}

                        {canRetry(job.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={isRetrying && retryingId === job.id}
                            onClick={() => void runRetry(job)}
                          >
                            {isRetrying && retryingId === job.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            {t.actions.retry}
                          </Button>
                        )}
                      </div>
                    </div>

                    {reason && (
                      <NoticeBanner
                        variant={job.status === 'falhou' ? 'destructive' : job.status === 'aguardando_decisao' ? 'info' : 'warning'}
                        className="mt-0.5"
                      >
                        <span className="text-xs">{reason}</span>
                      </NoticeBanner>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Confirmação do "emitir mesmo assim" (R7.5): explica ANTES do clique
          que a competência já fechou e que emitir mexe em imposto de período
          já apurado. Mesmo padrão de AlertDialog usado pelo cancelamento de
          nota em NfseDetailModal, a tela irmã deste módulo. */}
      <AlertDialog open={!!emitAnywayJob} onOpenChange={(o) => !o && setEmitAnywayJob(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.emitAnywayDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.emitAnywayDialog.description.replace(
                '{competence}',
                (emitAnywayJob && fmtMonthYear(emitAnywayJob.competencia)) || '',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRetrying}>{t.emitAnywayDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRetrying}
              onClick={(e) => {
                e.preventDefault();
                void confirmEmitAnyway();
              }}
            >
              {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : t.emitAnywayDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detalhe da nota já emitida ("Ver nota"). */}
      <NfseDetailModal
        emission={viewEmission}
        open={!!viewEmissionId}
        onOpenChange={(o) => !o && setViewEmissionId(null)}
      />
    </div>
  );
}
