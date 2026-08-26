/**
 * AdminMonitoramentoHistory — aba "Histórico & Picos" do painel de monitoramento.
 *
 * Consome 2 RPCs Supabase (admin-only):
 *  - get_db_health_history(p_from, p_to, p_bucket) → série temporal por bucket
 *  - get_usage_peaks(p_from, p_to)                 → maiores picos do período (jsonb)
 *
 * Séries plotadas (recharts, mesma lib do resto do admin):
 *  - CPU % (avg + max)
 *  - RAM % (avg + max)
 *  - Disco % (avg + max)
 *  - Conexões usadas (avg + max) com linha de referência do teto (conn_max)
 *  - Queries lentas (max_slow_queries) — barrinhas
 *
 * Período → bucket:
 *  - 24h  → '15 minutes'
 *  - 7d   → '1 hour'
 *  - 30d  → '6 hours'
 *
 * react-query com staleTime alto (60s) — histórico não precisa de auto-refresh.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Plug,
  Timer,
  ShieldAlert,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos (espelham o contrato das RPCs)
// ─────────────────────────────────────────────────────────────────────────────
interface HealthHistoryRow {
  bucket_ts: string;
  avg_cpu_pct: number | null;
  max_cpu_pct: number | null;
  avg_mem_pct: number | null;
  max_mem_pct: number | null;
  avg_disk_pct: number | null;
  max_disk_pct: number | null;
  avg_conn_used: number | null;
  max_conn_used: number | null;
  max_slow_queries: number | null;
  samples: number;
}

interface PeakEntry {
  value: number | null;
  captured_at: string | null;
}

interface UsagePeaks {
  from: string;
  to: string;
  samples: number;
  peak_cpu_pct: PeakEntry;
  peak_mem_pct: PeakEntry;
  peak_conn_used: PeakEntry;
  peak_slow_queries: PeakEntry;
}

// Teto de conexões da instância (cliente perguntou "65/160").
const CONN_MAX = 160;

type PeriodKey = "24h" | "7d" | "30d";

const PERIOD_CONFIG: Record<
  PeriodKey,
  { label: string; hours: number; bucket: string }
> = {
  "24h": { label: "24 horas", hours: 24, bucket: "15 minutes" },
  "7d": { label: "7 dias", hours: 24 * 7, bucket: "1 hour" },
  "30d": { label: "30 dias", hours: 24 * 30, bucket: "6 hours" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Formatação pt-BR
// ─────────────────────────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${(decimals === 0 ? nf0 : nf1).format(v)}%`;
}

function fmtInt(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return nf0.format(v);
}

/** Data/hora curta pro eixo X, sensível ao período (dia+hora em janelas longas). */
function fmtAxis(ts: string, period: PeriodKey): string {
  const d = new Date(ts);
  if (period === "24h") return format(d, "HH:mm", { locale: ptBR });
  if (period === "7d") return format(d, "dd/MM HH'h'", { locale: ptBR });
  return format(d, "dd/MM", { locale: ptBR });
}

