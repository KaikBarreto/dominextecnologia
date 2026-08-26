import { useState, useMemo } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ChargeDialog } from '@/components/financial/ChargeDialog';
import { useTenantCharges, buildCheckoutUrl } from '@/hooks/useTenantCharges';
import { useCustomers } from '@/hooks/useCustomers';
import { classifyTenantChargeStatus } from '@/utils/tenantChargeStatus';
import { formatBRL } from '@/utils/currency';
import {
  Copy,
  RotateCcw,
  Plus,
  Search,
  CalendarDays,
  DollarSign,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

/** Formata data yyyy-mm-dd sem travar UTC/BRT. */
function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(
    locale === 'pt-br' ? 'pt-BR' : locale,
    { day: '2-digit', month: '2-digit', year: 'numeric' },
  );
}

type StatusFilter = 'all' | 'pending' | 'paid' | 'overdue' | 'refunded';

/** Badge saturado com cor por classificação de status (regra CEO). */
function StatusBadge({ status, t }: { status: string; t: Record<string, string> }) {
  const cls = classifyTenantChargeStatus(status);
  const map: Record<string, { label: string; className: string }> = {
    paid:     { label: t.paid,     className: 'bg-emerald-600 text-white' },
    pending:  { label: t.pending,  className: 'bg-amber-500 text-white' },
    overdue:  { label: t.overdue,  className: 'bg-destructive text-white' },
    refunded: { label: t.refunded, className: 'bg-slate-500 text-white' },
    other:    { label: t.other,    className: 'bg-slate-400 text-white' },
  };
  const cfg = map[cls] ?? map.other;
  return (
    <Badge className={cn('shrink-0', cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

export function FinanceCobrancas() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.central;
  const { toast } = useToast();

  // Hook sem filtro de cliente — busca TODAS as cobranças da empresa (RLS escopa por company_id)
  const { charges, isLoading, refund } = useTenantCharges();
  const { customers } = useCustomers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [refundTargetId, setRefundTargetId] = useState<string | null>(null);

  // Mapa customer_id → nome para evitar N buscas
  const customerMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of customers) {
      map[c.id] = c.name;
    }
    return map;
  }, [customers]);

  // Cards de totais
  const totals = useMemo(() => {
    let pending = 0;
    let paid = 0;
    let overdue = 0;
    for (const c of charges) {
      const cls = classifyTenantChargeStatus(c.status);
      if (cls === 'pending') pending += c.value;
      else if (cls === 'paid') paid += c.value;
      else if (cls === 'overdue') overdue += c.value;
    }
    return { pending, paid, overdue };
  }, [charges]);

  // Filtro por status + busca por nome de cliente
  const filtered = useMemo(() => {
    return charges.filter((c) => {
      // Status
      if (statusFilter !== 'all') {
        const cls = classifyTenantChargeStatus(c.status);
        if (cls !== statusFilter) return false;
      }
      // Busca por nome do cliente
      if (search.trim()) {
        const name = (c.customer_id ? customerMap[c.customer_id] : '') ?? '';
        if (!name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [charges, statusFilter, search, customerMap]);

  const handleCopyLink = async (charge: (typeof charges)[0]) => {
    const url = charge.public_short_code
      ? buildCheckoutUrl(charge.public_short_code)
      : charge.invoice_url ?? '';
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t.actions.linkCopied });
    } catch {
      toast({ variant: 'destructive', title: t.actions.linkCopied });
    }
  };

  const handleConfirmRefund = async () => {
    if (!refundTargetId) return;
    try {
      await refund.mutateAsync({ charge_id: refundTargetId });
      toast({ title: t.actions.refundSuccess });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t.actions.refundError,
        description: err instanceof Error ? err.message : t.actions.refundErrorFallback,
      });
    } finally {
      // Fecha o dialog de confirmação independente de sucesso ou falha.
      setRefundTargetId(null);
    }
  };

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: 'all',      label: t.filters.all },
    { key: 'pending',  label: t.filters.pending },
    { key: 'paid',     label: t.filters.paid },
    { key: 'overdue',  label: t.filters.overdue },
    { key: 'refunded', label: t.filters.refunded },
  ];

  const methodLabel = (billing_type: string | null): string => {
    if (!billing_type) return '—';
    const key = billing_type.toUpperCase() as keyof typeof t.methods;
    return t.methods[key] ?? billing_type;
  };

  return (
    <div className="space-y-4">
      {/* ── Cards de totais ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* A receber */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <DollarSign className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t.cards.pending}</p>
            <p className="truncate text-base font-bold text-amber-600">
              {formatBRL(totals.pending)}
            </p>
          </div>
        </div>
        {/* Recebido */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <TrendingUp className="h-5 w-5 shrink-0 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t.cards.paid}</p>
            <p className="truncate text-base font-bold text-emerald-600">
              {formatBRL(totals.paid)}
            </p>
          </div>
        </div>
        {/* Vencido */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t.cards.overdue}</p>
            <p className="truncate text-base font-bold text-destructive">
              {formatBRL(totals.overdue)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Barra de ações + filtros ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Busca */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t.filters.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Botão nova cobrança */}
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t.newButton}
        </Button>
      </div>

      {/* Pills de filtro de status */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium transition-colors',
              statusFilter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Lista / Tabela ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={<DollarSign className="h-full w-full" />}
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
                <th className="px-4 py-3 font-medium text-muted-foreground">{t.table.status}</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">{t.table.dueDate}</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">{t.table.method}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((charge) => {
                // Estorno só faz sentido quando pago via Asaas (há asaas_payment_id)
                // e o status não é RECEIVED_IN_CASH (dinheiro em espécie — fora do Asaas).
                const isPaid =
                  classifyTenantChargeStatus(charge.status) === 'paid' &&
                  charge.status.toUpperCase() !== 'RECEIVED_IN_CASH' &&
                  !!charge.asaas_payment_id;
                const customerName = charge.customer_id ? (customerMap[charge.customer_id] ?? '—') : '—';
                return (
                  <tr key={charge.id} className="bg-card transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{customerName}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {formatBRL(charge.value)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={charge.status} t={t.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                        {fmtDate(charge.due_date, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {methodLabel(charge.billing_type)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => handleCopyLink(charge)}
                          title={t.actions.copyLink}
                        >
                          <Copy className="h-4 w-4" />
                          <span className="ml-1 hidden lg:inline">{t.actions.copyLink}</span>
                        </Button>
                        {isPaid && (
                          <Button
                            variant="destructive-ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setRefundTargetId(charge.id)}
                            disabled={refund.isPending}
                            title={t.actions.refund}
                          >
                            <RotateCcw className="h-4 w-4" />
                            <span className="ml-1 hidden lg:inline">{t.actions.refund}</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Lista mobile — cards */}
          <div className="divide-y divide-border sm:hidden">
            {filtered.map((charge) => {
              // Estorno só faz sentido quando pago via Asaas (há asaas_payment_id)
              // e o status não é RECEIVED_IN_CASH (dinheiro em espécie — fora do Asaas).
              const isPaid =
                classifyTenantChargeStatus(charge.status) === 'paid' &&
                charge.status.toUpperCase() !== 'RECEIVED_IN_CASH' &&
                !!charge.asaas_payment_id;
              const customerName = charge.customer_id ? (customerMap[charge.customer_id] ?? '—') : '—';
              return (
                <div key={charge.id} className="bg-card px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{customerName}</p>
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {formatBRL(charge.value)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        {fmtDate(charge.due_date, locale)}
                        <span className="mx-1">·</span>
                        {methodLabel(charge.billing_type)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StatusBadge status={charge.status} t={t.status} />
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => handleCopyLink(charge)}
                          title={t.actions.copyLink}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {isPaid && (
                          <Button
                            variant="destructive-ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => setRefundTargetId(charge.id)}
                            disabled={refund.isPending}
                            title={t.actions.refund}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Dialog nova cobrança (sem cliente pré-selecionado — seleção livre) ── */}
      <ChargeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      {/* ── Confirmação de estorno ───────────────────────────────────────────── */}
      <AlertDialog open={!!refundTargetId} onOpenChange={(open) => !open && setRefundTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.actions.refundConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.actions.refundConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRefundTargetId(null)}>
              {t.actions.refundCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleConfirmRefund}
              disabled={refund.isPending}
            >
              {t.actions.refundConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
