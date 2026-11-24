import { ArrowDownLeft, ArrowUpRight, CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

export function FinancialTypeBadge({ type, className }: { type: "income" | "expense" | string; className?: string }) {
  const income = type === "income" || type === "credit";
  const Icon = income ? ArrowDownLeft : ArrowUpRight;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white", income ? "bg-emerald-700" : "bg-rose-700", className)}><Icon className="h-3.5 w-3.5" />{income ? "Receita" : "Despesa"}</span>;
}

export function FinancialStatusBadge({ status, className }: { status: string; className?: string }) {
  const record: Record<string, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
    pending_categorization: { label: "Pendente", tone: "bg-amber-700", Icon: CircleAlert },
    partially_categorized: { label: "Parcial", tone: "bg-amber-700", Icon: CircleDashed },
    manually_categorized: { label: "Classificado", tone: "bg-blue-700", Icon: CheckCircle2 },
    fully_categorized: { label: "Classificado", tone: "bg-emerald-700", Icon: CheckCircle2 },
    auto_categorized: { label: "Automático", tone: "bg-violet-700", Icon: CheckCircle2 },
    reconciled: { label: "Conciliado", tone: "bg-emerald-700", Icon: CheckCircle2 },
    technical: { label: "Movimento automático", tone: "bg-slate-700", Icon: CircleDashed },
    pending: { label: "Em aberto", tone: "bg-amber-700", Icon: CircleAlert },
    overdue: { label: "Vencida", tone: "bg-rose-700", Icon: CircleAlert },
    paid: { label: "Paga", tone: "bg-emerald-700", Icon: CheckCircle2 },
    received: { label: "Recebida", tone: "bg-emerald-700", Icon: CheckCircle2 },
    settled: { label: "Liquidado", tone: "bg-emerald-700", Icon: CheckCircle2 },
    cancelled: { label: "Cancelado", tone: "bg-zinc-700", Icon: CircleDashed },
  };
  const value = record[status] ?? { label: status, tone: "bg-zinc-700", Icon: CircleDashed };
  const Icon = value.Icon;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white", value.tone, className)}><Icon className="h-3.5 w-3.5" />{value.label}</span>;
}

export const financialAmountClass = (type: "income" | "expense" | "credit" | "debit" | string) =>
  cn("font-bold tabular-nums", type === "income" || type === "credit" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400");
