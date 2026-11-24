import { adminKpiClass } from "@/components/admin/adminKpiStyles";
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, PieChart, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminFinancialCategory } from '@/hooks/useAdminFinancialCategories';
import { generateAdminDreHtml } from '@/utils/adminDreHtmlGenerator';
import { AdminDREEvolutionChart } from '@/components/admin/AdminDREEvolutionChart';
import { aggregateDre, buildDreCategoryIndex, labelForCategory } from '@/lib/adminDreBuckets';

interface Transaction {
  id: string;
  type: string;
  category: string | null;
  amount: number;
  description: string | null;
  transaction_date: string;
}

interface Props {
  transactions: Transaction[];
  categories: AdminFinancialCategory[];
  periodLabel: string;
  /** Mesmo recorte do período anterior, fornecido paginado pela página pai. */
  comparisonTransactions?: Transaction[];
  comparisonLabel?: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function FinancialDRESection({ transactions, categories, periodLabel, comparisonTransactions, comparisonLabel, periodStart, periodEnd }: Props) {
  const [showRevenue, setShowRevenue] = useState(false);
  const [showTax, setShowTax] = useState(false);
  const [showCPV, setShowCPV] = useState(false);
  const [showOpex, setShowOpex] = useState(false);
  const [showNonOperating, setShowNonOperating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [drilldownCategory, setDrilldownCategory] = useState<string | null>(null);

  const categoryIndex = useMemo(() => buildDreCategoryIndex(categories), [categories]);
  const comparisonBounds = useMemo(() => {
    if (!periodStart || !periodEnd) return null;
    const end = new Date(periodStart); end.setDate(end.getDate() - 1);
    const start = new Date(end); start.setDate(start.getDate() - Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000));
    const afterEnd = new Date(end); afterEnd.setDate(afterEnd.getDate() + 1);
    return { start: `${format(start, 'yyyy-MM-dd')}T00:00:00-03:00`, endExclusive: `${format(afterEnd, 'yyyy-MM-dd')}T00:00:00-03:00` };
  }, [periodStart, periodEnd]);
  const comparisonAvailable = Boolean(comparisonBounds) && periodLabel !== 'Todos os tempos';
  const comparisonQuery = useQuery({
    queryKey: ['admin-dre-comparison', comparisonBounds?.start, comparisonBounds?.endExclusive],
    enabled: comparisonAvailable && !comparisonTransactions,
    queryFn: async () => {
      const rows: Transaction[] = [];
      for (let page = 0; page < 100; page += 1) {
        const { data, error } = await supabase.from('admin_financial_transactions').select('id,type,category,amount,description,transaction_date')
          .gte('transaction_date', comparisonBounds!.start).lt('transaction_date', comparisonBounds!.endExclusive)
          .order('transaction_date', { ascending: false }).order('id', { ascending: false }).range(page * 500, page * 500 + 499);
        if (error) throw error;
        rows.push(...((data ?? []) as Transaction[]));
        if (!data || data.length < 500) return rows;
      }
      throw new Error('O período anterior tem mais de 50 mil lançamentos; escolha um intervalo menor para comparar.');
    },
  });
  const dre = useMemo(() => aggregateDre(transactions, categoryIndex), [transactions, categoryIndex]);
  const effectiveComparisonTransactions = comparisonTransactions ?? comparisonQuery.data;
  const comparisonDre = useMemo(() => effectiveComparisonTransactions ? aggregateDre(effectiveComparisonTransactions, categoryIndex) : null, [effectiveComparisonTransactions, categoryIndex]);
  const drilldownTransactions = useMemo(() => drilldownCategory ? transactions.filter((transaction) => transaction.category === drilldownCategory) : [], [drilldownCategory, transactions]);
  const labelFor = (name: string) => labelForCategory(name, categoryIndex);

  const handleExport = () => {
    if (exporting) return;
    setExporting(true);
    try {
      const html = generateAdminDreHtml({
        ...dre,
        revenueLines: dre.revenueByCategory.map((c) => ({ name: c.label, value: c.value })),
        estornos: dre.estornos,
        estornoLines: dre.estornosByCategory.map((c) => ({ name: c.label, value: c.value })),
        taxLines: dre.taxesByCategory.map((c) => ({ name: c.label, value: c.value })),
        cpvLines: dre.cpvByCategory.map((c) => ({ name: c.label, value: c.value })),
        opexLines: dre.opexByCategory.map((c) => ({ name: c.label, value: c.value })),
        nonOperating: dre.nonOperating,
        nonOperatingLines: dre.nonOperatingByCategory.map((c) => ({ name: c.label, value: c.value })),
        resultadoFinal: dre.resultadoFinal,
        grossRevenue: dre.receitaBruta,
        taxes: dre.impostos,
        netRevenue: dre.receitaLiquida,
        grossProfit: dre.lucroBruto,
        margin: dre.margem,
      }, periodLabel);
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); }
    } finally {
      setExporting(false);
    }
  };

  const ResultIcon = dre.resultadoFinal > 0 ? TrendingUp : dre.resultadoFinal < 0 ? TrendingDown : Minus;

  return (
    <div className="space-y-6">
      {/* Cards de métrica principais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className={adminKpiClass(dre.margem >= 0 ? 'emerald' : 'rose', 'relative overflow-hidden border-0 shadow-lg')}>
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1 lg:space-y-2">
                <p className="text-xs lg:text-sm font-medium text-white/80">Margem de Lucro</p>
                <p className="text-lg lg:text-2xl font-bold tracking-tight">{dre.margem.toFixed(1)}%</p>
              </div>
              <div className={cn('p-2 rounded-xl', dre.margem >= 0 ? 'bg-emerald-600' : 'bg-red-600')}>
                <PieChart className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={adminKpiClass("blue", "relative overflow-hidden border-0 shadow-lg")}>
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1 lg:space-y-2">
                <p className="text-xs lg:text-sm font-medium text-white/80">Receita Líquida</p>
                <p className="break-words text-lg font-bold tracking-tight tabular-nums lg:text-2xl">{fmt(dre.receitaLiquida)}</p>
              </div>
              <div className="shrink-0 p-2 rounded-xl bg-blue-600"><TrendingUp className="h-4 w-4 text-white" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className={adminKpiClass(dre.resultadoFinal >= 0 ? 'emerald' : 'rose', 'relative overflow-hidden border-0 shadow-lg')}>
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1 lg:space-y-2">
                <p className="text-xs lg:text-sm font-medium text-white/80">Resultado final</p>
                <p className="break-words text-lg font-bold tracking-tight tabular-nums lg:text-2xl">{fmt(dre.resultadoFinal)}</p>
              </div>
              <div className={cn('shrink-0 p-2 rounded-xl', dre.resultadoFinal >= 0 ? 'bg-emerald-600' : 'bg-red-600')}>
                <ResultIcon className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {comparisonDre && (
        <Card className="border bg-white shadow-sm"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-semibold">Comparação de período</p><p className="text-xs text-muted-foreground">Atual × {comparisonLabel ?? 'período anterior equivalente'}</p></div>
          <div className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-xs text-muted-foreground">Receita líquida</p><p className={cn('font-semibold', dre.receitaLiquida - comparisonDre.receitaLiquida >= 0 ? 'text-emerald-700' : 'text-red-700')}>{fmt(dre.receitaLiquida - comparisonDre.receitaLiquida)}</p></div><div><p className="text-xs text-muted-foreground">Resultado final</p><p className={cn('font-semibold', dre.resultadoFinal - comparisonDre.resultadoFinal >= 0 ? 'text-emerald-700' : 'text-red-700')}>{fmt(dre.resultadoFinal - comparisonDre.resultadoFinal)}</p></div></div>
        </CardContent></Card>
      )}
      {comparisonQuery.isError ? <p role="alert" className="text-xs text-red-700">Não foi possível carregar o período anterior para comparação. Tente novamente.</p> : null}
      {!comparisonAvailable && !comparisonTransactions ? <p className="text-xs text-muted-foreground">Escolha um período fechado para comparar a DRE com o intervalo anterior equivalente.</p> : null}

      {/* Evolution chart */}
      <AdminDREEvolutionChart transactions={transactions} categoryIndex={categoryIndex} periodStart={periodStart} periodEnd={periodEnd} />

      {/* DRE Card */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardHeader className="bg-slate-950 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-white">DRE - Demonstrativo de Resultados</CardTitle>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}
              className="gap-2 text-xs bg-white border-white text-black hover:bg-white hover:text-black">
              <ExternalLink className="h-3.5 w-3.5" />{exporting ? 'Exportando...' : 'Exportar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Receita Bruta */}
          <Section
            label="(+) RECEITA BRUTA" value={dre.receitaBruta} positive
            expanded={showRevenue} onToggle={() => setShowRevenue((v) => !v)}
            items={dre.revenueByCategory} labelFor={labelFor} sign="+" onDrilldown={setDrilldownCategory}
          />
          {/* Impostos */}
          <Section
            label="(-) IMPOSTOS E DEDUÇÕES" value={dre.impostos} negative
            expanded={showTax} onToggle={() => setShowTax((v) => !v)}
            items={dre.taxesByCategory} labelFor={labelFor} sign="-" onDrilldown={setDrilldownCategory}
          />
          {/* Receita Líquida */}
          <div className="border-b border-border/50 bg-blue-600">
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">(=) RECEITA LÍQUIDA</span>
              <span className="text-sm font-bold text-white">{fmt(dre.receitaLiquida)}</span>
            </div>
          </div>
          {/* CPV */}
          <Section
            label="(-) CPV (Custo do Serviço)" value={dre.cpv} negative
            expanded={showCPV} onToggle={() => setShowCPV((v) => !v)}
            items={dre.cpvByCategory} labelFor={labelFor} sign="-" onDrilldown={setDrilldownCategory}
          />
          {/* Lucro Bruto */}
          <div className={cn('border-b border-border/50', dre.lucroBruto > 0 ? 'bg-green-600' : dre.lucroBruto < 0 ? 'bg-red-600' : 'bg-gray-800')}>
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white">(=) LUCRO BRUTO</span>
                <span className="text-xs text-white/80">Margem Bruta: {dre.margemBruta.toFixed(1)}%</span>
              </div>
              <span className="text-sm font-bold text-white">{fmt(dre.lucroBruto)}</span>
            </div>
          </div>
          {/* OPEX */}
          <Section
            label="(-) DESPESAS OPERACIONAIS (OPEX)" value={dre.opex} negative
            expanded={showOpex} onToggle={() => setShowOpex((v) => !v)}
            items={dre.opexByCategory} labelFor={labelFor} sign="-" onDrilldown={setDrilldownCategory}
          />
          {dre.nonOperating !== 0 && <Section
            label="(-) ITENS NÃO OPERACIONAIS" value={dre.nonOperating} negative
            expanded={showNonOperating} onToggle={() => setShowNonOperating((v) => !v)}
            items={dre.nonOperatingByCategory} labelFor={labelFor} sign="-" onDrilldown={setDrilldownCategory}
          />}
          {/* Resultado líquido */}
          <div className={cn('px-4 py-5 flex items-center justify-between',
            dre.resultadoFinal >= 0 ? 'bg-emerald-500' : 'bg-red-500')}>
            <div className="flex items-center gap-3">
              <ResultIcon className="h-5 w-5 text-white" />
              <div className="flex flex-col">
                <span className="text-base font-bold text-white">(=) RESULTADO FINAL</span>
                <span className="text-xs text-white/80">EBITDA {fmt(dre.ebitda)} após itens não operacionais</span>
              </div>
            </div>
            <span className="text-xl font-bold text-white">{fmt(dre.resultadoFinal)}</span>
          </div>
        </CardContent>
      </Card>

      {drilldownCategory && (
        <Card className="border bg-white shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div><CardTitle className="text-base">Lançamentos em {labelFor(drilldownCategory)}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Origem identificada pelo ID do lançamento; clique em uma categoria para trocar o detalhe.</p></div>
            <Button variant="ghost" size="sm" onClick={() => setDrilldownCategory(null)}>Fechar</Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {drilldownTransactions.slice(0, 100).map((transaction) => <div key={transaction.id} className="flex items-center justify-between gap-3 border-t py-2 text-sm"><span className="min-w-0 text-muted-foreground">{new Date(transaction.transaction_date).toLocaleDateString('pt-BR')} · #{transaction.id.slice(0, 8)}</span><span className="shrink-0 font-medium tabular-nums">{fmt(Number(transaction.amount) || 0)}</span></div>)}
            {drilldownTransactions.length > 100 && <p className="pt-2 text-xs text-muted-foreground">Mostrando os primeiros 100 de {drilldownTransactions.length} lançamentos do período.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({ label, value, positive, negative, expanded, onToggle, items, labelFor, sign, onDrilldown }: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
  expanded: boolean;
  onToggle: () => void;
  items: { category: string; value: number }[];
  labelFor: (n: string) => string;
  sign: '+' | '-';
  onDrilldown: (category: string) => void;
}) {
  return (
    <div className="border-b border-border/50">
      <button onClick={onToggle} className="w-full px-4 py-3 bg-background flex items-center justify-between hover:bg-white transition-colors">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-bold', positive ? 'text-green-600' : 'text-red-600')}>
            {sign === '-' ? '-' : ''}{fmt(value)}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {expanded && items.length > 0 && (
        <div className="divide-y divide-border/30">
          {items.map((c) => (
            <button type="button" key={c.category} onClick={() => onDrilldown(c.category)} className="w-full px-4 py-2 flex items-center justify-between bg-white text-left hover:bg-white">
              <span className="text-xs text-muted-foreground pl-4">{labelFor(c.category)}</span>
              <span className={cn('text-xs font-medium', positive ? 'text-green-600' : 'text-red-600')}>
                {sign === '-' ? '-' : ''}{fmt(c.value)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
