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
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useIsMobile } from '@/hooks/use-mobile';
import { ADJUSTMENT_CATEGORY } from '@/lib/finance-constants';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';

interface FinanceDREProps {
  transactions: (FinancialTransaction & { customer?: any })[];
}

interface CategoryBreakdown {
  name: string;
  value: number;
  color: string;
}

export function FinanceDRE({ transactions: rawTransactions }: FinanceDREProps) {
  const { settings } = useCompanySettings();
  const { categories: financialCategories } = useFinancialCategories();
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const fmt = (v: number) => formatMoney(v, currency, locale);

  // Leitura tolerante a types ainda não regenerados — quando a migration
  // adicionar dre_start_date em company_settings, este cast vai funcionar sem
  // precisar regen imediato do types.ts.
  const dreStartDate = (settings as any)?.dre_start_date as string | null | undefined;

  // Filter out inter-account transfers, unpaid transactions, credit card bill
  // payments AND balance adjustments from DRE. Transfers/bill payments são itens
  // de balanço (não P&L); o "Ajuste de saldo" é conciliação de caixa (neutro) —
  // entra no extrato da conta mas NÃO é receita/despesa real, então não pode
  // inflar/distorcer o resultado do DRE.
  // Se dreStartDate estiver preenchida, filtra só transações a partir dessa data.
  const transactions = useMemo(
    () => rawTransactions.filter(t =>
      !t.transfer_pair_id &&
      t.is_paid &&
      t.category !== 'Pagamento de Fatura' &&
      t.category !== ADJUSTMENT_CATEGORY &&
      (dreStartDate ? parseISO(t.transaction_date) >= parseISO(dreStartDate) : true)
    ),
    [rawTransactions, dreStartDate]
  );
  const [showImpostos, setShowImpostos] = useState(false);
  const [showCpv, setShowCpv] = useState(false);
  const [showOpex, setShowOpex] = useState(false);
  const [showReceita, setShowReceita] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Build a map from category name to dre_group using the DB field
  const categoryDreGroupMap = useMemo(() => {
    const map = new Map<string, string>();
    financialCategories.forEach((c: any) => {
      map.set(c.name, c.dre_group || 'opex');
    });
    return map;
  }, [financialCategories]);

  // Classify category using the dre_group field from financial_categories table
  function classifyCategory(category: string | null): 'impostos' | 'cmv' | 'opex' {
    const catName = category || '';
    const dreGroup = categoryDreGroupMap.get(catName);
    if (dreGroup === 'impostos') return 'impostos';
    if (dreGroup === 'cmv') return 'cmv';
    // Fallback: regex matching for backwards compatibility
    const lower = catName.toLowerCase();
    if (/imposto|taxa|tributo|icms|iss|pis|cofins/.test(lower)) return 'impostos';
    if (/custo|material|peça|peca|fornecedor|insumo/.test(lower)) return 'cmv';
    return 'opex';
  }

  const { dre, impostosCategories, cmvCategories, opexCategories, receitaCategories } = useMemo(() => {
    let receitaBruta = 0;
    let impostos = 0;
    let cmv = 0;
    let opex = 0;

    const impostosMap = new Map<string, number>();
    const cmvMap = new Map<string, number>();
    const opexMap = new Map<string, number>();
    const receitaMap = new Map<string, number>();

    transactions.forEach((t) => {
      const amount = Number(t.amount);
      const cat = t.category || fin.dre.fallbackCategory;
      if (t.transaction_type === 'entrada') {
        receitaBruta += amount;
        receitaMap.set(cat, (receitaMap.get(cat) || 0) + amount);
      } else {
        const cls = classifyCategory(t.category);
        if (cls === 'impostos') {
          impostos += amount;
          impostosMap.set(cat, (impostosMap.get(cat) || 0) + amount);
        } else if (cls === 'cmv') {
          cmv += amount;
          cmvMap.set(cat, (cmvMap.get(cat) || 0) + amount);
        } else {
          opex += amount;
          opexMap.set(cat, (opexMap.get(cat) || 0) + amount);
        }
      }
    });

    const receitaLiquida = receitaBruta - impostos;
    const lucroBruto = receitaLiquida - cmv;
    const resultadoLiquido = lucroBruto - opex;
    const margem = receitaBruta > 0 ? (lucroBruto / receitaBruta) * 100 : 0;

    const mapToArray = (map: Map<string, number>): CategoryBreakdown[] =>
      Array.from(map.entries())
        .map(([name, value]) => ({ name, value, color: '#6b7280' }))
        .sort((a, b) => b.value - a.value);

    return {
      dre: { receitaBruta, impostos, receitaLiquida, cmv, lucroBruto, opex, resultadoLiquido, margem },
      impostosCategories: mapToArray(impostosMap),
      cmvCategories: mapToArray(cmvMap),
      opexCategories: mapToArray(opexMap),
      receitaCategories: mapToArray(receitaMap),
    };
  }, [transactions, categoryDreGroupMap]);

  // Monthly chart data — mobile simplifica pros últimos 6 meses pra caber.
  const monthlyData = useMemo(() => {
    const map = new Map<string, { receitas: number; despesas: number }>();
    transactions.forEach((t) => {
      const monthKey = format(startOfMonth(parseISO(t.transaction_date)), 'yyyy-MM');
      const entry = map.get(monthKey) || { receitas: 0, despesas: 0 };
      if (t.transaction_type === 'entrada') entry.receitas += Number(t.amount);
      else entry.despesas += Number(t.amount);
      map.set(monthKey, entry);
    });
    const all = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        month: format(parseISO(`${key}-01`), 'MMM/yy', { locale: ptBR }),
        ...val,
      }));
    return isMobile ? all.slice(-6) : all;
  }, [transactions, isMobile]);

  const handleExport = () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      generateDreHtml({
        company: {
          name: settings?.name || fin.dre.fallbackCompany,
          document: settings?.document || undefined,
          phone: settings?.phone || undefined,
          email: settings?.email || undefined,
          address: settings?.address || undefined,
          city: settings?.city || undefined,
          state: settings?.state || undefined,
          logo_url: settings?.logo_url || undefined,
        },
        period: fin.dre.fallbackPeriod,
        receitaBruta: dre.receitaBruta,
        impostos: dre.impostos,
        impostosCategories,
        receitaLiquida: dre.receitaLiquida,
        cpv: dre.cmv,
        cpvCategories: cmvCategories,
        lucroBruto: dre.lucroBruto,
        opex: dre.opex,
        opexCategories,
        resultadoLiquido: dre.resultadoLiquido,
        margem: dre.margem,
        locale,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const ResultIcon = dre.resultadoLiquido > 0 ? TrendingUp : dre.resultadoLiquido < 0 ? TrendingDown : Minus;

  const getResultBg = () => {
    if (dre.resultadoLiquido === 0) return 'bg-muted-foreground';
    return dre.resultadoLiquido > 0 ? 'bg-success' : 'bg-destructive';
  };

  const getGrossProfitBg = () => {
    if (dre.lucroBruto === 0) return 'bg-muted-foreground';
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
            -{fmt(c.value)}
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
            {fmt(c.value)}
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
        <span className="text-sm text-foreground/80 pl-2 sm:pl-4 font-medium">{fin.dre.table.total}</span>
        <span className={cn('text-sm font-medium', isNegative ? 'text-destructive' : 'text-success')}>
          {isNegative ? `-${fmt(total)}` : fmt(total)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* KPI Cards — mobile: 3 colunas compactas pra caber tudo na primeira tela. */}
      <div className="grid gap-2 sm:gap-4 grid-cols-3">
        <Card className={cn('border-0', dre.margem >= 0 ? 'bg-success' : 'bg-destructive')}>
          <CardContent className="p-3 sm:p-5">
            <p className="text-[10px] sm:text-xs font-medium text-white/80 uppercase tracking-wider leading-tight">{fin.dre.kpi.margin}</p>
            <p className="text-lg sm:text-3xl font-bold mt-1 text-white">{dre.margem.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-5">
            <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider leading-tight">{fin.dre.kpi.netRevenue}</p>
            <p className="text-sm sm:text-3xl font-bold mt-1 truncate">{fmt(dre.receitaLiquida)}</p>
          </CardContent>
        </Card>
        <Card className={cn('border-0', dre.resultadoLiquido >= 0 ? 'bg-success' : 'bg-destructive')}>
          <CardContent className="p-3 sm:p-5">
            <p className="text-[10px] sm:text-xs font-medium text-white/80 uppercase tracking-wider leading-tight">EBITDA</p>
            <p className="text-sm sm:text-3xl font-bold mt-1 text-white truncate">{fmt(dre.resultadoLiquido)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {monthlyData.length > 1 && (
        <Card>
          <CardHeader className={cn(isMobile && 'p-4 pb-2')}>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground/70">
              {isMobile ? fin.dre.chart.titleShort : fin.dre.chart.title}
            </CardTitle>
          </CardHeader>
          <CardContent className={cn(isMobile && 'p-2')}>
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
              <AreaChart data={monthlyData}>
                <defs>
                  {/* Gradiente vertical de preenchimento: forte no topo (0.7) → quase
                      transparente na base (0.05) — clássico de chart financeiro. */}
                  <linearGradient id="dre-grad-area-success" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="dre-grad-area-destructive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: isMobile ? 10 : 11 }} />
                <YAxis tick={{ fontSize: isMobile ? 10 : 11 }} tickFormatter={(v) => `${currency} ${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => fmt(value)} />
                <Area
                  type="monotone"
                  dataKey="receitas"
                  name={fin.dre.chart.revenue}
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  fill="url(#dre-grad-area-success)"
                />
                <Area
                  type="monotone"
                  dataKey="despesas"
                  name={fin.dre.chart.expenses}
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  fill="url(#dre-grad-area-destructive)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* DRE Table */}
      <Card className="border shadow-lg overflow-hidden">
        <CardHeader className="bg-foreground pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2 text-background">
              {fin.dre.table.title}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
              className="gap-2 text-xs bg-transparent border-background/20 text-background hover:bg-background/20 hover:text-background w-full sm:w-auto"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {isExporting ? fin.dre.table.exporting : fin.dre.table.export}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Receita Bruta */}
          <CollapsibleSection
            label={fin.dre.table.grossRevenue}
            total={dre.receitaBruta}
            isNegative={false}
            categories={receitaCategories}
            open={showReceita}
            onToggle={() => setShowReceita(!showReceita)}
            renderList={renderReceitaList}
          />

          {/* Impostos e Deduções */}
          {impostosCategories.length > 0 && (
            <CollapsibleSection
              label={fin.dre.table.taxes}
              total={dre.impostos}
              categories={impostosCategories}
              open={showImpostos}
              onToggle={() => setShowImpostos(!showImpostos)}
            />
          )}

          {/* Receita Líquida */}
          <div className={cn('px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between', dre.receitaLiquida >= 0 ? 'bg-success' : 'bg-destructive')}>
            <span className="text-sm font-semibold text-white">{fin.dre.table.netRevenue}</span>
            <span className="text-base font-bold text-white">{fmt(dre.receitaLiquida)}</span>
          </div>

          {/* CMV - Custo de Mercadoria/Serviço Vendido */}
          {cmvCategories.length > 0 && (
            <CollapsibleSection
              label={fin.dre.table.cogs}
              total={dre.cmv}
              categories={cmvCategories}
              open={showCpv}
              onToggle={() => setShowCpv(!showCpv)}
            />
          )}

          {/* Lucro Bruto */}
          <div className={cn('px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between', getGrossProfitBg())}>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">{fin.dre.table.grossProfit}</span>
              <span className="text-xs text-white/80">{fin.dre.table.margin}: {dre.margem.toFixed(1)}%</span>
            </div>
            <span className="text-base font-bold text-white">{fmt(dre.lucroBruto)}</span>
          </div>

          {/* OPEX */}
          <CollapsibleSection
            label={fin.dre.table.opex}
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
                <span className="text-sm sm:text-base font-bold text-white truncate">{fin.dre.table.netResult}</span>
                <span className="text-xs text-white/80">
                  {dre.resultadoLiquido > 0 ? fin.dre.table.surplus : dre.resultadoLiquido < 0 ? fin.dre.table.deficit : fin.dre.table.balanced}
                </span>
              </div>
            </div>
            <span className="text-lg sm:text-xl font-bold text-white flex-shrink-0 ml-2">
              {fmt(dre.resultadoLiquido)}
            </span>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        {fin.dre.footnote}
        {dreStartDate && (
          <> {fin.dre.footnoteStartDate} {format(parseISO(dreStartDate), 'dd/MM/yyyy')}.</>
        )}
      </p>
    </div>
  );
}
