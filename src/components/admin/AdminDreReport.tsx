import { adminKpiClass } from "@/components/admin/adminKpiStyles";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Minus,
  PieChart,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
const formatCurrencyBR = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
import { cn } from "@/lib/utils";
import { AdminDreEvolution as AdminDREEvolutionChart } from "./AdminDreEvolution";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  exportAdminDreReport as generateAdminDreHtml,
  fetchAdminDreComparison,
} from "@/lib/adminFinancialAdapter";
import { useAdminFinancialCategories } from "@/hooks/useAdminFinancialCategories";
import {
  aggregateDre,
  buildDreCategoryIndex,
  labelForCategory,
} from "@/lib/adminDreBuckets";
import { buildAdminPeriodWindowIso } from "@/lib/adminFinancialDates";

interface Transaction {
  id: string;
  type: string;
  category: string;
  amount: number;
  description: string | null;
  /** Competência (data da venda/renovação). Só o fallback do COALESCE. */
  transaction_date: string;
  /**
   * Data de CAIXA — coluna gerada `COALESCE(cash_date, transaction_date)`. É por
   * ela que o período é recortado, então é ela que agrupa e é ela que aparece.
   * Opcional porque há call site legado sem a coluna no `select`; nesse caso
   * `effectiveCashDateOf` cai na competência.
   */
  effective_cash_date?: string | null;
}

