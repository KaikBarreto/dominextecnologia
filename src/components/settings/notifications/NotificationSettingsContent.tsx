import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  CreditCard,
  Loader2,
  MonitorSmartphone,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Users,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNotificationSettings, type NotificationRecipientPolicy } from '@/hooks/useNotificationSettings';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useActiveCompanyProfiles } from '@/hooks/useProfiles';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  CATEGORY_LABELS,
  getEffectiveChannels,
  getRuleOrDefault,
  NOTIFICATION_EVENTS,
  type NotificationCategory,
  type NotificationEventDefinition,
} from './catalog';

type Section = 'personal' | 'company';
type EventFilter = 'all' | 'enabled' | 'disabled';

const CATEGORY_ICONS: Record<NotificationCategory, typeof Bell> = {
  agenda: CalendarDays,
  financeiro: CreditCard,
  operacional: Wrench,
  formularios: ClipboardCheck,
};

function friendlyError() {
  return 'Não foi possível salvar agora. Confira sua conexão e tente novamente.';
}
function NotificationLoading() {
  return (
    <div className="flex min-h-64 items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Carregando notificações…
    </div>
  );
}
function PushDeviceCard() {
  const push = usePushNotifications();
  const { toast } = useToast();

  const status = {
    unsupported: ['Não disponível', 'Este navegador ou aparelho não oferece notificações push.'],
    'not-configured': ['Configuração indisponível', 'O push ainda não foi configurado para este ambiente.'],
    blocked: ['Bloqueado no aparelho', 'Autorize as notificações nos ajustes do navegador ou do sistema.'],
    available: ['Pronto para ativar', 'Ative para receber avisos mesmo com o Dominex fechado.'],
    subscribed: ['Ativo neste aparelho', 'Este aparelho está pronto para receber notificações.'],
  }[push.state];

  const handleToggle = async () => {
    try {
      if (push.isSubscribed) {
        await push.disable();
        toast({ title: 'Push desativado neste aparelho' });
      } else {
        await push.enable();
        toast({ title: 'Push ativado!', description: 'Este aparelho já pode receber notificações.' });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível alterar o push',
        description: error instanceof Error ? error.message : friendlyError(),
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Push neste aparelho</CardTitle>
              <CardDescription className="mt-1">{status?.[1]}</CardDescription>
            </div>
          </div>
          <Badge className={cn(
            push.isSubscribed
              ? 'bg-foreground text-background hover:bg-foreground'
              : 'bg-zinc-600 text-white hover:bg-zinc-600',
          )}>
            {push.isLoading ? 'Verificando…' : status?.[0]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            A permissão vale somente para este navegador e pode ser revogada nos ajustes do aparelho.
          </p>
          {(push.state === 'available' || push.state === 'subscribed') && (
            <Button
              type="button"
              variant={push.isSubscribed ? 'outline' : 'default'}
              onClick={handleToggle}
              disabled={push.isPending || push.isLoading}
            >
              {push.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {push.isSubscribed ? 'Desativar neste aparelho' : 'Ativar push'}
            </Button>
          )}
        </div>
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
          O push pode mostrar valor, cliente e resumo na tela bloqueada. A ocultação da prévia é controlada nos ajustes do aparelho.
        </p>
        {push.devices.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meus dispositivos</p>
            {push.devices.map((device) => (
              <div key={device.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
                <MonitorSmartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {device.device_label || 'Navegador sem nome'} {device.is_current && <span className="text-xs text-muted-foreground">(este aparelho)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {device.last_seen_at
                      ? `Visto por último em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(device.last_seen_at))}`
                      : 'Ainda não houve confirmação de uso'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hover:bg-destructive hover:text-destructive-foreground"
                  disabled={push.isPending}
                  onClick={async () => {
                    try {
                      await push.disableDevice(device.id);
                      toast({ title: 'Dispositivo removido' });
                    } catch {
                      toast({ variant: 'destructive', title: 'Dispositivo não removido', description: friendlyError() });
                    }
                  }}
                >
                  Remover
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function PersonalNotifications() {
  const settings = useNotificationSettings();
  const { timezone } = useAppLocaleContext();
  const { toast } = useToast();
  const firstQuietPreference = settings.preferences.find((item) => item.quiet_start || item.quiet_end);
  const savedQuietStart = firstQuietPreference?.quiet_start?.slice(0, 5);
  const savedQuietEnd = firstQuietPreference?.quiet_end?.slice(0, 5);
  const [quietStart, setQuietStart] = useState(firstQuietPreference?.quiet_start?.slice(0, 5) ?? '22:00');
  const [quietEnd, setQuietEnd] = useState(firstQuietPreference?.quiet_end?.slice(0, 5) ?? '07:00');

  useEffect(() => {
    if (!firstQuietPreference) return;
    setQuietStart(savedQuietStart ?? '22:00');
    setQuietEnd(savedQuietEnd ?? '07:00');
  }, [firstQuietPreference, savedQuietEnd, savedQuietStart]);

  if (settings.isLoading) return <NotificationLoading />;
  if (settings.error) {
    return <p className="py-12 text-center text-sm text-destructive">Não foi possível carregar suas preferências.</p>;
  }

  const savePreference = async (eventType: string, patch: { in_app_enabled?: boolean | null; push_enabled?: boolean | null }) => {
    try {
      await settings.updatePreference({ eventType, patch });
    } catch {
      toast({ variant: 'destructive', title: 'Preferência não salva', description: friendlyError() });
    }
  };

  const saveQuietHours = async () => {
    try {
      await settings.updateQuietHours({
        eventTypes: NOTIFICATION_EVENTS.map((event) => event.eventType),
        quietStart: quietStart || null,
        quietEnd: quietEnd || null,
        timezone,
      });
      toast({ title: 'Horário silencioso salvo' });
    } catch {
      toast({ variant: 'destructive', title: 'Horário não salvo', description: friendlyError() });
    }
  };

  return (
    <div className="space-y-5">
      <PushDeviceCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-5 w-5" /> O que quero receber
          </CardTitle>
          <CardDescription>
            Você pode silenciar canais opcionais. A empresa define quais avisos estão disponíveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {NOTIFICATION_EVENTS.map((event) => {
            const Icon = CATEGORY_ICONS[event.category];
            const rule = getRuleOrDefault(event, settings.rules);
            const preference = settings.preferences.find((item) => item.event_type === event.eventType);
            const effective = getEffectiveChannels(rule, preference);
            return (
              <div key={event.eventType} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                    {!rule.enabled && <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">Desativado pela empresa</p>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-12 sm:pl-0">
                  <Label className="flex items-center gap-2 text-xs font-medium">
                    <Bell className="h-3.5 w-3.5" /> Sino
                    <Switch
                      checked={effective.inApp}
                      disabled={!rule.enabled || !rule.in_app_enabled || settings.isSavingPreference}
                      onCheckedChange={(checked) => savePreference(event.eventType, { in_app_enabled: checked })}
                      aria-label={`Notificação no sino: ${event.title}`}
                    />
                  </Label>
                  <Label className="flex items-center gap-2 text-xs font-medium">
                    <Smartphone className="h-3.5 w-3.5" /> Push
                    <Switch
                      checked={effective.push}
                      disabled={!rule.enabled || !rule.push_enabled || settings.isSavingPreference}
                      onCheckedChange={(checked) => savePreference(event.eventType, { push_enabled: checked })}
                      aria-label={`Notificação push: ${event.title}`}
                    />
                  </Label>
                  {preference && (preference.in_app_enabled !== null || preference.push_enabled !== null) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => savePreference(event.eventType, { in_app_enabled: null, push_enabled: null })}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Usar padrão
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-5 w-5" /> Horário silencioso</CardTitle>
          <CardDescription>O sino continua guardando os avisos; o push fica silencioso neste período.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="grid flex-1 grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="notification-quiet-start">Começa</Label>
              <Input id="notification-quiet-start" type="time" value={quietStart} onChange={(event) => setQuietStart(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notification-quiet-end">Termina</Label>
              <Input id="notification-quiet-end" type="time" value={quietEnd} onChange={(event) => setQuietEnd(event.target.value)} />
            </div>
          </div>
          <Button type="button" variant="outline" onClick={saveQuietHours} disabled={settings.isSavingPreference}>
            {settings.isSavingPreference && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar horário
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
interface RuleDraft {
  enabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  scheduleTime: string;
  recipientPolicy: NotificationRecipientPolicy;
}
function createDraft(event: NotificationEventDefinition, rules: ReturnType<typeof useNotificationSettings>['rules']): RuleDraft {
  const rule = getRuleOrDefault(event, rules);
  return {
    enabled: rule.enabled,
    inAppEnabled: rule.in_app_enabled,
    pushEnabled: rule.push_enabled,
    scheduleTime: rule.schedule_time?.slice(0, 5) ?? event.defaultScheduleTime ?? '',
    recipientPolicy: {
      include_defaults: rule.recipient_policy.include_defaults,
      user_ids: [...rule.recipient_policy.user_ids],
      permission_keys: [...rule.recipient_policy.permission_keys],
    },
  };
}
function CompanyRules() {
  const settings = useNotificationSettings();
  const profilesQuery = useActiveCompanyProfiles();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<EventFilter>('all');
  const selectedEvent = NOTIFICATION_EVENTS.find((event) => event.eventType === selectedType) ?? null;
  const selectedSavedRule = settings.rules.find((rule) => rule.event_type === selectedType);
  const [draft, setDraft] = useState<RuleDraft | null>(null);

  useEffect(() => {
    setDraft(selectedEvent ? createDraft(selectedEvent, selectedSavedRule ? [selectedSavedRule] : []) : null);
  }, [selectedEvent, selectedSavedRule]);

  const filteredEvents = useMemo(() => NOTIFICATION_EVENTS.filter((event) => {
    const rule = getRuleOrDefault(event, settings.rules);
    const matchesSearch = `${event.title} ${event.description} ${CATEGORY_LABELS[event.category]}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.trim().toLocaleLowerCase('pt-BR'));
    const matchesFilter = filter === 'all' || (filter === 'enabled' ? rule.enabled : !rule.enabled);
    return matchesSearch && matchesFilter;
  }), [filter, search, settings.rules]);

  if (settings.isLoading) return <NotificationLoading />;
  if (settings.error) {
    return <p className="py-12 text-center text-sm text-destructive">Não foi possível carregar as regras da empresa.</p>;
  }

  const togglePolicyValue = (field: 'user_ids' | 'permission_keys', value: string, checked: boolean) => {
    if (!draft) return;
    const current = draft.recipientPolicy[field];
    setDraft({
      ...draft,
      recipientPolicy: {
        ...draft.recipientPolicy,
        [field]: checked ? Array.from(new Set([...current, value])) : current.filter((item) => item !== value),
      },
    });
  };

  const saveRule = async () => {
    if (!selectedEvent || !draft) return;
    try {
      await settings.updateRule({
        eventType: selectedEvent.eventType,
        patch: {
          enabled: draft.enabled,
          in_app_enabled: draft.inAppEnabled,
          push_enabled: draft.pushEnabled,
          recipient_policy: draft.recipientPolicy,
          schedule_time: draft.scheduleTime || null,
        },
      });
      toast({ title: 'Regra de notificação salva' });
    } catch {
      toast({ variant: 'destructive', title: 'Regra não salva', description: friendlyError() });
    }
  };

  const list = (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar aviso" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={(value) => setFilter(value as EventFilter)}>
          <SelectTrigger className="w-full sm:w-36 lg:w-full xl:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="enabled">Ativos</SelectItem>
            <SelectItem value="disabled">Desativados</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        {filteredEvents.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">Nenhum aviso encontrado.</p>
        ) : filteredEvents.map((event) => {
          const Icon = CATEGORY_ICONS[event.category];
          const rule = getRuleOrDefault(event, settings.rules);
          const active = selectedType === event.eventType;
          return (
            <button
              type="button"
              key={event.eventType}
              onClick={() => setSelectedType(event.eventType)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{event.title}</span>
                <span className={cn('block truncate text-xs', active ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
                  {CATEGORY_LABELS[event.category]}
                </span>
              </span>
              <span className={cn('h-2 w-2 rounded-full', rule.enabled ? 'bg-foreground' : 'bg-zinc-400')} aria-label={rule.enabled ? 'Ativo' : 'Desativado'} />
              <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
            </button>
          );
        })}
      </div>
    </div>
  );

  const detail = selectedEvent && draft ? (
    <div className="space-y-6">
      {isMobile && (
        <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => setSelectedType(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar aos avisos
        </Button>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_LABELS[selectedEvent.category]}</p>
          <h3 className="mt-1 text-xl font-bold">{selectedEvent.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{selectedEvent.description}</p>
        </div>
        <Label className="flex items-center gap-3 rounded-lg border px-3 py-2">
          <span className="text-sm font-semibold">Evento ativo</span>
          <Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
        </Label>
      </div>

      <Separator />

      <section className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">Canais</h4>
          <p className="text-xs text-muted-foreground">O sino guarda o aviso; o push chama a atenção fora do app.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label className="flex items-center justify-between rounded-lg border p-3">
            <span className="flex items-center gap-2 text-sm"><Bell className="h-4 w-4" /> Sino no Dominex</span>
            <Switch disabled={!draft.enabled} checked={draft.inAppEnabled} onCheckedChange={(inAppEnabled) => setDraft({ ...draft, inAppEnabled })} />
          </Label>
          <Label className="flex items-center justify-between rounded-lg border p-3">
            <span className="flex items-center gap-2 text-sm"><Smartphone className="h-4 w-4" /> Push no aparelho</span>
            <Switch disabled={!draft.enabled} checked={draft.pushEnabled} onCheckedChange={(pushEnabled) => setDraft({ ...draft, pushEnabled })} />
          </Label>
        </div>
      </section>

      {selectedEvent.defaultScheduleTime && (
        <section className="space-y-2">
          <Label htmlFor="company-notification-time">Horário do resumo</Label>
          <Input
            id="company-notification-time"
            type="time"
            className="max-w-44"
            value={draft.scheduleTime}
            onChange={(event) => setDraft({ ...draft, scheduleTime: event.target.value })}
            disabled={!draft.enabled}
          />
          <p className="text-xs text-muted-foreground">Usa o fuso configurado para a empresa.</p>
        </section>
      )}

      <section className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold">Quem recebe</h4>
          <p className="text-xs text-muted-foreground">Os filtros são combinados e sempre respeitam a empresa e usuários ativos.</p>
        </div>
        <Label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            checked={draft.recipientPolicy.include_defaults}
            onCheckedChange={(checked) => setDraft({
              ...draft,
              recipientPolicy: { ...draft.recipientPolicy, include_defaults: checked === true },
            })}
          />
          <span>
            <span className="block text-sm font-semibold">Responsáveis padrão</span>
            <span className="block text-xs font-normal text-muted-foreground">Inclui criador, responsáveis ou equipe conforme o tipo do aviso.</span>
          </span>
        </Label>

        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" /> Por permissão</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {selectedEvent.permissionOptions.map((permission) => (
              <Label key={permission.key} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-normal">
                <Checkbox
                  checked={draft.recipientPolicy.permission_keys.includes(permission.key)}
                  onCheckedChange={(checked) => togglePolicyValue('permission_keys', permission.key, checked === true)}
                />
                {permission.label}
              </Label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> Pessoas específicas</p>
          {profilesQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando pessoas…</p>
          ) : (profilesQuery.data?.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Nenhuma pessoa ativa encontrada.</p>
          ) : (
            <div className="grid max-h-52 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {profilesQuery.data?.map((profile) => (
                <Label key={profile.user_id} className="flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-normal">
                  <Checkbox
                    checked={draft.recipientPolicy.user_ids.includes(profile.user_id)}
                    onCheckedChange={(checked) => togglePolicyValue('user_ids', profile.user_id, checked === true)}
                  />
                  <span className="truncate">{profile.full_name || 'Usuário sem nome'}</span>
                </Label>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="flex justify-end border-t pt-4">
        <Button type="button" onClick={saveRule} disabled={settings.isSavingRule}>
          {settings.isSavingRule && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar regra
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex min-h-96 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Bell className="h-5 w-5 text-muted-foreground" /></div>
      <h3 className="mt-4 text-sm font-semibold">Selecione um aviso</h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">Escolha um item da lista para configurar canais, destinatários e horário.</p>
    </div>
  );

  if (isMobile) return selectedEvent ? detail : list;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside>{list}</aside>
      <Card><CardContent className="p-5 lg:p-6">{detail}</CardContent></Card>
    </div>
  );
}

export function NotificationSettingsContent({ canManageRules }: { canManageRules: boolean }) {
  const [section, setSection] = useState<Section>('personal');
  const tabs = [
    { value: 'personal', label: 'Minhas notificações', icon: <MonitorSmartphone className="h-4 w-4" /> },
    ...(canManageRules ? [{ value: 'company', label: 'Regras da empresa', icon: <ShieldCheck className="h-4 w-4" /> }] : []),
  ];

  useEffect(() => {
    if (!canManageRules && section === 'company') setSection('personal');
  }, [canManageRules, section]);

  return (
    <div className="space-y-5 [--primary:0_0%_5%] [--primary-foreground:0_0%_100%] dark:[--primary:0_0%_100%] dark:[--primary-foreground:0_0%_5%]">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">Notificações</h2>
        <p className="text-sm text-muted-foreground">Escolha os avisos importantes sem perder o histórico do sino.</p>
      </div>
      <MobilePillTabs
        variant="underline"
        level="section"
        tabs={tabs}
        activeTab={section}
        onTabChange={(value) => setSection(value as Section)}
      />
      {section === 'personal' ? <PersonalNotifications /> : <CompanyRules />}
    </div>
  );
}
