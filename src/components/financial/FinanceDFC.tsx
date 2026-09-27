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
  ReceiptText,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DateRange } from '@/components/ui/DateRangeFilter';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import type { FinancialTransaction } from '@/types/database';
import { calculateDfc, type DfcGroupKey } from '@/lib/dfc';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { cn } from '@/lib/utils';

type DfcTransaction = FinancialTransaction & {
  dfc_group?: DfcGroupKey | null;
};

interface FinanceDFCProps {
  /**
   * Lista crua do histórico disponível, não apenas os itens já cortados pelo
   * seletor. O motor precisa das baixas anteriores a `range.from` para apurar
   * o saldo inicial sem alterar retroativamente o período selecionado.
   */
  transactions: FinancialTransaction[];
  /** Período herdado do filtro da página. Limites ausentes = todo o histórico. */
  range?: DateRange;
  /** Permite que a página mantenha o skeleton enquanto carrega os lançamentos. */
  isLoading?: boolean;
}

const GROUP_META: Record<DfcGroupKey, { description: string; icon: LucideIcon; iconClassName: string }> = {
  operacional: {
    description: 'Entradas e saídas ligadas à operação do negócio.',
    icon: ReceiptText,
    iconClassName: 'bg-sky-600',
  },
  investimento: {
    description: 'Compra e venda de ativos e outros investimentos.',
    icon: Landmark,
    iconClassName: 'bg-violet-600',
  },
  financiamento: {
    description: 'Empréstimos, aportes e outras fontes de financiamento.',
    icon: WalletCards,
    iconClassName: 'bg-amber-600',
  },
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

/**
 * Neutraliza fórmulas ao abrir o CSV no Excel/LibreOffice e escapa aspas,
 * separadores e quebras de linha. Descrição e categoria são dados do usuário.
 */
function csvCell(value: string | number): string {
  if (typeof value === 'number') {
    return `"${value.toFixed(2).replace('.', ',')}"`;
  }
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function FinanceDFC({ transactions, range, isLoading = false }: FinanceDFCProps) {
  const { categories, isLoading: isLoadingCategories } = useFinancialCategories();
  const { accounts, isLoading: isLoadingAccounts } = useFinancialAccounts();
  const { money, date } = useLocaleFormatters();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(['operacional']),
  );
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // O lançamento persiste o NOME da categoria, não o id. Enriquecer aqui
  // preserva a fronteira de dados no hook e mantém `calculateDfc` puro.
  const enrichedTransactions = useMemo<DfcTransaction[]>(() => {
    const groupByCategoryName = new Map(
      categories.map((category) => [
        category.name,
        category.dfc_group ?? null,
      ]),
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

  const report = useMemo(
    () => calculateDfc(
      enrichedTransactions,
      normalizedRange,
      accounts
        .filter((account) => account.type !== 'cartao')
        .reduce((total, account) => total + Number(account.initial_balance || 0), 0),
    ),
    [accounts, enrichedTransactions, normalizedRange],
  );

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

  const toggleSetItem = (
    setter: Dispatch<SetStateAction<Set<string>>>,
    key: string,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExportCsv = () => {
    const rows: Array<Array<string | number>> = [
      ['DFC Gerencial — somente realizado'],
      ['Período', periodLabel],
      ['Saldo inicial', report.openingBalance],
      ['Variação líquida', report.netChange],
      ['Saldo final', report.closingBalance],
      [],
      ['Atividade', 'Categoria', 'Data da baixa', 'Descrição', 'Tipo', 'Valor realizado'],
    ];

    report.groups.forEach((group) => {
      group.categories.forEach((category) => {
        category.transactions.forEach((transaction) => {
          rows.push([
            group.label,
            category.name,
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

  if (isLoading || isLoadingCategories || isLoadingAccounts) {
    return <FinanceDFCLoading />;
  }

  const changeIsPositive = report.netChange > 0;
  const changeIsZero = report.netChange === 0;
  const ChangeIcon = changeIsPositive ? ArrowUpCircle : changeIsZero ? Banknote : ArrowDownCircle;

  return (
    <section className="space-y-5 sm:space-y-6" aria-labelledby="dfc-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="dfc-title" className="text-lg font-semibold tracking-tight sm:text-xl">
              DFC Gerencial
            </h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              Somente realizado
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Fluxo de caixa por atividade · {periodLabel}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={movementCount === 0}
          className="w-full gap-2 sm:w-auto"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <DfcKpi
          label="Saldo inicial"
          value={money(report.openingBalance)}
          detail="Antes do período"
          icon={PiggyBank}
          className="bg-sky-600"
        />
        <DfcKpi
          label="Variação líquida"
          value={money(report.netChange)}
          detail={changeIsPositive ? 'Geração de caixa' : changeIsZero ? 'Caixa estável' : 'Consumo de caixa'}
          icon={ChangeIcon}
          className={changeIsPositive ? 'bg-emerald-600' : changeIsZero ? 'bg-slate-600' : 'bg-rose-600'}
        />
        <DfcKpi
          label="Saldo final"
          value={money(report.closingBalance)}
          detail="Após o período"
          icon={Landmark}
          className={report.closingBalance >= 0 ? 'bg-indigo-600' : 'bg-rose-700'}
        />
      </div>

      {movementCount === 0 && (
        <Card className="border-0 bg-muted/30 shadow-none">
          <CardContent className="flex flex-col items-center px-6 py-10 text-center">
            <ArrowDownToLine className="mb-3 h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">Nenhuma movimentação realizada no período</p>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              O DFC considera somente lançamentos pagos, pela data da baixa. Valores previstos ou pendentes não entram neste relatório.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {report.groups.map((group) => {
          const groupKey = group.key as DfcGroupKey;
          const meta = GROUP_META[groupKey] ?? GROUP_META.operacional;
          const GroupIcon = meta.icon;
          const groupIsOpen = expandedGroups.has(group.key);
          const groupContentId = `dfc-group-${group.key}`;

          return (
            <Card key={group.key} className="overflow-hidden border-0 bg-muted/20 shadow-none">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                aria-expanded={groupIsOpen}
                aria-controls={groupContentId}
                onClick={() => toggleSetItem(setExpandedGroups, group.key)}
              >
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white', meta.iconClassName)}>
                  <GroupIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{group.label}</span>
                  <span className="hidden text-xs text-muted-foreground sm:block">{meta.description}</span>
                </span>
                <span className={cn(
                  'shrink-0 text-sm font-bold tabular-nums sm:text-base',
                  group.total > 0 ? 'text-emerald-600' : group.total < 0 ? 'text-rose-600' : 'text-muted-foreground',
                )}>
                  {money(group.total)}
                </span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', groupIsOpen && 'rotate-180')} aria-hidden="true" />
              </button>

              {groupIsOpen && (
                <div id={groupContentId} className="border-t bg-muted/10">
                  {group.categories.length === 0 ? (
                    <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">
                      Sem movimentações nesta atividade.
                    </p>
                  ) : (
                    <div className="divide-y">
                      {group.categories.map((category, categoryIndex) => {
                        const categoryKey = `${group.key}:${category.name}`;
                        const categoryIsOpen = expandedCategories.has(categoryKey);
                        const categoryContentId = `dfc-category-${group.key}-${categoryIndex}`;

                        return (
                          <div key={categoryKey}>
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                              aria-expanded={categoryIsOpen}
                              aria-controls={categoryContentId}
                              onClick={() => toggleSetItem(setExpandedCategories, categoryKey)}
                            >
                              <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', categoryIsOpen && 'rotate-180')} aria-hidden="true" />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
                              <span className="hidden text-xs text-muted-foreground sm:inline">
                                {category.transactions.length} {category.transactions.length === 1 ? 'lançamento' : 'lançamentos'}
                              </span>
                              <span className={cn(
                                'min-w-[7rem] text-right text-sm font-semibold tabular-nums',
                                category.total > 0 ? 'text-emerald-600' : category.total < 0 ? 'text-rose-600' : 'text-muted-foreground',
                              )}>
                                {money(category.total)}
                              </span>
                            </button>

                            {categoryIsOpen && (
                              <div id={categoryContentId} className="divide-y border-t bg-background">
                                {category.transactions.map((transaction) => {
                                  const signedAmount = signedTransactionAmount(transaction);
                                  return (
                                    <div
                                      key={transaction.id}
                                      className="grid gap-1 px-4 py-3 pl-11 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_9rem] sm:items-center sm:gap-3 sm:px-5 sm:pl-12"
                                    >
                                      <span className="text-xs text-muted-foreground">
                                        {transaction.paid_date ? date(transaction.paid_date) : 'Data não informada'}
                                      </span>
                                      <span className="min-w-0 break-words text-foreground">
                                        {transaction.description || 'Sem descrição'}
                                      </span>
                                      <span className={cn(
                                        'font-medium tabular-nums sm:text-right',
                                        signedAmount >= 0 ? 'text-emerald-600' : 'text-rose-600',
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
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function DfcKpi({
  label,
  value,
  detail,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  className: string;
}) {
  return (
    <Card className={cn('border-0 text-white shadow-sm', className)}>
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-white/80">{label}</p>
          <p className="mt-1 break-words text-xl font-bold tabular-nums text-white sm:text-2xl">{value}</p>
          <p className="mt-1 text-xs text-white/75">{detail}</p>
        </div>
        <Icon className="h-6 w-6 shrink-0 text-white sm:h-7 sm:w-7" aria-hidden="true" />
      </CardContent>
    </Card>
  );
}

function FinanceDFCLoading() {
  return (
    <section className="space-y-5 sm:space-y-6" aria-label="Carregando DFC gerencial" aria-busy="true">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-64 max-w-[70vw]" />
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-28" />)}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-[74px]" />)}
      </div>
    </section>
  );
}
