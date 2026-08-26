/**
 * AdminMonitoramento — painel de monitoramento do banco de dados (admin-only).
 *
 * Consome RPCs Supabase já deployadas (admin-only via RLS/SECURITY DEFINER):
 *  - get_db_health_snapshot()       → snapshot de conexões/cache/tamanho/queries
 *  - get_top_cpu_queries(p_limit)   → top queries por tempo total (pg_stat_statements)
 *  - get_instance_recommendation()  → veredito descer/manter/subir com régua de tiers
 *
 * Regras de carga: react-query com staleTime alto (25s) pra não marretar o banco.
 * Auto-refresh opcional (30s) que SÓ dispara quando a aba está visível/focada
 * (document.visibilityState) — via refetchInterval condicional do react-query.
 *
 * Nota fixa e obrigatória: CPU% real deve ser conferida no dashboard do Supabase —
 * o Postgres não expõe isso internamente.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  MinusCircle,
  RefreshCw,
  Database,
  Gauge,
  Plug,
  HardDrive,
  Timer,
  Lock,
  Hourglass,
  Info,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  LineChart,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { typography } from "@/lib/typography";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import AdminMonitoramentoHistory from "./AdminMonitoramentoHistory";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos (espelham o contrato das RPCs)
// ─────────────────────────────────────────────────────────────────────────────
interface DbHealthSnapshot {
  captured_at: string;
  connections: {
    by_state: Record<string, number>;
    client_total: number;
    max_connections: number;
    used_pct: number;
    idle_in_transaction: number;
  };
  cache_hit_ratio: number;
  db_size: { bytes: number; pretty: string };
  active_queries_over_2s: number;
  blocked_queries: number;
}

interface TopCpuQuery {
  queryid: number;
  calls: number;
  mean_ms: number;
  total_ms: number;
  max_ms: number;
  pct_total_time: number;
  rows_returned: number;
  query_normalized: string;
}

// Recomendação de instância (get_instance_recommendation) — "leigo entende"
interface InstanceTier {
  identifier: string;
  name: string;
  cpu_cores: number;
  cpu_dedicated: boolean;
  memory_gb: number;
  price_monthly: number;
}

interface InstanceRecommendation {
  current: InstanceTier;
  ideal: InstanceTier;
  verdict: "descer" | "manter" | "subir";
  verdict_label: string;
  reasons: Array<{
    dim: "CPU" | "RAM" | "Conexões" | string;
    status: "ok" | "apertado" | "estoura" | string;
    texto: string;
  }>;
  peaks: {
    cpu_pct: number;
    ram_gb: number;
    cpu_pct_max: number;
    ram_gb_max: number;
    connections: number;
    window_days: number;
    window_from: string;
    sample_count: number;
  };
  economia_mensal: number;
  catalog: InstanceTier[];
  catalog_captured_at: string;
  data_note: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatação pt-BR
// ─────────────────────────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formata milissegundos de forma legível (ms / s), pt-BR. */
function fmtMs(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  if (ms >= 1000) return `${nf2.format(ms / 1000)} s`;
  if (ms >= 10) return `${nf0.format(ms)} ms`;
  return `${nf1.format(ms)} ms`;
}

function fmtInt(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return nf0.format(v);
}

function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${(decimals === 0 ? nf0 : nf1).format(v)}%`;
}

/** Formata dólar (Supabase cobra em USD): "US$ 111/mês" ou "US$ 1.332". */
function fmtUsd(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `US$ ${nf0.format(Math.round(v))}`;
}

/** vCPU + dedicada/compart. — "2 vCPU · dedicada". */
function fmtCpu(t: InstanceTier): string {
  return `${fmtInt(t.cpu_cores)} vCPU · ${t.cpu_dedicated ? "dedicada" : "compart."}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detecção de "acesso restrito" (RPC aborta com 42501)
// ─────────────────────────────────────────────────────────────────────────────
function isPermissionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "42501" || /permission denied|not authorized|acesso/i.test(e.message ?? "");
}

// Config visual da recomendação de instância (get_instance_recommendation).
// manter = verde/neutro · descer = azul (economia, positivo) · subir = âmbar/vermelho (custa mais)
const RECO_CONFIG: Record<
  InstanceRecommendation["verdict"],
  { icon: typeof ArrowUpCircle; solid: string; text: string; ring: string }
