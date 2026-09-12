import { useState, useMemo, useEffect } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
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
import {
  useTenantSubscriptions,
  type TenantSubscription,
  type SubscriptionCycle,
} from '@/hooks/useTenantSubscriptions';
import { formatBRL } from '@/utils/currency';
import { CalendarDays, Loader2, Pencil, Plus, RefreshCw, XCircle } from 'lucide-react';
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

const CYCLES: SubscriptionCycle[] = [
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUALLY',
  'YEARLY',
];

/** Assinatura pode ser editada/cancelada só enquanto não estiver cancelada. */
function isManageable(sub: TenantSubscription): boolean {
  return sub.status !== 'cancelled';
}

// ─────────────────────────────────────────────────────────────────────────────
// EditSubscriptionModal — edita valor, frequência, próximo vencimento e
// descrição de uma assinatura EXISTENTE via edge tenant-asaas-manage-subscription
// (action: 'update'). Reflete na Asaas e no cadastro local — não é um form novo
// de criação, por isso não reaproveita o SubscriptionDialog.
// ─────────────────────────────────────────────────────────────────────────────
function EditSubscriptionModal({
  subscription,
  onOpenChange,
  onSave,
  isPending,
  t,
}: {
  subscription: TenantSubscription | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { value: number; cycle: SubscriptionCycle; next_due_date: string; description: string }) => void;
  isPending: boolean;
  t: typeof MESSAGES['pt-br']['app']['charges']['subscriptions'];
}) {
  const [amount, setAmount] = useState(0);
  const [cycle, setCycle] = useState<SubscriptionCycle>('MONTHLY');
  const [nextDueDate, setNextDueDate] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (subscription) {
      setAmount(Number(subscription.value));
      setCycle(subscription.cycle as SubscriptionCycle);
      setNextDueDate(subscription.next_due_date ?? '');
      setDescription(subscription.description ?? '');
    }
  }, [subscription]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setAmount(parseInt(raw || '0', 10) / 100);
  };
  const amountDisplay = amount
    ? amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const isValid = amount > 0 && !!nextDueDate;

  return (
    <ResponsiveModal
      open={!!subscription}
      onOpenChange={onOpenChange}
      title={t.editDialog.title}
      description={t.editDialog.description}
    >
      <div className="space-y-4 px-4 pb-4 sm:px-1">
        {/* Valor (máscara de dinheiro — NÃO NumericInput) */}
        <div className="space-y-2">
          <Label htmlFor="edit-sub-amount" className="text-sm font-medium">
            {t.fields.value}
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              R$
            </span>
            <Input
              id="edit-sub-amount"
              className="pl-9"
              inputMode="numeric"
              placeholder={t.fields.valuePlaceholder}
              value={amountDisplay}
              onChange={handleAmountChange}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t.fields.cycle}</Label>
            <Select value={cycle} onValueChange={(v) => setCycle(v as SubscriptionCycle)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CYCLES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t.cycles[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-sub-due" className="text-sm font-medium">
              {t.fields.next_due_date}
            </Label>
            <Input
              id="edit-sub-due"
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-sub-desc" className="text-sm font-medium">
            {t.fields.description}
          </Label>
          <Textarea
            id="edit-sub-desc"
            rows={2}
            placeholder={t.fields.descriptionPlaceholder}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t.cancel}
          </Button>
          <Button
            disabled={isPending || !isValid}
            onClick={() => onSave({ value: amount, cycle, next_due_date: nextDueDate, description })}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.editDialog.submitting}
              </>
            ) : (
              t.editDialog.submit
            )}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}

export function FinanceAssinaturas() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.subscriptions;

  const { subscriptions, isLoading, manageSubscription, bulkCancel } = useTenantSubscriptions();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<TenantSubscription | null>(null);
  const [editTarget, setEditTarget] = useState<TenantSubscription | null>(null);

  // ── Seleção múltipla (cancelamento em massa) ──────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);

  const manageableSubs = useMemo(() => subscriptions.filter(isManageable), [subscriptions]);
  const allSelected = manageableSubs.length > 0 && selectedIds.size === manageableSubs.length;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(manageableSubs.map((s) => s.id)));
  };

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

  const handleSaveEdit = async (input: { value: number; cycle: SubscriptionCycle; next_due_date: string; description: string }) => {
    if (!editTarget) return;
    await manageSubscription.mutateAsync({
      subscription_id: editTarget.id,
      action: 'update',
      value: input.value,
      cycle: input.cycle,
      next_due_date: input.next_due_date,
      description: input.description,
    });
    setEditTarget(null);
  };

  const handleConfirmBulkCancel = async () => {
    const ids = Array.from(selectedIds);
    await bulkCancel.mutateAsync(ids);
    setSelectedIds(new Set());
    setBulkCancelOpen(false);
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

      {/* ── Barra de ações ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {selectedIds.size > 0 ? (
          <Button
            variant="destructive-ghost"
            size="sm"
            onClick={() => setBulkCancelOpen(true)}
            disabled={bulkCancel.isPending}
          >
            <XCircle className="mr-2 h-4 w-4" />
            {t.bulkCancel} ({selectedIds.size})
          </Button>
        ) : (
          <span />
        )}
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
                <th className="w-10 px-4 py-3">
                  {manageableSubs.length > 0 && (
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label={t.selection.selectAllAria}
                    />
                  )}
                </th>
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
                  <td className="px-4 py-3">
                    {isManageable(sub) && (
                      <Checkbox
                        checked={selectedIds.has(sub.id)}
                        onCheckedChange={() => toggleSelect(sub.id)}
                      />
                    )}
                  </td>
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
                    {isManageable(sub) && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="edit-ghost"
                          size="sm"
                          onClick={() => setEditTarget(sub)}
                          disabled={manageSubscription.isPending}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          {t.actions.edit}
                        </Button>
                        <Button
                          variant="destructive-ghost"
                          size="sm"
                          onClick={() => setCancelTarget(sub)}
                          disabled={manageSubscription.isPending}
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          {t.actions.cancel}
                        </Button>
                      </div>
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
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    {isManageable(sub) && (
                      <Checkbox
                        className="mt-1 shrink-0"
                        checked={selectedIds.has(sub.id)}
                        onCheckedChange={() => toggleSelect(sub.id)}
                      />
                    )}
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
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {statusBadge(sub.status, t.status)}
                    {isManageable(sub) && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="edit-ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setEditTarget(sub)}
                          disabled={manageSubscription.isPending}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="destructive-ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setCancelTarget(sub)}
                          disabled={manageSubscription.isPending}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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

      {/* ── Dialog editar assinatura ─────────────────────────────────────────── */}
      <EditSubscriptionModal
        subscription={editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        onSave={handleSaveEdit}
        isPending={manageSubscription.isPending}
        t={t}
      />

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

      {/* ── Alert de confirmação de cancelamento em massa ───────────────────── */}
      <AlertDialog open={bulkCancelOpen} onOpenChange={setBulkCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.bulkCancelDialog.titlePrefix} {selectedIds.size} {t.bulkCancelDialog.titleSuffix}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.bulkCancelDialog.descriptionPrefix} {selectedIds.size} {t.bulkCancelDialog.descriptionSuffix}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.bulkCancelDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleConfirmBulkCancel}
              disabled={bulkCancel.isPending}
            >
              {t.bulkCancelDialog.confirm} {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
