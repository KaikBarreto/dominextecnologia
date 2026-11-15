import { useMemo, useState } from 'react';
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
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function FinancialDRESection({ transactions, categories, periodLabel }: Props) {
  const [showRevenue, setShowRevenue] = useState(false);
  const [showTax, setShowTax] = useState(false);
  const [showCPV, setShowCPV] = useState(false);
  const [showOpex, setShowOpex] = useState(false);
  const [showNonOperating, setShowNonOperating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const categoryIndex = useMemo(() => buildDreCategoryIndex(categories), [categories]);
  const dre = useMemo(() => aggregateDre(transactions, categoryIndex), [transactions, categoryIndex]);
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
        <Card className={cn('relative overflow-hidden border-0 shadow-lg text-white', dre.margem >= 0 ? 'bg-emerald-500' : 'bg-red-500')}>
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

        <Card className="relative overflow-hidden border-0 shadow-lg bg-blue-500 text-white">
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

        <Card className={cn('relative overflow-hidden border-0 shadow-lg text-white', dre.ebitda >= 0 ? 'bg-emerald-500' : 'bg-red-500')}>
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

      {/* Evolution chart */}
      <AdminDREEvolutionChart transactions={transactions} categoryIndex={categoryIndex} />

      {/* DRE Card */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardHeader className="bg-slate-950 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-white">DRE - Demonstrativo de Resultados</CardTitle>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}
              className="gap-2 text-xs bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
              <ExternalLink className="h-3.5 w-3.5" />{exporting ? 'Exportando...' : 'Exportar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Receita Bruta */}
          <Section
            label="(+) RECEITA BRUTA" value={dre.receitaBruta} positive
            expanded={showRevenue} onToggle={() => setShowRevenue((v) => !v)}
            items={dre.revenueByCategory} labelFor={labelFor} sign="+"
          />
          {/* Impostos */}
          <Section
            label="(-) IMPOSTOS E DEDUÇÕES" value={dre.impostos} negative
            expanded={showTax} onToggle={() => setShowTax((v) => !v)}
            items={dre.taxesByCategory} labelFor={labelFor} sign="-"
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
            items={dre.cpvByCategory} labelFor={labelFor} sign="-"
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
            items={dre.opexByCategory} labelFor={labelFor} sign="-"
          />
          {dre.nonOperating !== 0 && <Section
            label="(-) ITENS NÃO OPERACIONAIS" value={dre.nonOperating} negative
            expanded={showNonOperating} onToggle={() => setShowNonOperating((v) => !v)}
            items={dre.nonOperatingByCategory} labelFor={labelFor} sign="-"
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
    </div>
  );
}

function Section({ label, value, positive, negative, expanded, onToggle, items, labelFor, sign }: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
  expanded: boolean;
  onToggle: () => void;
  items: { category: string; value: number }[];
  labelFor: (n: string) => string;
  sign: '+' | '-';
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
            <div key={c.category} className="px-4 py-2 flex items-center justify-between bg-background/50">
              <span className="text-xs text-muted-foreground pl-4">{labelFor(c.category)}</span>
              <span className={cn('text-xs font-medium', positive ? 'text-green-600' : 'text-red-600')}>
                {sign === '-' ? '-' : ''}{fmt(c.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