> = {
  manter: {
    icon: MinusCircle,
    solid: "bg-emerald-600",
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-600",
  },
  descer: {
    icon: ArrowDownCircle,
    solid: "bg-blue-600",
    text: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-600",
  },
  subir: {
    icon: ArrowUpCircle,
    solid: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500",
  },
};

// Farol das reasons por status.
const REASON_STATUS: Record<string, { dot: string; label: string }> = {
  ok: { dot: "bg-emerald-600", label: "OK" },
  apertado: { dot: "bg-amber-500", label: "Apertado" },
  estoura: { dot: "bg-red-600", label: "Estoura" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Componentes auxiliares
// ─────────────────────────────────────────────────────────────────────────────
/** Rótulo curto do selo sólido de estado (só aparece quando há estado != default). */
const TONE_STATUS: Record<"warning" | "danger" | "good", { label: string; solid: string }> = {
  good: { label: "OK", solid: "bg-emerald-600" },
  warning: { label: "Atenção", solid: "bg-amber-500" },
  danger: { label: "Crítico", solid: "bg-red-600" },
};

function HealthCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
  children,
}: {
  icon: typeof Gauge;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "warning" | "danger" | "good";
  children?: React.ReactNode;
}) {
  const status = tone === "default" ? null : TONE_STATUS[tone];
  return (
    <Card className="border shadow-none bg-card">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground min-w-0">
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-xs font-medium uppercase tracking-wide truncate">{label}</span>
          </div>
          {status && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white",
                status.solid,
              )}
            >
              {status.label}
            </span>
          )}
        </div>
        {/* Valor sempre neutro (foreground) — a cor comunica estado no selo, não no número */}
        <div className="text-2xl font-bold tabular-nums text-foreground">{value}</div>
        {children}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Card de destaque "Veredito de Instância" — mostra, pra leigo, se dá pra
 * descer/manter/subir a instância do Supabase, com régua de tiers e preços.
 */
