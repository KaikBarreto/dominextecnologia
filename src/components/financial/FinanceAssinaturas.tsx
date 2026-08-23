import { useState, useMemo } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { EmptyState } from '@/components/mobile/EmptyState';
import { SubscriptionDialog } from '@/components/financial/SubscriptionDialog';
import { useTenantSubscriptions, type TenantSubscription } from '@/hooks/useTenantSubscriptions';
import { formatBRL } from '@/utils/currency';
import { CalendarDays, Plus, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── MRR: normaliza o valor de cada ciclo para mensal ────────────────────────
// anual/12, semestral/6, trimestral/3, quinzenal*2, semanal*4.33, mensal=1
function toMonthlyFactor(cycle: string): number {
  switch (cycle) {
    case 'YEARLY':      return 1 / 12;
    case 'SEMIANNUALLY': return 1 / 6;
    case 'QUARTERLY':   return 1 / 3;
    case 'MONTHLY':     return 1;
    case 'BIWEEKLY':    return 2;
    case 'WEEKLY':      return 4.33;
    default:            return 1;
  }
}

// ─── Badge de status (saturado, texto branco — regra CEO) ────────────────────
function statusBadge(status: string, t: Record<string, string>) {
  const map: Record<string, { label: string; className: string }> = {
    active:    { label: t.active,    className: 'bg-emerald-500 text-white' },
    overdue:   { label: t.overdue,   className: 'bg-destructive text-white' },
    cancelled: { label: t.cancelled, className: 'bg-slate-500 text-white' },
    paused:    { label: t.paused,    className: 'bg-amber-500 text-white' },
    pending:   { label: t.pending,   className: 'bg-amber-500 text-white' },
  };
  const cfg = map[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
  return (
    <Badge className={cn('shrink-0 capitalize', cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

/** Formata data yyyy-mm-dd sem travar UTC/BRT. */
function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale === 'pt-br' ? 'pt-BR' : locale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function FinanceAssinaturas() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.subscriptions;

  const { subscriptions, isLoading, manageSubscription } = useTenantSubscriptions();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<TenantSubscription | null>(null);

  // ── Resumo MRR ─────────────────────────────────────────────────────────────
  const { activeCount, mrr } = useMemo(() => {
    const actives = subscriptions.filter((s) => s.status === 'active');
    const total = actives.reduce((sum, s) => sum + Number(s.value) * toMonthlyFactor(s.cycle), 0);
    return { activeCount: actives.length, mrr: total };
  }, [subscriptions]);

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    await manageSubscription.mutateAsync({
      subscription_id: cancelTarget.id,
      action: 'cancel',
    });
    setCancelTarget(null);
  };

  return (
    <div className="space-y-4">
      {/* ── Resumo MRR ─────────────────────────────────────────────────────── */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <RefreshCw className="h-4 w-4 shrink-0 text-emerald-500" />
          <div className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-foreground">
              {t.mrr.activeCount(activeCount)}
            </span>
            <span className="text-xs text-muted-foreground">
              {t.mrr.label}:{' '}
              <strong className="text-foreground">{formatBRL(mrr)}</strong>
            </span>
          </div>
        </div>
      )}

      {/* ── Botão nova assinatura ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span />
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t.newButton}
        </Button>
      </div>

      {/* ── Lista ─────────────────────────────────────────────────────────── */}
      {isLoading ? null : subscriptions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={<RefreshCw className="h-full w-full" />}
            title={t.empty.title}
            description={t.empty.description}
            action={{ label: t.newButton, onClick: () => setDialogOpen(true) }}
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          {/* Tabela desktop */}
          <table className="hidden w-full text-sm sm:table">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">{t.table.customer}</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">{t.table.value}</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">{t.table.cycle}</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">{t.table.nextDue}</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">{t.table.method}</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">{t.table.status}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="bg-card transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">
                    {sub.customers?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    {formatBRL(Number(sub.value))}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.cycles[sub.cycle as keyof typeof t.cycles] ?? sub.cycle}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      {fmtDate(sub.next_due_date, locale)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {sub.billing_type === 'UNDEFINED'
                      ? t.billing_types.UNDEFINED
                      : (t.billing_types[sub.billing_type as keyof typeof t.billing_types] ?? sub.billing_type)}
                  </td>
                  <td className="px-4 py-3">
                    {statusBadge(sub.status, t.status)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {sub.status !== 'cancelled' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setCancelTarget(sub)}
                        disabled={manageSubscription.isPending}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        {t.actions.cancel}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Lista mobile */}
          <div className="divide-y divide-border sm:hidden">
            {subscriptions.map((sub) => (
              <div key={sub.id} className="bg-card px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {sub.customers?.name ?? '—'}
                    </p>
                    <p className="text-sm font-semibold text-foreground tabular-nums">
                      {formatBRL(Number(sub.value))}
                      <span className="ml-1 font-normal text-muted-foreground text-xs">
                        / {t.cycles[sub.cycle as keyof typeof t.cycles] ?? sub.cycle}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3 shrink-0" />
                      {fmtDate(sub.next_due_date, locale)}
                      <span className="mx-1">·</span>
                      {sub.billing_type === 'UNDEFINED'
                        ? t.billing_types.UNDEFINED
                        : (t.billing_types[sub.billing_type as keyof typeof t.billing_types] ?? sub.billing_type)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {statusBadge(sub.status, t.status)}
                    {sub.status !== 'cancelled' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => setCancelTarget(sub)}
                        disabled={manageSubscription.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dialog nova assinatura ──────────────────────────────────────────── */}
      <SubscriptionDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {/* ── Alert de confirmação de cancelamento ────────────────────────────── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.cancelDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.cancelDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelTarget(null)}>
              {t.cancelDialog.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleConfirmCancel}
              disabled={manageSubscription.isPending}
            >
              {t.cancelDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
