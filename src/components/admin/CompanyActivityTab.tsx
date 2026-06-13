import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Award, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';

interface Props {
  companyId: string;
}

interface UsageEvent {
  id: string;
  created_at: string;
  event_type: string;
  metadata: Record<string, any> | null;
  user_id: string | null;
}

interface EventAuthor {
  name: string;
  avatarUrl: string | null;
  email: string | null;
  role: string | null;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  login: 'Login',
  page_view: 'Visualização',
  sale: 'Venda',
  os_completion: 'OS concluída',
};

// Tradução dos perfis (user_roles.role) pra PT-BR legível.
const ROLE_LABELS: Record<string, string> = {
  tecnico: 'Técnico',
  admin: 'Administrador',
  super_admin: 'Super Admin',
};

// Hierarquia pra escolher o perfil "mais alto" quando o usuário tem vários.
const ROLE_RANK: Record<string, number> = {
  super_admin: 3,
  admin: 2,
  tecnico: 1,
};

function getRoleLabel(role: string | null): string | null {
  if (!role) return null;
  return ROLE_LABELS[role] ?? role;
}

const PATH_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/agenda': 'Agenda',
  '/ordens-servico': 'Ordens de Serviço',
  '/ponto': 'Ponto Eletrônico',
  '/mapa-ao-vivo': 'Mapa e Rastreamento',
  '/orcamentos': 'Orçamentos',
  '/clientes': 'Clientes',
  '/servicos': 'Serviços',
  '/equipamentos': 'Equipamentos',
  '/estoque': 'Estoque',
  '/funcionarios': 'Funcionários',
  '/contratos': 'Contratos',
  '/crm': 'CRM',
  '/financeiro': 'Financeiro — Visão Geral',
  '/financeiro/movimentacoes': 'Financeiro — Movimentações',
  '/financeiro/contas': 'Financeiro — Contas',
  '/financeiro/caixas-bancos': 'Financeiro — Contas e Cartões',
  '/financeiro/dre': 'Financeiro — DRE',
  '/financeiro/configuracoes': 'Financeiro — Configurações',
  '/configuracoes': 'Configurações',
  '/perfil': 'Perfil',
  '/assinatura': 'Assinatura',
  '/domiflix': 'Domiflix',
};