function InstanceRecommendationCard({ reco }: { reco: InstanceRecommendation }) {
  const rc = RECO_CONFIG[reco.verdict] ?? RECO_CONFIG.manter;
  const eco = reco.economia_mensal ?? 0;

  return (
    <Card className="border shadow-sm bg-card overflow-hidden p-0 gap-0">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2 px-5 md:px-6 pt-5 pb-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Gauge className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Veredito de Instância
          </span>
        </div>
        {reco.data_note && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="text-[10px] font-medium text-muted-foreground cursor-help gap-1"
              >
                <Info className="h-3 w-3" />
                Preliminar
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              {reco.data_note}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <CardContent className="px-5 md:px-6 pb-5 md:pb-6 space-y-5">
        {/* Veredito em destaque + economia/custo */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-2">
            <rc.icon className={cn("h-8 w-8 shrink-0", rc.text)} />
            <span className={cn("text-2xl md:text-3xl font-bold leading-tight", rc.text)}>
              {reco.verdict_label}
            </span>
          </div>
          {eco > 0 ? (
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              Economia possível: {fmtUsd(eco)}/mês
              <span className="text-muted-foreground font-normal">
                {" "}
                (~{fmtUsd(eco * 12)}/ano)
              </span>
            </span>
          ) : eco < 0 ? (
            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
              Custo extra: {fmtUsd(Math.abs(eco))}/mês
            </span>
          ) : null}
        </div>

        {/* Motivos com farol por status */}
        {reco.reasons?.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Por quê
            </p>
            <ul className="space-y-1.5">
              {reco.reasons.map((r, i) => {
                const st = REASON_STATUS[r.status] ?? {
                  dot: "bg-muted-foreground",
                  label: "",
                };
                return (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span
                      className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", st.dot)}
                      title={st.label}
                    />
                    <span>
                      <span className="font-medium">{r.dim}:</span> {r.texto}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Régua de tiers (Micro → XL) */}
        {reco.catalog?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Régua de tiers
            </p>
            <div className="flex flex-col sm:flex-row sm:items-stretch gap-2">
              {reco.catalog.map((t) => {
                const isCurrent = t.identifier === reco.current.identifier;
                const isIdeal = t.identifier === reco.ideal.identifier;
                return (
                  <div
                    key={t.identifier}
                    className={cn(
                      "flex-1 min-w-0 rounded-lg border p-3 space-y-1.5 relative transition-colors",
                      isCurrent
                        ? cn("border-2 bg-muted/40", rc.ring, "ring-1", rc.ring)
                        : isIdeal
                          ? "border-dashed border-2 border-foreground/40 bg-muted/20"
                          : "border-border/60 bg-transparent",
                    )}
                  >
                    {/* Marcadores */}
                    {(isCurrent || isIdeal) && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {isCurrent && (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white",
                              rc.solid,
                            )}
                          >
                            Você está aqui
                          </span>
                        )}
                        {isIdeal && !isCurrent && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-foreground text-background">
                            Ideal
                          </span>
                        )}
                        {isIdeal && isCurrent && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-foreground text-background">
                            = Ideal
                          </span>
                        )}
                      </div>
                    )}
                    <div className="font-bold text-foreground leading-tight">{t.name}</div>
                    <div className="text-sm font-semibold tabular-nums text-foreground">
                      {fmtInt(t.memory_gb)} GB
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtCpu(t)}</div>
                    <div className="text-xs font-medium tabular-nums text-foreground">
                      {fmtUsd(t.price_monthly)}/mês
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rodapé — base do cálculo */}
        {reco.peaks && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Base: pico típico (p95) dos últimos {fmtInt(reco.peaks.window_days)} dias — CPU{" "}
            {fmtPct(reco.peaks.cpu_pct)} (máx {fmtPct(reco.peaks.cpu_pct_max)}), RAM{" "}
            {fmtInt(reco.peaks.ram_gb)} GB (máx {fmtInt(reco.peaks.ram_gb_max)} GB), conexões{" "}
            {fmtInt(reco.peaks.connections)}/160 · {fmtInt(reco.peaks.sample_count)} amostras.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function QueryRow({ q }: { q: TopCpuQuery }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = q.query_normalized?.length > 140;
  const shown = expanded || !truncated ? q.query_normalized : q.query_normalized.slice(0, 140) + "…";
  return (
    <tr className="border-b border-border/40 last:border-0 align-top">
      <td className="py-2 pr-3">
        <button
          type="button"
          onClick={() => truncated && setExpanded((v) => !v)}
          className={cn(
            "text-left flex items-start gap-1.5 max-w-[520px]",
            truncated && "cursor-pointer hover:text-foreground",
          )}
        >
          {truncated ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <code className="text-[11px] leading-snug font-mono text-muted-foreground whitespace-pre-wrap break-words">
            {shown}
          </code>
        </button>
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-sm">{fmtInt(q.calls)}</td>
      <td className="py-2 px-3 text-right tabular-nums text-sm">{fmtMs(q.mean_ms)}</td>
      <td className="py-2 px-3 text-right tabular-nums text-sm font-medium">{fmtMs(q.total_ms)}</td>
      <td className="py-2 pl-3 text-right tabular-nums text-sm">
        <div className="inline-flex items-center gap-2 justify-end">
          <span className="w-16 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:inline-block">
            <span
              className="block h-full bg-zinc-500 dark:bg-zinc-400"
              style={{ width: `${Math.min(100, q.pct_total_time ?? 0)}%` }}
            />
          </span>
          {fmtPct(q.pct_total_time)}
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────
const STALE = 25_000;

type TabKey = "overview" | "history" | "queries";

export default function AdminMonitoramento() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [autoRefresh, setAutoRefresh] = useState(false);
  // Reage a mudança de visibilidade da aba pra pausar o auto-refresh em background.
  const [tabVisible, setTabVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );

  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Só liga o polling quando o toggle está ON, a aba do navegador está visível/
  // focada E estamos na aba "Visão Geral" (não marretar o banco no histórico).
  const pollActive = autoRefresh && tabVisible && activeTab === "overview";
  const refetchInterval = pollActive ? 30_000 : false;

  const recoQ = useQuery<InstanceRecommendation>({
    queryKey: ["admin-instance-reco"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_instance_recommendation" as any);
      if (error) throw error;
      return data as unknown as InstanceRecommendation;
    },
    staleTime: STALE,
    refetchInterval,
    refetchOnWindowFocus: false,
    retry: (count, err) => !isPermissionError(err) && count < 2,
  });

  const snapshotQ = useQuery<DbHealthSnapshot>({
    queryKey: ["admin-db-snapshot"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_db_health_snapshot" as any);
      if (error) throw error;
      return data as unknown as DbHealthSnapshot;
    },
    staleTime: STALE,
    refetchInterval,
    refetchOnWindowFocus: false,
    retry: (count, err) => !isPermissionError(err) && count < 2,
  });

  const topQ = useQuery<TopCpuQuery[]>({
    queryKey: ["admin-db-top-cpu"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_top_cpu_queries" as any, { p_limit: 20 });
      if (error) throw error;
      return (data ?? []) as unknown as TopCpuQuery[];
    },
    staleTime: STALE,
    refetchInterval,
    refetchOnWindowFocus: false,
    retry: (count, err) => !isPermissionError(err) && count < 2,
  });

  const anyPermissionError =
    isPermissionError(snapshotQ.error) ||
    isPermissionError(topQ.error) ||
    isPermissionError(recoQ.error);

  const isRefreshing = snapshotQ.isFetching || topQ.isFetching || recoQ.isFetching;

  const refreshAll = () => {
    snapshotQ.refetch();
    topQ.refetch();
    recoQ.refetch();
  };

  // ── Acesso restrito (42501) ───────────────────────────────────────────────
  if (anyPermissionError) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <h1 className={`${typography.pageTitle} text-foreground flex items-center gap-2`}>
          <Database className="h-6 w-6 lg:h-7 lg:w-7" />
          Banco de Dados
        </h1>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Acesso restrito</AlertTitle>
          <AlertDescription>
            Você não tem permissão para consultar o monitoramento do banco de dados. Fale com um
            administrador master se precisar desse acesso.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const snap = snapshotQ.data;

  const capturedAt = snap?.captured_at;

  // Tons derivados dos limiares clássicos
  const cacheTone =
    snap == null
      ? "default"
      : snap.cache_hit_ratio * 100 >= 99
        ? "good"
        : snap.cache_hit_ratio * 100 >= 95
          ? "warning"
          : "danger";
  const connTone =
    snap == null
      ? "default"
      : snap.connections.used_pct >= 90
        ? "danger"
        : snap.connections.used_pct >= 75
          ? "warning"
          : "default";

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className={`${typography.pageTitle} text-foreground flex items-center gap-2`}>
              <Database className="h-6 w-6 lg:h-7 lg:w-7" />
              Banco de Dados
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitoramento de saúde do Postgres
              {capturedAt && (
                <>
                  {" · "}
                  atualizado{" "}
                  {formatDistanceToNow(new Date(capturedAt), { addSuffix: true, locale: ptBR })}
                </>
              )}
            </p>
          </div>

          {activeTab === "overview" && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                <Label htmlFor="auto-refresh" className="text-sm text-muted-foreground cursor-pointer">
                  Atualizar a cada 30s
                  {autoRefresh && !tabVisible && (
                    <span className="ml-1 text-xs">(pausado — aba em segundo plano)</span>
                  )}
                </Label>
              </div>
              <Button variant="outline" size="sm" onClick={refreshAll} disabled={isRefreshing}>
                <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
                Atualizar
              </Button>
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="overview" className="gap-1.5">
              <LayoutDashboard className="h-4 w-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <LineChart className="h-4 w-4" />
              Histórico &amp; Picos
            </TabsTrigger>
            <TabsTrigger value="queries" className="gap-1.5">
              <ListOrdered className="h-4 w-4" />
              Queries
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════ ABA: VISÃO GERAL ═══════════════ */}
          <TabsContent value="overview" className="space-y-6 mt-6">

        {/* ── VEREDITO DE INSTÂNCIA (régua de tiers + preços) ──────────────── */}
        {recoQ.isLoading ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : recoQ.data ? (
          <InstanceRecommendationCard reco={recoQ.data} />
        ) : recoQ.error && !isPermissionError(recoQ.error) ? (
          <p className="text-xs text-muted-foreground">
            Não foi possível carregar o veredito de instância.
          </p>
        ) : null}

        {/* ── CARDS DE SAÚDE ───────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Saúde do banco
          </h2>
          {snapshotQ.isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : snap ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Conexões */}
              <HealthCard
                icon={Plug}
                label="Conexões"
                tone={connTone}
                value={
                  <span>
                    {fmtInt(snap.connections.client_total)}
                    <span className="text-base font-normal text-muted-foreground">
                      {" "}
                      / {fmtInt(snap.connections.max_connections)}
                    </span>
                  </span>
                }
                hint={`${fmtPct(snap.connections.used_pct)} em uso`}
              >
                <Progress
                  value={Math.min(100, snap.connections.used_pct)}
                  className={cn(
                    "h-1.5",
                    connTone === "danger" && "[&>div]:bg-red-500",
                    connTone === "warning" && "[&>div]:bg-amber-500",
                  )}
                />
              </HealthCard>

              {/* Cache hit ratio */}
              <HealthCard
                icon={Gauge}
                label="Cache hit ratio"
                tone={cacheTone}
                value={fmtPct(snap.cache_hit_ratio * 100)}
                hint={
                  cacheTone === "good"
                    ? "Excelente"
                    : cacheTone === "warning"
                      ? "Aceitável — de olho"
                      : "Baixo — investigar"
                }
              />

              {/* Tamanho do banco */}
              <HealthCard
                icon={HardDrive}
                label="Tamanho do banco"
                value={snap.db_size.pretty}
                hint={`${fmtInt(snap.db_size.bytes)} bytes`}
              />

              {/* Queries ativas > 2s */}
              <HealthCard
                icon={Timer}
                label="Queries ativas > 2s"
                tone={snap.active_queries_over_2s > 0 ? "warning" : "default"}
                value={fmtInt(snap.active_queries_over_2s)}
                hint={snap.active_queries_over_2s > 0 ? "Consultas lentas em execução" : "Nenhuma no momento"}
              />

              {/* Queries bloqueadas */}
              <HealthCard
                icon={Lock}
                label="Queries bloqueadas"
                tone={snap.blocked_queries > 0 ? "danger" : "default"}
                value={fmtInt(snap.blocked_queries)}
                hint={snap.blocked_queries > 0 ? "Há contenção de locks" : "Sem bloqueios"}
              />

              {/* Idle in transaction */}
              <HealthCard
                icon={Hourglass}
                label="Idle in transaction"
                tone={snap.connections.idle_in_transaction > 0 ? "warning" : "default"}
                value={fmtInt(snap.connections.idle_in_transaction)}
                hint={
                  snap.connections.idle_in_transaction > 0
                    ? "Transações abertas paradas"
                    : "Nenhuma parada"
                }
              />
            </div>
          ) : (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Falha ao ler a saúde do banco</AlertTitle>
              <AlertDescription>
                {(snapshotQ.error as Error)?.message ?? "Tente atualizar novamente."}
              </AlertDescription>
            </Alert>
          )}

          {/* Estados por conexão (by_state) */}
          {snap && Object.keys(snap.connections.by_state ?? {}).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {Object.entries(snap.connections.by_state).map(([state, count]) => (
                <Badge key={state} variant="outline" className="font-normal text-xs">
                  {state}: <span className="ml-1 font-semibold tabular-nums">{fmtInt(count)}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>
          </TabsContent>

          {/* ═══════════════ ABA: HISTÓRICO & PICOS ═══════════════ */}
          <TabsContent value="history" className="mt-6">
            <AdminMonitoramentoHistory />
          </TabsContent>

          {/* ═══════════════ ABA: QUERIES ═══════════════ */}
          <TabsContent value="queries" className="mt-6">
        {/* ── TOP QUERIES DE CPU ───────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Top queries por tempo total
            </h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1 cursor-help">
                  <Info className="h-3.5 w-3.5" /> de onde vem
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                Dados de pg_stat_statements — acumulado desde o último reset. Ordenado por tempo
                total gasto (o maior consumidor de CPU do banco).
              </TooltipContent>
            </Tooltip>
          </div>

          {topQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : topQ.data && topQ.data.length > 0 ? (
            <Card className="border-0 shadow-none bg-muted/30">
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-xs text-muted-foreground">
                      <th className="text-left font-medium py-2 pr-3 pl-4">Query</th>
                      <th className="text-right font-medium py-2 px-3">Chamadas</th>
                      <th className="text-right font-medium py-2 px-3">Média</th>
                      <th className="text-right font-medium py-2 px-3">Total</th>
                      <th className="text-right font-medium py-2 pl-3 pr-4">% do tempo</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr>td:first-child]:pl-4 [&>tr>td:last-child]:pr-4">
                    {topQ.data.map((q) => (
                      <QueryRow key={q.queryid} q={q} />
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : topQ.error ? (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Falha ao ler as top queries</AlertTitle>
              <AlertDescription>
                {(topQ.error as Error)?.message ?? "Tente atualizar novamente."}
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Sem dados de pg_stat_statements no momento.
            </p>
          )}
        </div>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
