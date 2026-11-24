import { adminKpiClass } from "@/components/admin/adminKpiStyles";
import { useMemo, useState } from "react";
import {
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildDreCategoryIndex, classifyForDre } from "@/lib/adminDreBuckets";
const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Transaction = {
  id: string;
  type: string;
  category: string;
  amount: number;
};
export function AdminFinancialOverview({
  transactions,
  categories,
  income,
  expenses,
  balance,
  balanceLoading,
  balanceError,
  isLoading,
  canManage,
  onRefresh,
  onCreate,
  onNavigate,
  children,
}: {
  transactions: Transaction[];
  categories: any[];
  income: number;
  expenses: number;
  balance: number | null;
  balanceLoading: boolean;
  balanceError: boolean;
  isLoading: boolean;
  canManage: boolean;
  onRefresh: () => void;
  onCreate: (type: "income" | "expense") => void;
  onNavigate: (section: string) => void;
  children?: React.ReactNode;
}) {
  const [chartType, setChartType] = useState<"income" | "expense">("expense");
  const distribution = useMemo(() => {
    const index = buildDreCategoryIndex(categories);
    const sums = new Map<string, number>();
    transactions.filter((t) =>
      t.type === chartType && classifyForDre(t, index).bucket !== null
    ).forEach((t) =>
      sums.set(t.category, (sums.get(t.category) || 0) + Number(t.amount))
    );
    return [...sums].map(([key, value]) => ({
      name: categories.find((c) => c.name === key)?.label || key,
      value,
      color: categories.find((c) => c.name === key)?.color || "#52525b",
    })).sort((a, b) => b.value - a.value);
  }, [transactions, categories, chartType]);
  const result = income - expenses;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <article className={adminKpiClass("blue", "rounded-xl border bg-card p-4")}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="h-4 w-4" />Saldo Asaas
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Atualizar saldo"
              disabled={balanceLoading}
              onClick={onRefresh}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {balanceLoading
            ? <Skeleton className="my-2 h-8 w-32" />
            : balanceError || balance == null
            ? <p role="status" className="my-2 text-sm">Saldo indisponível</p>
            : (
              <p className="my-2 break-words text-2xl font-bold tabular-nums">
                {money(balance)}
              </p>
            )}
          <Button
            variant="link"
            className="h-auto px-0 text-sm"
            onClick={() => onNavigate("reconciliation")}
          >
            Conferir saldos e conciliação
          </Button>
        </article>
        {([{
          type: "income",
          label: "Receitas",
          amount: income,
          Icon: TrendingUp,
          color: "bg-emerald-700",
        }, {
          type: "expense",
          label: "Despesas",
          amount: expenses,
          Icon: TrendingDown,
          color: "bg-red-600",
        }] as const).map(({ type, label, amount, Icon, color }) => (
          <article key={type} className={adminKpiClass(type === "income" ? "emerald" : "rose", "rounded-xl border bg-card p-4")}>
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className={`rounded-lg p-2 text-white ${color}`}>
                <Icon className="h-4 w-4" />
              </span>
              {label} do período
            </span>
            {isLoading ? <Skeleton className="my-2 h-8 w-32" /> : (
              <button
                className="my-2 block break-words text-left text-2xl font-bold tabular-nums"
                onClick={() =>
                  onNavigate(type === "income" ? "income" : "expenses")}
              >
                {money(amount)}
              </button>
            )}
            <Button
              size="sm"
              disabled={!canManage}
              onClick={() =>
                onCreate(type)}
              className="bg-black text-white hover:bg-zinc-800"
            >
              <Plus className="mr-1 h-4 w-4" />
              {type === "income" ? "Nova receita" : "Nova despesa"}
            </Button>
          </article>
        ))}
      </div>
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 text-white ${
          result >= 0 ? "bg-emerald-700" : "bg-red-600"
        }`}
      >
        <div>
          <p className="text-sm">Resultado do período</p>
          <p className="text-2xl font-bold tabular-nums">
            {isLoading ? "…" : money(result)}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => onNavigate("dre")}
          className="border-white bg-transparent text-white hover:bg-white hover:text-black"
        >
          Analisar DRE
        </Button>
      </div>
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Distribuição por categoria</h2>
          <div
            role="group"
            aria-label="Tipo de distribuição"
            className="inline-flex gap-1 rounded-xl border bg-background p-1 shadow-sm"
          >
            {(["income", "expense"] as const).map((type) => (
              <Button
                key={type}
                size="sm"
                variant="ghost"
                aria-pressed={chartType === type}
                className={chartType === type
                  ? type === "income" ? "bg-emerald-700 text-white hover:bg-emerald-800 hover:text-white" : "bg-rose-700 text-white hover:bg-rose-800 hover:text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"}
                onClick={() => setChartType(type)}
              >
                {type === "income" ? "Receitas" : "Despesas"}
              </Button>
            ))}
          </div>
        </div>
        {isLoading
          ? <Skeleton className="mt-4 h-52 w-full" />
          : distribution.length === 0
          ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Sem movimentações deste tipo no período.
            </p>
          )
          : (
            <div className="grid items-center gap-4 lg:grid-cols-2">
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribution}
                      isAnimationActive={false}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={2}
                    >
                      {distribution.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => money(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="max-h-64 space-y-3 overflow-y-auto pr-2">
                {distribution.map((d) => (
                  <li
                    key={d.name}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: d.color }}
                      />
                      <span className="break-words">{d.name}</span>
                    </span>
                    <strong className="whitespace-nowrap tabular-nums">
                      {money(d.value)}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
      </section>
      {children}
    </div>
  );
}
