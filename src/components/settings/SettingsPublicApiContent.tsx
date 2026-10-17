import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CalendarClock,
  Check,
  Clipboard,
  Clock3,
  Code2,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { dateInTz, timeInTz, zonedDateTimeToUtc } from '@/lib/timezone';
import {
  PUBLIC_API_SCOPES,
  type PublicApiBookingException,
  type PublicApiBookingSettings,
  type PublicApiDistributionMode,
  type PublicApiIntegration,
  type PublicApiIntegrationInput,
  type PublicApiIntegrationResource,
  type PublicApiKeyMetadata,
  type PublicApiResource,
  type PublicApiScope,
  type PublicApiWeekday,
  usePublicApiManagement,
} from '@/hooks/usePublicApiManagement';

const DOCS_URL = '/docs';
const WEEKDAYS: Array<{ key: PublicApiWeekday; label: string }> = [
  { key: '1', label: 'Segunda' },
  { key: '2', label: 'Terça' },
  { key: '3', label: 'Quarta' },
  { key: '4', label: 'Quinta' },
  { key: '5', label: 'Sexta' },
  { key: '6', label: 'Sábado' },
  { key: '0', label: 'Domingo' },
];

const SCOPE_LABELS: Record<PublicApiScope, string> = {
  'availability:read': 'Consultar disponibilidade',
  'catalogs:read': 'Consultar catálogos',
  'customers:resolve': 'Localizar ou cadastrar clientes',
  'service_orders:read': 'Consultar ordens de serviço',
  'service_orders:create': 'Criar ordens de serviço',
};

const DISTRIBUTION_LABELS: Record<PublicApiDistributionMode, string> = {
  agent_selects: 'Agente escolhe',
  round_robin: 'Distribuição automática',
  unassigned: 'Sem responsável',
};

const DEFAULT_HOURS = Object.fromEntries(
  WEEKDAYS.map(({ key }, index) => [key, index < 5 ? [['08:00', '18:00']] : []]),
) as PublicApiBookingSettings['weekly_hours'];

const DEFAULT_BOOKING_SETTINGS: PublicApiBookingSettings = {
  weekly_hours: DEFAULT_HOURS,
  slot_interval_minutes: 30,
  minimum_notice_minutes: 120,
  booking_horizon_days: 60,
  default_duration_minutes: 120,
};

