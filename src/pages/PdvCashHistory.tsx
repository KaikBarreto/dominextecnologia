import { Fragment, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  History,
  Loader2,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  buildPdvReopenCashV2AttemptPayload,
  fetchPdvCashSessionReportV2,
  usePdvCashHistoryV2,
  usePdvCashV2AttemptRegistry,
  type PdvCashHistoryFilters,
  type PdvCashV2Session,
} from '@/hooks/usePdvCashSessionsV2';
import { useToast } from '@/hooks/use-toast';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { cn } from '@/lib/utils';
import { openPdvCashClosingReport } from '@/utils/pdvCashClosingReport';

const ALL = '__all__';
const PAGE_SIZE = 10;

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

export default function PdvCashHistory() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { money, dateTime } = useLocaleFormatters();
  const { user, isAdminOrGestor, hasPermission, hasPermissionRecord } = useAuth();
  const canManageOthers = isAdminOrGestor()
    || (hasPermissionRecord && hasPermission('fn:edit_pdv_sales'));
  const canReopen = isAdminOrGestor()
    || (hasPermissionRecord && hasPermission('fn:reopen_pdv_cash'));

  const [filters, setFilters] = useState<PdvCashHistoryFilters>({
    terminalId: null,
    operatorId: null,
    page: 0,
    pageSize: PAGE_SIZE,
  });
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [reportLoadingId, setReportLoadingId] = useState<string | null>(null);
  const [reopenTarget, setReopenTarget] = useState<PdvCashV2Session | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const attempts = usePdvCashV2AttemptRegistry();

  const cash = usePdvCashHistoryV2({
    enabled: !!user,
    userId: user?.id ?? null,
    history: filters,
  });

  const terminalNames = useMemo(
    () => Object.fromEntries(cash.terminals.map((terminal) => [terminal.id, terminal.name])),
    [cash.terminals],
  );
  const operatorOptions = useMemo(() => {
    const entries = Object.entries(cash.operators)
      .sort(([, first], [, second]) => first.localeCompare(second, 'pt-BR'));
    if (filters.operatorId && !entries.some(([id]) => id === filters.operatorId)) {
      entries.push([filters.operatorId, 'Operador selecionado']);
    }
    return entries;
  }, [cash.operators, filters.operatorId]);

  const query = normalizeSearch(search);
  const visibleRows = useMemo(() => {
    if (!query) return cash.history;
    return cash.history.filter((row) => {
      const values = [
        terminalNames[row.terminalId] ?? 'Terminal',
        row.openedBy ? (cash.operators[row.openedBy] ?? 'Operador') : 'Operador',
        row.openedAt ? dateTime(row.openedAt) : '',
        row.closedAt ? dateTime(row.closedAt) : '',
        row.cashAccountName,
        row.notes ?? '',
      ];
      return normalizeSearch(values.join(' ')).includes(query);
    });
  }, [cash.history, cash.operators, dateTime, query, terminalNames]);

  const activeFilterCount = Number(!!filters.terminalId) + Number(!!filters.operatorId);

  const updateFilters = (next: Partial<PdvCashHistoryFilters>) => {
    setExpandedIds(new Set());
    setFilters((current) => ({ ...current, ...next }));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const terminalName = (id: string) => terminalNames[id] ?? 'Terminal';
  const operatorName = (id: string | null) => (
    id ? (cash.operators[id] ?? 'Operador') : 'Operador'
  );
  const displayMoney = (value: number | null) => value == null ? '—' : money(value);

  const showReport = async (row: PdvCashV2Session, printAutomatically: boolean) => {
    const target = window.open('', '_blank');
    if (!target) {
      toast({ variant: 'destructive', title: 'O navegador bloqueou a nova guia', description: 'Permita pop-ups para ver o relatório.' });
      return;
    }
    target.document.write('<!doctype html><html lang="pt-BR"><title>Carregando relatório</title><body style="font-family:system-ui;padding:32px">Preparando o relatório…</body></html>');
    target.document.close();
    setReportLoadingId(row.id);
    try {
      const report = await fetchPdvCashSessionReportV2(row.id);
      openPdvCashClosingReport(target, report, printAutomatically);
    } catch (error) {
      target.close();
      toast({
        variant: 'destructive',
        title: 'Não foi possível abrir o relatório',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setReportLoadingId(null);
    }
  };

  const confirmReopen = async () => {
    if (!reopenTarget) return;
    const payload = buildPdvReopenCashV2AttemptPayload({
      sourceSessionId: reopenTarget.id,
      cashAccountId: reopenTarget.cashAccountId,
      reason: reopenReason,
    });
    const attempt = attempts.resolve('reopen', reopenTarget.id, payload);
    try {
      await cash.reopenSession.mutateAsync({ ...payload, attemptId: attempt.key });
      attempts.complete('reopen', reopenTarget.id, payload);
      toast({ title: 'Caixa reaberto', description: 'Uma continuação foi criada sem alterar o fechamento anterior.' });
      setReopenTarget(null);
      setReopenReason('');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível reabrir o caixa',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    }
  };

  const actions = (row: PdvCashV2Session) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 print:hidden" aria-label="Ações do caixa">
          {reportLoadingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem disabled={reportLoadingId === row.id} onSelect={() => void showReport(row, false)}>
          <FileText className="mr-2 h-4 w-4" /> Ver relatório
        </DropdownMenuItem>
        <DropdownMenuItem disabled={reportLoadingId === row.id} onSelect={() => void showReport(row, true)}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir
        </DropdownMenuItem>
        {canReopen ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={row.wasReopened}
              title={row.wasReopened ? 'Este caixa já possui uma continuação.' : undefined}
              onSelect={() => {
                setReopenTarget(row);
                setReopenReason('');
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> {row.wasReopened ? 'Caixa já reaberto' : 'Reabrir caixa'}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className={cn('space-y-5 pb-8', isMobile && 'pb-24')}>
      <PageHeader
        title="Histórico de caixa"
        subtitle="Consulte as conferências dos caixas já fechados."
        icon={History}
        actions={(
          <Button
            type="button"
            variant="outline"
            className="print:hidden"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        )}
      />

      <section className="space-y-4 rounded-xl bg-muted/30 p-4 sm:p-5 print:bg-transparent print:p-0">
          <div className="flex flex-col gap-2 sm:flex-row print:hidden">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nesta página"
                className="pl-9"
                aria-label="Buscar caixas fechados nesta página"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFiltersOpen((current) => !current)}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-4 w-4" /> Filtros
              {activeFilterCount > 0 ? <Badge variant="info">{activeFilterCount}</Badge> : null}
            </Button>
          </div>

          {filtersOpen ? (
            <div className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end print:hidden">
              <label className="space-y-1.5 text-sm font-medium">
                <span>Terminal</span>
                <Select
                  value={filters.terminalId ?? ALL}
                  onValueChange={(value) => updateFilters({
                    terminalId: value === ALL ? null : value,
                    page: 0,
                  })}
                >
                  <SelectTrigger><SelectValue placeholder="Todos os terminais" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos os terminais</SelectItem>
                    {cash.terminals.map((terminal) => (
                      <SelectItem key={terminal.id} value={terminal.id}>{terminal.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              {canManageOthers ? (
                <label className="space-y-1.5 text-sm font-medium">
                  <span>Operador</span>
                  <Select
                    value={filters.operatorId ?? ALL}
                    onValueChange={(value) => updateFilters({
                      operatorId: value === ALL ? null : value,
                      page: 0,
                    })}
                  >
                    <SelectTrigger><SelectValue placeholder="Todos os operadores" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todos os operadores</SelectItem>
                      {operatorOptions.map(([id, name]) => (
                        <SelectItem key={id} value={id}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              ) : (
                <div className="text-sm text-muted-foreground">Você vê somente os seus caixas.</div>
              )}

              <Button
                type="button"
                variant="outline"
                disabled={activeFilterCount === 0}
                onClick={() => updateFilters({ terminalId: null, operatorId: null, page: 0 })}
              >
                Limpar filtros
              </Button>
            </div>
          ) : null}

          {cash.isLoading || cash.isHistoryLoading ? (
            <HistoryLoading />
          ) : cash.isError ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertTriangle className="h-11 w-11 text-destructive" />
              <div>
                <h2 className="font-bold text-destructive">Não foi possível carregar o histórico</h2>
                <p className="mt-1 text-sm text-muted-foreground">Tente novamente. Nenhum dado foi alterado.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => void cash.refetch()}>
                <RefreshCw className="h-4 w-4" /> Tentar novamente
              </Button>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="py-12 text-center">
              <History className="mx-auto h-11 w-11 text-muted-foreground" />
              <h2 className="mt-3 font-bold">
                {query ? 'Nenhum caixa encontrado nesta página' : 'Nenhum caixa fechado neste filtro'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {query ? 'Tente buscar por outro termo.' : 'Os caixas aparecem aqui depois do fechamento.'}
              </p>
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {visibleRows.map((row) => {
                const expanded = expandedIds.has(row.id);
                return (
                  <article key={row.id} className="rounded-xl border bg-background p-4 break-inside-avoid">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-bold">{terminalName(row.terminalId)}</h2>
                        <p className="truncate text-sm text-muted-foreground">{operatorName(row.openedBy)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <DifferenceBadge difference={row.difference} />
                        {actions(row)}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <Value label="Fechado em" value={row.closedAt ? dateTime(row.closedAt) : '—'} />
                      <Value label="Esperado" value={displayMoney(row.expectedAmount)} align="right" />
                      <Value label="Contado" value={displayMoney(row.countedAmount)} />
                      <Value
                        label="Diferença"
                        value={displayMoney(row.difference)}
                        align="right"
                        className={differenceClass(row.difference)}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-3 w-full border-t pt-3 print:hidden"
                      aria-expanded={expanded}
                      aria-controls={`cash-details-mobile-${row.id}`}
                      onClick={() => toggleExpanded(row.id)}
                    >
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                    </Button>
                    <div
                      id={`cash-details-mobile-${row.id}`}
                      className={cn('border-t pt-4', !expanded && 'hidden print:block')}
                    >
                      <SessionDetails
                        row={row}
                        money={money}
                        dateTime={dateTime}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg bg-background print:border print:border-black">
              <Table className="min-w-[940px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-10 w-11 px-2 print:hidden"><span className="sr-only">Detalhes</span></TableHead>
                    <TableHead className="h-10 px-3">Terminal</TableHead>
                    <TableHead className="h-10 px-3">Operador</TableHead>
                    <TableHead className="h-10 px-3">Fechado em</TableHead>
                    <TableHead className="h-10 px-3 text-right">Esperado</TableHead>
                    <TableHead className="h-10 px-3 text-right">Contado</TableHead>
                    <TableHead className="h-10 px-3 text-right">Diferença</TableHead>
                    <TableHead className="h-10 px-3 text-right">Conferência</TableHead>
                    <TableHead className="h-10 w-12 px-2 text-right print:hidden"><span className="sr-only">Ações</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => {
                    const expanded = expandedIds.has(row.id);
                    return (
                      <Fragment key={row.id}>
                        <TableRow key={row.id}>
                          <TableCell className="px-2 py-2 print:hidden">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={expanded ? 'Ocultar detalhes do caixa' : 'Ver detalhes do caixa'}
                              aria-expanded={expanded}
                              aria-controls={`cash-details-${row.id}`}
                              onClick={() => toggleExpanded(row.id)}
                            >
                              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="px-3 py-2 font-semibold">{terminalName(row.terminalId)}</TableCell>
                          <TableCell className="px-3 py-2">{operatorName(row.openedBy)}</TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2">{row.closedAt ? dateTime(row.closedAt) : '—'}</TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{displayMoney(row.expectedAmount)}</TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{displayMoney(row.countedAmount)}</TableCell>
                          <TableCell className={cn(
                            'whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums',
                            differenceClass(row.difference),
                          )}>
                            {displayMoney(row.difference)}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-right"><DifferenceBadge difference={row.difference} /></TableCell>
                          <TableCell className="px-2 py-2 text-right print:hidden">{actions(row)}</TableCell>
                        </TableRow>
                        <TableRow
                          key={`${row.id}-details`}
                          id={`cash-details-${row.id}`}
                          className={cn('hover:bg-transparent', !expanded && 'hidden print:table-row')}
                        >
                          <TableCell colSpan={9} className="bg-background px-5 py-4 print:px-3">
                            <SessionDetails
                              row={row}
                              money={money}
                              dateTime={dateTime}
                            />
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {!cash.isLoading && !cash.isHistoryLoading && !cash.isError ? (
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
              <p className="text-sm text-muted-foreground">
                Mostrando {visibleRows.length} {visibleRows.length === 1 ? 'caixa' : 'caixas'} nesta página · Página {filters.page + 1}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filters.page === 0}
                  onClick={() => updateFilters({ page: Math.max(0, filters.page - 1) })}
                >
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!cash.hasMoreHistory}
                  onClick={() => updateFilters({ page: filters.page + 1 })}
                >
                  Próxima <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
      </section>

      <Dialog open={!!reopenTarget} onOpenChange={(open) => { if (!open && !cash.reopenSession.isPending) setReopenTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reabrir caixa</DialogTitle>
            <DialogDescription>
              O fechamento anterior continuará guardado. O sistema abrirá uma continuação com o valor contado naquele fechamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="cash-reopen-reason">Motivo da reabertura</Label>
            <Textarea
              id="cash-reopen-reason"
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              placeholder="Ex.: caixa fechado antes do fim do expediente"
              maxLength={500}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Informe pelo menos 3 caracteres. O motivo ficará no histórico.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={cash.reopenSession.isPending} onClick={() => setReopenTarget(null)}>Cancelar</Button>
            <Button type="button" disabled={reopenReason.trim().length < 3 || cash.reopenSession.isPending} onClick={() => void confirmReopen()}>
              {cash.reopenSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Reabrir caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DifferenceBadge({ difference }: { difference: number | null }) {
  if (difference == null) return <Badge variant="muted">Sem conferência</Badge>;
  if (difference === 0) return <Badge variant="success">Conferido</Badge>;
  return <Badge variant="warning">Com diferença</Badge>;
}

function differenceClass(difference: number | null) {
  if (difference == null || difference === 0) return undefined;
  return difference < 0 ? 'text-destructive' : 'text-amber-700 dark:text-amber-400';
}

function Value({
  label,
  value,
  align,
  className,
}: {
  label: string;
  value: string;
  align?: 'right';
  className?: string;
}) {
  return (
    <div className={cn(align === 'right' && 'text-right')}>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <strong className={cn('mt-0.5 block break-words tabular-nums', className)}>{value}</strong>
    </div>
  );
}

function SessionDetails({
  row,
  money,
  dateTime,
}: {
  row: PdvCashV2Session;
  money: (value: number) => string;
  dateTime: (value: string | Date) => string;
}) {
  const amount = (value: number | null) => value == null ? '—' : money(value);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Value label="Aberto em" value={dateTime(row.openedAt)} />
        <Value label="Dinheiro inicial" value={amount(row.openingAmount)} />
        <Value label="Esperado" value={amount(row.expectedAmount)} />
        <Value label="Contado" value={amount(row.countedAmount)} />
        <Value
          label="Diferença"
          value={amount(row.difference)}
          className={differenceClass(row.difference)}
        />
        <Value label="Fechado em" value={row.closedAt ? dateTime(row.closedAt) : '—'} />
      </div>
      <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
        <Value label="Conta do caixa" value={row.cashAccountName} />
        <div>
          <span className="block text-xs text-muted-foreground">Observação do fechamento</span>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">
            {row.notes?.trim() || 'Nenhuma observação informada.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function HistoryLoading() {
  return (
    <div className="space-y-2" aria-label="Carregando histórico">
      {[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-14 w-full" />)}
    </div>
  );
}