interface FinancialDRESectionProps {
  transactions: Transaction[];
  isLoading: boolean;
  period?: string;
  /** Mesmo recorte do período anterior, fornecido paginado pela página pai. */
  comparisonTransactions?: Transaction[];
  comparisonLabel?: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

// A hierarquia do DRE (receita / impostos / CPV / OPEX) NÃO mora mais aqui.
// Ela vem de `admin_financial_categories.dre_bucket` + `.affects_result`, via
// `@/lib/adminDreBuckets` — o MESMO módulo que o gráfico de evolução usa, pra
// que quadro e gráfico não possam divergir. Ver o cabeçalho de lá pro histórico
// (as listas hardcoded deixavam R$ 91.378,14 de despesa fora do Resultado).

export function AdminDreReport(
  {
    transactions,
    isLoading,
    period,
    comparisonTransactions,
    comparisonLabel,
    periodStart,
    periodEnd,
  }: FinancialDRESectionProps,
) {
  const [showRevenueDetails, setShowRevenueDetails] = useState(false);
  const [showEstornoDetails, setShowEstornoDetails] = useState(false);
  const [showTaxDetails, setShowTaxDetails] = useState(false);
  const [showCPVDetails, setShowCPVDetails] = useState(false);
  const [showOpexDetails, setShowOpexDetails] = useState(false);
  const [showNonOperatingDetails, setShowNonOperatingDetails] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [drilldownCategory, setDrilldownCategory] = useState<string | null>(
    null,
  );

  // Fetch all clients for average calculations (ARPU, ticket médio, clientes ativos)
  const { data: allClients } = useQuery({
    queryKey: ["all-clients-metrics"],
    queryFn: async () => {
      const rows: { id: string; ltv: number; subscription_value: number }[] =
        [];
      for (let page = 0; page < 100; page++) {
        const { data, error } = await supabase.from("companies").select(
          "id,ltv,subscription_value",
        ).eq("subscription_status", "active").order("id").range(
          page * 500,
          page * 500 + 499,
        );
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) return rows;
      }
      throw new Error("Não foi possível carregar os indicadores de clientes.");
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Régua do DRE vinda do banco. O hook usa `refetchOnMount: "always"`, então
  // categoria criada em Configurações aparece no Resultado sem F5.
  const {
    data: dreCategories,
    isLoading: categoriesLoading,
    isError: categoriesError,
  } = useAdminFinancialCategories();

  const categoryIndex = useMemo(() => buildDreCategoryIndex(dreCategories), [
    dreCategories,
  ]);

  const comparisonWindow = useMemo(() => {
    if (!periodStart || !periodEnd) return null;
    const previousEnd = new Date(periodStart);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(
      previousStart.getDate() -
        Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000),
    );
    return buildAdminPeriodWindowIso(previousStart, previousEnd);
  }, [periodStart, periodEnd]);
  const comparisonAvailable = Boolean(comparisonWindow) && period !== "allTime";
  const comparisonQuery = useQuery({
    queryKey: [
      "admin-dre-comparison",
      comparisonWindow?.periodStartIso,
      comparisonWindow?.periodEndExclusiveIso,
    ],
    enabled: comparisonAvailable && !comparisonTransactions,
    queryFn: () => fetchAdminDreComparison(comparisonWindow!),
  });

  const dre = useMemo(
    () => aggregateDre(transactions, categoryIndex),
    [transactions, categoryIndex],
  );
  const effectiveComparisonTransactions = comparisonTransactions ??
    comparisonQuery.data;
  const comparisonDre = useMemo(
    () =>
      effectiveComparisonTransactions
        ? aggregateDre(effectiveComparisonTransactions, categoryIndex)
        : null,
    [effectiveComparisonTransactions, categoryIndex],
  );
  const drilldownTransactions = useMemo(
    () =>
      drilldownCategory
        ? transactions.filter((transaction) =>
          transaction.category === drilldownCategory
        )
        : [],
    [drilldownCategory, transactions],
  );

  // Calculate LTV metrics - only clients with LTV > 0
  const ltvMetrics = useMemo(() => {
    if (!allClients || allClients.length === 0) {
      return { averageLtv: 0, averageTicket: 0, clientCount: 0 };
    }

    // Only consider clients with LTV > 0 for average calculation
    const clientsWithLtv = allClients.filter((c) => c.ltv && c.ltv > 0);
    const totalLtv = clientsWithLtv.reduce((sum, c) => sum + (c.ltv || 0), 0);
    const averageLtv = clientsWithLtv.length > 0
      ? totalLtv / clientsWithLtv.length
      : 0;

    // Only consider clients with subscription_value > 0 for ticket average
    const clientsWithTicket = allClients.filter((c) =>
      c.subscription_value && c.subscription_value > 0
    );
    const totalTicket = clientsWithTicket.reduce(
      (sum, c) => sum + (c.subscription_value || 0),
      0,
    );
    const averageTicket = clientsWithTicket.length > 0
      ? totalTicket / clientsWithTicket.length
      : 0;

    return {
      averageLtv,
      averageTicket,
      clientCount: allClients.length,
    };
  }, [allClients]);

  const periodLabels: Record<string, string> = {
    "7days": "Últimos 7 dias",
    "thisMonth": "Este mês",
    "lastMonth": "Mês passado",
    "30days": "Últimos 30 dias",
    "thisYear": "Este ano",
    "allTime": "Todo o período",
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const periodLabel = period && periodLabels[period]
        ? periodLabels[period]
        : (period || "Período Atual");
      await generateAdminDreHtml({
        period: periodLabel,
        receitaBruta: dre.receitaBruta,
        revenueByCategory: dre.revenueByCategory,
        estornos: dre.estornos,
        estornosByCategory: dre.estornosByCategory,
        impostos: dre.impostos,
        taxesByCategory: dre.taxesByCategory,
        receitaLiquida: dre.receitaLiquida,
        cpv: dre.cpv,
        cpvByCategory: dre.cpvByCategory,
        lucroBruto: dre.lucroBruto,
        margemBruta: dre.margemBruta,
        opex: dre.opex,
        opexByCategory: dre.opexByCategory,
        ebitda: dre.ebitda,
        margem: dre.margem,
        nonOperating: dre.nonOperating,
        nonOperatingByCategory: dre.nonOperatingByCategory,
        resultadoFinal: dre.resultadoFinal,
        ltvMetrics: ltvMetrics,
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Enquanto as categorias não chegam, NÃO renderiza número: sem a régua do
  // banco todo lançamento cairia no catch-all e o quadro mostraria um DRE
  // plausível e errado por uma fração de segundo.
  if (isLoading || categoriesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const ResultIcon = dre.resultadoFinal > 0
    ? TrendingUp
    : dre.resultadoFinal < 0
    ? TrendingDown
    : Minus;
  const hasEstornos = dre.estornos !== 0 || dre.estornosByCategory.length > 0;

  return (
    <div className="space-y-6">
      {/* Metric Cards - Dashboard Style */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Margem operacional */}
        <Card
          className={adminKpiClass(dre.margem >= 0 ? "emerald" : "rose", cn(
            "relative overflow-hidden border-0 shadow-lg text-white",
            dre.margem >= 0 ? "bg-emerald-500" : "bg-red-500",
          ))}
        >
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1 lg:space-y-2">
                <p className="text-xs lg:text-sm font-medium text-white/80">
                  Margem operacional
                </p>
                <p className="text-lg lg:text-2xl font-bold tracking-tight">
                  {dre.margem.toFixed(1)}%
                </p>
              </div>
              <div
                className={cn(
                  "p-2 rounded-xl",
                  dre.margem >= 0 ? "bg-emerald-600" : "bg-red-600",
                )}
              >
                <PieChart className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Receita Líquida */}
        <Card className={adminKpiClass("blue", "relative overflow-hidden border-0 shadow-lg bg-blue-500 text-white")}>
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1 lg:space-y-2">
                <p className="text-xs lg:text-sm font-medium text-white/80">
                  Receita Líquida
                </p>
                <p className="text-lg lg:text-2xl font-bold tracking-tight truncate">
                  {formatCurrencyBR(dre.receitaLiquida)}
                </p>
              </div>
              <div className="p-2 rounded-xl bg-blue-600">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resultado */}
        <Card
          className={adminKpiClass(dre.resultadoFinal >= 0 ? "emerald" : "rose", cn(
            "relative overflow-hidden border-0 shadow-lg text-white",
            dre.resultadoFinal >= 0 ? "bg-emerald-500" : "bg-red-500",
          ))}
        >
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1 lg:space-y-2">
                <p className="text-xs lg:text-sm font-medium text-white/80">
                  Resultado final
                </p>
                <p className="text-lg lg:text-2xl font-bold tracking-tight truncate">
                  {formatCurrencyBR(dre.resultadoFinal)}
                </p>
              </div>
              <div
                className={cn(
                  "p-2 rounded-xl",
                  dre.resultadoFinal >= 0 ? "bg-emerald-600" : "bg-red-600",
                )}
              >
                <ResultIcon className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {comparisonDre && (
        <Card className="border bg-white text-zinc-900 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Comparação de período</p>
              <p className="text-xs text-muted-foreground">
                Atual × {comparisonLabel ?? "período anterior equivalente"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Receita líquida</p>
                <p
                  className={cn(
                    "font-semibold",
                    dre.receitaLiquida - comparisonDre.receitaLiquida >= 0
                      ? "text-emerald-700"
                      : "text-red-700",
                  )}
                >
                  {formatCurrencyBR(
                    dre.receitaLiquida - comparisonDre.receitaLiquida,
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Resultado final</p>
                <p
                  className={cn(
                    "font-semibold",
                    dre.resultadoFinal - comparisonDre.resultadoFinal >= 0
                      ? "text-emerald-700"
                      : "text-red-700",
                  )}
                >
                  {formatCurrencyBR(
                    dre.resultadoFinal - comparisonDre.resultadoFinal,
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {comparisonQuery.isError
        ? (
          <p role="alert" className="text-xs text-red-700">
            Não foi possível carregar o período anterior para comparação. Tente
            novamente.
          </p>
        )
        : null}
      {!comparisonAvailable && !comparisonTransactions
        ? (
          <p className="text-xs text-muted-foreground">
            Escolha um período fechado para comparar a DRE com o intervalo
            anterior equivalente.
          </p>
        )
        : null}

      {/* Evolution Chart */}
      <AdminDREEvolutionChart
        transactions={transactions}
        categoryIndex={categoryIndex}
        periodStart={periodStart}
        periodEnd={periodEnd}
      />

      {
        /* Avisos honestos: o Resultado só é confiável se a régua do banco chegou
          e se toda categoria tem grupo. Nada aqui esconde valor — os totais
          abaixo já incluem tudo; o aviso diz onde a classificação está frouxa. */
      }
      {categoriesError && (
        <div className="flex items-start gap-2 rounded-md bg-white text-zinc-900 px-3 py-2 text-sm text-red-800 ">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Não foi possível carregar os grupos do DRE (categorias). Os valores
            continuam somados por inteiro, mas a separação entre Impostos, CPV e
            OPEX pode estar errada. Recarregue a página.
          </p>
        </div>
      )}
      {dre.unclassifiedCategories.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-white text-zinc-900 px-3 py-2 text-sm text-amber-800 ">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              {dre.unclassifiedCategories.length === 1
                ? "1 categoria sem grupo no DRE"
                : `${dre.unclassifiedCategories.length} categorias sem grupo no DRE`}
            </p>
            <p className="text-xs">
              {dre.unclassifiedCategories.map((c) =>
                labelForCategory(c, categoryIndex)
              ).join(", ")}{" "}
              — o valor está somado (receita na Receita Bruta, despesa no OPEX)
              para não sumir do resultado. Defina o grupo em Configurações ›
              Categorias.
            </p>
          </div>
        </div>
      )}

      {/* DRE Card */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardHeader className="bg-slate-950 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-white">
              DRE - Demonstrativo de Resultados
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={isExporting}
                className="gap-2 text-xs bg-white text-zinc-900 border-white text-black hover:bg-white hover:text-black"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {isExporting ? "Exportando..." : "Exportar"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Receita Bruta */}
          <div className="border-b border-border/50">
            <button
              onClick={() => setShowRevenueDetails(!showRevenueDetails)}
              className="w-full px-4 py-3 bg-background flex items-center justify-between hover:bg-white transition-colors"
            >
              <span className="text-sm font-semibold text-foreground">
                (+) RECEITA BRUTA
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-green-600">
                  {formatCurrencyBR(dre.receitaBruta)}
                </span>
                {showRevenueDetails
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>
            {showRevenueDetails && dre.revenueByCategory.length > 0 && (
              <div className="divide-y divide-border/30">
                {dre.revenueByCategory.map((
                  { category, label, value, unclassified },
                ) => (
                  <button
                    type="button"
                    key={category}
                    onClick={() => setDrilldownCategory(category)}
                    className="w-full px-4 py-2 flex items-center justify-between bg-white text-zinc-900 text-left hover:bg-white"
                  >
                    <span className="text-xs text-muted-foreground pl-4 flex items-center gap-1.5">
                      {label}
                      {unclassified && (
                        <AlertTriangle
                          className="h-3 w-3 text-amber-600 dark:text-amber-400"
                          aria-label="Categoria sem grupo no DRE"
                        />
                      )}
                    </span>
                    <span className="text-xs font-medium text-green-600">
                      {formatCurrencyBR(value)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {
            /* Estornos e Devoluções — redutor de receita, ANTES dos impostos.
              Só aparece quando existe estorno no período: enquanto o banco não
              marcar nenhuma categoria como `revenue_reduction` a linha fica
              fora do quadro em vez de exibir um R$ 0,00 permanente. A condição
              olha o TOTAL também (não só o detalhamento), pra que valor nenhum
              possa ficar sem linha. */
          }
          {hasEstornos && (
            <div className="border-b border-border/50">
              <button
                onClick={() => setShowEstornoDetails(!showEstornoDetails)}
                className="w-full px-4 py-3 bg-background flex items-center justify-between hover:bg-white transition-colors"
              >
                <span className="text-sm font-semibold text-foreground">
                  (-) ESTORNOS E DEVOLUÇÕES
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-red-600">
                    -{formatCurrencyBR(dre.estornos)}
                  </span>
                  {showEstornoDetails
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {showEstornoDetails && dre.estornosByCategory.length > 0 && (
                <div className="divide-y divide-border/30">
                  {dre.estornosByCategory.map((
                    { category, label, value, unclassified },
                  ) => (
                    <button
                      type="button"
                      key={category}
                      onClick={() => setDrilldownCategory(category)}
                      className="w-full px-4 py-2 flex items-center justify-between bg-white text-zinc-900 text-left hover:bg-white"
                    >
                      <span className="text-xs text-muted-foreground pl-4 flex items-center gap-1.5">
                        {label}
                        {unclassified && (
                          <AlertTriangle
                            className="h-3 w-3 text-amber-600 dark:text-amber-400"
                            aria-label="Categoria sem grupo no DRE"
                          />
                        )}
                      </span>
                      <span className="text-xs font-medium text-red-600">
                        -{formatCurrencyBR(value)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Impostos/Deduções */}
          <div className="border-b border-border/50">
            <button
              onClick={() => setShowTaxDetails(!showTaxDetails)}
              className="w-full px-4 py-3 bg-background flex items-center justify-between hover:bg-white transition-colors"
            >
              <span className="text-sm font-semibold text-foreground">
                (-) IMPOSTOS E DEDUÇÕES
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-red-600">
                  -{formatCurrencyBR(dre.impostos)}
                </span>
                {showTaxDetails
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>
            {showTaxDetails && dre.taxesByCategory.length > 0 && (
              <div className="divide-y divide-border/30">
                {dre.taxesByCategory.map((
                  { category, label, value, unclassified },
                ) => (
                  <button
                    type="button"
                    key={category}
                    onClick={() => setDrilldownCategory(category)}
                    className="w-full px-4 py-2 flex items-center justify-between bg-white text-zinc-900 text-left hover:bg-white"
                  >
                    <span className="text-xs text-muted-foreground pl-4 flex items-center gap-1.5">
                      {label}
                      {unclassified && (
                        <AlertTriangle
                          className="h-3 w-3 text-amber-600 dark:text-amber-400"
                          aria-label="Categoria sem grupo no DRE"
                        />
                      )}
                    </span>
                    <span className="text-xs font-medium text-red-600">
                      -{formatCurrencyBR(value)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Receita Líquida */}
          <div className="border-b border-border/50 bg-blue-600">
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">
                (=) RECEITA LÍQUIDA
              </span>
              <span className="text-sm font-bold text-white">
                {formatCurrencyBR(dre.receitaLiquida)}
              </span>
            </div>
          </div>

          {/* CPV */}
          <div className="border-b border-border/50">
            <button
              onClick={() => setShowCPVDetails(!showCPVDetails)}
              className="w-full px-4 py-3 bg-background flex items-center justify-between hover:bg-white transition-colors"
            >
              <span className="text-sm font-semibold text-foreground">
                (-) CPV (Custo do Serviço)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-red-600">
                  -{formatCurrencyBR(dre.cpv)}
                </span>
                {showCPVDetails
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>
            {showCPVDetails && dre.cpvByCategory.length > 0 && (
              <div className="divide-y divide-border/30">
                {dre.cpvByCategory.map((
                  { category, label, value, unclassified },
                ) => (
                  <button
                    type="button"
                    key={category}
                    onClick={() => setDrilldownCategory(category)}
                    className="w-full px-4 py-2 flex items-center justify-between bg-white text-zinc-900 text-left hover:bg-white"
                  >
                    <span className="text-xs text-muted-foreground pl-4 flex items-center gap-1.5">
                      {label}
                      {unclassified && (
                        <AlertTriangle
                          className="h-3 w-3 text-amber-600 dark:text-amber-400"
                          aria-label="Categoria sem grupo no DRE"
                        />
                      )}
                    </span>
                    <span className="text-xs font-medium text-red-600">
                      -{formatCurrencyBR(value)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lucro Bruto */}
          <div
            className={cn(
              "border-b border-border/50",
              dre.lucroBruto > 0
                ? "bg-green-600"
                : dre.lucroBruto < 0
                ? "bg-red-600"
                : "bg-gray-800",
            )}
          >
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white">
                  (=) LUCRO BRUTO
                </span>
                <span className="text-xs text-white/80">
                  Margem Bruta: {dre.margemBruta.toFixed(1)}%
                </span>
              </div>
              <span className="text-sm font-bold text-white">
                {formatCurrencyBR(dre.lucroBruto)}
              </span>
            </div>
          </div>

          {/* OPEX */}
          <div className="border-b border-border/50">
            <button
              onClick={() => setShowOpexDetails(!showOpexDetails)}
              className="w-full px-4 py-3 bg-background flex items-center justify-between hover:bg-white transition-colors"
            >
              <span className="text-sm font-semibold text-foreground">
                (-) DESPESAS OPERACIONAIS (OPEX)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-red-600">
                  -{formatCurrencyBR(dre.opex)}
                </span>
                {showOpexDetails
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>
            {showOpexDetails && dre.opexByCategory.length > 0 && (
              <div className="divide-y divide-border/30">
                {dre.opexByCategory.map((
                  { category, label, value, unclassified },
                ) => (
                  <button
                    type="button"
                    key={category}
                    onClick={() => setDrilldownCategory(category)}
                    className="w-full px-4 py-2 flex items-center justify-between bg-white text-zinc-900 text-left hover:bg-white"
                  >
                    <span className="text-xs text-muted-foreground pl-4 flex items-center gap-1.5">
                      {label}
                      {unclassified && (
                        <AlertTriangle
                          className="h-3 w-3 text-amber-600 dark:text-amber-400"
                          aria-label="Categoria sem grupo no DRE"
                        />
                      )}
                    </span>
                    <span className="text-xs font-medium text-red-600">
                      -{formatCurrencyBR(value)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {dre.nonOperating !== 0 && (
            <div className="border-b border-border/50">
              <button
                onClick={() =>
                  setShowNonOperatingDetails(!showNonOperatingDetails)}
                className="w-full px-4 py-3 bg-background flex items-center justify-between hover:bg-white transition-colors"
              >
                <span className="text-sm font-semibold text-foreground">
                  (-) ITENS NÃO OPERACIONAIS
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-red-600">
                    -{formatCurrencyBR(dre.nonOperating)}
                  </span>
                  {showNonOperatingDetails
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {showNonOperatingDetails &&
                dre.nonOperatingByCategory.length > 0 && (
                <div className="divide-y divide-border/30">
                  {dre.nonOperatingByCategory.map((
                    { category, label, value },
                  ) => (
                    <button
                      type="button"
                      key={category}
                      onClick={() => setDrilldownCategory(category)}
                      className="w-full px-4 py-2 flex items-center justify-between bg-white text-zinc-900 text-left hover:bg-white"
                    >
                      <span className="text-xs text-muted-foreground pl-4">
                        {label}
                      </span>
                      <span className="text-xs font-medium text-red-600">
                        -{formatCurrencyBR(value)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* EBITDA / Resultado */}
          <div
            className={cn(
              "px-4 py-5 flex items-center justify-between",
              dre.resultadoFinal >= 0 ? "bg-emerald-500" : "bg-red-500",
            )}
          >
            <div className="flex items-center gap-3">
              <ResultIcon className="h-5 w-5 text-white" />
              <div className="flex flex-col">
                <span className="text-base font-bold text-white">
                  (=) RESULTADO FINAL
                </span>
                <span className="text-xs text-white/80">
                  EBITDA {formatCurrencyBR(dre.ebitda)}{" "}
                  {dre.nonOperating ? "antes dos itens não operacionais" : ""}
                </span>
              </div>
            </div>
            <span className="text-xl font-bold text-white">
              {formatCurrencyBR(dre.resultadoFinal)}
            </span>
          </div>
        </CardContent>
      </Card>

      {drilldownCategory && (
        <Card className="border shadow-sm bg-white text-zinc-900">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">
                Lançamentos em{" "}
                {labelForCategory(drilldownCategory, categoryIndex)}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Origem identificada pelo ID do lançamento; clique em uma
                categoria para trocar o detalhe.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDrilldownCategory(null)}
            >
              Fechar
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {drilldownTransactions.slice(0, 100).map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between gap-3 border-t py-2 text-sm"
              >
                <span className="min-w-0 text-muted-foreground">
                  {new Date(
                    transaction.effective_cash_date ??
                      transaction.transaction_date,
                  ).toLocaleDateString("pt-BR")} · #{transaction.id.slice(0, 8)}
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatCurrencyBR(Number(transaction.amount) || 0)}
                </span>
              </div>
            ))}
            {drilldownTransactions.length > 100 && (
              <p className="pt-2 text-xs text-muted-foreground">
                Mostrando os primeiros 100 de {drilldownTransactions.length}
                {" "}
                lançamentos do período.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Key Metrics Below DRE - Subtle Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className={adminKpiClass("violet", "border shadow-sm bg-background")}>
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs lg:text-sm font-medium text-muted-foreground">
                  LTV médio
                </p>
                <p className="text-lg lg:text-2xl font-bold text-foreground">
                  {formatCurrencyBR(ltvMetrics.averageLtv)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Receita acumulada média por cliente
                </p>
              </div>
              <div className="p-2 rounded-xl bg-black/15">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={adminKpiClass("cyan", "border shadow-sm bg-background")}>
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs lg:text-sm font-medium text-muted-foreground">
                  Ticket Médio
                </p>
                <p className="text-lg lg:text-2xl font-bold text-foreground">
                  {formatCurrencyBR(ltvMetrics.averageTicket)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Mensalidade média
                </p>
              </div>
              <div className="p-2 rounded-xl bg-black/15">
                <PieChart className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={adminKpiClass("blue", "border shadow-sm bg-background")}>
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs lg:text-sm font-medium text-muted-foreground">
                  Clientes Ativos
                </p>
                <p className="text-lg lg:text-2xl font-bold text-foreground">
                  {ltvMetrics.clientCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  Com assinatura ativa
                </p>
              </div>
              <div className="p-2 rounded-xl bg-black/15">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