function formatDate(value: string | null): string {
  if (!value) return 'Nunca';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function keyStatus(key: PublicApiKeyMetadata): { label: string; variant: 'secondary' | 'destructive' | 'outline'; expiring: boolean; className: string } {
  if (key.revoked_at) return { label: 'Revogada', variant: 'destructive', expiring: false, className: '' };
  if (!key.expires_at) return { label: 'Ativa', variant: 'secondary', expiring: false, className: '' };
  const expiresAt = new Date(key.expires_at).getTime();
  const now = Date.now();
  const remainingDays = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
  if (remainingDays <= 0) return { label: 'Expirada', variant: 'destructive', expiring: false, className: '' };
  if (remainingDays <= 1) return { label: 'Expira em até 1 dia', variant: 'outline', expiring: true, className: 'border-destructive text-destructive' };
  if (remainingDays <= 7) return { label: 'Expira em até 7 dias', variant: 'outline', expiring: true, className: 'border-amber-500 text-amber-700 dark:text-amber-300' };
  if (remainingDays <= 30) return { label: 'Expira em até 30 dias', variant: 'outline', expiring: true, className: 'border-yellow-500 text-yellow-700 dark:text-yellow-300' };
  return { label: 'Ativa', variant: 'secondary', expiring: false, className: '' };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function SettingsPublicApiContent() {
  const api = usePublicApiManagement();
  const { settings: companySettings } = useCompanySettings();
  const { toast } = useToast();
  const [integrationDialog, setIntegrationDialog] = useState<{ open: boolean; integration: PublicApiIntegration | null }>({
    open: false,
    integration: null,
  });
  const [keyDialogIntegration, setKeyDialogIntegration] = useState<PublicApiIntegration | null>(null);
  const [keyName, setKeyName] = useState('');
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [secretSaved, setSecretSaved] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<PublicApiKeyMetadata | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<PublicApiKeyMetadata | null>(null);
  const [bookingSettings, setBookingSettings] = useState<PublicApiBookingSettings>(DEFAULT_BOOKING_SETTINGS);
  const [exceptions, setExceptions] = useState<PublicApiBookingException[]>([]);

  useEffect(() => {
    if (api.data?.booking_settings) setBookingSettings(api.data.booking_settings);
    if (api.data?.booking_exceptions) setExceptions(api.data.booking_exceptions);
  }, [api.data?.booking_exceptions, api.data?.booking_settings]);

  const timezone = api.data?.timezone || companySettings?.timezone || 'America/Sao_Paulo';
  const activeKeys = useMemo(
    () => api.data?.integrations.flatMap((integration) => integration.keys ?? [])
      .filter((key) => keyStatus(key).label === 'Ativa' || keyStatus(key).expiring) ?? [],
    [api.data?.integrations],
  );

  const showSecret = (secret: string) => {
    setSecretSaved(false);
    setOneTimeSecret(secret);
  };

  const copySecret = async () => {
    if (!oneTimeSecret) return;
    try {
      await navigator.clipboard.writeText(oneTimeSecret);
      toast({ title: 'Chave copiada' });
    } catch {
      toast({ title: 'Não foi possível copiar', description: 'Selecione e copie a chave manualmente.', variant: 'destructive' });
    }
  };

  const createKey = async () => {
    if (!keyDialogIntegration) return;
    try {
      const response = await api.createKey.mutateAsync({
        integrationId: keyDialogIntegration.id,
        name: keyName.trim() || undefined,
      });
      // O React Query guarda o último `data` da mutation. Limpar imediatamente
      // evita que o segredo de entrega única permaneça no mutation cache.
      api.createKey.reset();
      setKeyDialogIntegration(null);
      setKeyName('');
      showSecret(response.api_key);
    } catch (error) {
      toast({ title: 'Erro ao gerar chave', description: errorMessage(error, 'Tente novamente.'), variant: 'destructive' });
    }
  };

  const rotateKey = async () => {
    if (!rotateTarget) return;
    try {
      const response = await api.rotateKey.mutateAsync(rotateTarget.id);
      api.rotateKey.reset();
      setRotateTarget(null);
      showSecret(response.api_key);
    } catch (error) {
      toast({ title: 'Erro ao rotacionar chave', description: errorMessage(error, 'Tente novamente.'), variant: 'destructive' });
    }
  };

  const revokeKey = async () => {
    if (!revokeTarget) return;
    try {
      await api.revokeKey.mutateAsync(revokeTarget.id);
      setRevokeTarget(null);
      toast({ title: 'Chave revogada' });
    } catch (error) {
      toast({ title: 'Erro ao revogar chave', description: errorMessage(error, 'Tente novamente.'), variant: 'destructive' });
    }
  };

  const saveSchedule = async () => {
    if (bookingSettings.slot_interval_minutes < 5 || bookingSettings.slot_interval_minutes > 240
      || bookingSettings.default_duration_minutes < 15 || bookingSettings.default_duration_minutes > 480
      || bookingSettings.minimum_notice_minutes < 0 || bookingSettings.minimum_notice_minutes > 43_200
      || bookingSettings.booking_horizon_days < 1 || bookingSettings.booking_horizon_days > 365) {
      toast({ title: 'Limites inválidos', description: 'Revise intervalo, duração, antecedência e horizonte de agendamento.', variant: 'destructive' });
      return;
    }
    const invalidDay = WEEKDAYS.find(({ key }) => {
      const interval = bookingSettings.weekly_hours[key]?.[0];
      return interval && interval[0] >= interval[1];
    });
    if (invalidDay) {
      toast({ title: 'Expediente inválido', description: `O horário final de ${invalidDay.label} precisa ser posterior ao inicial.`, variant: 'destructive' });
      return;
    }
    try {
      await api.saveBookingSettings.mutateAsync(bookingSettings);
      toast({ title: 'Expediente e limites salvos' });
    } catch (error) {
      toast({ title: 'Erro ao salvar expediente', description: errorMessage(error, 'Tente novamente.'), variant: 'destructive' });
    }
  };

  const saveExceptions = async () => {
    if (exceptions.some((exception) => new Date(exception.starts_at).getTime() >= new Date(exception.ends_at).getTime())) {
      toast({ title: 'Exceção inválida', description: 'O fim de cada exceção precisa ser posterior ao início.', variant: 'destructive' });
      return;
    }
    try {
      await api.saveBookingExceptions.mutateAsync(exceptions);
      toast({ title: 'Exceções salvas' });
    } catch (error) {
      toast({ title: 'Erro ao salvar exceções', description: errorMessage(error, 'Tente novamente.'), variant: 'destructive' });
    }
  };

  if (!api.canManage) {
    return (
      <NoticeBanner variant="neutral" icon={Lock} title="Gestão de API restrita">
        Somente administradores ou usuários com a permissão explícita “Gerenciar chaves da API” podem acessar esta área.
      </NoticeBanner>
    );
  }

  if (api.isLoading) {
    return <div className="space-y-4" aria-label="Carregando gestão da API Pública"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (api.isError) {
    return (
      <NoticeBanner
        variant="warning"
        icon={AlertTriangle}
        title="Não foi possível carregar a API Pública"
        action={<Button type="button" variant="outline" size="sm" onClick={() => api.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>}
      >
        {errorMessage(api.error, 'Verifique sua conexão e tente novamente.')}
      </NoticeBanner>
    );
  }

  const integrations = api.data?.integrations ?? [];
  const resources = [
    ...(api.data?.resources?.users ?? []),
    ...(api.data?.resources?.teams ?? []),
  ];

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2"><CardTitle className="flex items-center gap-2"><Code2 className="h-5 w-5 text-primary" />API Pública Dominex</CardTitle><Badge>v1</Badge></div>
            <CardDescription>Conecte sistemas externos com chaves separadas, escopos mínimos e isolamento por empresa.</CardDescription>
            <p className="text-xs text-muted-foreground">{integrations.length} integração(ões) · {activeKeys.length} chave(s) ativa(s)</p>
          </div>
          <Button asChild variant="outline" className="shrink-0"><a href={DOCS_URL} target="_blank" rel="noreferrer"><BookOpen className="mr-2 h-4 w-4" />Ver documentação</a></Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-base">Integrações</CardTitle><CardDescription>Cada integração tem seus próprios escopos, distribuição, pool e allowlist.</CardDescription></div>
          <Button onClick={() => setIntegrationDialog({ open: true, integration: null })}><Plus className="mr-2 h-4 w-4" />Nova integração</Button>
        </CardHeader>
        <CardContent>
          {integrations.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center"><KeyRound className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">Nenhuma integração criada</p><p className="mt-1 text-sm text-muted-foreground">Crie a primeira integração para definir o acesso e gerar uma chave.</p></div>
          ) : (
            <div className="space-y-4">
              {integrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  resources={resources}
                  onEdit={() => setIntegrationDialog({ open: true, integration })}
                  onCreateKey={() => setKeyDialogIntegration(integration)}
                  onRotate={setRotateTarget}
                  onRevoke={setRevokeTarget}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BookingSettingsCard
        value={bookingSettings}
        timezone={timezone}
        saving={api.saveBookingSettings.isPending}
        onChange={setBookingSettings}
        onSave={saveSchedule}
      />

      <BookingExceptionsCard
        value={exceptions}
        timezone={timezone}
        saving={api.saveBookingExceptions.isPending}
        onChange={setExceptions}
        onSave={saveExceptions}
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" />Atividade recente</CardTitle><CardDescription>Eventos de gestão e uso sem exibir o segredo das chaves.</CardDescription></CardHeader>
        <CardContent>
          {(api.data?.activity ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há atividade registrada.</p> : (
            <div className="divide-y rounded-lg border">
              {(api.data?.activity ?? []).slice(0, 10).map((event) => (
                <div key={event.integration_id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{integrations.find((item) => item.id === event.integration_id)?.name ?? 'API Pública'}</p><p className="text-xs text-muted-foreground">Últimos 30 dias</p></div><div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{event.requests_30d} requisição(ões)</span><span>{event.errors_30d} erro(s)</span><span>P95: {event.p95_ms === null ? '—' : `${event.p95_ms} ms`}</span></div></div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <IntegrationDialog
        open={integrationDialog.open}
        integration={integrationDialog.integration}
        resources={resources}
        saving={api.createIntegration.isPending || api.updateIntegration.isPending}
        onOpenChange={(open) => setIntegrationDialog((current) => ({ ...current, open }))}
        onSave={async (input) => {
          try {
            if (integrationDialog.integration) await api.updateIntegration.mutateAsync({ integrationId: integrationDialog.integration.id, input });
            else await api.createIntegration.mutateAsync(input);
            setIntegrationDialog({ open: false, integration: null });
            toast({ title: integrationDialog.integration ? 'Integração atualizada' : 'Integração criada' });
          } catch (error) {
            toast({ title: 'Erro ao salvar integração', description: errorMessage(error, 'Tente novamente.'), variant: 'destructive' });
          }
        }}
      />

      <Dialog open={Boolean(keyDialogIntegration)} onOpenChange={(open) => { if (!open) { setKeyDialogIntegration(null); setKeyName(''); } }}>
        <DialogContent><DialogHeader><DialogTitle>Gerar chave de API</DialogTitle><DialogDescription>A chave será vinculada à integração “{keyDialogIntegration?.name}” e exibida somente uma vez.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="api-key-name">Nome da chave</Label><Input id="api-key-name" value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="Ex.: Produção" autoComplete="off" /></div><DialogFooter><Button variant="outline" onClick={() => setKeyDialogIntegration(null)}>Cancelar</Button><Button onClick={createKey} disabled={api.createKey.isPending}>{api.createKey.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gerar chave</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(oneTimeSecret)} onOpenChange={(open) => { if (!open && secretSaved) setOneTimeSecret(null); }}>
        <DialogContent onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}><DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Guarde sua chave agora</DialogTitle><DialogDescription>Por segurança, ela não poderá ser exibida novamente. Não cole a chave em chats, documentos públicos ou código versionado.</DialogDescription></DialogHeader><div className="rounded-lg border bg-muted/50 p-3"><div className="flex items-start gap-2"><code className="min-w-0 flex-1 break-all text-xs" data-testid="one-time-api-key">{oneTimeSecret}</code><Button size="icon" variant="outline" onClick={copySecret} aria-label="Copiar chave"><Clipboard className="h-4 w-4" /></Button></div></div><label className="flex items-start gap-2 text-sm"><Checkbox checked={secretSaved} onCheckedChange={(checked) => setSecretSaved(checked === true)} /><span>Salvei a chave em um gerenciador seguro.</span></label><DialogFooter><Button onClick={() => setOneTimeSecret(null)} disabled={!secretSaved}>Concluir</Button></DialogFooter></DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(rotateTarget)} onOpenChange={(open) => { if (!open) setRotateTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Rotacionar esta chave?</AlertDialogTitle><AlertDialogDescription>Uma nova chave será gerada e exibida uma única vez. Atualize o sistema consumidor imediatamente.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void rotateKey(); }} disabled={api.rotateKey.isPending}>{api.rotateKey.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Rotacionar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Revogar esta chave?</AlertDialogTitle><AlertDialogDescription>O acesso será interrompido imediatamente e não poderá ser restaurado.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); void revokeKey(); }} disabled={api.revokeKey.isPending}>{api.revokeKey.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Revogar chave</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function IntegrationCard({ integration, resources, onEdit, onCreateKey, onRotate, onRevoke }: {
  integration: PublicApiIntegration;
  resources: PublicApiResource[];
  onEdit: () => void;
  onCreateKey: () => void;
  onRotate: (key: PublicApiKeyMetadata) => void;
  onRevoke: (key: PublicApiKeyMetadata) => void;
}) {
  const resourceNames = (integration.resources ?? []).map((entry) => resources.find((resource) => resource.id === entry.id && resource.type === entry.type)?.name).filter(Boolean);
  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{integration.name}</h3><Badge variant={integration.status === 'active' ? 'secondary' : 'outline'}>{integration.status === 'active' ? 'Ativa' : 'Inativa'}</Badge></div><div className="mt-2 flex flex-wrap gap-1.5"><Badge variant="outline">{DISTRIBUTION_LABELS[integration.distribution_mode]}</Badge>{integration.scopes.map((scope) => <Badge key={scope} variant="secondary">{SCOPE_LABELS[scope]}</Badge>)}</div></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={onEdit}>Configurar</Button><Button size="sm" onClick={onCreateKey} disabled={integration.status !== 'active'}><KeyRound className="mr-2 h-4 w-4" />Gerar chave</Button></div></div>
      {(resourceNames.length > 0 || integration.ip_allowlist.length > 0) && <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">{resourceNames.length > 0 && <p><Users className="mr-1 inline h-3.5 w-3.5" />Pool: {resourceNames.join(', ')}</p>}{integration.ip_allowlist.length > 0 && <p><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />CIDRs: {integration.ip_allowlist.join(', ')}</p>}</div>}
      <Separator className="my-4" />
      {(integration.keys ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma chave gerada para esta integração.</p> : <div className="space-y-2">{integration.keys.map((key) => { const status = keyStatus(key); return <div key={key.id} className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><code className="text-sm font-medium">dmx_live_{key.public_id}.••••{key.secret_last_four}</code><Badge variant={status.variant} className={status.className}>{status.label}</Badge>{key.name && <span className="text-xs text-muted-foreground">{key.name}</span>}</div><p className="mt-1 text-xs text-muted-foreground">Criada em {formatDate(key.created_at)} · último uso: {formatDate(key.last_used_at)}{key.expires_at ? ` · expira: ${formatDate(key.expires_at)}` : ''}</p></div>{!key.revoked_at && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => onRotate(key)}><RotateCw className="mr-1.5 h-3.5 w-3.5" />Rotacionar</Button><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onRevoke(key)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Revogar</Button></div>}</div>; })}</div>}
    </div>
  );
}

function IntegrationDialog({ open, integration, resources, saving, onOpenChange, onSave }: {
  open: boolean;
  integration: PublicApiIntegration | null;
  resources: PublicApiResource[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: PublicApiIntegrationInput) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<PublicApiScope[]>(['availability:read', 'service_orders:read']);
  const [distributionMode, setDistributionMode] = useState<PublicApiDistributionMode>('unassigned');
  const [active, setActive] = useState(true);
  const [selectedResources, setSelectedResources] = useState<PublicApiIntegrationResource[]>([]);
  const [cidrs, setCidrs] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(integration?.name ?? '');
    setScopes(integration?.scopes ?? ['availability:read', 'service_orders:read']);
    setDistributionMode(integration?.distribution_mode ?? 'unassigned');
    setActive(integration?.status !== 'inactive');
    setSelectedResources(integration?.resources ?? []);
    setCidrs((integration?.ip_allowlist ?? []).join('\n'));
    setValidationError(null);
  }, [integration, open]);

  const submit = async () => {
    const allowlist = cidrs.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
    if (!name.trim()) return setValidationError('Informe um nome para a integração.');
    if (scopes.length === 0) return setValidationError('Selecione pelo menos um escopo.');
    if (distributionMode !== 'unassigned' && selectedResources.length === 0) return setValidationError('Selecione ao menos um recurso para o pool.');
    const invalidCidr = allowlist.find((value) => !/^[0-9a-f:.]+(?:\/\d{1,3})?$/i.test(value));
    if (invalidCidr) return setValidationError(`CIDR inválido: ${invalidCidr}`);
    setValidationError(null);
    await onSave({ name: name.trim(), scopes, distribution_mode: distributionMode, ...(integration ? { status: active ? 'active' : 'inactive' } : {}), ip_allowlist: allowlist, resources: distributionMode === 'unassigned' ? [] : selectedResources });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{integration ? 'Configurar integração' : 'Nova integração'}</DialogTitle><DialogDescription>Conceda somente os recursos necessários ao sistema consumidor.</DialogDescription></DialogHeader><div className="space-y-5"><div className="space-y-2"><Label htmlFor="integration-name">Nome</Label><Input id="integration-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Agendamento do site" /></div>{integration && <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm"><span><span className="block font-medium">Integração ativa</span><span className="text-xs text-muted-foreground">Ao desativar, todas as chaves param de autenticar imediatamente.</span></span><Switch checked={active} onCheckedChange={setActive} /></label>}<div className="space-y-2"><Label>Escopos</Label><div className="grid gap-2 sm:grid-cols-2">{PUBLIC_API_SCOPES.map((scope) => <label key={scope} className="flex items-start gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={scopes.includes(scope)} onCheckedChange={(checked) => setScopes((current) => checked ? [...current, scope] : current.filter((item) => item !== scope))} /><span><span className="block font-medium">{SCOPE_LABELS[scope]}</span><code className="text-[11px] text-muted-foreground">{scope}</code></span></label>)}</div></div><div className="space-y-2"><Label>Distribuição</Label><Select value={distributionMode} onValueChange={(value) => setDistributionMode(value as PublicApiDistributionMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="agent_selects">Agente escolhe o atendimento</SelectItem><SelectItem value="round_robin">Distribuição automática (round-robin)</SelectItem><SelectItem value="unassigned">Criar sem responsável</SelectItem></SelectContent></Select></div>{distributionMode !== 'unassigned' && <div className="space-y-2"><Label>Pool de recursos</Label><div className="grid gap-2 sm:grid-cols-2">{resources.map((resource) => { const selected = selectedResources.some((item) => item.id === resource.id && item.type === resource.type); return <label key={`${resource.type}:${resource.id}`} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={selected} onCheckedChange={(checked) => setSelectedResources((current) => checked ? [...current, { id: resource.id, type: resource.type }] : current.filter((item) => item.id !== resource.id || item.type !== resource.type))} /><span>{resource.name}<span className="ml-1 text-xs text-muted-foreground">({resource.type === 'team' ? 'equipe' : 'usuário'})</span></span></label>; })}</div>{resources.length === 0 && <p className="text-xs text-muted-foreground">Nenhum recurso elegível foi encontrado.</p>}</div>}<div className="space-y-2"><Label htmlFor="cidr-allowlist">Allowlist de IP/CIDR (opcional)</Label><Textarea id="cidr-allowlist" value={cidrs} onChange={(event) => setCidrs(event.target.value)} placeholder={'203.0.113.10/32\n2001:db8::/48'} rows={3} /><p className="text-xs text-muted-foreground">Um CIDR por linha. Vazio permite qualquer origem após autenticação.</p></div>{validationError && <p role="alert" className="text-sm text-destructive">{validationError}</p>}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar integração</Button></DialogFooter></DialogContent></Dialog>
  );
}

function BookingSettingsCard({ value, timezone, saving, onChange, onSave }: { value: PublicApiBookingSettings; timezone: string; saving: boolean; onChange: (value: PublicApiBookingSettings) => void; onSave: () => void }) {
  const setNumber = (key: keyof Omit<PublicApiBookingSettings, 'weekly_hours'>, raw: string) => onChange({ ...value, [key]: Math.max(0, Number(raw) || 0) });
  return <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-primary" />Expediente e limites de agendamento</CardTitle><CardDescription>Horários interpretados no fuso da empresa: <strong>{timezone}</strong>. Altere o fuso em Configurações &gt; Regional.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-2">{WEEKDAYS.map(({ key, label }) => { const hours = value.weekly_hours[key] ?? []; const interval = hours[0]; const enabled = Boolean(interval); const start = interval?.[0] ?? '08:00'; const end = interval?.[1] ?? '18:00'; const remainingIntervals = hours.slice(1); return <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border p-3 sm:grid-cols-[140px_1fr_1fr]"><label className="flex items-center gap-2 text-sm font-medium"><Switch checked={enabled} onCheckedChange={(checked) => onChange({ ...value, weekly_hours: { ...value.weekly_hours, [key]: checked ? [[start, end], ...remainingIntervals] : [] } })} />{label}</label><Input aria-label={`Início ${label}`} type="time" value={start} disabled={!enabled} onChange={(event) => onChange({ ...value, weekly_hours: { ...value.weekly_hours, [key]: [[event.target.value, end], ...remainingIntervals] } })} /><Input aria-label={`Fim ${label}`} type="time" value={end} disabled={!enabled} onChange={(event) => onChange({ ...value, weekly_hours: { ...value.weekly_hours, [key]: [[start, event.target.value], ...remainingIntervals] } })} />{remainingIntervals.length > 0 && <p className="col-span-full text-xs text-muted-foreground">+ {remainingIntervals.length} faixa(s) adicional(is) preservada(s)</p>}</div>; })}</div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><NumberField label="Intervalo dos horários (min)" value={value.slot_interval_minutes} min={5} max={240} onChange={(raw) => setNumber('slot_interval_minutes', raw)} /><NumberField label="Antecedência mínima (min)" value={value.minimum_notice_minutes} min={0} max={43_200} onChange={(raw) => setNumber('minimum_notice_minutes', raw)} /><NumberField label="Horizonte de agenda (dias)" value={value.booking_horizon_days} min={1} max={365} onChange={(raw) => setNumber('booking_horizon_days', raw)} /><NumberField label="Duração padrão (min)" value={value.default_duration_minutes} min={15} max={480} onChange={(raw) => setNumber('default_duration_minutes', raw)} /></div><div className="flex justify-end"><Button onClick={onSave} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar expediente</Button></div></CardContent></Card>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (raw: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type="number" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function localDateTimeValue(value: string, timezone: string): string {
  try {
    return `${dateInTz(value, timezone)}T${timeInTz(value, timezone)}`;
  } catch {
    return '';
  }
}

function zonedInputToIso(value: string, timezone: string): string {
  const [date, time] = value.split('T');
  return zonedDateTimeToUtc(date, time, timezone);
}

function BookingExceptionsCard({ value, timezone, saving, onChange, onSave }: { value: PublicApiBookingException[]; timezone: string; saving: boolean; onChange: (value: PublicApiBookingException[]) => void; onSave: () => void }) {
  const add = () => { const start = new Date(); start.setMinutes(0, 0, 0); const end = new Date(start); end.setHours(end.getHours() + 1); onChange([...value, { starts_at: start.toISOString(), ends_at: end.toISOString(), is_available: false, reason: '' }]); };
  return <Card><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4 text-primary" />Exceções de expediente</CardTitle><CardDescription>Cadastre bloqueios ou aberturas pontuais no fuso {timezone}, como feriados e plantões.</CardDescription></div><Button variant="outline" onClick={add}><Plus className="mr-2 h-4 w-4" />Adicionar exceção</Button></CardHeader><CardContent className="space-y-4">{value.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma exceção cadastrada.</p> : value.map((exception, index) => <div key={exception.id ?? index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto_auto]"><div className="space-y-1.5"><Label>Início</Label><Input type="datetime-local" value={localDateTimeValue(exception.starts_at, timezone)} onChange={(event) => { if (!event.target.value) return; const next = [...value]; next[index] = { ...exception, starts_at: zonedInputToIso(event.target.value, timezone) }; onChange(next); }} /></div><div className="space-y-1.5"><Label>Fim</Label><Input type="datetime-local" value={localDateTimeValue(exception.ends_at, timezone)} onChange={(event) => { if (!event.target.value) return; const next = [...value]; next[index] = { ...exception, ends_at: zonedInputToIso(event.target.value, timezone) }; onChange(next); }} /></div><div className="space-y-1.5"><Label>Motivo</Label><Input value={exception.reason ?? ''} onChange={(event) => { const next = [...value]; next[index] = { ...exception, reason: event.target.value }; onChange(next); }} placeholder="Ex.: Feriado ou plantão" /></div><label className="flex items-center gap-2 self-end pb-2 text-sm"><Switch checked={exception.is_available === true} onCheckedChange={(checked) => { const next = [...value]; next[index] = { ...exception, is_available: checked }; onChange(next); }} /><span>{exception.is_available ? 'Liberado' : 'Bloqueado'}</span></label><Button size="icon" variant="ghost" className="self-end text-destructive hover:text-destructive" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remover exceção"><Trash2 className="h-4 w-4" /></Button></div>)}<div className="flex justify-end"><Button onClick={onSave} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Salvar exceções</Button></div></CardContent></Card>;
}
