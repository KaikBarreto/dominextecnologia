import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Calculator,
  CreditCard,
  FileText,
  History,
  Lightbulb,
  Link2,
  Lock,
  MessageSquareText,
  Megaphone,
  PlugZap,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Unplug,
  type LucideIcon,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { SettingsAsaasContent } from '@/components/settings/SettingsAsaasContent';
import { SettingsAsaasSimulator } from '@/components/settings/SettingsAsaasSimulator';
import { WhatsappAutomationSettings } from '@/components/settings/whatsapp/WhatsappAutomationSettings';
import { WhatsappProtectionSettings } from '@/components/settings/whatsapp/WhatsappProtectionSettings';
import { WhatsappPairingSteps } from '@/components/settings/whatsapp/WhatsappPairingSteps';
import { OptimisticProgress } from '@/components/settings/whatsapp/OptimisticProgress';
import {
  WhatsappInboxPreview,
  WhatsappCampaignsPreview,
  WhatsappTemplatesPreview,
} from '@/components/settings/whatsapp/WhatsappCapabilityPreviews';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useToast } from '@/hooks/use-toast';
import { useWhatsappSettings } from '@/hooks/useWhatsappSettings';
import { useWhatsappConnections, type WhatsappConnectionStatus } from '@/hooks/useWhatsappConnections';
import { MESSAGES } from '@/lib/i18n';
import type { LocaleCode } from '@/lib/i18n/locales';
import { WHATSAPP_MODULE_CODE } from '@/lib/subscriptionCatalog';
import {
  DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES,
  normalizeWhatsappAutomationPreferences,
  type WhatsappAutomationPreferences,
} from '@/lib/whatsappAutomation';

type IntegrationSubTab = 'whatsapp' | 'asaas';
type AsaasSection = 'settings' | 'simulator';
type WhatsappSection = 'automations' | 'inbox' | 'templates' | 'campaigns' | 'history' | 'connection';

