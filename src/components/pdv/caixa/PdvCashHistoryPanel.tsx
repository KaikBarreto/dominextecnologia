import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  FileText,
  Pencil,
  ReceiptText,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { FilterButton } from '@/components/ui/FilterButton';
import { SearchField } from '@/components/ui/search-field-actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobilePillTabs, type PillTab } from '@/components/mobile/MobilePillTabs';
import { useIsCompact } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  filterPdvLedger,
  paginate,
  pdvLedgerAccountNames,
  planLedgerReversal,
  type PdvLedgerEntry,
  type PdvLedgerKind,
  type PdvMethodGroup,
  type PdvReversalBlock,
} from '@/lib/pdv/cash';
import { normalizePaymentMethod } from '@/lib/finance-payment-methods';
import { PdvLedgerRowDetail } from '@/components/pdv/caixa/PdvLedgerRowDetail';
import type { pdv } from '@/lib/i18n/messages/app/pdv';
import {
  exportPdvCashHistoryExcel,
  exportPdvCashHistoryPdf,
} from '@/utils/pdvCashHistoryExport';
import { PdvMoneyInput } from '@/components/pdv/caixa/PdvMoneyInput';
import { PDV_HISTORY_ROW_MOTION, PDV_MOTION_EASE } from '@/lib/pdv/motion';
import { UserAvatarTooltip } from '@/components/ui/UserAvatarTooltip';

type HistoryTexts = (typeof pdv)['pt-br']['cashPanel']['history'];
type LedgerBadgeKind = PdvLedgerKind | 'transferencia';

const PER_PAGE = 20;

/** Quantas colunas a tabela do desktop tem (o expansível ocupa a linha inteira). */
const DESKTOP_COLSPAN = 9;

interface PdvCashHistoryPanelProps {
  texts: HistoryTexts;
  entries: PdvLedgerEntry[];
  isLoading: boolean;
  valuesVisible: boolean;
  money: (value: number) => string;
  dateTime: (value: string) => string;
  number: (value: number, opts?: Intl.NumberFormatOptions) => string;
  /** `fn:manage_finance` (ou admin/gestor): destrava EDITAR lançamento. */
  canManageFinance: boolean;
  /** `fn:delete_finance` (ou admin/gestor): destrava EXCLUIR lançamento. */
  canDeleteFinance: boolean;
  /** Permissão crítica e explícita `fn:edit_pdv_sales`. */
  canEditPdvSales: boolean;
  onEdit: (entry: PdvLedgerEntry) => void;
  onDelete: (entry: PdvLedgerEntry) => void;
}

/**
 * Histórico de transações do caixa em foco: venda, receita, despesa, sangria e
 * suprimento numa lista só, com abas por forma de pagamento, busca, filtro de
 * tipo, linha EXPANSÍVEL e coluna de ações.
 *
 * SEM CARD de propósito (pedido do CEO, 18/10): o histórico é conteúdo solto da
 * página, não um card empilhado dentro de card. A régua da casa é 1 borda
 * externa e linhas por divisor — aqui nem a externa existe, porque a página
 * inteira já é a superfície.
 *
 * O que NÃO vem da EcoSistema de propósito (lá é ferro-velho): coluna de
 * quilos, filtro "Abastecimento", detalhamento de material por peso, fila de
 * pedido pendente de sincronização offline e abas de multi-caixa.
 *
 * Carregando usa `Skeleton`, nunca spinner, e `EmptyState` só aparece DEPOIS de
 * carregar: confundir "carregando" com "vazio" é erro que o CEO já cobrou.
 */
