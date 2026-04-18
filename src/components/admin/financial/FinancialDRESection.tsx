import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, PieChart, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminFinancialCategory } from '@/hooks/useAdminFinancialCategories';
import { generateAdminDreHtml } from '@/utils/adminDreHtmlGenerator';
import { AdminDREEvolutionChart } from '@/components/admin/AdminDREEvolutionChart';

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

// Hierarquia DRE — espelha EcoSistema
const REVENUE_CATEGORIES = ['sale', 'first_sale', 'renewal', 'partner_contribution', 'other_income', 'upgrade'];
const TAX_CATEGORIES = ['asaas_fee', 'tax', 'impostos'];
const CPV_CATEGORIES = ['infrastructure'];
const OPEX_CATEGORIES = ['salary', 'marketing', 'development', 'commission', 'advance', 'tools', 'administrative', 'other_expense'];

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function FinancialDRESection({ transactions, categories, periodLabel }: Props) {
  const [showRevenue, setShowRevenue] = useState(false);
  const [showTax, setShowTax] = useState(false);
  const [showCPV, setShowCPV] = useState(false);
  const [showOpex, setShowOpex] = useState(false);
  const [exporting, setExporting] = useState(false);

  const labelFor = (name: string) => categories.find((c) => c.name === name)?.label ?? name;

  const dre = useMemo(() => {
    const sumByCat = (allowed: string[], type: 'income' | 'expense') => {
      const map: Record<string, number> = {};
      allowed.forEach((c) => { map[c] = 0; });
      transactions
        .filter((t) => t.type === type && allowed.includes(t.category || ''))
        .forEach((t) => {
          // Merge first_sale into sale for visualization
          const k = t.category === 'first_sale' ? 'sale' : (t.category as string);
          map[k] = (map[k] || 0) + Number(t.amount);
        });
      return map;
    };

    const revenueByCategory = sumByCat(REVENUE_CATEGORIES, 'income');
    const receitaBruta = Object.values(revenueByCategory).reduce((s, v) => s + v, 0);

    const taxesByCategory = sumByCat(TAX_CATEGORIES, 'expense');
    const impostos = Object.values(taxesByCategory).reduce((s, v) => s + v, 0);
    const receitaLiquida = receitaBruta - impostos;

    const cpvByCategory = sumByCat(CPV_CATEGORIES, 'expense');
    const cpv = Object.values(cpvByCategory).reduce((s, v) => s + v, 0);
    const lucroBruto = receitaLiquida - cpv;
    const margemBruta = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0;

    const opexByCategory = sumByCat(OPEX_CATEGORIES, 'expense');
    const opex = Object.values(opexByCategory).reduce((s, v) => s + v, 0);

    const ebitda = lucroBruto - opex;
    const margem = receitaBruta > 0 ? (ebitda / receitaBruta) * 100 : 0;

    const breakdown = (m: Record<string, number>) =>
      Object.entries(m).filter(([_, v]) => v > 0).map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value);

    return {
      receitaBruta,
      revenueByCategory: breakdown(revenueByCategory),
      impostos,
      taxesByCategory: breakdown(taxesByCategory),
      receitaLiquida,
      cpv,
      cpvByCategory: breakdown(cpvByCategory),
      lucroBruto,
      margemBruta,
      opex,
      opexByCategory: breakdown(opexByCategory),
      ebitda,
      margem,
    };
  }, [transactions]);

  const handleExport = () => {
    if (exporting) return;
    setExporting(true);
    try {
      const html = generateAdminDreHtml({
        ...dre,
        revenueLines: dre.revenueByCategory.map((c) => ({ name: labelFor(c.category), value: c.value })),
        taxLines: dre.taxesByCategory.map((c) => ({ name: labelFor(c.category), value: c.value })),
        cpvLines: dre.cpvByCategory.map((c) => ({ name: labelFor(c.category), value: c.value })),
        opexLines: dre.opexByCategory.map((c) => ({ name: labelFor(c.category), value: c.value })),
        grossRevenue: dre.receitaBruta,
        taxes: dre.impostos,
        netRevenue: dre.receitaLiquida,
        grossProfit: dre.lucroBruto,
        margin: dre.margem,
      } as any, periodLabel);
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); }
    } finally {
      setExporting(false);
    }
  };

  const ResultIcon = dre.ebitda > 0 ? TrendingUp : dre.ebitda < 0 ? TrendingDown : Minus;

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
            <div className="flex items-start justify-between">
              <div className="space-y-1 lg:space-y-2">
                <p className="text-xs lg:text-sm font-medium text-white/80">Receita Líquida</p>
                <p className="text-lg lg:text-2xl font-bold tracking-tight truncate">{fmt(dre.receitaLiquida)}</p>
              </div>
              <div className="p-2 rounded-xl bg-blue-600"><TrendingUp className="h-4 w-4 text-white" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn('relative overflow-hidden border-0 shadow-lg text-white', dre.ebitda >= 0 ? 'bg-emerald-500' : 'bg-red-500')}>
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1 lg:space-y-2">
                <p className="text-xs lg:text-sm font-medium text-white/80">Resultado (EBITDA)</p>
                <p className="text-lg lg:text-2xl font-bold tracking-tight truncate">{fmt(dre.ebitda)}</p>
              </div>
              <div className={cn('p-2 rounded-xl', dre.ebitda >= 0 ? 'bg-emerald-600' : 'bg-red-600')}>
                <ResultIcon className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evolution chart */}
      <AdminDREEvolutionChart transactions={transactions} />

      {/* DRE Card */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-gray-900 to-gray-800 pb-4">
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
          {/* EBITDA */}
          <div className={cn('px-4 py-5 flex items-center justify-between',
            dre.ebitda >= 0 ? 'bg-gradient-to-r from-green-600 to-green-500' : 'bg-gradient-to-r from-red-600 to-red-500')}>
            <div className="flex items-center gap-3">
              <ResultIcon className="h-5 w-5 text-white" />
              <div className="flex flex-col">
                <span className="text-base font-bold text-white">(=) RESULTADO LÍQUIDO (EBITDA)</span>
                <span className="text-xs text-white/80">{dre.ebitda >= 0 ? 'Lucro' : 'Prejuízo'} do Período</span>
              </div>
            </div>
            <span className="text-xl font-bold text-white">{fmt(dre.ebitda)}</span>
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
      <button onClick={onToggle} className="w-full px-4 py-3 bg-background flex items-center justify-between hover:bg-muted/50 transition-colors">
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
