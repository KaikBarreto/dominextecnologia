import { useId, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  ChartNoAxesCombined,
  CircleDollarSign,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminKpiClass, type AdminKpiTone } from "./adminKpiStyles";
import {
  useAdminValuation,
  useAdminValuationMonthlyRevenue,
} from "@/hooks/useAdminValuation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ARR_MARKET_REFERENCE,
  DEFAULT_VALUATION_MULTIPLES,
  parseValuationNumber,
  projectValuation,
} from "@/lib/adminValuation";
import { cn } from "@/lib/utils";

const money = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
const exactMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number | null) =>
  n == null
    ? "Indisponível"
    : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const date = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
const monthLabel = (s: string) => `${s.slice(5, 7)}/${s.slice(2, 4)}`;
const scenarioNames = ["Conservador", "Base", "Otimista"];

function NumericInput(
  { value, onChange, label, suffix = "R$", min = -1e9, max = 1e9 }: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    suffix?: string;
    min?: number;
    max?: number;
  },
) {
  const id = useId();
  const invalid = parseValuationNumber(value, min, max) == null;
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          aria-label={label}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className={cn(
            "h-10 bg-background font-semibold tabular-nums",
            suffix.length > 3 ? "pr-20" : "pr-10",
          )}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {value.trim() === ""
            ? "Preencha o valor."
            : `Use um número entre ${min.toLocaleString("pt-BR")} e ${
              max.toLocaleString("pt-BR")
            }.`}
        </p>
      )}
    </div>
  );
}
function Kpi(
  { label, value, detail, icon: Icon, tone }: {
    label: string;
    value: string;
    detail: string;
    icon: typeof TrendingUp;
    tone: AdminKpiTone;
  },
) {
  return (
    <Card className={adminKpiClass(tone, "min-w-0 shadow-none")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 text-xs font-medium">
          <span>{label}</span>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        </div>
        <p className="mt-2 text-xl font-bold tracking-tight tabular-nums sm:text-2xl">
          {value}
        </p>
        <p className="mt-1 text-xs">{detail}</p>
      </CardContent>
    </Card>
  );
}
function Metric(
  { label, value, hint }: { label: string; value: string; hint?: string },
) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="font-semibold tabular-nums">{value}</dd>
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
export function AdminValuationReport() {
  const valuation = useAdminValuation();
  const [method, setMethod] = useState<"arr" | "profit" | "monthly">("arr");
  const [multiplesByMethod, setMultiplesByMethod] = useState(
    DEFAULT_VALUATION_MULTIPLES,
  );
  const multiples = multiplesByMethod[method];
  const [monthlySource, setMonthlySource] = useState<
    "current" | "closed" | "forecast"
  >("current");
  const [monthlyForecast, setMonthlyForecast] = useState("");
  const monthly = useAdminValuationMonthlyRevenue(
    method === "monthly" && monthlySource === "current",
  );
  const [mrrAdjustment, setMrrAdjustment] = useState("0");
  const [profitAdjustment, setProfitAdjustment] = useState("0");
  const [growth, setGrowth] = useState("5");
  const [churn, setChurn] = useState("3");
  const [margin, setMargin] = useState("15");
  const data = valuation.data;
  const mrrDelta = parseValuationNumber(mrrAdjustment),
    profitDelta = parseValuationNumber(profitAdjustment);
  const adjustedMrr = mrrDelta == null
    ? null
    : (data?.current.mrr ?? 0) + mrrDelta;
  const adjustedProfit = profitDelta == null
    ? null
    : (data?.financial.operating_result ?? 0) + profitDelta;
  const validMrr = adjustedMrr != null && adjustedMrr >= 0;
  const parsedMultiples = multiples.map((v) => parseValuationNumber(v, 0, 20));
  const ordered = parsedMultiples.every((v, i) =>
    v != null && (i === 0 || v >= (parsedMultiples[i - 1] ?? Infinity))
  );
  const profitAvailable = (data?.financial.observed_months ?? 0) >= 12 &&
    adjustedProfit != null && adjustedProfit > 0;
  const closedMonth = data?.history.at(-1);
  const monthlyRevenue = monthlySource === "forecast"
    ? parseValuationNumber(monthlyForecast, 0)
    : monthlySource === "closed"
    ? closedMonth?.revenue ?? null
    : monthly.isError || monthly.isFetching
    ? null
    : monthly.data?.revenue ?? null;
  const basis = method === "monthly"
    ? monthlyRevenue != null && monthlyRevenue > 0 ? monthlyRevenue * 12 : null
    : method === "arr"
    ? validMrr && adjustedMrr! > 0 ? adjustedMrr! * 12 : null
    : profitAvailable
    ? adjustedProfit
    : null;
  const values = parsedMultiples.map((v) =>
    ordered && basis != null && v != null ? v * basis : null
  );
  const growthValue = parseValuationNumber(growth, 0, 100),
    churnValue = parseValuationNumber(churn, 0, 100),
    marginValue = parseValuationNumber(margin, -1000, 100);
  const simulation =
    validMrr && growthValue != null && churnValue != null && marginValue != null
      ? projectValuation(adjustedMrr!, growthValue, churnValue, marginValue)
      : null;
  const future = simulation?.[12];
  const projectedBasis = method !== "monthly" && future
    ? (method === "arr"
      ? future.mrr * 12
      : future.result > 0
      ? future.result * 12
      : null)
    : null;
  const projectedBase = projectedBasis != null && ordered
    ? projectedBasis * parsedMultiples[1]!
    : null;

  if (valuation.isLoading) {
    return (
      <div
        role="status"
        aria-label="Carregando valuation"
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (valuation.isError || !data) {
    return (
      <Card>
        <CardContent role="alert" className="space-y-3 p-6">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <p className="font-semibold">
            Não foi possível calcular a estimativa
          </p>
          <p className="text-sm text-muted-foreground">
            Confira sua conexão e seu acesso aos totais do financeiro.
          </p>
          <Button variant="outline" onClick={() => valuation.refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }
  const historicalMrr = data.history.some((row) => row.mrr != null);
  const cashAvailable = data.financial.cash_first_movement != null &&
    data.financial.net_cash != null;
  return (
    <section aria-label="Valuation do SaaS" className="space-y-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Valuation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Uma faixa para planejar o valor do SaaS.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Financeiro: {date(data.period_start)} a {date(data.period_end)}{" "}
            · 12 meses fechados
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={valuation.isFetching || monthly.isFetching}
          onClick={() => {
            void valuation.refetch();
            if (
              method === "monthly" && monthlySource === "current"
            ) void monthly.refetch();
          }}
        >
          <RefreshCw
            className={cn(
              "mr-2 h-4 w-4",
              (valuation.isFetching || monthly.isFetching) && "animate-spin",
            )}
          />Atualizar dados
        </Button>
      </header>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          label="MRR cadastral"
          value={money(data.current.mrr)}
          detail={`${data.current.active_customers} empresas pagas em dia`}
          icon={CircleDollarSign}
          tone="blue"
        />
        <Kpi
          label="ARR de referência"
          value={money(data.current.arr)}
          detail="MRR cadastral × 12"
          icon={ChartNoAxesCombined}
          tone="violet"
        />
        <Kpi
          label="Receita — 12 meses"
          value={money(data.financial.revenue)}
          detail={`${data.financial.observed_months} meses de histórico · caixa`}
          icon={TrendingUp}
          tone="emerald"
        />
        <Kpi
          label="Resultado operacional"
          value={money(data.financial.operating_result)}
          detail={`Caixa · margem ${pct(data.financial.operating_margin_pct)}`}
          icon={data.financial.operating_result < 0 ? TrendingDown : TrendingUp}
          tone={data.financial.operating_result < 0 ? "rose" : "amber"}
        />
      </div>
      {method === "arr" && (
        <aside
          aria-label="Referência de mercado para ARR"
          className="rounded-lg border bg-card p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">
                Referência de mercado · SaaS B2B
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {date(ARR_MARKET_REFERENCE.date)} ·{" "}
                {ARR_MARKET_REFERENCE.companies}{" "}
                empresas listadas com dados válidos
              </p>
            </div>
            <dl className="flex flex-wrap gap-6">
              <div>
                <dt className="text-xs text-muted-foreground">Mediana</dt>
                <dd className="text-xl font-bold tabular-nums">
                  {ARR_MARKET_REFERENCE.median.toLocaleString("pt-BR")}×
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Média calculada
                </dt>
                <dd className="text-xl font-bold tabular-nums">
                  {ARR_MARKET_REFERENCE.mean.toLocaleString("pt-BR")}×
                </dd>
              </div>
            </dl>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Valor das ações ÷ receita anualizada corrente. Esta amostra
            internacional de empresas listadas não determina o múltiplo de um
            SaaS privado menor e não é um múltiplo de valor da operação (EV).
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Fonte:{" "}
            <a
              className="font-medium text-foreground underline underline-offset-2"
              href={ARR_MARKET_REFERENCE.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              SaaS Capital Index
            </a>{" "}
            ·{" "}
            <a
              className="font-medium text-foreground underline underline-offset-2"
              href={ARR_MARKET_REFERENCE.dataUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Planilha de 31/10/2026
            </a>. Referência datada, sem atualização automática.
          </p>
        </aside>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" />Faixa estimada
            </CardTitle>
            <CardDescription>
              {method === "arr"
                ? "Cenários iniciais de 3×, 5× e 7× ARR. São hipóteses de gestão, não percentis da amostra nem preços garantidos de venda."
                : method === "monthly"
                ? "Faturamento de um mês × 12. O cenário base usa 1× esse valor anualizado; você pode ajustar os múltiplos para comparar hipóteses."
                : "Múltiplos próprios para o resultado operacional em caixa. Não reutilizam os múltiplos de ARR."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              aria-label="Método de valuation"
              className="flex flex-wrap gap-x-4 border-b"
            >
              <button
                type="button"
                aria-pressed={method === "arr"}
                onClick={() => setMethod("arr")}
                className={cn(
                  "min-h-11 border-b-2 text-sm font-medium",
                  method === "arr"
                    ? "border-foreground"
                    : "border-transparent text-muted-foreground",
                )}
              >
                Por ARR
              </button>
              <button
                type="button"
                aria-pressed={method === "profit"}
                onClick={() => setMethod("profit")}
                className={cn(
                  "min-h-11 border-b-2 text-sm font-medium",
                  method === "profit"
                    ? "border-foreground"
                    : "border-transparent text-muted-foreground",
                )}
              >
                Por resultado
              </button>
              <button
                type="button"
                aria-pressed={method === "monthly"}
                onClick={() => setMethod("monthly")}
                className={cn(
                  "min-h-11 border-b-2 text-sm font-medium",
                  method === "monthly"
                    ? "border-foreground"
                    : "border-transparent text-muted-foreground",
                )}
              >
                Faturamento mensal × 12
              </button>
            </div>
            {method === "monthly"
              ? (
                <div className="space-y-4">
                  <div className="grid items-start gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="valuation-monthly-source"
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Faturamento de referência
                      </label>
                      <Select
                        value={monthlySource}
                        onValueChange={(
                          value: "current" | "closed" | "forecast",
                        ) => setMonthlySource(value)}
                      >
                        <SelectTrigger
                          id="valuation-monthly-source"
                          className="h-10 bg-background"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="current">
                            Mês atual · realizado parcial
                          </SelectItem>
                          <SelectItem value="closed">
                            Último mês fechado{closedMonth
                              ? ` · ${monthLabel(closedMonth.month)}`
                              : ""}
                          </SelectItem>
                          <SelectItem value="forecast">
                            Previsão informada · simulação
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {monthlySource === "forecast"
                      ? (
                        <NumericInput
                          label="Faturamento mensal previsto"
                          value={monthlyForecast}
                          onChange={setMonthlyForecast}
                          min={0}
                        />
                      )
                      : (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            Receita realizada no mês
                          </p>
                          <p
                            data-testid="monthly-revenue"
                            className="flex h-10 items-center text-lg font-bold tabular-nums"
                          >
                            {monthlyRevenue == null
                              ? "—"
                              : exactMoney(monthlyRevenue)}
                          </p>
                        </div>
                      )}
                  </div>
                  {monthlySource === "current" && monthly.isFetching
                    ? (
                      <p
                        role="status"
                        className="text-sm text-muted-foreground"
                      >
                        Consultando receita do mês…
                      </p>
                    )
                    : monthlySource === "current" && monthly.isError
                    ? (
                      <div
                        role="alert"
                        className="flex flex-wrap items-center gap-3 text-sm"
                      >
                        <p>Não foi possível consultar a receita do mês.</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => monthly.refetch()}
                        >
                          Tentar novamente
                        </Button>
                      </div>
                    )
                    : (
                      <p className="text-xs text-muted-foreground">
                        {monthlySource === "current" && monthly.data
                          ? `De ${date(monthly.data.month_start)} até ${
                            new Date(monthly.data.as_of).toLocaleString(
                              "pt-BR",
                              { timeZone: "America/Sao_Paulo" },
                            )
                          } (Brasília). Mês em andamento: o valor parcial não é uma previsão do fechamento.`
                          : monthlySource === "closed"
                          ? closedMonth
                            ? `Mês fechado: ${
                              monthLabel(closedMonth.month)
                            }. Mesma receita em caixa do histórico abaixo.`
                            : "Nenhum mês fechado disponível."
                          : "Previsão informada por você para um mês completo. Não representa receita já realizada e não altera os lançamentos."}
                      </p>
                    )}
                  <div className="border-y py-4">
                    <p className="text-sm font-medium">Valuation a 12× o mês</p>
                    <p
                      data-testid="monthly-annualized"
                      className="mt-1 text-2xl font-bold tracking-tight tabular-nums"
                    >
                      {basis == null ? "—" : money(basis)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {basis == null
                        ? "Informe ou selecione uma receita mensal positiva."
                        : `${exactMoney(monthlyRevenue!)} × 12 = ${
                          exactMoney(basis)
                        }. Nos cenários abaixo, esse valor é multiplicado pela premissa de cada cenário.`}
                    </p>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Este método usa recebimentos em caixa, incluindo anuais
                    antecipados, e exclui aportes de sócios. Não é ARR nem
                    receita por competência: um mês forte pode incluir
                    pagamentos por serviços dos próximos meses. Os múltiplos são
                    hipóteses de simulação, sem benchmark de mercado para esta
                    base.
                  </p>
                </div>
              )
              : method === "arr"
              ? (
                <div className="grid items-start gap-3 sm:grid-cols-2">
                  <NumericInput
                    label="Ajuste manual do MRR"
                    value={mrrAdjustment}
                    onChange={setMrrAdjustment}
                    min={-data.current.mrr}
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground sm:pt-6">
                    Anuais usam o valor mensal do cadastro. Ajuste descontos ou
                    contratos especiais que ainda não estejam refletidos nele.
                  </p>
                </div>
              )
              : (
                <div className="grid items-start gap-3 sm:grid-cols-2">
                  <NumericInput
                    label="Ajuste do resultado anual"
                    value={profitAdjustment}
                    onChange={setProfitAdjustment}
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground sm:pt-6">
                    Ajuste custos ou receitas extraordinárias. A base é o
                    resultado operacional em caixa dos 12 meses, não EBITDA.
                  </p>
                </div>
              )}
            {!ordered && (
              <p role="alert" className="text-sm text-destructive">
                Preencha os múltiplos em ordem: conservador ≤ base ≤ otimista.
              </p>
            )}
            {method === "profit" && !profitAvailable && (
              <p role="status" className="text-sm text-amber-700">
                Este método exige 12 meses de histórico e resultado ajustado
                positivo. Os valores ficam indisponíveis enquanto essa base não
                existir.
              </p>
            )}
            {method === "arr" && adjustedMrr === 0 && (
              <p role="status" className="text-sm text-muted-foreground">
                Não há MRR positivo para estimar o valor por ARR.
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              {scenarioNames.map((name, i) => (
                <div
                  key={name}
                  className={cn(
                    "min-w-0 rounded-lg border p-3",
                    i === 1 && "border-foreground",
                  )}
                >
                  <h3 className="text-sm font-semibold">{name}</h3>
                  <p
                    data-testid={`valuation-${i}`}
                    className="my-3 break-words text-xl font-bold tracking-tight tabular-nums"
                  >
                    {values[i] == null ? "—" : money(values[i]!)}
                  </p>
                  <NumericInput
                    label={`Múltiplo ${name.toLowerCase()}`}
                    suffix="×"
                    value={multiples[i]}
                    min={0}
                    max={20}
                    onChange={(value) =>
                      setMultiplesByMethod((current) => ({
                        ...current,
                        [method]: current[method].map((n, j) =>
                          j === i ? value : n
                        ),
                      }))}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {basis != null
                ? `Base de cálculo: ${money(basis)} × múltiplo. `
                : ""}Não inclui ajuste por caixa excedente e dívidas. As
              premissas são descartadas ao sair desta aba. Ajuste os múltiplos
              conforme porte, crescimento, retenção e margem da empresa; não há
              desconto ou prêmio automático por esses fatores.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Qualidade da receita</CardTitle>
            <CardDescription>
              {data.retention.month
                ? `Referência: ${
                  monthLabel(data.retention.month)
                } · mês fechado`
                : "Sem histórico de retenção disponível"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Metric
                label="Crescimento do MRR"
                value={pct(data.retention.mrr_growth_pct)}
                hint="Variação líquida no mês"
              />
              <Metric
                label="Churn de clientes"
                value={pct(data.retention.churn_pct)}
                hint="Empresas que saíram da base"
              />
              <Metric
                label="Retenção de receita (NRR)"
                value={pct(data.retention.nrr_pct)}
              />
              <Metric
                label="Concentração do MRR"
                value={data.current.top1_pct == null
                  ? "Indisponível"
                  : `${pct(data.current.top1_pct)} / ${
                    pct(data.current.top5_pct)
                  }`}
                hint="Maior empresa / cinco maiores"
              />
              <Metric
                label="Cobranças vencidas"
                value={money(data.financial.overdue_amount)}
                hint={`${data.financial.overdue_count} cobranças abertas de assinatura; pode incluir cobranças antigas a revisar.`}
              />
            </dl>
          </CardContent>
        </Card>
      </div>
      {method !== "monthly" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />Simular os próximos 12 meses
            </CardTitle>
            <CardDescription>
              Premissas ilustrativas. Crescimento antes das perdas e churn de
              receita são informados separadamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid items-start gap-3 sm:grid-cols-3">
              <NumericInput
                label="Novas vendas e expansão"
                value={growth}
                onChange={setGrowth}
                suffix="% / mês"
                min={0}
                max={100}
              />
              <NumericInput
                label="Churn bruto de receita"
                value={churn}
                onChange={setChurn}
                suffix="% / mês"
                min={0}
                max={100}
              />
              <NumericInput
                label="Margem operacional alvo"
                value={margin}
                onChange={setMargin}
                suffix="%"
                min={-1000}
                max={100}
              />
            </div>
            {simulation && future
              ? (
                <>
                  <div className="grid gap-3 border-y py-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        MRR no mês 12
                      </p>
                      <p className="text-lg font-bold tabular-nums">
                        {money(future.mrr)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Resultado anualizado no mês 12
                      </p>
                      <p
                        className={cn(
                          "text-lg font-bold tabular-nums",
                          future.result < 0
                            ? "text-red-600"
                            : "text-emerald-700",
                        )}
                      >
                        {money(future.result * 12)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Valuation base projetado ·{" "}
                        {method === "arr" ? "ARR" : "resultado"}
                      </p>
                      <p className="text-lg font-bold tabular-nums">
                        {projectedBase == null
                          ? "Indisponível"
                          : money(projectedBase)}
                      </p>
                    </div>
                  </div>
                  <div
                    className="h-60 min-w-0"
                    aria-label="Projeção mensal de MRR e resultado"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={simulation}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="month"
                          tickLine={false}
                          axisLine={false}
                          fontSize={11}
                        />
                        <YAxis
                          tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                          width={44}
                          tickLine={false}
                          axisLine={false}
                          fontSize={11}
                        />
                        <Tooltip formatter={(value: number) => money(value)} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line
                          dataKey="mrr"
                          name="MRR simulado"
                          stroke="#1d4ed8"
                          strokeWidth={2.5}
                          dot={false}
                        />
                        <Line
                          dataKey="result"
                          name="Resultado mensal simulado"
                          stroke="#047857"
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A cada mês: MRR × (1 + crescimento) × (1 − churn de
                    receita). Resultado mensal = MRR × margem. Valores
                    anualizados mostram o ritmo do mês 12 × 12, não o
                    faturamento acumulado da projeção.
                  </p>
                </>
              )
              : (
                <p role="alert" className="py-8 text-sm text-destructive">
                  Revise as premissas e o ajuste de MRR para calcular a
                  projeção.
                </p>
              )}
          </CardContent>
        </Card>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Evolução observada</CardTitle>
            <CardDescription>
              Receita e resultado em caixa. {historicalMrr
                ? "MRR histórico pela cobertura de pagamentos; pode diferir do cadastro atual."
                : "O histórico de MRR ainda não está disponível."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.financial.observed_months > 0
              ? (
                <div className="h-64" aria-label="Histórico financeiro mensal">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={data.history.map((row) => ({
                        ...row,
                        label: monthLabel(row.month),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                      />
                      <YAxis
                        tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                        width={44}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                      />
                      <Tooltip formatter={(value: number) => money(value)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="revenue"
                        name="Receita"
                        fill="#047857"
                        radius={[3, 3, 0, 0]}
                      />
                      <Line
                        dataKey="operating_result"
                        name="Resultado"
                        stroke="#7c3aed"
                        strokeWidth={2}
                        dot={false}
                      />
                      {historicalMrr && (
                        <Line
                          dataKey="mrr"
                          name="MRR histórico"
                          stroke="#1d4ed8"
                          strokeWidth={2}
                          dot={false}
                          connectNulls={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )
              : (
                <p className="py-8 text-sm text-muted-foreground">
                  Ainda não há registros em meses fechados.
                </p>
              )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Composição financeira</CardTitle>
            <CardDescription>
              Mesmo período do DRE. Aportes excluídos da receita nesta análise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Metric
                label="Vendas, renovações e upgrades"
                value={money(data.financial.recurring_receipts)}
                hint="Recebimentos; não compõem o cálculo do MRR"
              />
              <Metric
                label="Outras receitas"
                value={money(data.financial.other_receipts)}
              />
              <Metric
                label="Aportes excluídos"
                value={money(data.financial.capital_excluded)}
              />
              <Metric
                label="Variação de caixa (DFC)"
                value={cashAvailable
                  ? money(data.financial.net_cash!)
                  : "Indisponível"}
                hint={cashAvailable
                  ? `Movimentos operacionais e não operacionais. Extrato disponível desde ${
                    date(data.financial.cash_first_movement!)
                  }.`
                  : "Sem extrato bancário disponível."}
              />
            </dl>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <h3 className="text-sm font-semibold">
                Qualidade dos dados e premissas
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {data.current.annual_customers} empresas anuais ·{" "}
                {data.current.overdue_active_customers}{" "}
                ativas com vencimento pendente ou ausente fora do MRR ·{" "}
                {data.current.missing_value_customers}{" "}
                sem mensalidade positiva.<br />
                {money(data.financial.unclassified_amount)}{" "}
                em lançamentos precisam de classificação suficiente no período.
                O resultado mantém esses valores incluídos.
              </p>
            </div>
          </div>
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-sm font-medium">
              Como os números são calculados
            </summary>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-relaxed text-muted-foreground">
              {data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              A referência de mercado é datada e os múltiplos de cada método são
              premissas independentes e editáveis. Para avaliar uma negociação,
              revise porte, crescimento, retenção, contratos, descontos, custos,
              caixa excedente e dívidas. Este painel não é um laudo de
              avaliação.
            </p>
          </details>
          <p className="text-xs text-muted-foreground">
            Apurado em {new Date(data.as_of).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })} (Brasília). Simulações não alteram os registros financeiros.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
