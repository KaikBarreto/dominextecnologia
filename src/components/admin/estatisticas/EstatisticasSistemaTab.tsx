import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Minus,
  MoonStar,
  Search,
  ShieldAlert,
  Users,
  Zap,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn, fuzzyIncludes } from '@/lib/utils';
import { typography } from '@/lib/typography';
import {
  useAdminUsageStatistics,
  usagePeriodRange,
  bucketSugerido,
  isPermissionError,
  variacaoPct,
  USAGE_BUCKET_LABELS,
  USAGE_METRIC_LABELS,
  USAGE_METRIC_ORDER,
  USAGE_PERIOD_LABELS,
  type UsageBucket,
  type UsageMetricKey,
  type UsagePeriodPreset,
  type UsageRankingRow,
} from '@/hooks/useAdminUsageStatistics';
import { useCompanyHealthScores, getHealthBadgeConfig } from '@/hooks/useCompanyHealthScore';

/**
 * Aba "Sistema" de /admin/estatisticas — uso agregado de TODA a base.
 *
 * A pergunta que esta tela responde é "quem parou de usar?". Por isso:
 *   - o delta contra o período anterior vem PRONTO da RPC (campo `anterior`) e
 *     nunca é recalculado aqui;
 *   - a classificação de saúde (Saudável/Atenção/Em Risco/Inativo) vem de
 *     `useCompanyHealthScores`, fonte ÚNICA dessa regra. `dias_sem_atividade`
 *     é mostrado como número cru, sem faixa de cor inventada — duas definições
 *     de "empresa em risco" seria uma delas apodrecendo em silêncio.
 *
 * PT-BR chumbado: painel Auctus não entra no i18n de 4 idiomas.
 */

const fmtInt = (n: number | null | undefined) =>
  n == null ? '-' : n.toLocaleString('pt-BR');

const STATUS_ASSINATURA: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativa', className: 'bg-emerald-500 text-white hover:bg-emerald-500' },
  testing: { label: 'Testando', className: 'bg-blue-500 text-white hover:bg-blue-500' },
  inactive: { label: 'Inativa', className: 'bg-red-500 text-white hover:bg-red-500' },
  overdue: { label: 'Em atraso', className: 'bg-amber-500 text-white hover:bg-amber-500' },
  cancelled: { label: 'Cancelada', className: 'bg-gray-500 text-white hover:bg-gray-500' },
};

function StatusAssinaturaBadge({ status }: { status: string | null }) {
  const cfg = STATUS_ASSINATURA[status ?? ''] ?? {
    label: status ?? 'Sem status',
    className: 'bg-gray-500 text-white hover:bg-gray-500',
  };
  return <Badge className={cn('border-0 font-medium', cfg.className)}>{cfg.label}</Badge>;
}

