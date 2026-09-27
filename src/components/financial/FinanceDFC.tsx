import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ArrowDownCircle,
  ArrowDownToLine,
  ArrowUpCircle,
  Banknote,
  ChevronDown,
  Download,
  Landmark,
  Loader2,
  PiggyBank,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DateRange } from '@/components/ui/DateRangeFilter';
import { useFinancialCategories, type FinancialCategory } from '@/hooks/useFinancialCategories';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useCostCenters } from '@/hooks/useCostCenters';
import type { FinancialTransaction } from '@/types/database';
import {
  calculateDfc,
  DFC_GROUP_KEYS,
  DFC_UNCLASSIFIED_FALLBACK,
  type DfcCategoryLine,
  type DfcGroupKey,
} from '@/lib/dfc';
import { buildCategoryTree, groupDreRowsByParent, type DreRowNode } from '@/lib/category-tree';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { getCategoryIcon } from './categoryIcons';

type DfcTransaction = FinancialTransaction & {
  dfc_group?: DfcGroupKey | null;
};

type DfcUiCategory = DfcCategoryLine<DfcTransaction> & {
  key: string;
  value: number;
};

interface CostCenterRow {
  key: string;
  id: string | null;
  name: string;
  color: string;
  total: number;
  transactions: DfcTransaction[];
}

interface FinanceDFCProps {
  /**
   * Lista crua do histórico disponível, não apenas os itens já cortados pelo
   * seletor. O motor usa as baixas anteriores a `range.from` no saldo inicial.
   */
  transactions: FinancialTransaction[];
  /** Período herdado do filtro da página. Limites ausentes = todo o histórico. */
  range?: DateRange;
  /** Permite que a página mantenha o skeleton enquanto carrega os lançamentos. */
  isLoading?: boolean;
}

const FALLBACK_CATEGORY_COLOR = '#6b7280';
const FALLBACK_COST_CENTER_COLOR = '#94a3b8';
const NO_COST_CENTER_KEY = '__none__';
const DFC_GROUP_META: Record<DfcGroupKey, { icon: LucideIcon; color: string }> = {
  operacional: { icon: Banknote, color: '#2563eb' },
  investimento: { icon: Landmark, color: '#7c3aed' },
  financiamento: { icon: PiggyBank, color: '#d97706' },
};

