import { useState } from "react";
import { AlertTriangle, CalendarRange, CheckCircle2, ChevronDown, ChevronRight, EyeOff, Loader2 } from "lucide-react";
import type { DreCustomLine, DreCustomRow, DreCustomStatement } from "@/lib/dreCustomLayout";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  statement?: DreCustomStatement;
  isLoading: boolean;
  error?: unknown;
  renderValue: (value: number, isNegative?: boolean, currency?: string) => React.ReactNode;
  currentPeriodLabel?: string;
  comparisonPeriodLabels?: string[];
  comparisonStatements?: DreCustomStatement[];
  onComparePeriods?: () => void;
  comparisonDisabled?: boolean;
}

export function DreCustomStatementView({
  statement,
  isLoading,
  error,
  renderValue,
  currentPeriodLabel,
  comparisonPeriodLabels = [],
  comparisonStatements = [],
  onComparePeriods,
  comparisonDisabled,
}: Props) {
  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Montando esta visão…</div>;
  }
  if (error || !statement) {
    return (
      <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Esta visão não pôde ser calculada com segurança. O DRE padrão e os lançamentos não foram alterados.
      </div>
    );
  }
  if (statement.currencies.length === 0) {
    return <p className="px-4 py-16 text-center text-sm text-muted-foreground">Nenhum lançamento no período selecionado.</p>;
  }

  return (
    <div className="divide-y">
      {(currentPeriodLabel || onComparePeriods) && (
        <div className="flex flex-col gap-2 border-b bg-muted/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">{currentPeriodLabel ?? "Período atual"}</p>
            {comparisonPeriodLabels.length > 0 && (
              <p className="truncate text-[11px] text-muted-foreground">Comparando com {comparisonPeriodLabels.join(" · ")}</p>
            )}
          </div>
          {onComparePeriods && (
            <Button type="button" variant="outline" size="sm" disabled={comparisonDisabled} onClick={onComparePeriods} className="h-8 gap-2 text-xs">
              <CalendarRange className="h-3.5 w-3.5" />
              Comparar períodos
            </Button>
          )}
        </div>
      )}
      {statement.currencies.map((currencyStatement) => (
        <section key={currencyStatement.currency} className="overflow-x-auto">
          {statement.currencies.length > 1 && (
            <div className="flex items-center justify-between bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Valores em {currencyStatement.currency}</span>
              <span>Nenhuma conversão entre moedas</span>
            </div>
          )}
          <div className={comparisonPeriodLabels.length > 0 ? "min-w-[760px]" : undefined}>
            {comparisonPeriodLabels.length > 0 && (
              <div className="flex items-center justify-end gap-3 border-b bg-muted/10 px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <span className="w-28 text-right">{currentPeriodLabel ?? "Atual"}</span>
                {comparisonPeriodLabels.map((label) => <span key={label} className="w-28 text-right">{label}</span>)}
              </div>
            )}
            {currencyStatement.rows.map((row) => (
              <CustomRow
                key={row.id}
                row={row}
                comparisonRows={comparisonStatements.map((item) => item.currencies.find((candidate) => candidate.currency === currencyStatement.currency)?.rows.find((candidate) => candidate.id === row.id))}
                currency={currencyStatement.currency}
                renderValue={renderValue}
              />
            ))}
          </div>
          <div className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs",
            currencyStatement.reconciled ? "bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" : "bg-red-50 text-red-800",
          )}>
            {currencyStatement.reconciled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {currencyStatement.reconciled
              ? `${currencyStatement.displayedEntryCount} de ${currencyStatement.sourceEntryCount} itens conferidos nesta moeda.`
              : "Os itens desta moeda não reconciliaram."}
          </div>
        </section>
      ))}
    </div>
  );
}

