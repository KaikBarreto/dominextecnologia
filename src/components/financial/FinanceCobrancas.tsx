import { useState, useMemo } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { EmptyState } from '@/components/mobile/EmptyState';
import { ChargeDialog } from '@/components/financial/ChargeDialog';
import {
  useTenantCharges,
  buildCheckoutUrl,
  TenantChargeApiError,
  type TenantCharge,
} from '@/hooks/useTenantCharges';
import { useCustomers } from '@/hooks/useCustomers';
import { classifyTenantChargeStatus } from '@/utils/tenantChargeStatus';
import { formatBRL } from '@/utils/currency';
import { readPastedCents } from '@/lib/money-paste-mask';
import {
  Copy,
  RotateCcw,
  Plus,
  Search,
  CalendarDays,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Pencil,
  Trash2,
  AlertTriangle,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

/** Cobrança ainda não paga/estornada — só nela faz sentido editar ou excluir.
 *  Cobrança paga (CONFIRMED/RECEIVED/RECEIVED_IN_CASH) segue o caminho do
 *  estorno; a edge é quem valida de verdade (`not_editable`). */
function canManageCharge(status: string): boolean {
  const cls = classifyTenantChargeStatus(status);
  return cls === 'pending' || cls === 'overdue';
}

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
  const { charges, isLoading, refund, update, remove } = useTenantCharges();
  const { customers } = useCustomers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [refundTargetId, setRefundTargetId] = useState<string | null>(null);

  // ── Editar cobrança (valor, vencimento, descrição) ──────────────────────────
  const [editTarget, setEditTarget] = useState<TenantCharge | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editDueDate, setEditDueDate] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // ── Excluir cobrança (individual e em lote) ─────────────────────────────────
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Aviso PERSISTENTE (faixa que não some sozinha): a cobrança foi alterada ou
  // removida no gateway, mas o lançamento no Financeiro ficou para trás (ex.:
  // já estava baixado). Some só quando o usuário dispensa.
  const [warningBanner, setWarningBanner] = useState<string | null>(null);

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

  // ── Seleção múltipla (exclusão em lote) ─────────────────────────────────────
  // Seleção é livre em qualquer linha (mesmo paga) — o filtro de quem pode
  // realmente ser excluída acontece na hora de confirmar, e o usuário é
  // avisado se a seleção misturar cobranças pagas/estornadas com pendentes.
  const selectedCharges = useMemo(
    () => filtered.filter((c) => selectedIds.has(c.id)),
    [filtered, selectedIds],
  );
  const deletableSelected = useMemo(
    () => selectedCharges.filter((c) => canManageCharge(c.status)),
    [selectedCharges],
  );
  const blockedSelectedCount = selectedCharges.length - deletableSelected.length;
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) return new Set();
      const next = new Set(prev);
      filtered.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Mensagem final ao usuário: prioriza o `message` do servidor (já em
   *  PT-BR); cai no fallback TRADUZIDO por código quando ele vier vazio. */
  const errorMessage = (err: unknown): string => {
    if (err instanceof TenantChargeApiError) {
      if (err.message) return err.message;
      return t.errors[err.code] ?? t.errors.unknown;
    }
    return err instanceof Error && err.message ? err.message : t.errors.unknown;
  };

  const showFinanceWarning = (warning: string | null) => {
    if (!warning) return;
    toast({ variant: 'destructive', title: t.financeWarning.title, description: warning });
    setWarningBanner(warning);
  };

  const openEditDialog = (charge: TenantCharge) => {
    setEditTarget(charge);
    setEditAmount(charge.value);
    setEditDueDate(charge.due_date ?? '');
    setEditDescription(charge.description ?? '');
  };

  const handleEditAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setEditAmount(parseInt(raw || '0', 10) / 100);
  };
  // Colar um valor pronto (ex. "4.550" de planilha) NÃO passa pela regra de
  // centavos comum: daria R$ 45,50 (100x menor). Ver `money-paste-mask.ts`.
  const handleEditAmountPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cents = readPastedCents(e);
    if (cents != null) setEditAmount(cents / 100);
  };
  const editAmountDisplay = editAmount
    ? editAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const handleSubmitEdit = async () => {
    if (!editTarget) return;
    if (!editAmount || editAmount <= 0) {
      toast({ variant: 'destructive', title: t.editDialog.validation.valueRequired });
      return;
    }
    if (!editDueDate) {
      toast({ variant: 'destructive', title: t.editDialog.validation.dueDateRequired });
      return;
    }
    // Contrato da edge é parcial: só envia o que realmente mudou.
    const patch: { charge_id: string; value?: number; due_date?: string; description?: string } = {
      charge_id: editTarget.id,
    };
    if (editAmount !== editTarget.value) patch.value = editAmount;
    if (editDueDate !== (editTarget.due_date ?? '')) patch.due_date = editDueDate;
    if (editDescription !== (editTarget.description ?? '')) patch.description = editDescription;

    try {
      const result = await update.mutateAsync(patch);
      toast({ title: t.editDialog.success });
      showFinanceWarning(result.financeWarning);
      setEditTarget(null);
    } catch (err) {
      toast({ variant: 'destructive', title: t.editDialog.errorTitle, description: errorMessage(err) });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      const result = await remove.mutateAsync({ charge_id: deleteTargetId });
      toast({ title: t.deleteDialog.success });
      showFinanceWarning(result.financeWarning);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTargetId);
        return next;
      });
    } catch (err) {
      toast({ variant: 'destructive', title: t.deleteDialog.errorTitle, description: errorMessage(err) });
    } finally {
      setDeleteTargetId(null);
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (deletableSelected.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        deletableSelected.map((c) => remove.mutateAsync({ charge_id: c.id })),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      const warnings = results
        .filter((r): r is PromiseFulfilledResult<{ financeWarning: string | null }> => r.status === 'fulfilled')
        .map((r) => r.value.financeWarning)
        .filter((w): w is string => !!w);

      if (fail === 0) {
        toast({ title: t.bulkDeleteDialog.success(ok) });
      } else {
        toast({
          variant: 'destructive',
          title: t.bulkDeleteDialog.partial(ok, fail),
        });
      }
      if (warnings.length > 0) {
        showFinanceWarning(warnings.join('\n'));
      }
      // Limpa da seleção só as que foram processadas nesta rodada (excluídas ou
      // que falharam) — o que ficou bloqueado por já estar pago continua
      // selecionado, caso o usuário queira revisar.
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletableSelected.forEach((c) => next.delete(c.id));
        return next;
      });
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  };

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
      {/* ── Aviso persistente: cobrança alterada/excluída no gateway, mas o
          lançamento no Financeiro ficou para trás. NÃO some sozinho — só
          quando o usuário dispensa. */}
      {warningBanner && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-medium text-foreground">{t.financeWarning.title}</p>
            <p className="whitespace-pre-line text-xs text-muted-foreground">{warningBanner}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => setWarningBanner(null)}
            aria-label={t.financeWarning.dismiss}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

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

      {/* ── Barra de seleção em lote — só aparece com algo selecionado ────────── */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">{t.selection.countLabel(selectedIds.size)}</span>
          <Button
            variant="destructive-ghost"
            size="sm"
            onClick={() => setBulkDeleteOpen(true)}
            disabled={bulkDeleting}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t.bulkDelete}
          </Button>
        </div>
      )}

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
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label={t.selection.selectAllAria}
                  />
                </th>
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
                // Editar/excluir só faz sentido para cobrança ainda não paga/estornada
                // (o caminho da paga é o estorno, acima).
                const canManage = canManageCharge(charge.status);
                const customerName = charge.customer_id ? (customerMap[charge.customer_id] ?? '—') : '—';
                return (
                  <tr key={charge.id} className="bg-card transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selectedIds.has(charge.id)}
                        onCheckedChange={() => toggleSelectRow(charge.id)}
                        aria-label={t.selection.selectRowAria}
                      />
                    </td>
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
                        {canManage && (
                          <>
                            <Button
                              variant="edit-ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => openEditDialog(charge)}
                              title={t.actions.edit}
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="ml-1 hidden lg:inline">{t.actions.edit}</span>
                            </Button>
                            <Button
                              variant="destructive-ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => setDeleteTargetId(charge.id)}
                              disabled={remove.isPending}
                              title={t.actions.delete}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="ml-1 hidden lg:inline">{t.actions.delete}</span>
                            </Button>
                          </>
                        )}
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
              const canManage = canManageCharge(charge.status);
              const customerName = charge.customer_id ? (customerMap[charge.customer_id] ?? '—') : '—';
              return (
                <div key={charge.id} className="bg-card px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <Checkbox
                        className="mt-1 shrink-0"
                        checked={selectedIds.has(charge.id)}
                        onCheckedChange={() => toggleSelectRow(charge.id)}
                        aria-label={t.selection.selectRowAria}
                      />
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
                        {canManage && (
                          <>
                            <Button
                              variant="edit-ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => openEditDialog(charge)}
                              title={t.actions.edit}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="destructive-ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => setDeleteTargetId(charge.id)}
                              disabled={remove.isPending}
                              title={t.actions.delete}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
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

      {/* ── Editar cobrança (valor, vencimento, descrição) — só PENDING/OVERDUE ── */}
      <ResponsiveModal
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        title={t.editDialog.title}
        description={t.editDialog.description}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={update.isPending}>
              {t.editDialog.cancel}
            </Button>
            <Button onClick={handleSubmitEdit} disabled={update.isPending}>
              {update.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.editDialog.submitting}
                </>
              ) : (
                t.editDialog.submit
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 px-4 pb-4 sm:px-1">
          {/* Valor (máscara de dinheiro — NÃO NumericInput, é campo monetário) */}
          <div className="space-y-2">
            <Label htmlFor="edit-charge-amount" className="text-sm font-medium">
              {t.editDialog.fields.value}
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                R$
              </span>
              <Input
                id="edit-charge-amount"
                className="pl-9"
                inputMode="numeric"
                placeholder={t.editDialog.fields.valuePlaceholder}
                value={editAmountDisplay}
                onChange={handleEditAmountChange}
                onPaste={handleEditAmountPaste}
              />
            </div>
          </div>

          {/* Vencimento */}
          <div className="space-y-2">
            <Label htmlFor="edit-charge-due" className="text-sm font-medium">
              {t.editDialog.fields.dueDate}
            </Label>
            <Input
              id="edit-charge-due"
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
            />
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="edit-charge-desc" className="text-sm font-medium">
              {t.editDialog.fields.description}
            </Label>
            <Textarea
              id="edit-charge-desc"
              rows={2}
              placeholder={t.editDialog.fields.descriptionPlaceholder}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
          </div>
        </div>
      </ResponsiveModal>

      {/* ── Confirmação de exclusão individual ──────────────────────────────── */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTargetId(null)}>
              {t.deleteDialog.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleConfirmDelete}
              disabled={remove.isPending}
            >
              {t.deleteDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirmação de exclusão em lote ─────────────────────────────────── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => !open && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.bulkDeleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletableSelected.length === 0
                ? t.bulkDeleteDialog.descriptionNoneDeletable
                : blockedSelectedCount > 0
                  ? t.bulkDeleteDialog.descriptionMixed(deletableSelected.length, blockedSelectedCount)
                  : t.bulkDeleteDialog.descriptionAllDeletable(deletableSelected.length)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkDeleteOpen(false)}>
              {t.bulkDeleteDialog.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleConfirmBulkDelete}
              disabled={bulkDeleting || deletableSelected.length === 0}
            >
              {t.bulkDeleteDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
