import { useMemo, useState } from 'react';
import {
  Star, TrendingUp, Users, MessageSquare, ThumbsUp, Minus, ThumbsDown,
  Trophy, AlertTriangle, Filter, Settings,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { useServiceRatings, calculateNps, classifyNps } from '@/hooks/useServiceRatings';
import { useNpsTechnicianRanking, useNpsOpenDetractors } from '@/hooks/useNpsRanking';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { NpsSettingsModal } from '@/components/service-orders/NpsSettingsModal';
import { idealForeground } from '@/lib/colorContrast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar,
} from 'recharts';

const NPS_COLORS = { promoter: '#22c55e', passive: '#f59e0b', detractor: '#ef4444' };

/** Iniciais pro fallback de avatar. */
function initials(name?: string | null) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}

const PODIUM_COLORS = ['#facc15', '#cbd5e1', '#d97706']; // ouro, prata, bronze

function NpsGauge({ nps }: { nps: number }) {
  const angle = ((nps + 100) / 200) * 180;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-24 overflow-hidden">
        <svg viewBox="0 0 200 100" className="w-full h-full">
          <path d="M 10 95 A 85 85 0 0 1 190 95" fill="none" stroke="hsl(var(--muted))" strokeWidth="16" strokeLinecap="round" />
          <path d="M 10 95 A 85 85 0 0 1 190 95" fill="none" stroke="url(#npsGradient)" strokeWidth="16" strokeLinecap="round"
            strokeDasharray={`${(angle / 180) * 267} 267`} />
          <defs>
            <linearGradient id="npsGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <span className="text-4xl font-bold -mt-4">{nps}</span>
      <span className="text-sm text-muted-foreground">NPS Score</span>
    </div>
  );
}

