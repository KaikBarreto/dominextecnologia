import { useMemo, useState } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Mail,
  MessagesSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { adminKpiClass, type AdminKpiTone } from '@/components/admin/adminKpiStyles';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  isCommunicationPermissionError,
  useAdminCommunicationProviderMetrics,
  useAdminCommunicationStatistics,
  type CommunicationChannel,
  type ResendUsageWindow,
} from '@/hooks/useAdminCommunicationStatistics';
import {
  usagePeriodRange,
  type UsagePeriodPreset,
} from '@/hooks/useAdminUsageStatistics';
import { typography } from '@/lib/typography';
import { cn } from '@/lib/utils';

const PERIOD_LABELS: Record<UsagePeriodPreset, string> = {
  this_month: 'Este mês',
  last_month: 'Mês passado',
  last7: 'Últimos 7 dias',
  last30: 'Últimos 30 dias',
  last90: 'Últimos 90 dias',
  this_year: 'Este ano',
};

const EVENT_LABELS: Record<string, string> = {
  charge_created: 'Cobrança criada',
  charge_due_reminder: 'Lembrete de vencimento',
  charge_overdue: 'Cobrança vencida',
  charge_paid: 'Cobrança paga',
  charge_refunded: 'Cobrança estornada',
  'billing.created': 'Cobrança criada',
  'billing.before_due': 'Antes do vencimento',
  'billing.due_today': 'Vence hoje',
  'billing.after_due': 'Após o vencimento',
  'os.a_caminho': 'Técnico a caminho',
  'os.em_andamento': 'OS em andamento',
  'os.concluida': 'OS concluída',
};

const STATUS_LABELS: Record<string, string> = {
  retry: 'Nova tentativa',
  failed: 'Falhou',
  skipped_quota: 'Limite atingido',
};

const CONNECTION_LABELS: Record<string, string> = {
  connected: 'Conectada',
  connecting: 'Conectando',
  qr: 'Aguardando QR Code',
  attention: 'Atenção',
  disconnected: 'Desconectada',
  error: 'Erro',
  banned: 'Bloqueada',
};

const formatNumber = (value: number | null | undefined) =>
  (value ?? 0).toLocaleString('pt-BR');

const relativeTime = (iso: string | null | undefined) => {
  if (!iso) return 'Sem registro';
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return 'Data indisponível';
  }
};

const rateLimitWindowLabel = (duration: string | null) => {
  if (!duration) return 'janela não informada';
  const milliseconds = Number.parseInt(duration, 10);
  if (!Number.isFinite(milliseconds)) return duration;
  if (milliseconds % 60_000 === 0) return `${milliseconds / 60_000} min`;
  if (milliseconds % 1_000 === 0) return `${milliseconds / 1_000} s`;
  return `${milliseconds} ms`;
};