/** Card saturado do painel admin (mesma linguagem do AdminDashboardStats). */
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  bg,
  iconBg,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  bg: string;
  iconBg: string;
}) {
  return (
    <Card className={cn('relative overflow-hidden border-0 shadow-lg text-white', bg)}>
      <CardContent className="p-4 lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs lg:text-sm font-medium text-white/80">{title}</p>
            <p className="text-xl lg:text-2xl font-bold tracking-tight tabular-nums">{value}</p>
            {subtitle && <p className="text-xs text-white/75">{subtitle}</p>}
          </div>
          <div className={cn('p-2 rounded-xl shrink-0', iconBg)}>
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Selo de variação: verde subiu, vermelho caiu, cinza estável. Sempre saturado. */
function DeltaBadge({ atual, anterior }: { atual: number; anterior: number }) {
  const pct = variacaoPct(atual, anterior);
  const diff = atual - anterior;

  if (anterior === 0 && atual === 0) {
    return (
      <Badge className="border-0 bg-gray-500 text-white hover:bg-gray-500 gap-1 font-medium">
        <Minus className="h-3 w-3" />
        sem base
      </Badge>
    );
  }
  if (anterior === 0) {
    return (
      <Badge className="border-0 bg-emerald-500 text-white hover:bg-emerald-500 gap-1 font-medium">
        <ArrowUpRight className="h-3 w-3" />
        novo
      </Badge>
    );
  }

  const subiu = diff > 0;
  const estavel = diff === 0;
  const Icone = estavel ? Minus : subiu ? ArrowUpRight : ArrowDownRight;
  const cor = estavel
    ? 'bg-gray-500 hover:bg-gray-500'
    : subiu
      ? 'bg-emerald-500 hover:bg-emerald-500'
      : 'bg-red-500 hover:bg-red-500';

  return (
    <Badge className={cn('border-0 text-white gap-1 font-medium tabular-nums', cor)}>
      <Icone className="h-3 w-3" />
      {pct == null ? '-' : `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`}
    </Badge>
  );
}

type OrdemRanking = 'uso' | 'parado';

export function EstatisticasSistemaTab() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [preset, setPreset] = useState<UsagePeriodPreset>('this_month');
  const [bucket, setBucket] = useState<UsageBucket>(() => bucketSugerido('this_month'));
  const [incluirInternas, setIncluirInternas] = useState(false);
  const [metricaSerie, setMetricaSerie] = useState<UsageMetricKey>('ordens_servico');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<OrdemRanking>('uso');

  const { from, to } = useMemo(() => usagePeriodRange(preset), [preset]);
  const { data, isLoading, error } = useAdminUsageStatistics({
    from,
    to,
    bucket,
    includeInternal: incluirInternas,
  });

  // Saúde por empresa: fonte ÚNICA da regra de "em risco". Falha aqui não
  // derruba a tela — o ranking continua útil sem o selo.
  const { data: health } = useCompanyHealthScores();
  const healthPorEmpresa = useMemo(() => {
    const mapa = new Map<string, string>();
    (health ?? []).forEach((h) => mapa.set(h.company_id, h.health_status));
    return mapa;
  }, [health]);

  const trocarPreset = (novo: UsagePeriodPreset) => {
    setPreset(novo);
    setBucket(bucketSugerido(novo));
  };

  const serie = useMemo(() => {
    if (!data) return [];
    return data.serie.map((ponto) => ({
      rotulo: rotuloBucket(ponto.bucket, bucket),
      valor: ponto[metricaSerie] ?? 0,
    }));
  }, [data, bucket, metricaSerie]);

  const ranking = useMemo<UsageRankingRow[]>(() => {
    if (!data) return [];
    const filtrado = data.ranking.filter((r) => fuzzyIncludes(r.company_name, busca));
    if (ordem === 'uso') return filtrado; // a RPC já devolve por total_uso DESC
    // "Parado há mais tempo" primeiro; quem NUNCA usou vem antes de todos.
    return [...filtrado].sort((a, b) => {
      const da = a.dias_sem_atividade ?? Number.POSITIVE_INFINITY;
      const db = b.dias_sem_atividade ?? Number.POSITIVE_INFINITY;
      return db - da;
    });
  }, [data, busca, ordem]);

  if (error && isPermissionError(error)) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Acesso restrito</AlertTitle>
        <AlertDescription>
          As estatísticas de uso da base são exclusivas do administrador master.
        </AlertDescription>
      </Alert>
    );
  }

  const semUso = data ? data.empresas.total - data.empresas.com_uso_no_periodo : 0;

  return (
    <div className="space-y-6">
      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={preset} onValueChange={(v) => trocarPreset(v as UsagePeriodPreset)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(USAGE_PERIOD_LABELS).map(([valor, rotulo]) => (
              <SelectItem key={valor} value={valor}>
                {rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={bucket} onValueChange={(v) => setBucket(v as UsageBucket)}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(USAGE_BUCKET_LABELS).map(([valor, rotulo]) => (
              <SelectItem key={valor} value={valor}>
                {rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Contas internas (Demo Dominex, Minha Empresa Tutorial) ficam FORA por
            padrão: incluí-las infla "empresas ativas" e o uso da base com
            movimento da própria Auctus. */}
        <div className="flex flex-col items-start gap-1 sm:ml-auto">
          <LabeledSwitch
            value={incluirInternas ? 'sim' : 'nao'}
            onChange={(v) => setIncluirInternas(v === 'sim')}
            off={{ value: 'nao', label: 'Só clientes' }}
            on={{ value: 'sim', label: 'Com contas internas' }}
            size="default"
            aria-label="Incluir contas internas da Auctus nas estatísticas"
          />
          {data && data.periodo.contas_internas_existentes > 0 && (
            <span className="text-xs text-muted-foreground">
              {data.periodo.contas_internas_existentes} conta(s) da própria Auctus (demo e
              tutorial)
            </span>
          )}
        </div>
      </div>

      {data && (
        <p className={typography.pageSubtitle}>
          Período de {formatarData(data.periodo.de)} a {formatarData(data.periodo.ate)} (
          {data.periodo.dias} dias). Comparado com {formatarData(data.periodo.anterior_de)} a{' '}
          {formatarData(data.periodo.anterior_ate)}.
        </p>
      )}

      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {error && !isPermissionError(error) && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Falha ao carregar as estatísticas</AlertTitle>
          <AlertDescription>
            {(error as Error)?.message ?? 'Tente novamente em instantes.'}
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          {/* ── Empresas ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h2 className={typography.sectionTitle}>Empresas na base</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                title="Total de empresas"
                value={fmtInt(data.empresas.total)}
                subtitle={`${data.empresas.novas_no_periodo} nova(s) no período`}
                icon={Building2}
                bg="bg-slate-600"
                iconBg="bg-slate-700"
              />
              <StatCard
                title="Assinatura ativa"
                value={fmtInt(data.empresas.ativas)}
                subtitle={`${data.empresas.testando} testando · ${data.empresas.inativas} inativa(s)`}
                icon={Zap}
                bg="bg-emerald-500"
                iconBg="bg-emerald-600"
              />
              <StatCard
                title="Com uso no período"
                value={fmtInt(data.empresas.com_uso_no_periodo)}
                subtitle={`${data.totais.usuarios_ativos} usuário(s) ativo(s)`}
                icon={Users}
                bg="bg-blue-500"
                iconBg="bg-blue-600"
              />
              <StatCard
                title="Sem nenhum uso"
                value={fmtInt(semUso)}
                subtitle="Não criaram nada no período"
                icon={MoonStar}
                bg="bg-red-500"
                iconBg="bg-red-600"
              />
            </div>
          </section>

          {/* ── Uso no período ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <h2 className={typography.sectionTitle}>O que a base produziu no período</h2>
            {/* Grade de caixas independentes (e não `divide-*` num grid, que
                deixa borda torta na primeira linha de cada quebra). */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {USAGE_METRIC_ORDER.map((chave) => {
                const atual = data.totais[chave] ?? 0;
                const anterior = data.anterior[chave] ?? 0;
                return (
                  <div
                    key={chave}
                    className="rounded-xl border border-border bg-card p-4 space-y-1.5"
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      {USAGE_METRIC_LABELS[chave]}
                      {chave === 'contratos_pmoc' && (
                        <span className="block text-[10px]">já contados em Contratos</span>
                      )}
                    </p>
                    <p className="text-2xl font-bold tabular-nums leading-none">{fmtInt(atual)}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <DeltaBadge atual={atual} anterior={anterior} />
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        antes: {fmtInt(anterior)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Evolução ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className={typography.sectionTitle}>Evolução no tempo</h2>
              <Select
                value={metricaSerie}
                onValueChange={(v) => setMetricaSerie(v as UsageMetricKey)}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USAGE_METRIC_ORDER.map((chave) => (
                    <SelectItem key={chave} value={chave}>
                      {USAGE_METRIC_LABELS[chave]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Card>
              <CardContent className="p-3 sm:p-4">
                {serie.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Sem dados no período escolhido.
                  </p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradUso" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                        <XAxis
                          dataKey="rotulo"
                          tick={{ fontSize: 11 }}
                          interval="preserveStartEnd"
                          minTickGap={isMobile ? 24 : 12}
                        />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
                        <RechartsTooltip
                          formatter={(v: number) => [fmtInt(v), USAGE_METRIC_LABELS[metricaSerie]]}
                          labelClassName="text-xs"
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="valor"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          fill="url(#gradUso)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* ── Ranking ──────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className={typography.sectionTitle}>Ranking de uso por empresa</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Quem sumiu é quem cancela. O selo de saúde vem do Health Score, a mesma régua
                  da tela de Health Score.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar empresa"
                    className="pl-9"
                  />
                </div>
                <Select value={ordem} onValueChange={(v) => setOrdem(v as OrdemRanking)}>
                  <SelectTrigger className="w-full sm:w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uso">Maior uso primeiro</SelectItem>
                    <SelectItem value="parado">Parado há mais tempo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {ranking.length === 0 ? (
              <EmptyState
                icon={<Building2 className="h-10 w-10" />}
                title="Nenhuma empresa encontrada"
                description={
                  busca
                    ? 'Nenhuma empresa bate com a busca.'
                    : 'Não há empresas para o filtro escolhido.'
                }
              />
            ) : isMobile ? (
              <div className="space-y-2">
                {ranking.map((linha) => (
                  <Card
                    key={linha.company_id}
                    className="cursor-pointer active:scale-[0.99] transition-transform"
                    onClick={() => navigate(`/admin/empresas/${linha.company_id}`)}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm min-w-0 truncate">
                          {linha.company_name}
                        </p>
                        <SeloSaude status={healthPorEmpresa.get(linha.company_id)} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusAssinaturaBadge status={linha.subscription_status} />
                        {linha.is_internal && (
                          <Badge className="border-0 bg-violet-500 text-white hover:bg-violet-500 font-medium">
                            Interna
                          </Badge>
                        )}
                        <SeloParado dias={linha.dias_sem_atividade} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          <strong className="text-foreground text-sm">
                            {fmtInt(linha.total_uso)}
                          </strong>{' '}
                          registros no período
                        </span>
                        <span className="tabular-nums">
                          {fmtInt(linha.ordens_servico)} OS · {fmtInt(linha.clientes)} clientes
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Assinatura</TableHead>
                        <TableHead>Saúde</TableHead>
                        <TableHead className="text-right">Parada há</TableHead>
                        <TableHead className="text-right">Uso total</TableHead>
                        <TableHead className="text-right">OS</TableHead>
                        <TableHead className="text-right">Clientes</TableHead>
                        <TableHead className="text-right">Orçamentos</TableHead>
                        <TableHead className="text-right">Contratos</TableHead>
                        <TableHead className="text-right">NFS-e</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ranking.map((linha) => (
                        <TableRow
                          key={linha.company_id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/admin/empresas/${linha.company_id}`)}
                        >
                          <TableCell className="font-medium max-w-[240px]">
                            <span className="block truncate">{linha.company_name}</span>
                            {linha.is_internal && (
                              <Badge className="mt-1 border-0 bg-violet-500 text-white hover:bg-violet-500 text-[10px] font-medium">
                                Conta interna
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusAssinaturaBadge status={linha.subscription_status} />
                          </TableCell>
                          <TableCell>
                            <SeloSaude status={healthPorEmpresa.get(linha.company_id)} />
                          </TableCell>
                          <TableCell className="text-right">
                            <SeloParado dias={linha.dias_sem_atividade} />
                          </TableCell>
                          <TableCell className="text-right font-bold tabular-nums">
                            {fmtInt(linha.total_uso)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtInt(linha.ordens_servico)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtInt(linha.clientes)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtInt(linha.orcamentos)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtInt(linha.contratos)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtInt(linha.nfse_emitidas)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Selo de saúde — rótulo e cor vêm de `getHealthBadgeConfig`, que é a fonte
 * única da regra. Não inventar faixa nova aqui.
 */
function SeloSaude({ status }: { status: string | undefined }) {
  if (!status) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }
  const cfg = getHealthBadgeConfig(status);
  return <Badge className={cn('border-0 font-medium', cfg.className)}>{cfg.label}</Badge>;
}

/**
 * Dias sem atividade. É NÚMERO CRU de propósito: colorir por faixa criaria uma
 * segunda definição de "empresa em risco" concorrendo com o Health Score. A
 * única cor aqui é pro caso factual "nunca registrou atividade".
 */
function SeloParado({ dias }: { dias: number | null }) {
  if (dias == null) {
    return (
      <Badge className="border-0 bg-gray-500 text-white hover:bg-gray-500 font-medium">
        nunca usou
      </Badge>
    );
  }
  if (dias === 0) return <span className="text-sm tabular-nums text-muted-foreground">hoje</span>;
  return (
    <span className="text-sm font-semibold tabular-nums">
      {fmtInt(dias)} <span className="font-normal text-muted-foreground">dia(s)</span>
    </span>
  );
}

function formatarData(iso: string) {
  try {
    return format(parseISO(iso), "dd 'de' MMM", { locale: ptBR });
  } catch {
    return iso;
  }
}

function rotuloBucket(iso: string, bucket: UsageBucket) {
  try {
    const d = parseISO(iso);
    if (bucket === 'month') return format(d, 'MMM/yy', { locale: ptBR });
    return format(d, 'dd/MM', { locale: ptBR });
  } catch {
    return iso;
  }
}
