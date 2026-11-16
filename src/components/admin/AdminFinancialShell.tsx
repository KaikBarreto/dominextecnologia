import { type ReactNode, useEffect, useRef } from "react";
import {
  Building2,
  History,
  Inbox,
  LayoutDashboard,
  PieChart,
  Settings,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
export const ADMIN_FINANCIAL_SECTIONS = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "income", label: "Receitas", icon: TrendingUp },
  { id: "expenses", label: "Despesas", icon: TrendingDown },
  { id: "payables", label: "Contas a pagar", icon: TrendingDown },
  { id: "receivables", label: "Contas a receber", icon: TrendingUp },
  { id: "reconciliation", label: "Conciliação bancária", icon: Inbox },
  { id: "dre", label: "Resultado (DRE)", icon: PieChart },
  { id: "cashflow", label: "Fluxo de caixa (DFC)", icon: Wallet },
  { id: "banks", label: "Contas bancárias", icon: Building2 },
  { id: "history", label: "Histórico", icon: History },
  { id: "settings", label: "Configurações", icon: Settings },
] as const;
export function AdminFinancialShell(
  { active, onChange, periodControl, children }: {
    active: string;
    onChange: (section: string) => void;
    periodControl: ReactNode;
    children: ReactNode;
  },
) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && nav.current && window.innerWidth < 1024) {
      const left = el.offsetLeft - nav.current.offsetLeft;
      nav.current.scrollTo({
        left: Math.max(0, left - 16),
        behavior: "smooth",
      });
    }
  }, [active]);
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black text-white">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
            <p className="text-sm text-muted-foreground">
              Controle financeiro do SaaS
            </p>
          </div>
        </div>
        {periodControl}
      </header>
      <div className="flex min-w-0 flex-col gap-5 lg:flex-row">
        <nav
          ref={nav}
          aria-label="Seções do financeiro"
          className="flex shrink-0 gap-1 overflow-x-auto pb-2 lg:sticky lg:top-4 lg:w-52 lg:flex-col lg:self-start lg:overflow-visible lg:pb-0"
        >
          {ADMIN_FINANCIAL_SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={active === id ? "page" : undefined}
              onClick={() => onChange(id)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                active === id
                  ? "bg-black text-white"
                  : "bg-background text-foreground hover:bg-black hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
        </nav>
        <section
          className="min-w-0 flex-1"
          aria-label={ADMIN_FINANCIAL_SECTIONS.find((s) => s.id === active)
            ?.label}
        >
          {children}
        </section>
      </div>
    </main>
  );
}
export function AdminFinancialPeriodFilter(
  { value, onChange, from, to, onCustomChange }: {
    value: string;
    onChange: (value: string) => void;
    from: string;
    to: string;
    onCustomChange: (from: string, to: string) => void;
  },
) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor="admin-finance-period"
        >
          Período das movimentações
        </label>
        <Select value={value} onValueChange={onChange}><SelectTrigger id="admin-finance-period" className="h-10 w-[190px] bg-background"><SelectValue placeholder="Selecione o período" /></SelectTrigger><SelectContent><SelectItem value="today">Hoje</SelectItem><SelectItem value="7days">Últimos 7 dias</SelectItem><SelectItem value="thisMonth">Este mês</SelectItem><SelectItem value="lastMonth">Mês passado</SelectItem><SelectItem value="30days">Últimos 30 dias</SelectItem><SelectItem value="thisYear">Este ano</SelectItem><SelectItem value="allTime">Todo o período</SelectItem><SelectItem value="custom">Personalizado</SelectItem></SelectContent></Select>
      </div>
      {value === "custom" && (
        <>
          <div className="w-[150px]"><label className="mb-1 block text-xs" htmlFor="admin-finance-from">De</label><DatePicker id="admin-finance-from" value={from} max={to || undefined} placeholder="dd/mm/aaaa" onValueChange={(next) => onCustomChange(next, to)} /></div>
          <div className="w-[150px]"><label className="mb-1 block text-xs" htmlFor="admin-finance-to">Até</label><DatePicker id="admin-finance-to" value={to} min={from || undefined} placeholder="dd/mm/aaaa" onValueChange={(next) => onCustomChange(from, next)} /></div>
        </>
      )}
    </div>
  );
}
