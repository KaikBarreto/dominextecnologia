import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { FinancialTransaction } from '@/types/database';
import { format, parseISO, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { generateDreHtml } from '@/utils/dreHtmlGenerator';
import { useCompanySettings } from '@/hooks/useCompanySettings';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// DRE classification by category name
function classifyCategory(category: string | null): 'impostos' | 'cpv' | 'opex' {
  const lower = (category || '').toLowerCase();
  if (/imposto|taxa|tributo|icms|iss|pis|cofins/.test(lower)) return 'impostos';
  if (/custo|material|peça|peca|fornecedor|insumo/.test(lower)) return 'cpv';
  return 'opex';
}

interface FinanceDREProps {
  transactions: (FinancialTransaction & { customer?: any })[];
}

interface CategoryBreakdown {
  name: string;
  value: number;
  color: string;
}

export function FinanceDRE({ transactions }: FinanceDREProps) {
  const { settings } = useCompanySettings();
  const [showImpostos, setShowImpostos] = useState(false);
  const [showCpv, setShowCpv] = useState(false);
  const [showOpex, setShowOpex] = useState(false);
  const [showReceita, setShowReceita] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { dre, impostosCategories, cpvCategories, opexCategories, receitaCategories } = useMemo(() => {
    let receitaBruta = 0;
    let impostos = 0;
    let cpv = 0;
    let opex = 0;

    const impostosMap = new Map<string, number>();
    const cpvMap = new Map<string, number>();
    const opexMap = new Map<string, number>();
    const receitaMap = new Map<string, number>();

    transactions.forEach((t) => {
      const amount = Number(t.amount);
      const cat = t.category || 'Sem categoria';
      if (t.transaction_type === 'entrada') {
        receitaBruta += amount;
        receitaMap.set(cat, (receitaMap.get(cat) || 0) + amount);
      } else {
        const cls = classifyCategory(t.category);
        if (cls === 'impostos') {
          impostos += amount;
          impostosMap.set(cat, (impostosMap.get(cat) || 0) + amount);
        } else if (cls === 'cpv') {
          cpv += amount;
          cpvMap.set(cat, (cpvMap.get(cat) || 0) + amount);
        } else {
          opex += amount;
          opexMap.set(cat, (opexMap.get(cat) || 0) + amount);
        }
      }
    });

    const receitaLiquida = receitaBruta - impostos;
    const lucroBruto = receitaLiquida - cpv;
    const resultadoLiquido = lucroBruto - opex;
    const margem = receitaBruta > 0 ? (resultadoLiquido / receitaBruta) * 100 : 0;

    const mapToArray = (map: Map<string, number>): CategoryBreakdown[] =>
      Array.from(map.entries())
        .map(([name, value]) => ({ name, value, color: '#6b7280' }))
        .sort((a, b) => b.value - a.value);

    return {
      dre: { receitaBruta, impostos, receitaLiquida, cpv, lucroBruto, opex, resultadoLiquido, margem },
      impostosCategories: mapToArray(impostosMap),
      cpvCategories: mapToArray(cpvMap),
      opexCategories: mapToArray(opexMap),
      receitaCategories: mapToArray(receitaMap),
    };
  }, [transactions]);

  // Monthly chart data
  const monthlyData = useMemo(() => {
    const map = new Map<string, { receitas: number; despesas: number }>();
    transactions.forEach((t) => {
      const monthKey = format(startOfMonth(parseISO(t.transaction_date)), 'yyyy-MM');
      const entry = map.get(monthKey) || { receitas: 0, despesas: 0 };
      if (t.transaction_type === 'entrada') entry.receitas += Number(t.amount);
      else entry.despesas += Number(t.amount);
      map.set(monthKey, entry);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        month: format(parseISO(`${key}-01`), 'MMM/yy', { locale: ptBR }),
        ...val,
      }));
  }, [transactions]);

  const handleExport = () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      generateDreHtml({
        company: {
          name: settings?.name || 'Minha Empresa',
          document: settings?.document || undefined,
          phone: settings?.phone || undefined,
          email: settings?.email || undefined,
          address: settings?.address || undefined,
          city: settings?.city || undefined,
          state: settings?.state || undefined,
          logo_url: settings?.logo_url || undefined,
        },
        period: 'Período Atual',
        receitaBruta: dre.receitaBruta,
        impostos: dre.impostos,
        impostosCategories,
        receitaLiquida: dre.receitaLiquida,
        cpv: dre.cpv,
        cpvCategories,
        lucroBruto: dre.lucroBruto,
        opex: dre.opex,
        opexCategories,
        resultadoLiquido: dre.resultadoLiquido,
        margem: dre.margem,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const ResultIcon = dre.resultadoLiquido > 0 ? TrendingUp : dre.resultadoLiquido < 0 ? TrendingDown : Minus;

  const getResultBg = () => {
    if (dre.resultadoLiquido === 0) return 'bg-foreground';
    return dre.resultadoLiquido > 0 ? 'bg-success' : 'bg-destructive';
  };

  const getGrossProfitBg = () => {
    if (dre.lucroBruto === 0) return 'bg-foreground';
    return dre.lucroBruto > 0 ? 'bg-success' : 'bg-destructive';
  };

  const renderCategoryList = (categories: CategoryBreakdown[]) => (
    <div className="divide-y divide-border/30">
      {categories.map((c) => (
        <div key={c.name} className="px-3 sm:px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 pl-2 sm:pl-4 min-w-0 flex-1">
            <div className="w-2 h-2 rounded-full flex-shrink-0 bg-muted-foreground" />
            <span className="text-xs text-foreground/70 truncate">{c.name}</span>
          </div>
          <span className="text-xs font-medium text-destructive flex-shrink-0 ml-2">
            -{formatCurrency(c.value)}
          </span>
        </div>
      ))}
    </div>
  );

  const renderReceitaList = (categories: CategoryBreakdown[]) => (
    <div className="divide-y divide-border/30">
      {categories.map((c) => (
        <div key={c.name} className="px-3 sm:px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 pl-2 sm:pl-4 min-w-0 flex-1">
            <div className="w-2 h-2 rounded-full flex-shrink-0 bg-success" />
            <span className="text-xs text-foreground/70 truncate">{c.name}</span>
          </div>
          <span className="text-xs font-medium text-success flex-shrink-0 ml-2">
            {formatCurrency(c.value)}
          </span>
        </div>
      ))}
    </div>
  );

  const CollapsibleSection = ({
    label,
    total,
    isNegative = true,
    categories,
    open,
    onToggle,
    renderList,
  }: {
    label: string;
    total: number;
    isNegative?: boolean;
    categories: CategoryBreakdown[];
    open: boolean;
    onToggle: () => void;
    renderList?: (cats: CategoryBreakdown[]) => React.ReactNode;
  }) => (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-muted/30 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && categories.length > 0 && (renderList ? renderList(categories) : renderCategoryList(categories))}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between border-t border-border/30">
        <span className="text-sm text-foreground/80 pl-2 sm:pl-4 font-medium">Total</span>
        <span className={cn('text-sm font-medium', isNegative ? 'text-destructive' : 'text-success')}>
          {isNegative ? `-${formatCurrency(total)}` : formatCurrency(total)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className={cn('border-0', dre.margem >= 0 ? 'bg-success' : 'bg-destructive')}>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-white/80 uppercase tracking-wider">Margem de Lucro</p>
            <p className="text-3xl font-bold mt-1 text-white">{dre.margem.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Receita Líquida</p>
            <p className="text-3xl font-bold mt-1">{formatCurrency(dre.receitaLiquida)}</p>
          </CardContent>
        </Card>
        <Card className={cn('border-0', dre.resultadoLiquido >= 0 ? 'bg-success' : 'bg-destructive')}>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-white/80 uppercase tracking-wider">Resultado (EBITDA)</p>
            <p className="text-3xl font-bold mt-1 text-white">{formatCurrency(dre.resultadoLiquido)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {monthlyData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground/70">
              Evolução Receita × Despesas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Area type="monotone" dataKey="receitas" name="Receitas" stroke="hsl(145, 65%, 42%)" fill="hsl(145, 65%, 42%)" fillOpacity={0.15} />
                <Area type="monotone" dataKey="despesas" name="Despesas" stroke="hsl(0, 84%, 60%)" fill="hsl(0, 84%, 60%)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* DRE Table */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-gray-900 to-gray-800 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2 text-white">
              Demonstrativo de Resultado (DRE)
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
              className="gap-2 text-xs bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white w-full sm:w-auto"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {isExporting ? 'Exportando...' : 'Exportar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Receita Bruta */}
          <CollapsibleSection
            label="(+) Receita Bruta"
            total={dre.receitaBruta}
            isNegative={false}
            categories={receitaCategories}
            open={showReceita}
            onToggle={() => setShowReceita(!showReceita)}
            renderList={renderReceitaList}
          />

          {/* Impostos */}
          {impostosCategories.length > 0 && (
            <CollapsibleSection
              label="(-) Impostos e Deduções"
              total={dre.impostos}
              categories={impostosCategories}
              open={showImpostos}
              onToggle={() => setShowImpostos(!showImpostos)}
            />
          )}

          {/* Receita Líquida */}
          <div className={cn('px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between', dre.receitaLiquida >= 0 ? 'bg-success' : 'bg-destructive')}>
            <span className="text-sm font-semibold text-white">(=) Receita Líquida</span>
            <span className="text-base font-bold text-white">{formatCurrency(dre.receitaLiquida)}</span>
          </div>

          {/* CPV */}
          {cpvCategories.length > 0 && (
            <CollapsibleSection
              label="(-) CPV (Custo do Serviço)"
              total={dre.cpv}
              categories={cpvCategories}
              open={showCpv}
              onToggle={() => setShowCpv(!showCpv)}
            />
          )}

          {/* Lucro Bruto */}
          <div className={cn('px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between', getGrossProfitBg())}>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">(=) Lucro Bruto</span>
              <span className="text-xs text-white/80">Margem: {dre.margem.toFixed(1)}%</span>
            </div>
            <span className="text-base font-bold text-white">{formatCurrency(dre.lucroBruto)}</span>
          </div>

          {/* OPEX */}
          <CollapsibleSection
            label="(-) Despesas Operacionais (OPEX)"
            total={dre.opex}
            categories={opexCategories}
            open={showOpex}
            onToggle={() => setShowOpex(!showOpex)}
          />

          {/* Resultado */}
          <div className={cn('px-3 sm:px-4 py-4 sm:py-5 flex items-center justify-between', getResultBg())}>
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <ResultIcon className="h-4 w-4 sm:h-5 sm:w-5 text-white flex-shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm sm:text-base font-bold text-white truncate">(=) Resultado Líquido (EBITDA)</span>
                <span className="text-xs text-white/80">
                  {dre.resultadoLiquido > 0 ? 'Superávit' : dre.resultadoLiquido < 0 ? 'Déficit' : 'Equilibrado'}
                </span>
              </div>
            </div>
            <span className="text-lg sm:text-xl font-bold text-white flex-shrink-0 ml-2">
              {formatCurrency(dre.resultadoLiquido)}
            </span>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        * O DRE é calculado automaticamente com base nas categorias das transações. 
        Categorias com "imposto/taxa" são classificadas como deduções, "custo/material/fornecedor" como CPV, e demais como OPEX.
      </p>
    </div>
  );
}