export function PdvCashHistoryPanel({
  texts,
  entries,
  isLoading,
  valuesVisible,
  money,
  dateTime,
  number,
  canManageFinance,
  canDeleteFinance,
  canEditPdvSales,
  onEdit,
  onDelete,
}: PdvCashHistoryPanelProps) {
  const isCompact = useIsCompact();
  const reduceMotion = useReducedMotion();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<PdvLedgerKind | 'all'>('all');
  const [methodGroup, setMethodGroup] = useState<PdvMethodGroup>('todas');
  const [account, setAccount] = useState('all');
  const [minAmount, setMinAmount] = useState(0);
  const [maxAmount, setMaxAmount] = useState(0);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const previousEntryKeysRef = useRef<Set<string>>(new Set());
  const hasLoadedEntriesRef = useRef(false);

  // Só marca como nova uma linha que chegou DEPOIS do primeiro carregamento.
  // Paginação e filtros não alteram `entries`, portanto não fingem que uma
  // transação antiga acabou de acontecer.
  const newEntryKeys = new Set<string>();
  if (!isLoading && hasLoadedEntriesRef.current) {
    for (const entry of entries) {
      if (!previousEntryKeysRef.current.has(entry.key)) newEntryKeys.add(entry.key);
    }
  }

  useEffect(() => {
    if (isLoading) {
      hasLoadedEntriesRef.current = false;
      previousEntryKeysRef.current = new Set();
      return;
    }
    previousEntryKeysRef.current = new Set(entries.map((entry) => entry.key));
    hasLoadedEntriesRef.current = true;
  }, [entries, isLoading]);

  const kindLabels: Record<PdvLedgerKind, string> = {
    venda: texts.kindSale,
    compra: texts.kindPurchase,
    receita: texts.kindRevenue,
    despesa: texts.kindExpense,
    sangria: texts.kindBleed,
    suprimento: texts.kindSupply,
  };

  function badgeKind(entry: PdvLedgerEntry): LedgerBadgeKind {
    if (
      (entry.kind === 'sangria' || entry.kind === 'suprimento')
      && entry.detail.movedBetweenAccounts
    ) {
      return 'transferencia';
    }
    return entry.kind;
  }

  function badgeLabel(entry: PdvLedgerEntry): string {
    return badgeKind(entry) === 'transferencia'
      ? texts.kindTransfer
      : kindLabels[entry.kind];
  }

  const methodLabels: Record<string, string> = {
    dinheiro: texts.methodDinheiro,
    pix: texts.methodPixName,
    transferencia: texts.methodTransferencia,
    cartao_debito: texts.methodDebito,
    cartao_credito: texts.methodCredito,
    boleto: texts.methodBoleto,
    cheque: texts.methodCheque,
    fiado: texts.methodFiado,
    pontos: texts.methodPontos,
  };

  const blockedLabels: Record<PdvReversalBlock, string> = {
    no_permission: texts.blockedNoPermission,
    movement_edit_undo_and_redo: texts.blockedMovementEdit,
    sale_edit_cancel_and_redo: texts.blockedSaleEdit,
  };

  const methodTabs: PillTab[] = [
    { value: 'todas', label: texts.methodAll },
    { value: 'dinheiro', label: texts.methodCash },
    { value: 'pix_transferencia', label: texts.methodPix },
  ];

  const accountOptions = useMemo(
    () => Array.from(new Set(entries.flatMap(pdvLedgerAccountNames))).sort((a, b) => a.localeCompare(b)),
    [entries],
  );
  const activeFilterCount = Number(kind !== 'all') + Number(account !== 'all')
    + Number(minAmount > 0 || maxAmount > 0);

  const filtered = useMemo(
    () => filterPdvLedger(entries, {
      search,
      kind: kind === 'all' ? null : kind,
      methodGroup,
      account: account === 'all' ? null : account,
      minAmount: minAmount > 0 ? minAmount : null,
      maxAmount: maxAmount > 0 ? maxAmount : null,
    }),
    [entries, search, kind, methodGroup, account, minAmount, maxAmount],
  );

  const pageData = paginate(filtered, page, PER_PAGE);

  function resetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearAdvancedFilters() {
    setKind('all');
    setAccount('all');
    setMinAmount(0);
    setMaxAmount(0);
    setPage(1);
  }

  function methodLabel(method: string): string {
    const code = normalizePaymentMethod(method) ?? method;
    return methodLabels[code] ?? methodLabels[method] ?? method;
  }

  function methodText(entry: PdvLedgerEntry): string {
    if (!entry.methods || entry.methods.length === 0) return texts.methodUnknown;
    return entry.methods.map(methodLabel).join(' + ');
  }

  function methodDisplay(entry: PdvLedgerEntry) {
    const salePayments = entry.detail.payments ?? [];
    const rows = salePayments.length > 0
      ? salePayments.map((payment) => ({
          method: payment.method,
          accountName: payment.accountName,
          accountColor: payment.accountColor,
        }))
      : entry.methods.map((method) => ({
          method,
          accountName: entry.detail.accountName ?? null,
          accountColor: entry.detail.accountColor ?? null,
        }));

    if (rows.length === 0) return <span>{texts.methodUnknown}</span>;
    return (
      <span className="flex min-w-0 flex-col gap-0.5">
        {rows.map((row, index) => {
          const normalized = normalizePaymentMethod(row.method) ?? row.method;
          const showAccount = (normalized === 'pix' || normalized === 'transferencia') && row.accountName;
          return (
            <span key={`${row.method}-${row.accountName ?? ''}-${index}`} className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0">{methodLabel(row.method)}</span>
              {showAccount && (
                <span className="flex min-w-0 items-center gap-1 text-xs text-foreground">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: row.accountColor || 'hsl(var(--primary))' }}
                  />
                  <span className="truncate">{row.accountName}</span>
                </span>
              )}
            </span>
          );
        })}
      </span>
    );
  }

  async function handleExport(format: 'excel' | 'pdf') {
    if (exporting || filtered.length === 0) return;
    setExporting(format);
    const exportInput = {
      generatedAt: dateTime(new Date().toISOString()),
      language: document.documentElement.lang || 'pt-BR',
      rows: filtered.map((entry) => ({
        reference: entry.reference || '',
        type: kindLabels[entry.kind],
        customer: entry.customerName || entry.label,
        signedAmount: entry.signedAmount,
        formattedAmount: money(entry.amount),
        method: methodText(entry),
        date: dateTime(entry.occurredAt),
      })),
      texts: {
        title: texts.title,
        columnNumber: texts.columnNumber,
        columnType: texts.columnType,
        columnCustomer: texts.columnCustomer,
        columnAmount: texts.columnAmount,
        columnMethod: texts.columnMethod,
        columnDate: texts.columnDate,
        exportSheetName: texts.exportSheetName,
        exportGeneratedAt: texts.exportGeneratedAt,
        exportGeneratingPdf: texts.exportGeneratingPdf,
        exportBack: texts.exportBack,
        exportDownloadPdf: texts.exportDownloadPdf,
        exportDownloadAs: texts.exportDownloadAs,
      },
    };

    try {
      if (format === 'excel') await exportPdvCashHistoryExcel(exportInput);
      else await exportPdvCashHistoryPdf(exportInput);
    } catch {
      toast({ variant: 'destructive', title: texts.exportError });
    } finally {
      setExporting(null);
    }
  }

  /**
   * Ações da linha pelo MESMO `RowActionsMenu` do resto do app (editar laranja,
   * excluir vermelho). Ação sem caminho de reversão seguro aparece
   * DESABILITADA com o motivo no `title`, nunca escondida: o operador precisa
   * saber que existe e por que não dá — some do menu parece bug.
   */
  function rowActions(entry: PdvLedgerEntry): RowAction[] {
    const plan = planLedgerReversal(entry, { canManageFinance, canDeleteFinance, canEditPdvSales });
    // Sangria/suprimento NÃO é apagado: a RPC marca `cancelled_at` e a linha
    // sai do histórico. Chamar isso de "Excluir" prometia o que o sistema não
    // faz, então o rótulo é "Desfazer" — igual ao botão da confirmação.
    const deleteLabel = plan.path === 'revert_movement' ? texts.actionUndo : texts.actionDelete;
    return [
      {
        // Motivo colado no rótulo com DOIS-PONTOS, nunca travessão (régua de
        // copy da casa). Por isso os motivos são frases curtas em minúscula.
        label: plan.canEdit
          ? texts.actionEdit
          : `${texts.actionEdit}: ${blockedLabels[plan.editBlock ?? 'no_permission']}`,
        icon: Pencil,
        variant: 'edit',
        disabled: !plan.canEdit,
        onClick: () => onEdit(entry),
      },
      {
        label: plan.canDelete
          ? deleteLabel
          : `${deleteLabel}: ${blockedLabels[plan.deleteBlock ?? 'no_permission']}`,
        icon: Trash2,
        variant: 'delete',
        disabled: !plan.canDelete,
        onClick: () => onDelete(entry),
      },
    ];
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <ReceiptText className="h-4 w-4 text-primary" />
          {texts.title}
        </h2>
        {!isLoading && filtered.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {texts.showing
              .replace('{count}', String(pageData.items.length))
              .replace('{total}', String(filtered.length))}
          </span>
        )}
      </div>

      <MobilePillTabs
        tabs={methodTabs}
        activeTab={methodGroup}
        onTabChange={resetPage((v: string) => setMethodGroup(v as PdvMethodGroup))}
        variant="underline"
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchField
            containerClassName="flex-1"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            placeholder={texts.search}
            actions={
              <FilterButton
                activeCount={activeFilterCount}
                onClear={clearAdvancedFilters}
                label={texts.filters}
                embedded
              >
                <div className="space-y-1.5">
                  <Label>{texts.filterType}</Label>
                  <Select value={kind} onValueChange={resetPage((value: string) => setKind(value as PdvLedgerKind | 'all'))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{texts.typeAll}</SelectItem>
                      <SelectItem value="venda">{texts.kindSale}</SelectItem>
                      <SelectItem value="compra">{texts.kindPurchase}</SelectItem>
                      <SelectItem value="receita">{texts.kindRevenue}</SelectItem>
                      <SelectItem value="despesa">{texts.kindExpense}</SelectItem>
                      <SelectItem value="sangria">{texts.kindBleed}</SelectItem>
                      <SelectItem value="suprimento">{texts.kindSupply}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{texts.filterAccount}</Label>
                  <Select value={account} onValueChange={resetPage(setAccount)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{texts.filterAllAccounts}</SelectItem>
                      {accountOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{texts.filterAmount}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <PdvMoneyInput value={minAmount} onChange={resetPage(setMinAmount)} placeholder={texts.filterMinimum} />
                    <PdvMoneyInput value={maxAmount} onChange={resetPage(setMaxAmount)} placeholder={texts.filterMaximum} />
                  </div>
                </div>
              </FilterButton>
            }
          />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="justify-between gap-2"
                disabled={filtered.length === 0 || !!exporting}
              >
                <FileDown className="h-4 w-4" />
                {exporting ? texts.exporting : texts.export}
                <ChevronDown className="ml-auto h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={() => void handleExport('excel')}
              >
                <FileSpreadsheet className="h-4 w-4 text-success" />
                {texts.exportExcel}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={() => void handleExport('pdf')}
              >
                <FileText className="h-4 w-4 text-destructive" />
                {texts.exportPdf}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<ReceiptText className="h-10 w-10" />}
          title={entries.length === 0 ? texts.emptyTitle : texts.noResultsTitle}
          description={entries.length === 0 ? texts.emptyDescription : texts.noResultsDescription}
        />
      ) : isCompact ? (
        /* ── MOBILE: a linha já é card; o expansível abre dentro dela ────── */
        <ul className="divide-y">
          {pageData.items.map((entry) => {
            const isExpanded = expanded.has(entry.key);
            const isNew = newEntryKeys.has(entry.key);
            return (
              <motion.li
                key={entry.key}
                data-new-entry={isNew || undefined}
                layout="position"
                initial={
                  reduceMotion || !isNew
                    ? false
                    : {
                        opacity: 0,
                        y: -PDV_HISTORY_ROW_MOTION.enterOffset,
                        scale: 0.99,
                        backgroundColor: 'hsl(var(--primary) / 0.14)',
                      }
                }
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  backgroundColor: 'hsl(var(--primary) / 0)',
                }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        layout: {
                          duration: PDV_HISTORY_ROW_MOTION.layoutDuration,
                          ease: PDV_MOTION_EASE,
                        },
                        opacity: {
                          duration: PDV_HISTORY_ROW_MOTION.opacityDuration,
                          ease: PDV_MOTION_EASE,
                        },
                        y: {
                          duration: PDV_HISTORY_ROW_MOTION.enterDuration,
                          ease: PDV_MOTION_EASE,
                        },
                        scale: {
                          duration: PDV_HISTORY_ROW_MOTION.scaleDuration,
                          ease: PDV_MOTION_EASE,
                        },
                        backgroundColor: {
                          duration: PDV_HISTORY_ROW_MOTION.highlightDuration,
                          ease: PDV_MOTION_EASE,
                        },
                      }
                }
                className="py-3"
              >
                <div className="flex items-start gap-1">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? texts.collapse : texts.expand}
                    onClick={() => toggleExpanded(entry.key)}
                    className="flex min-w-0 flex-1 items-start justify-between gap-2 text-left"
                  >
                    <div className="flex min-w-0 gap-2.5">
                      <UserAvatarTooltip
                        name={entry.actor?.name}
                        email={entry.actor?.email}
                        avatarUrl={entry.actor?.avatarUrl}
                        size={30}
                        side="right"
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5">
                        <KindBadge kind={badgeKind(entry)} label={badgeLabel(entry)} />
                        {entry.reference && (
                          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                            {entry.reference}
                          </span>
                        )}
                        </div>
                        <p className="truncate text-sm font-medium">
                          {entry.customerName || entry.label}
                        </p>
                        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                          {methodDisplay(entry)}
                          <span aria-hidden>·</span>
                          <span className="shrink-0">{dateTime(entry.occurredAt)}</span>
                        </div>
                      </div>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      <span
                        className={cn(
                          'text-sm font-bold tabular-nums',
                          entry.signedAmount < 0 ? 'text-destructive' : 'text-success',
                        )}
                      >
                        {valuesVisible ? money(entry.amount) : '•••••'}
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 text-muted-foreground transition-transform',
                          isExpanded && 'rotate-180',
                        )}
                      />
                    </span>
                  </button>
                  <RowActionsMenu actions={rowActions(entry)} ariaLabel={texts.columnActions} />
                </div>
                {isExpanded && (
                  <div className="pt-2.5">
                    <PdvLedgerRowDetail
                      texts={texts}
                      entry={entry}
                      valuesVisible={valuesVisible}
                      money={money}
                      methodLabel={methodLabel}
                      number={number}
                    />
                  </div>
                )}
              </motion.li>
            );
          })}
        </ul>
      ) : (
        /* ── DESKTOP: tabela limpa, divisor por linha, sem borda externa ─── */
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="w-8 py-2" />
                <th className="w-12 py-2 pr-3 font-semibold">{texts.columnOperator}</th>
                <th className="py-2 pr-3 font-semibold">{texts.columnNumber}</th>
                <th className="py-2 pr-3 font-semibold">{texts.columnType}</th>
                <th className="py-2 pr-3 font-semibold">{texts.columnCustomer}</th>
                <th className="py-2 pr-3 text-right font-semibold">{texts.columnAmount}</th>
                <th className="py-2 pr-3 font-semibold">{texts.columnMethod}</th>
                <th className="py-2 pr-3 font-semibold">{texts.columnDate}</th>
                <th className="w-12 py-2 text-right font-semibold">{texts.columnActions}</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((entry) => {
                const isExpanded = expanded.has(entry.key);
                const isNew = newEntryKeys.has(entry.key);
                return [
                  <motion.tr
                    key={entry.key}
                    data-new-entry={isNew || undefined}
                    layout="position"
                    initial={
                      reduceMotion || !isNew
                        ? false
                        : {
                            opacity: 0,
                            y: -PDV_HISTORY_ROW_MOTION.enterOffset,
                            scale: 0.995,
                            backgroundColor: 'hsl(var(--primary) / 0.14)',
                          }
                    }
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      backgroundColor: isExpanded
                        ? 'hsl(var(--muted) / 0.5)'
                        : 'hsl(var(--primary) / 0)',
                    }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            layout: {
                              duration: PDV_HISTORY_ROW_MOTION.layoutDuration,
                              ease: PDV_MOTION_EASE,
                            },
                            opacity: {
                              duration: PDV_HISTORY_ROW_MOTION.opacityDuration,
                              ease: PDV_MOTION_EASE,
                            },
                            y: {
                              duration: PDV_HISTORY_ROW_MOTION.enterDuration,
                              ease: PDV_MOTION_EASE,
                            },
                            scale: {
                              duration: PDV_HISTORY_ROW_MOTION.scaleDuration,
                              ease: PDV_MOTION_EASE,
                            },
                            backgroundColor: {
                              duration: PDV_HISTORY_ROW_MOTION.highlightDuration,
                              ease: PDV_MOTION_EASE,
                            },
                          }
                    }
                    className={cn(
                      'cursor-pointer border-b transition-colors hover:bg-muted/50',
                      isExpanded && 'bg-muted/50',
                    )}
                    onClick={() => toggleExpanded(entry.key)}
                  >
                    <td className="py-4">
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform',
                          isExpanded && 'rotate-180',
                        )}
                      />
                    </td>
                    <td className="py-4 pr-3">
                      <UserAvatarTooltip
                        name={entry.actor?.name}
                        email={entry.actor?.email}
                        avatarUrl={entry.actor?.avatarUrl}
                        size={30}
                        side="right"
                      />
                    </td>
                    {/* Sem travessão de placeholder (régua de copy): linha que
                        não é venda simplesmente não tem número, e a coluna
                        Tipo já diz o que ela é. */}
                    <td className="py-4 pr-3 font-semibold tabular-nums">{entry.reference}</td>
                    <td className="py-4 pr-3">
                      <KindBadge kind={badgeKind(entry)} label={badgeLabel(entry)} />
                    </td>
                    <td className="max-w-[18rem] truncate py-4 pr-3">
                      {entry.customerName || entry.label}
                    </td>
                    <td
                      className={cn(
                        'py-4 pr-3 text-right font-bold tabular-nums',
                        entry.signedAmount < 0 ? 'text-destructive' : 'text-success',
                      )}
                    >
                      {valuesVisible ? money(entry.amount) : '•••••'}
                    </td>
                    <td className="max-w-[14rem] py-4 pr-3 text-muted-foreground">
                      {methodDisplay(entry)}
                    </td>
                    <td className="py-4 pr-3 text-muted-foreground">
                      {dateTime(entry.occurredAt)}
                    </td>
                    <td className="py-4 text-right">
                      <RowActionsMenu actions={rowActions(entry)} ariaLabel={texts.columnActions} />
                    </td>
                  </motion.tr>,
                  isExpanded ? (
                    <tr key={`${entry.key}-detail`} className="border-b">
                      <td colSpan={DESKTOP_COLSPAN} className="px-0 pb-3">
                        <PdvLedgerRowDetail
                          texts={texts}
                          entry={entry}
                          valuesVisible={valuesVisible}
                          money={money}
                          methodLabel={methodLabel}
                          number={number}
                        />
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && pageData.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          {/* `ghost` em vez de `outline`: a página já tem borda de sobra
              (pedido do CEO), e paginação não precisa de caixa própria. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1"
            disabled={pageData.page <= 1}
            onClick={() => setPage(pageData.page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            {texts.previous}
          </Button>
          <span className="text-xs text-muted-foreground">
            {texts.pageOf
              .replace('{page}', String(pageData.page))
              .replace('{total}', String(pageData.totalPages))}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1"
            disabled={pageData.page >= pageData.totalPages}
            onClick={() => setPage(pageData.page + 1)}
          >
            {texts.next}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * Selo SATURADO com texto na cor de contraste do token. Nunca contorno.
 * `rounded-full` por pedido do CEO (18/10): selo de tipo é pill, não retângulo.
 */
function KindBadge({ kind, label }: { kind: LedgerBadgeKind; label: string }) {
  const style: Record<LedgerBadgeKind, string> = {
    venda: 'bg-emerald-600 text-white',
    compra: 'bg-blue-600 text-white',
    receita: 'bg-cyan-600 text-white',
    despesa: 'bg-red-600 text-white',
    transferencia: 'bg-indigo-600 text-white',
    sangria: 'bg-orange-600 text-white',
    suprimento: 'bg-violet-600 text-white',
  };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        style[kind],
      )}
    >
      {label}
    </span>
  );
}
