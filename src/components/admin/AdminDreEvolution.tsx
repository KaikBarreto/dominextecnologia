import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
const formatCurrencyBR = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
import {
  eachMonthOfInterval,
  endOfMonth,
  format,
  setMonth,
  setYear,
  startOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { classifyForDre, type DreCategoryIndex } from "@/lib/adminDreBuckets";
const effectiveCashDateOf = (
  tx: { effective_cash_date?: string | null; transaction_date: string },
) => tx.effective_cash_date ?? tx.transaction_date;

interface Transaction {
  id: string;
  type: string;
  category: string;
  amount: number;
  description: string | null;
  /** Competência. Só o fallback do COALESCE de caixa. */
  transaction_date: string;
  /** Data de CAIXA — coluna gerada `COALESCE(cash_date, transaction_date)`. */
  effective_cash_date?: string | null;
}

interface AdminDREEvolutionChartProps {
  transactions: Transaction[];
  /**
   * Régua do DRE (bucket por categoria) vinda de `admin_financial_categories`.
   * É PROPRIEDADE, não um segundo fetch, exatamente pra não voltar a existir
   * duas listas: antes deste refactor esta tela tinha a sua própria cópia
   * hardcoded e divergia do quadro de DRE logo abaixo dela.
   */
  categoryIndex: DreCategoryIndex;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

export function AdminDreEvolution(
  { transactions, categoryIndex, periodStart, periodEnd }:
    AdminDREEvolutionChartProps,
) {
  const isMobile = useIsMobile();

  const chartData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const startDate = periodStart
      ? startOfMonth(periodStart)
      : startOfMonth(setMonth(setYear(new Date(), currentYear - 1), 11));
    const endDate = periodEnd
      ? endOfMonth(periodEnd)
      : endOfMonth(setMonth(setYear(new Date(), currentYear), 11));

    const monthsInRange = eachMonthOfInterval({
      start: startDate,
      end: endDate,
    });

    const months: {
      month: string;
      receita: number;
      despesas: number;
      resultado: number;
    }[] = [];

    monthsInRange.forEach((date) => {
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      const monthLabel = format(date, "MMM/yy", { locale: ptBR });

      // Mês em REGIME DE CAIXA (`effective_cash_date` = `COALESCE(cash_date,
      // transaction_date)`), a MESMA régua do quadro de DRE logo abaixo, do card
      // do dashboard e da aba Financeiro. Gráfico em competência ao lado de
      // quadro em caixa seria o mesmo Resultado divergindo dentro da mesma tela
      // — o defeito que o `adminDreBuckets` já existe pra impedir, agora na
      // dimensão DATA. 32 lançamentos de 2026 (R$ 6.167,70) mudam de mês.
      const monthTransactions = transactions.filter((t) => {
        const tDate = new Date(effectiveCashDateOf(t) ?? 0);
        return tDate >= monthStart && tDate <= monthEnd;
      });

      // Mesma classificação do quadro de DRE — vinda do banco. O que tem
      // `affects_result = false` (antecipação, transferência interna, saldo de
      // abertura) fica de fora: é caixa, não resultado.
      //
      // O `switch` tem que cobrir TODOS os buckets. Bucket que não caísse em
      // nenhum ramo sumiria do gráfico em silêncio — foi assim que R$ 91.861 de
      // despesa ficaram invisíveis aqui até 08/09/2026. Daí o `never` no
      // `default`: bucket novo na régua vira erro de compilação, não linha
      // faltando no gráfico.
      let receitaBruta = 0;
      let estornos = 0;
      let impostos = 0;
      let despesas = 0;
      let naoOperacionais = 0;
      monthTransactions.forEach((t) => {
        const amount = Number(t.amount) || 0;
        const { bucket } = classifyForDre(t, categoryIndex);
        switch (bucket) {
          case "revenue":
            receitaBruta += amount;
            break;
          case "revenue_reduction":
            estornos += amount;
            break;
          case "tax":
            impostos += amount;
            break;
          case "cpv":
          case "opex":
            despesas += amount;
            break;
          case "non_operating":
            naoOperacionais += amount;
            break;
          case null:
            break; // fora do resultado (é caixa)
          default: {
            // Inalcançável: `normalizeBucket` só deixa passar bucket conhecido.
            const _exhaustive: never = bucket;
            void _exhaustive;
            break;
          }
        }
      });

      // Receita Líquida (já deduzidos estornos e impostos). O estorno é redutor
      // de receita — nunca entra em "Despesas", senão seria contado duas vezes.
      const receitaLiquida = receitaBruta - estornos - impostos;
      const resultadoOperacional = receitaLiquida - despesas;

      months.push({
        month: monthLabel,
        receita: receitaLiquida,
        despesas: despesas,
        resultado: resultadoOperacional - naoOperacionais,
      });
    });

    return months;
  }, [transactions, categoryIndex, periodStart, periodEnd]);

  const formatChartValue = (value: number) => {
    if (Math.abs(value) >= 1000) {
      return `R$ ${(value / 1000).toFixed(0)}k`;
    }
    return formatCurrencyBR(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3">
          <p className="font-medium text-sm mb-2">{label}</p>
          {payload.map((entry: any) => (
            <div
              key={entry.name}
              className="flex items-center justify-between gap-4 text-xs"
            >
              <span style={{ color: entry.color }}>{entry.name}</span>
              <span className="font-medium">
                {formatChartValue(entry.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Get year range for title
  const currentYear = new Date().getFullYear();
  const rangeTitle = periodStart && periodEnd
    ? `${format(periodStart, "MMM/yy", { locale: ptBR })} a ${
      format(periodEnd, "MMM/yy", { locale: ptBR })
    }`
    : `Dez/${currentYear - 1} a Dez/${currentYear}`;
  const chartTitle = `Evolução - Receita vs Despesas (${rangeTitle})`;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3 px-3 sm:px-6">
        <CardTitle className="text-base sm:text-lg font-semibold">
          {isMobile ? `Evolução ${rangeTitle}` : chartTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className={isMobile ? "h-64" : "h-72"}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{
                top: 10,
                right: isMobile ? 5 : 10,
                left: isMobile ? -15 : 0,
                bottom: 0,
              }}
            >
              <defs>
                <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorResultado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border/50"
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: isMobile ? 9 : 11 }}
                className="text-muted-foreground"
                interval={isMobile ? 2 : 0}
                angle={isMobile ? -45 : 0}
                textAnchor={isMobile ? "end" : "middle"}
                height={isMobile ? 50 : 30}
              />
              <YAxis
                tick={{ fontSize: isMobile ? 9 : 11 }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                className="text-muted-foreground"
                width={isMobile ? 35 : 45}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{
                  fontSize: isMobile ? "10px" : "12px",
                  paddingTop: isMobile ? "8px" : "0px",
                }}
                iconType="circle"
                iconSize={isMobile ? 8 : 10}
              />
              <Area
                type="monotone"
                dataKey="receita"
                name="Receita Líquida"
                stroke="#22c55e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorReceita)"
              />
              <Area
                type="monotone"
                dataKey="despesas"
                name="Despesas"
                stroke="#ef4444"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorDespesas)"
              />
              <Area
                type="monotone"
                dataKey="resultado"
                name="Resultado"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorResultado)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