export function NpsDashboard() {
  const { ratings, isLoading } = useServiceRatings();
  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');

  const { data: ranking = [], isLoading: rankingLoading } = useNpsTechnicianRanking(range.from, range.to);
  const { data: openDetractors = [], isLoading: detractorsLoading } = useNpsOpenDetractors(range.from, range.to);

  // Filtros do feed (multi-seleção; vazio = mostra tudo)
  const [feedClasses, setFeedClasses] = useState<string[]>([]);
  const [feedTechs, setFeedTechs] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const filteredRatings = useMemo(() => {
    const answered = ratings.filter((r) => r.rated_at);
    return filterByDate(answered, 'rated_at');
  }, [ratings, range]);

  const npsData = useMemo(() => calculateNps(filteredRatings), [filteredRatings]);

  const avgStars = useMemo(() => {
    const rated = filteredRatings.filter((r) => r.quality_rating);
    if (rated.length === 0) return { quality: 0, punctuality: 0, professionalism: 0 };
    return {
      quality: +(rated.reduce((s, r) => s + (r.quality_rating || 0), 0) / rated.length).toFixed(1),
      punctuality: +(rated.reduce((s, r) => s + (r.punctuality_rating || 0), 0) / rated.length).toFixed(1),
      professionalism: +(rated.reduce((s, r) => s + (r.professionalism_rating || 0), 0) / rated.length).toFixed(1),
    };
  }, [filteredRatings]);

  const responseRate = useMemo(() => {
    const total = ratings.length;
    const answered = ratings.filter((r) => r.rated_at).length;
    return total > 0 ? Math.round((answered / total) * 100) : 0;
  }, [ratings]);

  // Monthly NPS trend
  const trendData = useMemo(() => {
    const byMonth: Record<string, { nps_score: number | null }[]> = {};
    filteredRatings.forEach((r) => {
      if (!r.rated_at) return;
      const key = format(new Date(r.rated_at), 'yyyy-MM');
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(r);
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, items]) => ({
        month: format(new Date(month + '-01'), 'MMM/yy', { locale: ptBR }),
        nps: calculateNps(items).nps,
        count: items.length,
      }));
  }, [filteredRatings]);

  // Pie data
  const pieData = [
    { name: 'Promotores', value: npsData.promoters, color: NPS_COLORS.promoter },
    { name: 'Neutros', value: npsData.passives, color: NPS_COLORS.passive },
    { name: 'Detratores', value: npsData.detractors, color: NPS_COLORS.detractor },
  ].filter((d) => d.value > 0);

  // Star distribution
  const starDistribution = [
    { category: 'Qualidade', avg: avgStars.quality },
    { category: 'Pontualidade', avg: avgStars.punctuality },
    { category: 'Profissionalismo', avg: avgStars.professionalism },
  ];

  // Feed de feedbacks — avaliações com nota NPS, ordenadas por data desc.
  const feedSource = useMemo(
    () =>
      filteredRatings
        .filter((r) => r.nps_score !== null)
        .sort((a, b) => (b.rated_at || '').localeCompare(a.rated_at || '')),
    [filteredRatings],
  );

  // Opções de técnico pro filtro do feed (a partir das avaliações do período).
  const techOptions = useMemo(() => {
    const map = new Map<string, string>();
    feedSource.forEach((r) => {
      if (r.technician_id) map.set(r.technician_id, r.technician_name || 'Sem nome');
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [feedSource]);

  const filteredFeed = useMemo(() => {
    return feedSource.filter((r) => {
      const cls = r.nps_score !== null ? classifyNps(r.nps_score) : null;
      if (feedClasses.length > 0 && (!cls || !feedClasses.includes(cls))) return false;
      if (feedTechs.length > 0 && (!r.technician_id || !feedTechs.includes(r.technician_id))) return false;
      return true;
    });
  }, [feedSource, feedClasses, feedTechs]);

  const feedFiltersActive = feedClasses.length + feedTechs.length;

  // Ranking partido em pódio (top 3) + resto. "Precisam de atenção" = piores
  // NPS médio (últimos da lista, que já vem ordenada desc pela RPC).
  const podium = ranking.slice(0, 3);
  const restRanking = ranking.slice(3);
  const attentionId = ranking.length > 0 ? ranking[ranking.length - 1].user_id : null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <DateRangeFilter
          value={range}
          preset={preset}
          onPresetChange={setPreset}
          onRangeChange={setRange}
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-9 shrink-0"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline">Configurações</span>
        </Button>
      </div>

      <NpsSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full p-2 bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">NPS Score</p>
                <p className="text-2xl font-bold">{npsData.nps}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full p-2 bg-warning/10">
                <Star className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Média Geral</p>
                <p className="text-2xl font-bold">
                  {avgStars.quality > 0 ? ((avgStars.quality + avgStars.punctuality + avgStars.professionalism) / 3).toFixed(1) : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full p-2 bg-info/10">
                <Users className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Respostas</p>
                <p className="text-2xl font-bold">{npsData.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full p-2 bg-success/10">
                <MessageSquare className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Taxa de Resposta</p>
                <p className="text-2xl font-bold">{responseRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* NPS Gauge + Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Distribuição NPS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <NpsGauge nps={npsData.nps} />
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <ThumbsUp className="h-4 w-4 text-success" />
                  <span>Promotores: {npsData.total > 0 ? Math.round((npsData.promoters / npsData.total) * 100) : 0}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Minus className="h-4 w-4 text-warning" />
                  <span>Neutros: {npsData.total > 0 ? Math.round((npsData.passives / npsData.total) * 100) : 0}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ThumbsDown className="h-4 w-4 text-destructive" />
                  <span>Detratores: {npsData.total > 0 ? Math.round((npsData.detractors / npsData.total) * 100) : 0}%</span>
                </div>
              </div>
              {pieData.length > 0 && (
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <defs>
                      {pieData.map((entry, i) => (
                        <linearGradient key={i} id={`nps-grad-pie-${i}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={entry.color} stopOpacity={1.0} />
                          <stop offset="100%" stopColor={entry.color} stopOpacity={0.55} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={`url(#nps-grad-pie-${i})`} stroke={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Star Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Média por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {avgStars.quality > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={starDistribution} layout="vertical">
                  <defs>
                    {/* Gradient horizontal (eixo X) pra barras layout="vertical" */}
                    <linearGradient id="nps-grad-warning-horizontal" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} />
                  <YAxis type="category" dataKey="category" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="avg" fill="url(#nps-grad-warning-horizontal)" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                Nenhuma avaliação no período
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* NPS Trend */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tendência NPS</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <defs>
                  <linearGradient id="nps-grad-line-success" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(160, 100%, 39%)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="hsl(160, 100%, 39%)" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis domain={[-100, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="nps"
                  stroke="url(#nps-grad-line-success)"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: 'hsl(160, 100%, 39%)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Ranking de Técnicos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" />
            Ranking de Técnicos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rankingLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sem avaliações por técnico no período
            </p>
          ) : (
            <div className="space-y-5">
              {/* Pódio top 3 */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {podium.map((t, i) => (
                  <div
                    key={t.user_id}
                    className="flex flex-col items-center text-center rounded-xl border p-3 bg-muted/30"
                  >
                    <div className="relative">
                      <Avatar className="h-12 w-12 sm:h-14 sm:w-14 ring-2" style={{ '--tw-ring-color': PODIUM_COLORS[i] } as React.CSSProperties}>
                        <AvatarImage src={t.avatar_url || undefined} />
                        <AvatarFallback>{initials(t.full_name)}</AvatarFallback>
                      </Avatar>
                      <span
                        className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{ backgroundColor: PODIUM_COLORS[i], color: idealForeground(PODIUM_COLORS[i]) }}
                      >
                        {i + 1}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-medium truncate w-full" title={t.full_name || ''}>
                      {t.full_name || 'Sem nome'}
                    </p>
                    <p className="text-lg font-bold leading-tight">{t.nps_medio ?? '—'}</p>
                    <p className="text-[10px] text-muted-foreground">NPS médio</p>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Star className="h-3 w-3 fill-warning text-warning" />
                      {t.media_estrelas ?? '—'}
                      <span className="mx-0.5">·</span>
                      {t.respostas} resp.
                    </div>
                  </div>
                ))}
              </div>

              {/* Restante da lista */}
              {restRanking.length > 0 && (
                <div className="rounded-xl border divide-y divide-border/60">
                  {restRanking.map((t, i) => {
                    const isAttention = t.user_id === attentionId && (t.nps_medio ?? 0) <= 6;
                    return (
                      <div
                        key={t.user_id}
                        className={`flex items-center gap-3 px-3 py-2.5 ${isAttention ? 'bg-destructive/5' : ''}`}
                      >
                        <span className="w-5 text-center text-xs font-semibold text-muted-foreground">
                          {i + 4}
                        </span>
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={t.avatar_url || undefined} />
                          <AvatarFallback>{initials(t.full_name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.full_name || 'Sem nome'}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {t.respostas} respostas · {Math.round((t.taxa_resposta ?? 0) * 100)}% de retorno
                          </p>
                        </div>
                        {isAttention && (
                          <Badge variant="outline" className="border-destructive text-destructive gap-1 shrink-0">
                            <AlertTriangle className="h-3 w-3" />
                            Atenção
                          </Badge>
                        )}
                        <div className="flex items-center gap-1 shrink-0">
                          <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                          <span className="text-xs text-muted-foreground w-7 text-right">{t.media_estrelas ?? '—'}</span>
                          <span className="ml-2 text-base font-bold w-8 text-right">{t.nps_medio ?? '—'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detratores em aberto */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Detratores em Aberto
            {openDetractors.length > 0 && (
              <Badge variant="outline" className="border-destructive text-destructive ml-1">
                {openDetractors.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detractorsLoading ? (
            <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : openDetractors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum detrator em aberto no período. 🎉
            </p>
          ) : (
            <div className="space-y-3">
              {openDetractors.map((d) => (
                <div key={d.os_id} className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs text-muted-foreground shrink-0">OS #{d.order_number}</span>
                      <span className="text-sm font-medium truncate">{d.customer_name || 'Cliente'}</span>
                    </div>
                    <Badge
                      className="shrink-0"
                      style={{ backgroundColor: NPS_COLORS.detractor, color: idealForeground(NPS_COLORS.detractor) }}
                    >
                      NPS: {d.nps_score}
                    </Badge>
                  </div>
                  {d.comment && <p className="text-sm text-foreground/80">{d.comment}</p>}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    {d.technician_name && <span>Técnico: {d.technician_name}</span>}
                    {d.rated_by_name && <span>• {d.rated_by_name}</span>}
                    <span>• {format(new Date(d.rated_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feed de Feedbacks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-info" />
            Feed de Feedbacks
          </CardTitle>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-9">
                <Filter className="h-4 w-4 text-muted-foreground" />
                Filtros
                {feedFiltersActive > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[11px]">{feedFiltersActive}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-4" align="end">
              <FilterCheckboxGroup
                label="Classificação"
                emptyLabel="Todas"
                options={[
                  { value: 'promoter', label: 'Promotores (9-10)', color: NPS_COLORS.promoter },
                  { value: 'passive', label: 'Neutros (7-8)', color: NPS_COLORS.passive },
                  { value: 'detractor', label: 'Detratores (0-6)', color: NPS_COLORS.detractor },
                ]}
                selected={feedClasses}
                onChange={setFeedClasses}
              />
              <FilterCheckboxGroup
                label="Técnico"
                emptyLabel="Todos"
                options={techOptions}
                selected={feedTechs}
                onChange={setFeedTechs}
              />
            </PopoverContent>
          </Popover>
        </CardHeader>
        <CardContent>
          {filteredFeed.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {feedFiltersActive > 0 ? 'Nenhum feedback com esses filtros' : 'Nenhum feedback no período'}
            </p>
          ) : (
            <div className="space-y-4">
              {filteredFeed.map((r) => {
                const classification = r.nps_score !== null ? classifyNps(r.nps_score) : null;
                return (
                  <div key={r.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          OS #{r.service_order?.order_number}
                        </span>
                        <span className="text-sm font-medium truncate">{r.service_order?.customer?.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {classification && (
                          <Badge
                            variant="outline"
                            className={
                              classification === 'promoter'
                                ? 'border-success text-success'
                                : classification === 'detractor'
                                ? 'border-destructive text-destructive'
                                : 'border-warning text-warning'
                            }
                          >
                            NPS: {r.nps_score}
                          </Badge>
                        )}
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`h-3 w-3 ${s <= (r.quality_rating || 0) ? 'fill-warning text-warning' : 'text-muted-foreground/20'}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    {r.comment && <p className="text-sm text-foreground/80">{r.comment}</p>}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      {r.technician_name && <span>Técnico: {r.technician_name}</span>}
                      {r.rated_by_name && <span>• {r.rated_by_name}</span>}
                      {r.rated_at && <span>• {format(new Date(r.rated_at), 'dd/MM/yyyy', { locale: ptBR })}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
