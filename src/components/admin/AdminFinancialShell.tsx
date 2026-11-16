import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Building2,
  ChartNoAxesCombined,
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
import { DateRangeFilter, type DatePreset } from "@/components/ui/DateRangeFilter";
import { format } from "date-fns";
import { getAdminFinancialRange } from "@/lib/adminFinancialDates";
export const ADMIN_FINANCIAL_SECTIONS = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "income", label: "Receitas", icon: TrendingUp },
  { id: "expenses", label: "Despesas", icon: TrendingDown },
  { id: "accounts", label: "Contas", icon: Wallet },
  { id: "reconciliation", label: "Conciliação bancária", icon: Inbox },
  { id: "reports", label: "Relatórios", icon: PieChart },
  { id: "history", label: "Histórico", icon: History },
  { id: "settings", label: "Configurações", icon: Settings },
] as const;
export const ADMIN_FINANCIAL_SUBSECTIONS = {
  accounts: [
    { id: "payables", label: "A pagar", icon: TrendingDown },
    { id: "receivables", label: "A receber", icon: TrendingUp },
  ],
  reports: [
    { id: "dre", label: "DRE", icon: PieChart },
    { id: "cashflow", label: "DFC", icon: Wallet },
    { id: "valuation", label: "Valuation", icon: ChartNoAxesCombined },
  ],
  settings: [
    { id: "settings", label: "Categorias", icon: Settings },
    { id: "banks", label: "Contas bancárias", icon: Building2 },
  ],
} as const;

export function getAdminFinancialSection(page: string) {
  return Object.entries(ADMIN_FINANCIAL_SUBSECTIONS)
    .find(([, tabs]) => tabs.some(tab => tab.id === page))?.[0] ?? page;
}

export function AdminFinancialSubnav({ active, onChange }: {
  active: string;
  onChange: (page: string) => void;
}) {
  const section = getAdminFinancialSection(active);
  const tabs = ADMIN_FINANCIAL_SUBSECTIONS[section as keyof typeof ADMIN_FINANCIAL_SUBSECTIONS];
  if (!tabs) return null;
  const label = ADMIN_FINANCIAL_SECTIONS.find(item => item.id === section)?.label;
  return <nav aria-label={`Opções de ${label}`} className="mb-5 flex flex-wrap gap-3 border-b border-border sm:gap-5">
    {tabs.map(({ id, label, icon: Icon }) => <button
      key={id} type="button" aria-current={active === id ? "page" : undefined}
      onClick={() => onChange(id)}
      className={cn("-mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-1 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
        active === id ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground")}
    ><Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />{label}</button>)}
  </nav>;
}

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
                "flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                active === id
                  ? "border-foreground text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
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
  const presets: Record<string, DatePreset> = { allTime: "all", today: "today", "7days": "last7", thisMonth: "this_month", lastMonth: "last_month", "30days": "last30", thisYear: "this_year", custom: "custom" };
  return <div className="min-w-0 [&>div]:max-w-full [&>div]:flex-wrap"><DateRangeFilter
    preset={presets[value] ?? "all"}
    value={{ from: from ? new Date(from + "T12:00:00") : undefined, to: to ? new Date(to + "T12:00:00") : undefined }}
    onPresetChange={next => onChange(Object.keys(presets).find(key => presets[key] === next) ?? "allTime")}
    onRangeChange={next => onCustomChange(next.from ? format(next.from, "yyyy-MM-dd") : "", next.to ? format(next.to, "yyyy-MM-dd") : "")}
  /></div>;
}

export function AdminFinancialDateFilter({ from, to, onChange }: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [preset, setPreset] = useState(from || to ? "custom" : "allTime");
  return <AdminFinancialPeriodFilter
    value={preset} from={from} to={to}
    onChange={next => {
      setPreset(next);
      if (next === "custom") return;
      const range = getAdminFinancialRange(next);
      onChange(range.from ? format(range.from, "yyyy-MM-dd") : "", range.to ? format(range.to, "yyyy-MM-dd") : "");
    }}
    onCustomChange={(start, end) => { setPreset("custom"); onChange(start, end); }}
  />;
}