function CustomRow({
  row,
  comparisonRows,
  currency,
  renderValue,
}: {
  row: DreCustomRow;
  comparisonRows: Array<DreCustomRow | undefined>;
  currency: string;
  renderValue: Props["renderValue"];
}) {
  const shouldStartOpen = row.kind === "unclassified";
  const [open, setOpen] = useState(shouldStartOpen);
  const lines = row.groups.flatMap((group) => group.lines).concat(row.lines);
  const expandable = lines.length > 0 || row.groups.length > 0;
  const isFinal = row.kind === "final_result";
  const isSubtotal = row.kind === "subtotal";
  const isWarning = row.kind === "unclassified";
  const isOutside = row.kind === "outside_dre";

  if (isFinal) {
    const positive = row.value >= 0;
    return (
      <div className={cn("flex items-center justify-between gap-3 px-4 py-4 text-white", positive ? "bg-emerald-600" : "bg-red-600")}>
        <div>
          <p className="font-bold">(=) {row.label}</p>
          <p className="text-xs text-white/80">{positive ? "Superávit" : "Déficit"}</p>
        </div>
        <PeriodValues current={row.value} comparisons={comparisonRows.map((item) => item?.value ?? 0)} currency={currency} renderValue={renderValue} className="text-lg font-bold" />
      </div>
    );
  }

  return (
    <div className={cn(isWarning && "border-y border-amber-200 bg-amber-50/70", isOutside && "bg-muted/20")}>
      <button
        type="button"
        disabled={!expandable}
        onClick={() => expandable && setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-4 py-3 text-left",
          expandable && "hover:bg-muted/30",
          isSubtotal && "bg-slate-900 text-white",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {expandable ? (open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />) : <span className="w-4" />}
          {isWarning && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
          {isOutside && <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span>
            <span className={cn("block text-sm font-semibold", isWarning && "text-amber-950")}>{row.label}</span>
            {isWarning && <span className="block text-[11px] font-normal text-amber-800">Visível e incluído provisoriamente no resultado até ser classificado.</span>}
            {isOutside && <span className="block text-[11px] font-normal text-muted-foreground">Visível para conferência, sem alterar o resultado.</span>}
            {row.kind === "macro_group" && !row.affectsResult && <span className="block text-[11px] font-normal text-muted-foreground">Seção informativa — não entra no resultado.</span>}
          </span>
        </span>
        <PeriodValues current={row.value} comparisons={comparisonRows.map((item) => item?.value ?? 0)} currency={currency} renderValue={renderValue} className="text-sm font-semibold" />
      </button>

      {open && expandable && (
        <div className="border-t bg-background/80">
          {row.groups.map((group) => (
            <div key={group.id}>
              <div className="flex items-center justify-between bg-muted/20 px-5 py-2 text-xs font-medium text-muted-foreground">
                <span>{group.label}</span>
                <PeriodValues current={group.value} comparisons={comparisonRows.map((item) => item?.groups.find((candidate) => candidate.id === group.id)?.value ?? 0)} currency={currency} renderValue={renderValue} />
              </div>
              {group.lines.map((line) => (
                <Line key={line.entryId} line={line} comparisonLines={comparisonRows.map((item) => item?.groups.flatMap((candidate) => candidate.lines).find((candidate) => sameLine(candidate, line)))} currency={currency} renderValue={renderValue} />
              ))}
            </div>
          ))}
          {row.lines.map((line) => (
            <Line key={line.entryId} line={line} comparisonLines={comparisonRows.map((item) => item?.lines.find((candidate) => sameLine(candidate, line)))} currency={currency} renderValue={renderValue} />
          ))}
        </div>
      )}
    </div>
  );
}

function Line({
  line,
  comparisonLines,
  currency,
  renderValue,
}: {
  line: DreCustomLine;
  comparisonLines: Array<DreCustomLine | undefined>;
  currency: string;
  renderValue: Props["renderValue"];
}) {
  const [showCenters, setShowCenters] = useState(false);
  const centers = line.costCenters ?? [];
  return (
    <div className="border-t border-border/30 text-xs">
      <button
        type="button"
        disabled={centers.length === 0}
        onClick={() => centers.length > 0 && setShowCenters((current) => !current)}
        className={cn("flex w-full items-center justify-between gap-3 px-8 py-2 text-left", centers.length > 0 && "hover:bg-muted/20")}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-foreground/75">
          {centers.length > 0 && (showCenters ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />)}
          <span className="truncate">{line.label}</span>
        </span>
        <PeriodValues current={line.value} comparisons={comparisonLines.map((item) => item?.value ?? 0)} currency={currency} renderValue={renderValue} className="font-medium" />
      </button>
      {showCenters && centers.length > 0 && (
        <div className="bg-muted/10 pb-1">
          {centers.map((center) => (
            <div key={center.id ?? center.name} className="flex items-center justify-between gap-3 px-12 py-1.5 text-[11px] text-muted-foreground">
              <span>{center.name}</span>
              <span>{renderValue(center.value, center.value < 0, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function sameLine(left: DreCustomLine, right: DreCustomLine) {
  return left.categoryId === right.categoryId
    && left.sourceKey === right.sourceKey
    && left.label === right.label
    && left.reason === right.reason;
}

function PeriodValues({
  current,
  comparisons,
  currency,
  renderValue,
  className,
}: {
  current: number;
  comparisons: number[];
  currency: string;
  renderValue: Props["renderValue"];
  className?: string;
}) {
  return (
    <span className={cn("flex shrink-0 items-center gap-3", className)}>
      <span className="w-28 text-right">{renderValue(current, current < 0, currency)}</span>
      {comparisons.map((value, index) => (
        <span key={index} className="w-28 text-right">{renderValue(value, value < 0, currency)}</span>
      ))}
    </span>
  );
}
