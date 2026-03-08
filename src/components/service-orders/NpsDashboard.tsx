import { useMemo } from 'react';
import { Star, TrendingUp, Users, MessageSquare, ThumbsUp, Minus, ThumbsDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useServiceRatings, calculateNps, classifyNps } from '@/hooks/useServiceRatings';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar,
} from 'recharts';

const NPS_COLORS = { promoter: '#22c55e', passive: '#f59e0b', detractor: '#ef4444' };

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

  // Recent comments
  const recentComments = filteredRatings
    .filter((r) => r.comment)
    .slice(0, 10);

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
      <DateRangeFilter
        value={range}
        preset={preset}
        onPresetChange={setPreset}
        onRangeChange={setRange}
      />

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
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
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
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} />
                  <YAxis type="category" dataKey="category" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="avg" fill="hsl(38, 92%, 50%)" radius={[0, 4, 4, 0]} barSize={24} />
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
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis domain={[-100, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="nps" stroke="hsl(160, 100%, 39%)" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent Comments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Comentários Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentComments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum comentário no período</p>
          ) : (
            <div className="space-y-4">
              {recentComments.map((r) => {
                const classification = r.nps_score !== null ? classifyNps(r.nps_score) : null;
                return (
                  <div key={r.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          OS #{r.service_order?.order_number}
                        </span>
                        <span className="text-sm font-medium">{r.service_order?.customer?.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
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
                    <p className="text-sm text-foreground/80">{r.comment}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.rated_by_name && <span>— {r.rated_by_name}</span>}
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