function getPathLabel(path: string): string {
  if (PATH_LABELS[path]) return PATH_LABELS[path];
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return path;
  return segments[0]
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ScoreCategory {
  label: string;
  bg: string;
  text: string;
  badge: string;
}

function getScoreCategory(score: number): ScoreCategory {
  if (score >= 61) {
    return {
      label: 'Alto',
      bg: 'bg-green-600',
      text: 'text-green-600',
      badge: 'bg-green-600 text-white hover:bg-green-600',
    };
  }
  if (score >= 31) {
    return {
      label: 'Médio',
      bg: 'bg-yellow-500',
      text: 'text-yellow-600',
      badge: 'bg-yellow-500 text-white hover:bg-yellow-500',
    };
  }
  return {
    label: 'Baixo',
    bg: 'bg-red-600',
    text: 'text-red-600',
    badge: 'bg-red-600 text-white hover:bg-red-600',
  };
}

export function CompanyActivityTab({ companyId }: Props) {
  const [periodDays, setPeriodDays] = useState<number>(30);

  const { data: events, isLoading } = useQuery({
    queryKey: ['usage_events', companyId, periodDays],
    queryFn: async () => {
      const since = subDays(new Date(), periodDays).toISOString();
      const { data, error } = await supabase
        .from('usage_events')
        .select('id, created_at, event_type, metadata, user_id')
        .eq('company_id', companyId)
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as UsageEvent[];
    },
    enabled: !!companyId,
  });

  const recent = useMemo(() => (events ?? []).slice(0, 20), [events]);

  // IDs distintos dos autores que aparecem na lista "Últimos eventos".
  const authorIds = useMemo(() => {
    const ids = new Set<string>();
    recent.forEach((e) => {
      if (e.user_id) ids.add(e.user_id);
    });
    return Array.from(ids).sort();
  }, [recent]);

  // Fetch agregado (sem N+1): perfis + roles dos autores da página.
  const { data: authorMap } = useQuery({
    queryKey: ['usage_event_authors', authorIds],
    queryFn: async () => {
      const map = new Map<string, EventAuthor>();
      if (authorIds.length === 0) return map;

      const [profilesRes, rolesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url, email')
          .in('user_id', authorIds),
        supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', authorIds),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      // Escolhe o perfil mais alto por usuário.
      const topRole = new Map<string, string>();
      (rolesRes.data ?? []).forEach((r) => {
        const current = topRole.get(r.user_id);
        if (!current || (ROLE_RANK[r.role] ?? 0) > (ROLE_RANK[current] ?? 0)) {
          topRole.set(r.user_id, r.role);
        }
      });

      (profilesRes.data ?? []).forEach((p) => {
        map.set(p.user_id, {
          name: (p.full_name || '').trim() || 'Usuário',
          avatarUrl: p.avatar_url ?? null,
          email: p.email ?? null,
          role: topRole.get(p.user_id) ?? null,
        });
      });
      return map;
    },
    enabled: authorIds.length > 0,
  });

  const totalEvents = events?.length ?? 0;

  const activeDays = useMemo(() => {
    if (!events) return 0;
    const days = new Set(
      events.map((e) => format(new Date(e.created_at), 'yyyy-MM-dd'))
    );
    return days.size;
  }, [events]);

  const engagementRate =
    periodDays > 0 ? Math.round((activeDays / periodDays) * 100) : 0;

  const activityScore = useMemo(() => {
    const engagement = engagementRate;
    const avgEventsPerDay = activeDays > 0 ? totalEvents / activeDays : 0;
    const VOLUME_CAP = 20;
    const volume = Math.min(
      100,
      Math.round((avgEventsPerDay / VOLUME_CAP) * 100)
    );
    const uniqueEventTypes = new Set(events?.map((e) => e.event_type) ?? []).size;
    const DIVERSITY_CAP = 4;
    const diversity = Math.min(
      100,
      Math.round((uniqueEventTypes / DIVERSITY_CAP) * 100)
    );
    return Math.round(0.4 * engagement + 0.4 * volume + 0.2 * diversity);
  }, [engagementRate, totalEvents, activeDays, events]);

  const scoreCategory = getScoreCategory(activityScore);

  const topPaths = useMemo(() => {
    if (!events) return [];
    const pathCounts: Record<string, number> = {};
    events
      .filter((e) => e.event_type === 'page_view' && e.metadata?.path)
      .forEach((e) => {
        const path = e.metadata!.path as string;
        pathCounts[path] = (pathCounts[path] || 0) + 1;
      });
    const sorted = Object.entries(pathCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    const maxCount = sorted[0]?.[1] ?? 1;
    return sorted.map(([path, count]) => ({
      path,
      count,
      label: getPathLabel(path),
      percentage: Math.round((count / maxCount) * 100),
    }));
  }, [events]);

  const chartData = useMemo(() => {
    if (!events) return [];
    const counts: Record<string, number> = {};
    events.forEach((e) => {
      const day = format(new Date(e.created_at), 'yyyy-MM-dd');
      counts[day] = (counts[day] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({
        day,
        label: format(new Date(day), 'dd/MM', { locale: ptBR }),
        fullDate: format(new Date(day), 'dd/MM/yyyy', { locale: ptBR }),
        count,
      }));
  }, [events]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40 ml-auto" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex justify-end">
        <Select
          value={String(periodDays)}
          onValueChange={(v) => setPeriodDays(Number(v))}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="14">Últimos 14 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="60">Últimos 60 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total de eventos</p>
            <p className="text-2xl font-bold">{totalEvents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Dias ativos</p>
            <p className="text-2xl font-bold">
              {activeDays} / {periodDays}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Taxa de engajamento</p>
            <p className="text-2xl font-bold">{engagementRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Pontuação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between mb-2">
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-bold ${scoreCategory.text}`}>
                  {activityScore}
                </span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </div>
              <Badge className={scoreCategory.badge}>
                {scoreCategory.label}
              </Badge>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${scoreCategory.bg} transition-all`}
                style={{ width: `${activityScore}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Atividade por dia</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              Nenhuma atividade registrada ainda. Os eventos aparecerão aqui
              assim que a empresa começar a usar o sistema.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                {/* Bar vertical — gradient 95%→40% (pattern Dominex). */}
                <defs>
                  <linearGradient id="gradActivityBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip
                  formatter={(v: number) => [v, 'Eventos']}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.fullDate ?? ''
                  }
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                />
                <Bar
                  dataKey="count"
                  fill="url(#gradActivityBar)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top paths */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Telas mais acessadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topPaths.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma navegação registrada neste período.
            </p>
          ) : (
            <div className="space-y-2">
              {topPaths.map((item) => (
                <div key={item.path} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate flex-1 pr-2">
                      {item.label}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {item.count}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent events */}
      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Últimos eventos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {recent.map((e) => {
                const author = e.user_id
                  ? authorMap?.get(e.user_id)
                  : undefined;
                const authorName = author?.name ?? 'Sistema';
                const roleLabel = getRoleLabel(author?.role ?? null);

                return (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    {/* Autor: foto + nome sempre visível (mobile-first). */}
                    <HoverCard openDelay={120} closeDelay={80}>
                      <HoverCardTrigger asChild>
                        <div className="flex items-center gap-1.5 min-w-0 max-w-[40%] cursor-default">
                          <SalespersonAvatar
                            name={authorName}
                            photoUrl={author?.avatarUrl}
                            size="sm"
                            className="shrink-0"
                          />
                          <span className="text-xs font-medium truncate">
                            {authorName}
                          </span>
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-64" align="start">
                        <div className="flex items-start gap-3">
                          <SalespersonAvatar
                            name={authorName}
                            photoUrl={author?.avatarUrl}
                            size="md"
                            className="shrink-0"
                          />
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-semibold truncate">
                              {authorName}
                            </p>
                            {author?.email && (
                              <p className="text-xs text-muted-foreground truncate">
                                {author.email}
                              </p>
                            )}
                            {roleLabel && (
                              <Badge variant="secondary" className="mt-1">
                                {roleLabel}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </HoverCardContent>
                    </HoverCard>

                    <Badge variant="secondary" className="shrink-0">
                      {EVENT_TYPE_LABELS[e.event_type] || e.event_type}
                    </Badge>
                    {e.metadata?.path && (
                      <span className="text-xs text-muted-foreground flex-1 truncate hidden sm:inline">
                        {e.metadata.path}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(e.created_at), 'dd/MM HH:mm', {
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