const SHELL_COPY: Record<LocaleCode, {
  preparationTitle: string;
  preparationDescription: string;
  noModuleTitle: string;
  noModuleDescription: string;
  readOnlyTitle: string;
  readOnlyDescription: string;
  connectionTitle: string;
  connectionDescription: string;
  pending: string;
  stepProvider: string;
  stepNumber: string;
  stepTemplates: string;
  readyNow: string;
  futureStep: string;
  readyDescription: string;
  lockedSection: string;
  contractModule: string;
  saveSuccess: string;
  sections: Record<WhatsappSection, string>;
}> = {
  'pt-br': {
    preparationTitle: 'Conecte o WhatsApp para liberar as configurações',
    preparationDescription: 'As automações ficam disponíveis após conectar o número da empresa por QR Code. Atendimento e campanhas continuam como etapas futuras.',
    noModuleTitle: 'Prévia do módulo de WhatsApp',
    noModuleDescription: 'Você pode conhecer toda a estrutura. Para salvar e ativar as automações, contrate o módulo de WhatsApp.',
    readOnlyTitle: 'Configuração somente para leitura',
    readOnlyDescription: 'Somente administradores, gestores ou usuários com permissão de configurações podem alterar estas regras.',
    connectionTitle: 'Conexão com o WhatsApp',
    connectionDescription: 'Conecte o WhatsApp atual da empresa por QR Code. A API Oficial da Meta será adicionada depois, sem misturar os canais.',
    pending: 'Conexão necessária',
    stepProvider: 'Escolher QR Code ou Meta',
    stepNumber: 'Conectar o número da empresa',
    stepTemplates: 'Aprovar e vincular os templates',
    readyNow: 'Liberado após conectar',
    futureStep: 'Etapa futura',
    readyDescription: 'Automações, modelos, conteúdo e autorização por cliente.',
    lockedSection: 'Conecte o WhatsApp para liberar esta área',
    contractModule: 'Contratar módulo',
    saveSuccess: 'Configurações de WhatsApp salvas.',
    sections: { automations: 'Automações', inbox: 'Atendimento', templates: 'Modelos', campaigns: 'Campanhas', history: 'Histórico', connection: 'Conexão' },
  },
  en: {
    preparationTitle: 'Connect WhatsApp to unlock settings',
    preparationDescription: 'The other areas remain visible but locked until the company number is officially connected.',
    noModuleTitle: 'WhatsApp module preview', noModuleDescription: 'You can explore the full structure. Subscribe to the WhatsApp module to save and enable automations.',
    readOnlyTitle: 'Read-only settings', readOnlyDescription: 'Only administrators, managers or users with settings permission can change these rules.',
    connectionTitle: 'WhatsApp connection', connectionDescription: 'Message settings are separate from the provider, so they remain valid with Meta direct or an official partner.',
    pending: 'Provider to be defined', stepProvider: 'Choose Meta direct or an official partner', stepNumber: 'Connect the company number', stepTemplates: 'Approve and link templates',
    readyNow: 'Unlocked after connecting', futureStep: 'Future step', readyDescription: 'Automations, templates, content and customer authorization.', lockedSection: 'Connect WhatsApp to unlock this area', contractModule: 'Add module', saveSuccess: 'WhatsApp settings saved.',
    sections: { automations: 'Automations', inbox: 'Inbox', templates: 'Templates', campaigns: 'Campaigns', history: 'History', connection: 'Connection' },
  },
  es: {
    preparationTitle: 'Conecta WhatsApp para desbloquear la configuración', preparationDescription: 'Las demás áreas siguen visibles, pero bloqueadas hasta conectar oficialmente el número de la empresa.',
    noModuleTitle: 'Vista previa del módulo de WhatsApp', noModuleDescription: 'Puedes conocer toda la estructura. Contrata el módulo para guardar y activar automatizaciones.',
    readOnlyTitle: 'Configuración de solo lectura', readOnlyDescription: 'Solo administradores, gestores o usuarios con permiso pueden cambiar estas reglas.',
    connectionTitle: 'Conexión con WhatsApp', connectionDescription: 'La configuración de mensajes está separada del proveedor y seguirá válida con Meta directa o un socio oficial.',
    pending: 'Proveedor por definir', stepProvider: 'Elegir Meta directa o un socio oficial', stepNumber: 'Conectar el número de la empresa', stepTemplates: 'Aprobar y vincular las plantillas',
    readyNow: 'Se desbloquea al conectar', futureStep: 'Etapa futura', readyDescription: 'Automatizaciones, plantillas, contenido y autorización por cliente.', lockedSection: 'Conecta WhatsApp para desbloquear esta área', contractModule: 'Contratar módulo', saveSuccess: 'Configuración de WhatsApp guardada.',
    sections: { automations: 'Automatizaciones', inbox: 'Atención', templates: 'Plantillas', campaigns: 'Campañas', history: 'Historial', connection: 'Conexión' },
  },
  fr: {
    preparationTitle: 'Connectez WhatsApp pour déverrouiller les paramètres', preparationDescription: 'Les autres sections restent visibles mais verrouillées jusqu’à la connexion officielle du numéro de l’entreprise.',
    noModuleTitle: 'Aperçu du module WhatsApp', noModuleDescription: 'Vous pouvez découvrir toute la structure. Souscrivez au module pour enregistrer et activer les automatisations.',
    readOnlyTitle: 'Paramètres en lecture seule', readOnlyDescription: 'Seuls les administrateurs, gestionnaires ou utilisateurs autorisés peuvent modifier ces règles.',
    connectionTitle: 'Connexion WhatsApp', connectionDescription: 'Les paramètres de message sont séparés du fournisseur et restent valables avec Meta direct ou un partenaire officiel.',
    pending: 'Fournisseur à définir', stepProvider: 'Choisir Meta direct ou un partenaire officiel', stepNumber: 'Connecter le numéro de l’entreprise', stepTemplates: 'Approuver et lier les modèles',
    readyNow: 'Déverrouillé après connexion', futureStep: 'Étape future', readyDescription: 'Automatisations, modèles, contenu et autorisation client.', lockedSection: 'Connectez WhatsApp pour déverrouiller cette section', contractModule: 'Ajouter le module', saveSuccess: 'Paramètres WhatsApp enregistrés.',
    sections: { automations: 'Automatisations', inbox: 'Assistance', templates: 'Modèles', campaigns: 'Campagnes', history: 'Historique', connection: 'Connexion' },
  },
};

export function SettingsIntegrationContent() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.integrations;
  const [activeSubTab, setActiveSubTab] = useState<IntegrationSubTab>('whatsapp');

  const subTabs = [
    { value: 'whatsapp' as const, label: t.subTabs.whatsapp, icon: <WhatsAppIcon className="h-4 w-4 shrink-0" /> },
    { value: 'asaas' as const, label: t.subTabs.asaas, icon: <CreditCard className="h-4 w-4 shrink-0" /> },
  ];

  return (
    <div className="space-y-4">
      <MobilePillTabs
        variant="underline"
        tabs={subTabs}
        activeTab={activeSubTab}
        onTabChange={(value) => setActiveSubTab(value as IntegrationSubTab)}
      />

      {activeSubTab === 'whatsapp' && <WhatsappContent />}
      {activeSubTab === 'asaas' && <AsaasContent />}
    </div>
  );
}

