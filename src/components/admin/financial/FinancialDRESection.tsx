import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminFinancialCategory } from '@/hooks/useAdminFinancialCategories';
import { generateAdminDreHtml } from '@/utils/adminDreHtmlGenerator';

interface Props {
  transactions: any[];
  categories: AdminFinancialCategory[];
  periodLabel: string;
}

const TAX_CATS = ['impostos', 'asaas_fee'];
const CPV_CATS: string[] = []; // reserva — não há CPV explícito no admin saas
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface DRELine { name: string; value: number; }

export function FinancialDRESection({ transactions, categories, periodLabel }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ revenue: true, tax: false, cpv: false, opex: true });

  const dre = useMemo(() => {
    const incomeTx = transactions.filter((t) => t.type === 'income');
    const expenseTx = transactions.filter((t) => t.type === 'expense');

    const grossRevenue = incomeTx.reduce((s, t) => s + Number(t.amount), 0);
    const taxes = expenseTx.filter((t) => TAX_CATS.includes(t.category)).reduce((s, t) => s + Number(t.amount), 0);
    const cpv = expenseTx.filter((t) => CPV_CATS.includes(t.category)).reduce((s, t) => s + Number(t.amount), 0);
    const opexTx = expenseTx.filter((t) => !TAX_CATS.includes(t.category) && !CPV_CATS.includes(t.category));
    const opex = opexTx.reduce((s, t) => s + Number(t.amount), 0);

    const groupBy = (arr: any[]): DRELine[] => {
      const map = new Map<string, number>();
      for (const t of arr) {
        const key = t.category || 'other';
        map.set(key, (map.get(key) ?? 0) + Number(t.amount));
      }
      return Array.from(map.entries())
        .map(([name, value]) => ({ name: categories.find((c) => c.name === name)?.label ?? name, value }))
        .sort((a, b) => b.value - a.value);
    };

    const netRevenue = grossRevenue - taxes;
    const grossProfit = netRevenue - cpv;
    const ebitda = grossProfit - opex;
    const margin = grossRevenue > 0 ? (ebitda / grossRevenue) * 100 : 0;

    return {
      grossRevenue,
      revenueLines: groupBy(incomeTx),
      taxes,
      taxLines: groupBy(expenseTx.filter((t) => TAX_CATS.includes(t.category))),
      netRevenue,
      cpv,
      cpvLines: groupBy(expenseTx.filter((t) => CPV_CATS.includes(t.category))),
      grossProfit,
      opex,
      opexLines: groupBy(opexTx),
      ebitda,
      margin,
    };
  }, [transactions, categories]);

  const toggle = (k: string) => setExpanded((e) => ({ ...e, [k]: !e[k] }));

  const exportHtml = () => {
    const html = generateAdminDreHtml(dre, periodLabel);
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 border-0 shadow-md">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Receita Líquida</p>
          <p className="text-xl font-bold">{fmt(dre.netRevenue)}</p>
        </Card>
        <Card className="p-4 border-0 shadow-md">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Resultado (EBITDA)</p>
          <p className={cn('text-xl font-bold', dre.ebitda >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{fmt(dre.ebitda)}</p>
        </Card>
        <Card className="p-4 border-0 shadow-md">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Margem</p>
          <p className={cn('text-xl font-bold', dre.margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{dre.margin.toFixed(1)}%</p>
        </Card>
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b bg-muted/30 py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Demonstrativo de Resultado · {periodLabel}</CardTitle>
          <Button variant="outline" size="sm" onClick={exportHtml} className="gap-2">
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
        </CardHeader>
        <CardContent className="p-0 divide-y">
          <DRERow label="Receita Bruta" value={dre.grossRevenue} bold positive expanded={expanded.revenue} onToggle={() => toggle('revenue')} lines={dre.revenueLines} />
          <DRERow label="(-) Impostos e Taxas" value={-dre.taxes} expanded={expanded.tax} onToggle={() => toggle('tax')} lines={dre.taxLines.map((l) => ({ ...l, value: -l.value }))} />
          <DRERow label="= Receita Líquida" value={dre.netRevenue} bold accent />
          {dre.cpv > 0 && <DRERow label="(-) CPV" value={-dre.cpv} expanded={expanded.cpv} onToggle={() => toggle('cpv')} lines={dre.cpvLines.map((l) => ({ ...l, value: -l.value }))} />}
          {dre.cpv > 0 && <DRERow label="= Lucro Bruto" value={dre.grossProfit} bold />}
          <DRERow label="(-) Despesas Operacionais" value={-dre.opex} expanded={expanded.opex} onToggle={() => toggle('opex')} lines={dre.opexLines.map((l) => ({ ...l, value: -l.value }))} />
          <DRERow label="= EBITDA" value={dre.ebitda} bold accent />
        </CardContent>
      </Card>
    </div>
  );
}

function DRERow({ label, value, bold, positive, accent, expanded, onToggle, lines }: {
  label: string;
  value: number;
  bold?: boolean;
  positive?: boolean;
  accent?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  lines?: DRELine[];
}) {
  return (
    <div>
      <button type="button" onClick={onToggle} disabled={!onToggle}
        className={cn('w-full flex items-center justify-between gap-2 px-4 py-3 text-left transition-colors', onToggle && 'hover:bg-muted/40', accent && 'bg-primary/5')}>
        <div className="flex items-center gap-2">
          {onToggle && (expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />)}
          <span className={cn('text-sm', bold && 'font-semibold')}>{label}</span>
        </div>
        <span className={cn('text-sm tabular-nums', bold && 'font-bold', value < 0 ? 'text-red-600 dark:text-red-400' : positive || accent ? 'text-emerald-600 dark:text-emerald-400' : '')}>
          {fmt(value)}
        </span>
      </button>
      {expanded && lines && lines.length > 0 && (
        <div className="bg-muted/20 px-8 py-2 space-y-1">
          {lines.map((c, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{c.name}</span>
              <span className="tabular-nums">{fmt(c.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