function toDateOnly(value?: Date): string | undefined {
  if (!value || Number.isNaN(value.getTime())) return undefined;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function signedTransactionAmount(transaction: FinancialTransaction): number {
  const amount = Math.abs(Number(transaction.amount) || 0);
  return transaction.transaction_type === 'entrada' ? amount : -amount;
}

function signedTransactionCents(transaction: FinancialTransaction): number {
  const cents = Math.round((Math.abs(Number(transaction.amount) || 0) + Number.EPSILON) * 100);
  return transaction.transaction_type === 'entrada' ? cents : -cents;
}

function resolveDfcGroup(value: string | null | undefined): DfcGroupKey {
  return (DFC_GROUP_KEYS as readonly string[]).includes(value ?? '')
    ? value as DfcGroupKey
    : DFC_UNCLASSIFIED_FALLBACK;
}

/** Protege células textuais contra fórmulas ao abrir o CSV em planilhas. */
function csvCell(value: string | number): string {
  if (typeof value === 'number') return `"${value.toFixed(2).replace('.', ',')}"`;
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function transactionCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'lançamento' : 'lançamentos'}`;
}

export function FinanceDFC({ transactions, range, isLoading = false }: FinanceDFCProps) {
  const { categories, isLoading: isLoadingCategories } = useFinancialCategories();
  const { accounts, isLoading: isLoadingAccounts } = useFinancialAccounts();
  const { costCenters, isLoading: isLoadingCostCenters } = useCostCenters();
  const { money, date } = useLocaleFormatters();
  const isMobile = useIsMobile();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(['operacional']));
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedCostCenters, setExpandedCostCenters] = useState<Set<string>>(new Set());

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const categoryParentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category) => {
      const parent = categoryTree.parentOf(category);
      if (parent) map.set(category.name, parent.name);
    });
    return map;
  }, [categories, categoryTree]);
  const categoryMetaMap = useMemo(
    () => new Map(categories.map((category) => [category.name, category])),
    [categories],
  );
  const costCenterMetaMap = useMemo(
    () => new Map(costCenters.map((center) => [center.id, center])),
    [costCenters],
  );

  // `financial_transactions.category` persiste o nome da folha. O grupo vem
  // da categoria do mesmo tenant já carregada pelo hook; o motor segue puro.
  const enrichedTransactions = useMemo<DfcTransaction[]>(() => {
    const groupByCategoryName = new Map(
      categories.map((category) => [category.name, category.dfc_group]),
    );
    return transactions.map((transaction) => ({
      ...transaction,
      dfc_group: groupByCategoryName.get(transaction.category ?? '') ?? null,
    }));
  }, [categories, transactions]);

  const normalizedRange = useMemo(
    () => ({ from: toDateOnly(range?.from), to: toDateOnly(range?.to) }),
    [range?.from, range?.to],
  );
  const baseBalance = useMemo(
    () => accounts
      .filter((account) => account.type !== 'cartao')
      .reduce((total, account) => total + Number(account.initial_balance || 0), 0),
    [accounts],
  );
  const report = useMemo(
    () => calculateDfc(enrichedTransactions, normalizedRange, baseBalance),
    [baseBalance, enrichedTransactions, normalizedRange],
  );

  const groupNodes = useMemo(() => {
    const nodes = new Map<DfcGroupKey, DreRowNode<DfcUiCategory>[]>();
    report.groups.forEach((group) => {
      const rows: DfcUiCategory[] = group.categories.map((category) => ({
        ...category,
        key: `${group.key}:${category.name}`,
        value: category.total,
      })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      nodes.set(group.key, groupDreRowsByParent(rows, {
        parentNameOf: (name) => categoryParentNameMap.get(name) ?? null,
        parentInSameGroup: (parentName) =>
          resolveDfcGroup(categoryMetaMap.get(parentName)?.dfc_group) === group.key,
        makeKey: (name) => `${group.key}:${name}`,
      }));
    });
    return nodes;
  }, [categoryMetaMap, categoryParentNameMap, report.groups]);

  const movementCount = useMemo(
    () => report.groups.reduce(
      (groupCount, group) => groupCount + group.categories.reduce(
        (categoryCount, category) => categoryCount + category.transactions.length,
        0,
      ),
      0,
    ),
    [report.groups],
  );
  const periodLabel = useMemo(() => {
    if (range?.from && range?.to) return `${date(range.from)} a ${date(range.to)}`;
    if (range?.from) return `A partir de ${date(range.from)}`;
    if (range?.to) return `Até ${date(range.to)}`;
    return 'Todo o histórico';
  }, [date, range?.from, range?.to]);

  const toggleSetItem = (setter: Dispatch<SetStateAction<Set<string>>>, key: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const categoryMeta = (name: string): Pick<FinancialCategory, 'color' | 'icon'> =>
    categoryMetaMap.get(name) ?? { color: FALLBACK_CATEGORY_COLOR, icon: null };

  const buildCostCenterRows = (category: DfcUiCategory): CostCenterRow[] => {
    const rows = new Map<string, { id: string | null; totalCents: number; transactions: DfcTransaction[] }>();
    category.transactions.forEach((transaction) => {
      const id = transaction.cost_center_id?.trim() || null;
      const key = id ?? NO_COST_CENTER_KEY;
      const row = rows.get(key) ?? { id, totalCents: 0, transactions: [] };
      row.totalCents += signedTransactionCents(transaction);
      row.transactions.push(transaction);
      rows.set(key, row);
    });
    return Array.from(rows, ([key, row]) => {
      const meta = row.id ? costCenterMetaMap.get(row.id) : undefined;
      return {
        key,
        id: row.id,
        name: meta?.name ?? (row.id ? 'Centro de custo não encontrado' : 'Sem centro de custo'),
        color: meta?.color ?? FALLBACK_COST_CENTER_COLOR,
        total: row.totalCents / 100,
        transactions: row.transactions,
      };
    }).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  };

  const handleExportCsv = () => {
    const rows: Array<Array<string | number>> = [
      ['DFC Gerencial — somente realizado'],
      ['Período', periodLabel],
      ['Saldo inicial', report.openingBalance],
      ['Variação líquida', report.netChange],
      ['Saldo final', report.closingBalance],
      [],
      ['Atividade', 'Categoria', 'Centro de custo', 'Data da baixa', 'Descrição', 'Tipo', 'Valor realizado'],
    ];
    report.groups.forEach((group) => {
      group.categories.forEach((category) => {
        category.transactions.forEach((transaction) => {
          const center = transaction.cost_center_id
            ? costCenterMetaMap.get(transaction.cost_center_id)?.name ?? 'Centro de custo não encontrado'
            : 'Sem centro de custo';
          rows.push([
            group.label,
            category.name,
            center,
            transaction.paid_date ?? '',
            transaction.description ?? '',
            transaction.transaction_type === 'entrada' ? 'Entrada' : 'Saída',
            signedTransactionAmount(transaction),
          ]);
        });
      });
    });
    const csv = rows.map((row) => row.map(csvCell).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix = [normalizedRange.from, normalizedRange.to].filter(Boolean).join('_a_') || 'historico';
    link.download = `dfc-gerencial_${suffix}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || isLoadingCategories || isLoadingAccounts || isLoadingCostCenters) {
    return <FinanceDFCLoading />;
  }

  const renderCostCenters = (category: DfcUiCategory) => {
    const rows = buildCostCenterRows(category);
    return (
      <div className="bg-muted/20 py-1.5">
        <p className="px-8 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:px-10">
          Centros de custo
        </p>
        <div className="divide-y divide-border/20">
          {rows.map((row) => {
            const centerKey = `${category.key}:center:${row.key}`;
            const isOpen = expandedCostCenters.has(centerKey);
            return (
              <div key={centerKey}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-8 py-2 text-left transition-colors hover:bg-muted/30 sm:px-10"
                  aria-expanded={isOpen}
                  onClick={() => toggleSetItem(setExpandedCostCenters, centerKey)}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] text-muted-foreground">{row.name}</span>
                      <span className="block text-[10px] text-muted-foreground/80">{transactionCountLabel(row.transactions.length)}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className={cn(
                      'text-[11px] font-medium tabular-nums',
                      row.total > 0 ? 'text-success' : row.total < 0 ? 'text-destructive' : 'text-muted-foreground',
                    )}>
                      {money(row.total)}
                    </span>
                    <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                  </span>
                </button>
                {isOpen && (
                  <div className="divide-y divide-border/20 border-t border-border/20 bg-background/80">
                    {row.transactions.map((transaction) => {
                      const signedAmount = signedTransactionAmount(transaction);
                      return (
                        <div
                          key={transaction.id}
                          className="grid gap-0.5 py-2 pl-11 pr-3 text-xs sm:grid-cols-[6.5rem_minmax(0,1fr)_8rem] sm:items-center sm:gap-3 sm:pl-14 sm:pr-4"
                        >
                          <span className="text-[10px] text-muted-foreground">
                            {transaction.paid_date ? date(transaction.paid_date) : 'Data não informada'}
                          </span>
                          <span className="min-w-0 break-words text-foreground/80">
                            {transaction.description || 'Sem descrição'}
                          </span>
                          <span className={cn(
                            'font-medium tabular-nums sm:text-right',
                            signedAmount >= 0 ? 'text-success' : 'text-destructive',
                          )}>
                            {money(signedAmount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCategoryRow = (
    category: DfcUiCategory,
    options: { label?: string; caption?: string; nested?: boolean } = {},
  ) => {
    const isOpen = expandedCategories.has(category.key);
    const meta = categoryMeta(category.name);
    const Icon = getCategoryIcon(meta.icon);
    return (
      <div key={category.key}>
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/40 sm:px-4"
          aria-expanded={isOpen}
          onClick={() => toggleSetItem(setExpandedCategories, category.key)}
        >
          <span className={cn('flex min-w-0 flex-1 items-center gap-2', options.nested ? 'pl-4 sm:pl-6' : 'pl-2 sm:pl-4')}>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: meta.color }}>
              <Icon className="h-3 w-3 text-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-foreground/80">{options.label ?? category.name}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {options.caption ? `${options.caption} · ` : ''}{transactionCountLabel(category.transactions.length)}
              </span>
            </span>
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1.5">
            <span className={cn(
              'text-xs font-medium tabular-nums',
              category.total > 0 ? 'text-success' : category.total < 0 ? 'text-destructive' : 'text-muted-foreground',
            )}>
              {money(category.total)}
            </span>
            <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
          </span>
        </button>
        {isOpen && renderCostCenters(category)}
      </div>
    );
  };

  const renderParentCategory = (
    node: Extract<DreRowNode<DfcUiCategory>, { kind: 'parent' }>,
  ) => {
    const childrenKey = `${node.key}:children`;
    const isOpen = expandedCategories.has(childrenKey);
    const meta = categoryMeta(node.name);
    const Icon = getCategoryIcon(meta.icon);
    const transactionCount = (node.own?.transactions.length ?? 0)
      + node.children.reduce((count, child) => count + child.transactions.length, 0);
    return (
      <div key={node.key}>
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/40 sm:px-4"
          aria-expanded={isOpen}
          onClick={() => toggleSetItem(setExpandedCategories, childrenKey)}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 pl-2 sm:pl-4">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: meta.color }}>
              <Icon className="h-3 w-3 text-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-foreground/80">{node.name}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {node.children.length} {node.children.length === 1 ? 'subcategoria' : 'subcategorias'} · {transactionCountLabel(transactionCount)}
              </span>
            </span>
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1.5">
            <span className={cn(
              'text-xs font-semibold tabular-nums',
              node.total > 0 ? 'text-success' : node.total < 0 ? 'text-destructive' : 'text-muted-foreground',
            )}>
              {money(node.total)}
            </span>
            <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
          </span>
        </button>
        {isOpen && (
          <div className="bg-muted/20">
            <p className="px-3 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:px-4">
              Subcategorias
            </p>
            <div className="divide-y divide-border/30">
              {node.own && renderCategoryRow(node.own, {
                nested: true,
                label: `Lançado diretamente em ${node.name}`,
              })}
              {node.children.map((child) => renderCategoryRow(child, { nested: true }))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const changeIsPositive = report.netChange > 0;
  const changeIsZero = report.netChange === 0;
  const ChangeIcon = changeIsPositive ? ArrowUpCircle : changeIsZero ? Banknote : ArrowDownCircle;
  const kpiMoney = (value: number) => {
    if (!isMobile || Math.abs(value) < 1_000) return money(value);
    const compactBase = (scaled: number) => money(scaled)
      .replace(/([,.]\d)0$/, '$1')
      .replace(/([,.])00$/, '');
    if (Math.abs(value) >= 1_000_000) return `${compactBase(value / 1_000_000)} mi`;
    return `${compactBase(value / 1_000)} mil`;
  };

  return (
    <section className="space-y-5 sm:space-y-6" aria-labelledby="dfc-title">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <DfcKpi label="Saldo inicial" shortLabel="Inicial" value={kpiMoney(report.openingBalance)} fullValue={money(report.openingBalance)} icon={PiggyBank} className="bg-info" />
        <DfcKpi
          label="Variação líquida"
          shortLabel="Variação"
          value={kpiMoney(report.netChange)}
          fullValue={money(report.netChange)}
          icon={ChangeIcon}
          className={changeIsPositive ? 'bg-success' : changeIsZero ? 'bg-muted-foreground' : 'bg-destructive'}
        />
        <DfcKpi
          label="Saldo final"
          shortLabel="Final"
          value={kpiMoney(report.closingBalance)}
          fullValue={money(report.closingBalance)}
          icon={Landmark}
          className={report.closingBalance >= 0 ? 'bg-primary' : 'bg-destructive'}
        />
      </div>

      <Card className="overflow-hidden border-0 bg-muted/15 shadow-none">
        <CardHeader className="bg-foreground pb-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle id="dfc-title" className="text-base font-semibold text-background sm:text-lg">
                  DFC Gerencial
                </CardTitle>
                <span className="rounded-full bg-success px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Somente realizado
                </span>
              </div>
              <p className="mt-1 text-xs text-background/70">Fluxo de caixa por atividade · {periodLabel}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={movementCount === 0}
              className="w-full gap-2 border-background/20 bg-transparent text-xs text-background hover:bg-background/20 hover:text-background sm:w-auto"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {movementCount === 0 && (
            <div className="flex flex-col items-center border-b border-border/30 px-6 py-8 text-center">
              <ArrowDownToLine className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">Nenhuma movimentação realizada no período</p>
              <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                O DFC considera somente lançamentos pagos, pela data da baixa. Valores previstos ou pendentes não entram.
              </p>
            </div>
          )}

          {report.groups.map((group) => {
            const groupIsOpen = expandedGroups.has(group.key);
            const nodes = groupNodes.get(group.key) ?? [];
            const groupMeta = DFC_GROUP_META[group.key];
            const GroupIcon = groupMeta.icon;
            return (
              <div key={group.key} className="border-b border-border/30 last:border-b-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 sm:px-4 sm:py-3"
                  aria-expanded={groupIsOpen}
                  onClick={() => toggleSetItem(setExpandedGroups, group.key)}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      data-dfc-group-icon={group.key}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm"
                      style={{ backgroundColor: groupMeta.color }}
                      aria-hidden="true"
                    >
                      <GroupIcon className="h-3.5 w-3.5 text-white" />
                    </span>
                    <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</span>
                  </span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', groupIsOpen && 'rotate-180')} />
                </button>

                {groupIsOpen && (
                  nodes.length === 0 ? (
                    <p className="px-6 py-3 text-xs text-muted-foreground">Sem movimentações nesta atividade.</p>
                  ) : (
                    <div className="divide-y divide-border/30">
                      {nodes.map((node) => {
                        if (node.kind === 'parent') return renderParentCategory(node);
                        const parentName = categoryParentNameMap.get(node.row.name);
                        return renderCategoryRow(node.row, {
                          caption: parentName ? `Subcategoria de ${parentName}` : undefined,
                        });
                      })}
                    </div>
                  )
                )}

                <div className="flex items-center justify-between border-t border-border/30 px-3 py-2.5 sm:px-4 sm:py-3">
                  <span className="pl-2 text-sm font-medium text-foreground/80 sm:pl-4">Total</span>
                  <span className={cn(
                    'text-sm font-semibold tabular-nums',
                    group.total > 0 ? 'text-success' : group.total < 0 ? 'text-destructive' : 'text-muted-foreground',
                  )}>
                    {money(group.total)}
                  </span>
                </div>
              </div>
            );
          })}

          <div className={cn(
            'flex items-center justify-between px-3 py-4 text-white sm:px-4',
            report.netChange > 0 ? 'bg-success' : report.netChange < 0 ? 'bg-destructive' : 'bg-muted-foreground',
          )}>
            <div className="flex min-w-0 items-center gap-2 pl-2 sm:pl-4">
              <ChangeIcon className="h-4 w-4 shrink-0" />
              <span className="truncate text-sm font-bold sm:text-base">Variação líquida de caixa</span>
            </div>
            <span className="ml-2 max-w-[50%] shrink-0 break-words text-right text-base font-bold leading-tight tabular-nums [overflow-wrap:anywhere] sm:text-lg">
              {money(report.netChange)}
            </span>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Método direto · somente valores realizados pela data da baixa.
      </p>
    </section>
  );
}

function DfcKpi({
  label,
  shortLabel,
  value,
  fullValue,
  icon: Icon,
  className,
}: {
  label: string;
  shortLabel: string;
  value: string;
  fullValue: string;
  icon: LucideIcon;
  className: string;
}) {
  return (
    <Card className={cn('border-0 text-white shadow-sm', className)}>
      <CardContent className="min-w-0 p-3 sm:p-5">
        <p className="flex items-center gap-1 text-[10px] font-medium uppercase leading-tight tracking-wider text-white/80 sm:text-xs">
          <Icon className="h-3 w-3 shrink-0 text-white sm:h-4 sm:w-4" />
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
        <p className="mt-1 truncate whitespace-nowrap text-xs font-bold leading-tight tabular-nums text-white min-[380px]:text-sm sm:text-3xl" title={fullValue}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function FinanceDFCLoading() {
  return (
    <section className="space-y-5 sm:space-y-6" aria-label="Carregando DFC gerencial" aria-busy="true">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 sm:h-28" />)}
      </div>
      <div className="space-y-3 rounded-lg bg-muted/15 p-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-6 w-44" />
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-[74px]" />)}
      </div>
    </section>
  );
}