export function AsaasContent() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.integrations.subTabs;
  const [activeSection, setActiveSection] = useState<AsaasSection>('settings');

  const sections = [
    { value: 'settings' as const, label: t.configuracao, icon: <Settings2 className="h-4 w-4 shrink-0" /> },
    { value: 'simulator' as const, label: t.simulador, icon: <Calculator className="h-4 w-4 shrink-0" /> },
  ];

  return (
    <div className="space-y-4">
      <MobilePillTabs
        tabs={sections}
        activeTab={activeSection}
        onTabChange={(value) => setActiveSection(value as AsaasSection)}
      />

      {activeSection === 'settings' && <SettingsAsaasContent />}
      {activeSection === 'simulator' && <SettingsAsaasSimulator />}
    </div>
  );
}

function WhatsappContent() {
  const navigate = useNavigate();
  const { locale } = useAppLocaleContext();
  const copy = SHELL_COPY[locale];
  const { toast } = useToast();
  const { isAdminOrGestor, hasPermission } = useAuth();
  const canManage = isAdminOrGestor() || hasPermission('fn:manage_settings');
  const { hasModule, isLoading: modulesLoading } = useCompanyModules();
  const { settings, isLoading, update } = useWhatsappSettings();
  const whatsappConnections = useWhatsappConnections();
  const [requestedSection, setRequestedSection] = useState<WhatsappSection | null>(null);

  const persistedPreferences = useMemo(
    () => normalizeWhatsappAutomationPreferences(settings?.automation_preferences),
    [settings?.automation_preferences],
  );
  const [enabled, setEnabled] = useState(false);
  const [preferences, setPreferences] = useState<WhatsappAutomationPreferences>(
    DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES,
  );

  useEffect(() => {
    setEnabled(settings?.enabled ?? false);
    setPreferences(persistedPreferences);
  }, [settings?.enabled, settings?.updated_at, persistedPreferences]);

  const baseline = useMemo(
    () => JSON.stringify({ enabled: settings?.enabled ?? false, preferences: persistedPreferences }),
    [settings?.enabled, persistedPreferences],
  );
  const current = JSON.stringify({ enabled, preferences });
  const isDirty = current !== baseline;
  const moduleActive = hasModule('whatsapp');
  const readOnly = !moduleActive || !canManage;
  const isConnected = whatsappConnections.connections.some(
    (connection) => connection.id === settings?.active_connection_id
      && connection.status === 'connected'
      && Boolean(connection.risk_accepted_at),
  );
  const activeSection = isConnected ? (requestedSection ?? 'automations') : 'connection';

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        enabled,
        automation_preferences: preferences,
        // Mantém compatibilidade com o motor atual até a troca do provedor.
        trigger_a_caminho: preferences.os.events.a_caminho.enabled,
        trigger_em_andamento: preferences.os.events.em_andamento.enabled,
        trigger_concluida: preferences.os.events.concluida.enabled,
      });
      toast({ title: copy.saveSuccess });
    } catch {
      // O hook já mostra o erro traduzido e restaura o cache anterior.
    }
  };

  if (isLoading || modulesLoading) {
    return (
      <div className="space-y-4" aria-label="Carregando configurações do WhatsApp">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-[560px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!moduleActive ? (
        <NoticeBanner
          variant="warning"
          icon={Lock}
          title={copy.noModuleTitle}
          action={canManage ? (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 bg-white px-3 text-foreground hover:bg-white/90"
              onClick={() => navigate(`/assinatura?addModule=${WHATSAPP_MODULE_CODE}`)}
            >
              {copy.contractModule}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : undefined}
        >
          {copy.noModuleDescription}
        </NoticeBanner>
      ) : !canManage ? (
        <NoticeBanner variant="neutral" icon={Lock} title={copy.readOnlyTitle}>
          {copy.readOnlyDescription}
        </NoticeBanner>
      ) : !isConnected && activeSection !== 'connection' ? (
        /* Só faz sentido para quem AINDA não conectou. Ficava na tela mesmo com
           o número já pareado, mandando conectar o que já estava conectado.
           E na aba de Conexão ele repetia, a 60px de distância, exatamente o que
           o cartão logo abaixo já diz. */
        <NoticeBanner variant="info" title={copy.preparationTitle}>
          {copy.preparationDescription}
        </NoticeBanner>
      ) : null}

      <WhatsappSectionNav
        active={activeSection}
        isConnected={isConnected}
        lockedLabel={copy.lockedSection}
        onChange={setRequestedSection}
        labels={copy.sections}
      />

      {activeSection === 'automations' && (
        <>
          {/* Horário e ritmo vêm antes do conteúdo: é a régua que protege o número.
              O botão de salvar é o do card de automações, logo abaixo. */}
          <WhatsappProtectionSettings
            locale={locale}
            preferences={preferences}
            readOnly={readOnly}
            onPreferencesChange={setPreferences}
          />
          <WhatsappAutomationSettings
            locale={locale}
            enabled={enabled}
            preferences={preferences}
            isSaving={update.isPending}
            isDirty={isDirty}
            readOnly={readOnly}
            onEnabledChange={setEnabled}
            onPreferencesChange={setPreferences}
            onSave={handleSave}
          />
        </>
      )}

      {activeSection === 'inbox' && <WhatsappInboxPreview />}
      {activeSection === 'templates' && <WhatsappTemplatesPreview />}
      {activeSection === 'campaigns' && <WhatsappCampaignsPreview />}
      {activeSection === 'history' && (
        <WhatsappOperationalHistory jobs={whatsappConnections.jobs} isLoading={whatsappConnections.historyLoading} />
      )}
      {activeSection === 'connection' && (
        <ConnectionCard
          copy={copy}
          activeConnectionId={settings?.active_connection_id ?? null}
          canManage={isAdminOrGestor()}
          moduleActive={moduleActive}
          connectionState={whatsappConnections}
        />
      )}
    </div>
  );
}

const SECTION_ICONS: Record<WhatsappSection, LucideIcon> = {
  automations: Bot,
  inbox: MessageSquareText,
  templates: FileText,
  campaigns: Megaphone,
  history: History,
  connection: PlugZap,
};

export function WhatsappSectionNav({
  active,
  isConnected,
  lockedLabel,
  onChange,
  labels,
}: {
  active: WhatsappSection;
  isConnected: boolean;
  lockedLabel: string;
  onChange: (section: WhatsappSection) => void;
  labels: Record<WhatsappSection, string>;
}) {
  const sections = Object.keys(labels) as WhatsappSection[];
  const isLocked = (section: WhatsappSection) =>
    section === 'inbox' || section === 'campaigns'
    || (section !== 'connection' && !isConnected);
  return (
    /* Underline é o padrão de navegação por abas do sistema (mesmo componente
       das abas WhatsApp/Cobranças logo acima). Antes era uma grade de pills com
       borda dentro de uma caixa com borda, que somava mais duas molduras numa
       tela que já tinha molduras demais. */
    <MobilePillTabs
      variant="underline"
      tabs={sections.map((section) => {
        const Icon = SECTION_ICONS[section];
        return { value: section, label: labels[section], icon: <Icon className="h-4 w-4 shrink-0" /> };
      })}
      activeTab={active}
      onTabChange={(value) => {
        const section = value as WhatsappSection;
        // Aba bloqueada não navega. O MobilePillTabs não tem estado desabilitado,
        // então o guarda fica aqui, e o cadeado ao lado do rótulo avisa por quê.
        if (isLocked(section)) return;
        onChange(section);
      }}
      renderSuffix={(tab) =>
        isLocked(tab.value as WhatsappSection)
          ? (
            <span
              className="ml-1 inline-flex items-center text-muted-foreground/70"
              title={tab.value === 'inbox' || tab.value === 'campaigns' ? 'Etapa futura' : lockedLabel}
            >
              <Lock className="h-3 w-3" aria-hidden="true" />
            </span>
          )
          : null
      }
    />
  );
}

type ConnectionState = ReturnType<typeof useWhatsappConnections>;

const CONNECTION_LABELS: Record<WhatsappConnectionStatus, string> = {
  disconnected: 'Desconectado', connecting: 'Conectando', qr: 'Aguardando leitura do QR',
  connected: 'Conectado', attention: 'Pausado por segurança', banned: 'Possível bloqueio', error: 'Erro',
};

function ConnectionCard({
  copy,
  activeConnectionId,
  canManage,
  moduleActive,
  connectionState,
}: {
  copy: (typeof SHELL_COPY)[LocaleCode];
  activeConnectionId: string | null;
  canManage: boolean;
  moduleActive: boolean;
  connectionState: ConnectionState;
}) {
  const { toast } = useToast();
  const [acceptedRisk, setAcceptedRisk] = useState(false);
  const qrConnection = connectionState.connections.find((connection) => connection.provider === 'evolution_qr');
  const qrPayload = connectionState.connectQr.data;
  const qrImageSrc = qrPayload?.qr?.startsWith('data:image')
    ? qrPayload.qr
    : qrPayload?.qr?.startsWith('iVBOR')
      ? `data:image/png;base64,${qrPayload.qr}`
      : null;
  const active = qrConnection?.id === activeConnectionId;
  const qrReady = qrConnection?.status === 'connected' && Boolean(qrConnection.risk_accepted_at);

  const startQr = async () => {
    try {
      await connectionState.connectQr.mutateAsync();
      toast({ title: 'QR Code gerado', description: 'Abra o WhatsApp no celular e leia o código abaixo.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível conectar', description: (error as Error).message });
    }
  };

  const activate = async () => {
    if (!qrConnection) return;
    try {
      await connectionState.selectConnection.mutateAsync(qrConnection.id);
      toast({ title: 'Canal ativado', description: 'Os próximos avisos usarão este número.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível ativar', description: (error as Error).message });
    }
  };

  const disconnect = async () => {
    if (!qrConnection) return;
    try {
      await connectionState.disconnect.mutateAsync(qrConnection.id);
      connectionState.connectQr.reset();
      toast({ title: 'WhatsApp desconectado', description: 'A fila foi pausada e não mudará de canal automaticamente.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível desconectar', description: (error as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-5 w-5 text-primary" />
            {copy.connectionTitle}
          </CardTitle>
          <CardDescription className="mt-1 max-w-2xl">{copy.connectionDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* HIERARQUIA: o QR é a única ação possível hoje, então ele é o herói e
              ocupa a largura toda. A Meta Cloud API vira faixa secundária abaixo.
              Antes os dois dividiam 50/50, o que prometia uma escolha que não
              existe e ainda deixava meia tela vazia do lado desabilitado. */}
          <section>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white">
                  <WhatsAppIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold leading-tight">Conectar por QR Code</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Usa um número de WhatsApp da empresa. Leva menos de um minuto.
                  </p>
                </div>
              </div>
              <Badge variant={qrReady ? 'default' : 'outline'} className="shrink-0">
                {qrConnection?.status === 'connected' && !qrConnection.risk_accepted_at
                  ? 'Aceite necessário'
                  : CONNECTION_LABELS[qrConnection?.status ?? 'disconnected']}
              </Badge>
            </div>

            {qrConnection?.display_number && (
              <p className="mt-4 text-sm"><span className="text-muted-foreground">Número:</span> +{qrConnection.display_number}</p>
            )}

            {/* Só é erro quando o número chegou a conectar de verdade, ou quando o
                estado é mesmo de falha. Mostrar "foi desconectado" pra quem nunca
                conectou é alarme falso, e alarme falso treina o cliente a ignorar
                alarme de verdade. */}
            {qrConnection?.last_error
              && (Boolean(qrConnection.display_number) || qrConnection.status === 'error' || qrConnection.status === 'banned') && (
              <NoticeBanner variant="destructive" className="mt-4">{qrConnection.last_error}</NoticeBanner>
            )}

            {qrPayload?.qr && qrConnection?.status !== 'connected' && (
              <div className="mt-5 flex flex-col items-center rounded-xl bg-white p-4 text-slate-950">
                {qrImageSrc ? (
                  <img src={qrImageSrc} alt="QR Code para conectar o WhatsApp" className="h-56 w-56" />
                ) : (
                  <QRCodeSVG value={qrPayload.qr} size={224} level="M" />
                )}
                <p className="mt-3 text-center text-xs text-slate-600">WhatsApp → Aparelhos conectados → Conectar aparelho</p>
              </div>
            )}

            {!qrReady && (
              <>
                {/* O passo a passo fica visível TAMBÉM com o QR na tela: é
                    justamente nesse momento que a pessoa está com o celular na
                    mão procurando o menu certo. */}
                <WhatsappPairingSteps className="mt-4" />

                <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                  <Checkbox checked={acceptedRisk} onCheckedChange={(value) => setAcceptedRisk(value === true)} className="mt-0.5" disabled={!canManage || !moduleActive} />
                  <span>
                    Entendo que toda automação de WhatsApp fora da API Oficial da Meta tem um risco, ainda que ínfimo, de bloqueio do número, justamente por se tratar de envio automatizado.
                  </span>
                </label>

                {/* Recomendação, não perigo. Virou dica discreta: em bloco laranja
                    cheio ela pesava mais que o próprio botão de conectar. */}
                <p className="mt-2.5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  Pode ser melhor usar um número secundário. Se a empresa tiver um chip separado para os avisos, o WhatsApp principal de atendimento segue funcionando em qualquer cenário.
                </p>
              </>
            )}

            {/* A criação da instância na Evolution leva alguns segundos. Sem
                sinal de progresso, a espera parece travamento e o cliente
                clica de novo. */}
            <OptimisticProgress
              active={connectionState.connectQr.isPending}
              label="Preparando a conexão e gerando o QR Code…"
              className="mt-4"
            />

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {qrReady ? (
                <>
                  {!active && <Button type="button" size="lg" onClick={activate} disabled={!canManage || !moduleActive || connectionState.selectConnection.isPending}>Usar este canal</Button>}
                  <Button type="button" variant="outline" onClick={disconnect} disabled={!canManage || connectionState.disconnect.isPending}><Unplug className="mr-2 h-4 w-4" />Desconectar</Button>
                  {active && <Badge variant="outline" className="h-9 px-3">Canal ativo</Badge>}
                </>
              ) : (
                <Button type="button" size="lg" className="w-full sm:w-auto" onClick={startQr} disabled={!canManage || !moduleActive || !acceptedRisk || connectionState.connectQr.isPending}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${connectionState.connectQr.isPending ? 'animate-spin' : ''}`} />
                  {qrConnection?.status === 'connected' ? 'Confirmar e ativar' : qrPayload?.qr ? 'Gerar novo QR Code' : 'Conectar meu WhatsApp'}
                </Button>
              )}
            </div>
          </section>

          {/* Secundário de propósito: está desabilitado, então não disputa atenção
              com a única ação possível. Sem caixa: a separação vem de uma linha
              e do espaço, não de mais uma moldura dentro do cartão. */}
          <Separator />
          <section className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">Meta Cloud API</h3>
                <Badge variant="secondary" className="shrink-0">Em breve</Badge>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Conexão oficial pelo Facebook, com mais estabilidade e escala. Os custos da Meta serão separados do plano Dominex.
              </p>
            </div>
          </section>
          <div className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            O Dominex reduz o risco com consentimento, fila, aquecimento e limites. Nenhuma integração por QR Code consegue garantir ausência de bloqueio.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WhatsappOperationalHistory({ jobs, isLoading }: { jobs: ConnectionState['jobs']; isLoading: boolean }) {
  const counts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] ?? 0) + 1;
    return acc;
  }, {});
  const labels: Record<string, string> = { pending: 'Na fila', processing: 'Processando', retry: 'Nova tentativa', sent: 'Enviado', delivered: 'Entregue', read: 'Lido', skipped: 'Ignorado', failed: 'Falhou', cancelled: 'Cancelado' };
  const metricValue = (status: string) => status === 'pending'
    ? (counts.pending ?? 0) + (counts.processing ?? 0) + (counts.retry ?? 0)
    : counts[status] ?? 0;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Fila e histórico de envios</CardTitle><CardDescription>Últimos 50 avisos transacionais. Mensagens ignoradas mostram o motivo.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {['pending', 'sent', 'delivered', 'read', 'skipped', 'failed'].map((status) => (
            <div key={status} className="rounded-lg bg-muted/35 p-3"><p className="text-xs text-muted-foreground">{labels[status]}</p><p className="mt-1 text-xl font-semibold">{metricValue(status)}</p></div>
          ))}
        </div>
        {isLoading ? <Skeleton className="h-32 w-full" /> : jobs.length === 0 ? (
          <p className="rounded-lg bg-muted/30 p-6 text-center text-sm text-muted-foreground">Nenhum aviso entrou na fila ainda.</p>
        ) : (
          <div className="divide-y rounded-lg bg-muted/20">
            {jobs.slice(0, 15).map((job) => (
              <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
                <div><p className="font-medium">{job.event_key.replace('os.', 'OS · ').replace('billing.', 'Cobrança · ')}</p><p className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString('pt-BR')}{job.last_error ? ` · ${job.last_error}` : ''}</p></div>
                <Badge variant="outline">{labels[job.status] ?? job.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