function SummaryCard({
  title,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  tone: AdminKpiTone;
}) {
  return (
    <Card className={adminKpiClass(tone, 'min-w-0 shadow-md')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/80">{title}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-white/75">{hint}</p>
          </div>
          <div className="shrink-0 rounded-lg bg-black/20 p-2">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelBadge({ channel }: { channel: 'email' | 'whatsapp' }) {
  const isEmail = channel === 'email';
  const Icon = isEmail ? Mail : MessagesSquare;
  return (
    <Badge
      className={cn(
        'gap-1 border-0 text-white',
        isEmail ? 'bg-blue-600 hover:bg-blue-600' : 'bg-emerald-600 hover:bg-emerald-600',
      )}
    >
      <Icon className="h-3 w-3" />
      {isEmail ? 'E-mail' : 'WhatsApp'}
    </Badge>
  );
}

function ResendUsage({ title, data }: { title: string; data: ResendUsageWindow }) {
  const percentage = data.limit && data.limit > 0 ? (data.used / data.limit) * 100 : null;
  const tone = percentage != null && percentage >= 95
    ? 'text-red-600 dark:text-red-400'
    : percentage != null && percentage >= 80
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-foreground';

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={cn('text-2xl font-bold tabular-nums', tone)}>
            {formatNumber(data.used)}
            <span className="text-sm font-medium text-muted-foreground">
              {' '}/ {data.limit == null ? 'sem teto' : formatNumber(data.limit)}
            </span>
          </p>
        </div>
        {percentage != null && (
          <span className={cn('text-sm font-semibold tabular-nums', tone)}>
            {Math.min(999, percentage).toFixed(0)}%
          </span>
        )}
      </div>
      <Progress value={percentage == null ? 0 : Math.min(100, percentage)} className="h-2" />
      <p className="text-xs text-muted-foreground">
        {formatNumber(data.sent)} enviados
        {data.resetsAt ? ` · renova ${relativeTime(data.resetsAt)}` : ''}
      </p>
    </div>
  );
}

export function EstatisticasComunicacoesTab() {
  const [period, setPeriod] = useState<UsagePeriodPreset>('this_month');
  const [channel, setChannel] = useState<CommunicationChannel>('all');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState('overview');
  const range = useMemo(() => usagePeriodRange(period), [period]);

  const statistics = useAdminCommunicationStatistics({
    from: range.from,
    to: range.to,
    channel,
    companyId,
  });
  const providers = useAdminCommunicationProviderMetrics(channel !== 'whatsapp');

  const refresh = () => {
    void statistics.refetch();
    if (channel !== 'whatsapp') void providers.refetch();
  };

  const chartData = useMemo(() => {
    const days = new Map<
      string,
      { date: string; emailSuccess: number; emailFailed: number; whatsappSuccess: number; whatsappFailed: number }
    >();
    for (const point of statistics.data?.series ?? []) {
      const row = days.get(point.bucket) ?? {
        date: point.bucket,
        emailSuccess: 0,
        emailFailed: 0,
        whatsappSuccess: 0,
        whatsappFailed: 0,
      };
      if (point.channel === 'email') {
        row.emailSuccess = point.success;
        row.emailFailed = point.failed;
      } else {
        row.whatsappSuccess = point.success;
        row.whatsappFailed = point.failed;
      }
      days.set(point.bucket, row);
    }
    return [...days.values()];
  }, [statistics.data?.series]);

  const data = statistics.data;
  const providerData = providers.data;
  const providerCheckedAt = providerData?.ok ? providerData.checkedAt : undefined;
  const providerError = (() => {
    if (!providerData) return 'Tente novamente em instantes.';
    if (providerData.ok === false) return providerData.error.message;
    if (providerData.resend.available === false) return providerData.resend.error.message;
    return null;
  })();
  const concluded = (data?.summary.success ?? 0) + (data?.summary.failed ?? 0);
  const successRate = concluded > 0 ? ((data?.summary.success ?? 0) / concluded) * 100 : 0;

  if (statistics.error && isCommunicationPermissionError(statistics.error)) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Acesso restrito</AlertTitle>
        <AlertDescription>
          As métricas de comunicação são exclusivas do administrador master.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
          <Select value={period} onValueChange={(value) => setPeriod(value as UsagePeriodPreset)}>
            <SelectTrigger aria-label="Período das comunicações">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={channel} onValueChange={(value) => setChannel(value as CommunicationChannel)}>
            <SelectTrigger aria-label="Canal de comunicação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={companyId ?? 'all'}
            onValueChange={(value) => setCompanyId(value === 'all' ? null : value)}
          >
            <SelectTrigger aria-label="Empresa">
              <SelectValue placeholder="Todas as empresas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {(data?.filters.companies ?? []).map((company) => (
                <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" onClick={refresh} disabled={statistics.isFetching || providers.isFetching}>
          <RefreshCw className={cn('mr-2 h-4 w-4', (statistics.isFetching || providers.isFetching) && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {statistics.error && !isCommunicationPermissionError(statistics.error) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Falha ao carregar as comunicações</AlertTitle>
          <AlertDescription>
            Não foi possível consultar as filas. Tente atualizar em instantes.
          </AlertDescription>
        </Alert>
      )}

      {statistics.isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SummaryCard
              title="Processadas"
              value={formatNumber(data.summary.total)}
              hint={`${format(data.period.from ? parseISO(data.period.from) : new Date(), 'dd/MM')} a ${format(parseISO(data.period.to), 'dd/MM')}`}
              icon={Send}
              tone="blue"
            />
            <SummaryCard
              title="Enviadas"
              value={formatNumber(data.summary.success)}
              hint="Aceitas pelos provedores"
              icon={CheckCircle2}
              tone="emerald"
            />
            <SummaryCard
              title="Na fila agora"
              value={formatNumber(data.queue.total)}
              hint={`${formatNumber(data.queue.ready)} pronta(s) para processar`}
              icon={Clock3}
              tone="amber"
            />
            <SummaryCard
              title="Falhas"
              value={formatNumber(data.summary.failed)}
              hint={`${formatNumber(data.summary.skipped)} cancelada(s) ou ignorada(s)`}
              icon={XCircle}
              tone="rose"
            />
            <SummaryCard
              title="Taxa de sucesso"
              value={`${successRate.toFixed(1)}%`}
              hint="Sobre envios concluídos"
              icon={CheckCircle2}
              tone="violet"
            />
          </div>

          {channel !== 'whatsapp' && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Mail className="h-4 w-4" />
                      Consumo real do Resend
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Limites da conta de envio, separados das franquias vendidas às empresas.
                    </p>
                  </div>
                  {providerCheckedAt && (
                    <span className="text-xs text-muted-foreground">
                      Consultado {relativeTime(providerCheckedAt)}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {providers.isLoading ? (
                  <div className="grid gap-6 md:grid-cols-2">
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                  </div>
                ) : providers.data?.ok && providers.data.resend.available ? (
                  <div className="space-y-5">
                    <div className="grid gap-6 md:grid-cols-2 md:divide-x">
                      <ResendUsage title="Uso diário" data={providers.data.resend.daily} />
                      <div className="md:pl-6">
                        <ResendUsage title="Uso mensal" data={providers.data.resend.monthly} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium">Ritmo máximo da API</span>
                      <span className="text-muted-foreground">
                        {providers.data.resend.rateLimit.limit == null
                          ? 'Não informado pelo Resend'
                          : `${formatNumber(providers.data.resend.rateLimit.limit)} requisições a cada ${rateLimitWindowLabel(providers.data.resend.rateLimit.duration)}`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="font-medium">Consumo do provedor indisponível</p>
                      <p className="text-muted-foreground">
                        {providerError}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <TabsList variant="underline" className="w-full">
              <TabsTrigger value="overview" variant="underline" level="section">Visão geral</TabsTrigger>
              <TabsTrigger value="errors" variant="underline" level="section">Fila e erros</TabsTrigger>
              <TabsTrigger value="companies" variant="underline" level="section">Empresas</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-5 space-y-6">
              <section className="space-y-3">
                <div>
                  <h2 className={typography.sectionTitle}>Envios por dia</h2>
                  <p className="text-sm text-muted-foreground">
                    Sucessos e falhas registrados por canal no período selecionado.
                  </p>
                </div>
                <div className="h-72 min-w-0">
                  {chartData.some((row) => row.emailSuccess + row.emailFailed + row.whatsappSuccess + row.whatsappFailed > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                        <defs>
                          <linearGradient id="communicationEmail" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="communicationWhatsapp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => format(parseISO(value), 'dd/MM')}
                          tick={{ fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={22}
                        />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                        <RechartsTooltip
                          labelFormatter={(value) => format(parseISO(String(value)), "dd 'de' MMMM", { locale: ptBR })}
                          formatter={(value: number, name: string) => [formatNumber(value), name]}
                          contentStyle={{ borderRadius: 10, borderColor: 'hsl(var(--border))' }}
                        />
                        {channel !== 'whatsapp' && (
                          <Area type="monotone" dataKey="emailSuccess" name="E-mails enviados" stroke="#2563eb" fill="url(#communicationEmail)" strokeWidth={2} />
                        )}
                        {channel !== 'email' && (
                          <Area type="monotone" dataKey="whatsappSuccess" name="WhatsApps enviados" stroke="#059669" fill="url(#communicationWhatsapp)" strokeWidth={2} />
                        )}
                        {channel !== 'whatsapp' && (
                          <Area type="monotone" dataKey="emailFailed" name="Falhas de e-mail" stroke="#dc2626" fill="transparent" strokeDasharray="4 4" />
                        )}
                        {channel !== 'email' && (
                          <Area type="monotone" dataKey="whatsappFailed" name="Falhas de WhatsApp" stroke="#f97316" fill="transparent" strokeDasharray="4 4" />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyPanel icon={Send} title="Sem envios neste período" description="Altere o período ou a empresa para consultar outro recorte." />
                  )}
                </div>
              </section>

              {channel !== 'email' && (
                <section className="space-y-3">
                  <div>
                    <h2 className={typography.sectionTitle}>Conexões WhatsApp</h2>
                    <p className="text-sm text-muted-foreground">Saúde atual das conexões por empresa e provedor.</p>
                  </div>
                  {data.whatsapp_connections.length === 0 ? (
                    <EmptyPanel icon={MessagesSquare} title="Nenhuma conexão neste recorte" description="Não há conexão WhatsApp configurada para a seleção atual." />
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Empresa</TableHead>
                            <TableHead>Provedor</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Último sinal</TableHead>
                            <TableHead className="text-right">Falhas seguidas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.whatsapp_connections.map((connection) => (
                            <TableRow key={`${connection.company_id}-${connection.provider}`}>
                              <TableCell className="font-medium">{connection.company_name}</TableCell>
                              <TableCell>{connection.provider === 'meta_cloud' ? 'Meta Cloud' : 'Evolution'}</TableCell>
                              <TableCell>
                                <Badge className={cn('border-0 text-white', connection.status === 'connected' ? 'bg-emerald-600 hover:bg-emerald-600' : connection.status === 'attention' || connection.status === 'connecting' || connection.status === 'qr' ? 'bg-amber-500 hover:bg-amber-500' : 'bg-red-600 hover:bg-red-600')}>
                                  {CONNECTION_LABELS[connection.status] ?? 'Indisponível'}
                                </Badge>
                              </TableCell>
                              <TableCell>{relativeTime(connection.last_seen_at)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatNumber(connection.consecutive_failures)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </section>
              )}
            </TabsContent>

            <TabsContent value="errors" className="mt-5 space-y-6">
              <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-3">
                  <div>
                    <h2 className={typography.sectionTitle}>Falhas recentes</h2>
                    <p className="text-sm text-muted-foreground">Sem destinatários ou conteúdo das mensagens.</p>
                  </div>
                  {data.recent_failures.length === 0 ? (
                    <EmptyPanel icon={CheckCircle2} title="Nenhuma falha no período" description="Os canais não registraram falhas ou tentativas pendentes neste recorte." />
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Canal</TableHead>
                            <TableHead>Empresa</TableHead>
                            <TableHead>Evento</TableHead>
                            <TableHead>Motivo</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Quando</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.recent_failures.map((failure, index) => (
                            <TableRow key={`${failure.company_id}-${failure.updated_at}-${index}`}>
                              <TableCell><ChannelBadge channel={failure.channel} /></TableCell>
                              <TableCell className="font-medium">{failure.company_name}</TableCell>
                              <TableCell>{EVENT_LABELS[failure.event_key] ?? 'Evento automático'}</TableCell>
                              <TableCell>{failure.safe_error}</TableCell>
                              <TableCell>{STATUS_LABELS[failure.status] ?? 'Falha'}</TableCell>
                              <TableCell className="whitespace-nowrap">{relativeTime(failure.updated_at)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <h2 className={typography.sectionTitle}>Motivos agrupados</h2>
                    <p className="text-sm text-muted-foreground">Onde concentrar a correção primeiro.</p>
                  </div>
                  <div className="divide-y rounded-lg border">
                    {data.errors.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">Nenhum erro agrupado.</p>
                    ) : data.errors.map((error) => (
                      <div key={`${error.channel}-${error.safe_error}`} className="flex items-start justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <ChannelBadge channel={error.channel} />
                          <p className="mt-2 text-sm font-medium">{error.safe_error}</p>
                          <p className="text-xs text-muted-foreground">Último {relativeTime(error.last_seen_at)}</p>
                        </div>
                        <span className="text-lg font-bold tabular-nums">{formatNumber(error.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="companies" className="mt-5 space-y-6">
              <section className="space-y-3">
                <div>
                  <h2 className={typography.sectionTitle}>Volume por empresa</h2>
                  <p className="text-sm text-muted-foreground">Até 100 empresas com atividade no período selecionado.</p>
                </div>
                {data.companies.length === 0 ? (
                  <EmptyPanel icon={Building2} title="Nenhuma empresa com envios" description="Não há atividade para o recorte atual." />
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Empresa</TableHead>
                          <TableHead className="text-right">E-mails</TableHead>
                          <TableHead className="text-right">WhatsApps</TableHead>
                          <TableHead className="text-right">Sucessos</TableHead>
                          <TableHead className="text-right">Falhas</TableHead>
                          <TableHead>Última atividade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.companies.map((company) => (
                          <TableRow key={company.company_id}>
                            <TableCell className="font-medium">{company.company_name}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(company.email)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(company.whatsapp)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(company.success)}</TableCell>
                            <TableCell className={cn('text-right tabular-nums', company.failed > 0 && 'font-semibold text-red-600 dark:text-red-400')}>{formatNumber(company.failed)}</TableCell>
                            <TableCell>{relativeTime(company.last_activity)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>

              {channel !== 'whatsapp' && (
                <section className="space-y-3">
                  <div>
                    <h2 className={typography.sectionTitle}>Franquia Dominex por empresa</h2>
                    <p className="text-sm text-muted-foreground">Consumo persistido no mês atual, independente do filtro de período.</p>
                  </div>
                  {data.email_quota.length === 0 ? (
                    <EmptyPanel icon={Mail} title="Nenhum envio por e-mail ativo" description="As empresas deste recorte ainda não ativaram o canal." />
                  ) : (
                    <div className="divide-y rounded-lg border">
                      {data.email_quota.map((quota) => {
                        const percent = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0;
                        return (
                          <div key={quota.company_id} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,280px)_90px] sm:items-center">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{quota.company_name}</p>
                              <p className="text-xs text-muted-foreground">{quota.enabled ? 'Canal ativo' : 'Canal desativado'}</p>
                            </div>
                            <Progress value={Math.min(100, percent)} className="h-2" />
                            <p className="text-right text-sm font-semibold tabular-nums">{formatNumber(quota.used)} / {formatNumber(quota.limit)}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center">
      <Icon className="mb-3 h-7 w-7 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