/** Data/hora completa pro tooltip e cards de pico. */
function fmtFull(ts: string | null): string {
  if (!ts) return "—";
  return format(new Date(ts), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function isPermissionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "42501" ||
    /permission denied|not authorized|acesso/i.test(e.message ?? "")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip customizado (mesmo tratamento visual dos gráficos do admin)
// ─────────────────────────────────────────────────────────────────────────────
function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  unit: "%" | "conn" | "count";
}) {
  if (!active || !payload || !payload.length) return null;
  const fmt = (v: number) =>
    unit === "%" ? fmtPct(v) : fmtInt(v);
  return (
    <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3">
      <p className="font-medium text-sm mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div
          key={entry.name}
          className="flex items-center justify-between gap-4 text-xs"
        >
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="font-medium tabular-nums">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloco de um gráfico de área (avg + max) — usado por CPU/RAM/Disco/Conexões
// ─────────────────────────────────────────────────────────────────────────────
function TimeSeriesAreaChart({
  title,
  icon: Icon,
  data,
  period,
  avgKey,
  maxKey,
  avgName,
  maxName,
  color,
  unit,
  yDomain,
  yFormatter,
  referenceValue,
  referenceLabel,
}: {
  title: string;
  icon: typeof Cpu;
  data: HealthHistoryRow[];
  period: PeriodKey;
  avgKey: keyof HealthHistoryRow;
  maxKey: keyof HealthHistoryRow;
  avgName: string;
  maxName: string;
  color: string;
  unit: "%" | "conn";
  yDomain?: [number | "auto", number | "auto"];
  yFormatter: (v: number) => string;
  referenceValue?: number;
  referenceLabel?: string;
}) {
  const isMobile = useIsMobile();
  const gradId = `grad-${String(maxKey)}`;
  const gradIdAvg = `grad-avg-${String(avgKey)}`;

  const chartData = useMemo(
    () =>
      data.map((r) => ({
        ...r,
        _x: fmtAxis(r.bucket_ts, period),
      })),
    [data, period],
  );

  return (
    <Card className="border shadow-none bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wide">
            {title}
          </span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{
                top: 8,
                right: isMobile ? 6 : 12,
                left: isMobile ? -14 : 0,
                bottom: 0,
              }}
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={gradIdAvg} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.12} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border/50"
              />
              <XAxis
                dataKey="_x"
                tick={{ fontSize: isMobile ? 9 : 11 }}
                className="text-muted-foreground"
                interval="preserveStartEnd"
                minTickGap={isMobile ? 24 : 32}
                height={28}
              />
              <YAxis
                tick={{ fontSize: isMobile ? 9 : 11 }}
                tickFormatter={yFormatter}
                className="text-muted-foreground"
                width={isMobile ? 34 : 44}
                domain={yDomain}
                allowDecimals={false}
              />
              <ReTooltip
                content={(props) => <ChartTooltip {...props} unit={unit} />}
              />
              <Legend
                wrapperStyle={{ fontSize: isMobile ? "10px" : "12px" }}
                iconType="circle"
                iconSize={isMobile ? 8 : 10}
              />
              {typeof referenceValue === "number" && (
                <ReferenceLine
                  y={referenceValue}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: referenceLabel,
                    position: "insideTopRight",
                    fontSize: isMobile ? 9 : 11,
                    fill: "#ef4444",
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey={maxKey as string}
                name={maxName}
                stroke={color}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#${gradId})`}
                connectNulls
                dot={false}
              />
              <Area
                type="monotone"
                dataKey={avgKey as string}
                name={avgName}
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fillOpacity={1}
                fill={`url(#${gradIdAvg})`}
                connectNulls
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloco de barras — queries lentas (max_slow_queries)
// ─────────────────────────────────────────────────────────────────────────────
function SlowQueriesBarChart({
  data,
  period,
}: {
  data: HealthHistoryRow[];
  period: PeriodKey;
}) {
  const isMobile = useIsMobile();
  const chartData = useMemo(
    () =>
      data.map((r) => ({
        ...r,
        _x: fmtAxis(r.bucket_ts, period),
      })),
    [data, period],
  );

  return (
    <Card className="border shadow-none bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Timer className="h-4 w-4 shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wide">
            Queries lentas (máx por período)
          </span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{
                top: 8,
                right: isMobile ? 6 : 12,
                left: isMobile ? -14 : 0,
                bottom: 0,
              }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border/50"
                vertical={false}
              />
              <XAxis
                dataKey="_x"
                tick={{ fontSize: isMobile ? 9 : 11 }}
                className="text-muted-foreground"
                interval="preserveStartEnd"
                minTickGap={isMobile ? 24 : 32}
                height={28}
              />
              <YAxis
                tick={{ fontSize: isMobile ? 9 : 11 }}
                className="text-muted-foreground"
                width={isMobile ? 30 : 40}
                allowDecimals={false}
              />
              <ReTooltip
                content={(props) => <ChartTooltip {...props} unit="count" />}
              />
              <Bar
                dataKey="max_slow_queries"
                name="Queries lentas"
                fill="#f59e0b"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card de pico — mesmo tratamento sólido/limpo dos cards de saúde
// ─────────────────────────────────────────────────────────────────────────────
function PeakCard({
  icon: Icon,
  label,
  value,
  when,
  solid,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  when: string;
  solid: string;
}) {
  return (
    <Card className="border shadow-none bg-card overflow-hidden">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-white shrink-0",
              solid,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-xs font-medium uppercase tracking-wide truncate">
            {label}
          </span>
        </div>
        <div className="text-2xl font-bold tabular-nums text-foreground">
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{when}</p>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal da aba
// ─────────────────────────────────────────────────────────────────────────────
const HISTORY_STALE = 60_000;
// Abaixo disso, a coleta (a cada 2min) ainda não juntou pontos suficientes pra
// desenhar uma série útil.
const MIN_SAMPLES = 3;

export default function AdminMonitoramentoHistory() {
  const [period, setPeriod] = useState<PeriodKey>("24h");

  const { from, to, bucket } = useMemo(() => {
    const now = new Date();
    const cfg = PERIOD_CONFIG[period];
    const fromDate = new Date(now.getTime() - cfg.hours * 3600_000);
    return {
      from: fromDate.toISOString(),
      to: now.toISOString(),
      bucket: cfg.bucket,
    };
  }, [period]);

  const historyQ = useQuery<HealthHistoryRow[]>({
    queryKey: ["admin-db-history", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_db_health_history" as any,
        { p_from: from, p_to: to, p_bucket: bucket },
      );
      if (error) throw error;
      return (data ?? []) as unknown as HealthHistoryRow[];
    },
    staleTime: HISTORY_STALE,
    refetchOnWindowFocus: false,
    retry: (count, err) => !isPermissionError(err) && count < 2,
  });

  const peaksQ = useQuery<UsagePeaks>({
    queryKey: ["admin-db-peaks", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_usage_peaks" as any, {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return data as unknown as UsagePeaks;
    },
    staleTime: HISTORY_STALE,
    refetchOnWindowFocus: false,
    retry: (count, err) => !isPermissionError(err) && count < 2,
  });

  const rows = historyQ.data ?? [];
  const totalSamples = rows.reduce((s, r) => s + Number(r.samples ?? 0), 0);
  const isLoading = historyQ.isLoading || peaksQ.isLoading;
  const hasError = historyQ.error || peaksQ.error;
  const notEnoughData = !isLoading && !hasError && totalSamples < MIN_SAMPLES;

  const peaks = peaksQ.data;

  return (
    <div className="space-y-5">
      {/* Seletor de período */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md bg-muted p-1">
          {(Object.keys(PERIOD_CONFIG) as PeriodKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPeriod(k)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-sm transition-all",
                period === k
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {PERIOD_CONFIG[k].label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" />
          Agrupado por {PERIOD_CONFIG[period].bucket.replace("minutes", "min").replace("hour", "h").replace("hours", "h")}
          {totalSamples > 0 && <> · {fmtInt(totalSamples)} amostras</>}
        </p>
      </div>

      {/* Erro de permissão / falha */}
      {hasError ? (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Falha ao ler o histórico</AlertTitle>
          <AlertDescription>
            {(historyQ.error as Error)?.message ??
              (peaksQ.error as Error)?.message ??
              "Tente atualizar novamente."}
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full rounded-xl" />
            ))}
          </div>
        </>
      ) : notEnoughData ? (
        <Card className="border shadow-none bg-card">
          <CardContent className="p-10 flex flex-col items-center text-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Timer className="h-6 w-6" />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                Coletando dados…
              </p>
              <p className="text-sm text-muted-foreground max-w-md">
                O histórico é coletado a cada 2 minutos. Ainda há poucas
                amostras neste período — volte em alguns minutos para ver os
                gráficos e picos.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── MAIORES PICOS DO PERÍODO ─────────────────────────────────── */}
          {peaks && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Maiores picos do período
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <PeakCard
                  icon={Cpu}
                  label="CPU máxima"
                  value={fmtPct(peaks.peak_cpu_pct?.value)}
                  when={fmtFull(peaks.peak_cpu_pct?.captured_at)}
                  solid="bg-rose-500"
                />
                <PeakCard
                  icon={MemoryStick}
                  label="RAM máxima"
                  value={fmtPct(peaks.peak_mem_pct?.value)}
                  when={fmtFull(peaks.peak_mem_pct?.captured_at)}
                  solid="bg-violet-500"
                />
                <PeakCard
                  icon={Plug}
                  label="Conexões máx"
                  value={
                    typeof peaks.peak_conn_used?.value === "number"
                      ? `${fmtInt(peaks.peak_conn_used.value)} / ${fmtInt(CONN_MAX)}`
                      : "—"
                  }
                  when={fmtFull(peaks.peak_conn_used?.captured_at)}
                  solid="bg-blue-500"
                />
                <PeakCard
                  icon={Timer}
                  label="Queries lentas máx"
                  value={fmtInt(peaks.peak_slow_queries?.value)}
                  when={fmtFull(peaks.peak_slow_queries?.captured_at)}
                  solid="bg-amber-500"
                />
              </div>
            </div>
          )}

          {/* ── GRÁFICOS DE SÉRIE TEMPORAL ───────────────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Evolução ao longo do tempo
            </h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <TimeSeriesAreaChart
                title="CPU %"
                icon={Cpu}
                data={rows}
                period={period}
                avgKey="avg_cpu_pct"
                maxKey="max_cpu_pct"
                avgName="Média"
                maxName="Pico"
                color="#f43f5e"
                unit="%"
                yDomain={[0, 100]}
                yFormatter={(v) => `${nf0.format(v)}%`}
              />
              <TimeSeriesAreaChart
                title="RAM %"
                icon={MemoryStick}
                data={rows}
                period={period}
                avgKey="avg_mem_pct"
                maxKey="max_mem_pct"
                avgName="Média"
                maxName="Pico"
                color="#8b5cf6"
                unit="%"
                yDomain={[0, 100]}
                yFormatter={(v) => `${nf0.format(v)}%`}
              />
              <TimeSeriesAreaChart
                title="Disco %"
                icon={HardDrive}
                data={rows}
                period={period}
                avgKey="avg_disk_pct"
                maxKey="max_disk_pct"
                avgName="Média"
                maxName="Pico"
                color="#10b981"
                unit="%"
                yDomain={[0, 100]}
                yFormatter={(v) => `${nf0.format(v)}%`}
              />
              <TimeSeriesAreaChart
                title="Conexões usadas"
                icon={Plug}
                data={rows}
                period={period}
                avgKey="avg_conn_used"
                maxKey="max_conn_used"
                avgName="Média"
                maxName="Pico"
                color="#3b82f6"
                unit="conn"
                yDomain={[0, "auto"]}
                yFormatter={(v) => nf0.format(v)}
                referenceValue={CONN_MAX}
                referenceLabel={`Teto ${fmtInt(CONN_MAX)}`}
              />
              <SlowQueriesBarChart data={rows} period={period} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
