import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  History,
  Link2,
  Lock,
  MessageSquareText,
  Megaphone,
  PlugZap,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { SettingsAsaasContent } from '@/components/settings/SettingsAsaasContent';
import { SettingsAsaasSimulator } from '@/components/settings/SettingsAsaasSimulator';
import { WhatsappAutomationSettings } from '@/components/settings/whatsapp/WhatsappAutomationSettings';
import {
  WhatsappHistoryPreview,
  WhatsappInboxPreview,
  WhatsappCampaignsPreview,
  WhatsappTemplatesPreview,
} from '@/components/settings/whatsapp/WhatsappCapabilityPreviews';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useToast } from '@/hooks/use-toast';
import { useWhatsappSettings } from '@/hooks/useWhatsappSettings';
import { MESSAGES } from '@/lib/i18n';
import type { LocaleCode } from '@/lib/i18n/locales';
import {
  DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES,
  normalizeWhatsappAutomationPreferences,
  type WhatsappAutomationPreferences,
} from '@/lib/whatsappAutomation';

type IntegrationSubTab = 'whatsapp' | 'asaas' | 'simulador';
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
  saveSuccess: string;
  sections: Record<WhatsappSection, string>;
}> = {
  'pt-br': {
    preparationTitle: 'Conecte o WhatsApp para liberar as configurações',
    preparationDescription: 'As outras áreas ficam visíveis, mas bloqueadas até a conexão oficial do número da empresa ser concluída.',
    noModuleTitle: 'Prévia do módulo de WhatsApp',
    noModuleDescription: 'Você pode conhecer toda a estrutura. Para salvar e ativar as automações, contrate o módulo de WhatsApp.',
    readOnlyTitle: 'Configuração somente para leitura',
    readOnlyDescription: 'Somente administradores, gestores ou usuários com permissão de configurações podem alterar estas regras.',
    connectionTitle: 'Conexão com o WhatsApp',
    connectionDescription: 'A configuração de mensagens está separada do provedor. Assim, ela continua válida com Meta direta ou parceiro oficial.',
    pending: 'Provedor a definir',
    stepProvider: 'Escolher Meta direta ou parceiro oficial',
    stepNumber: 'Conectar o número da empresa',
    stepTemplates: 'Aprovar e vincular os templates',
    readyNow: 'Liberado após conectar',
    futureStep: 'Etapa futura',
    readyDescription: 'Automações, modelos, conteúdo e autorização por cliente.',
    lockedSection: 'Conecte o WhatsApp para liberar esta área',
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
    readyNow: 'Unlocked after connecting', futureStep: 'Future step', readyDescription: 'Automations, templates, content and customer authorization.', lockedSection: 'Connect WhatsApp to unlock this area', saveSuccess: 'WhatsApp settings saved.',
    sections: { automations: 'Automations', inbox: 'Inbox', templates: 'Templates', campaigns: 'Campaigns', history: 'History', connection: 'Connection' },
  },
  es: {
    preparationTitle: 'Conecta WhatsApp para desbloquear la configuración', preparationDescription: 'Las demás áreas siguen visibles, pero bloqueadas hasta conectar oficialmente el número de la empresa.',
    noModuleTitle: 'Vista previa del módulo de WhatsApp', noModuleDescription: 'Puedes conocer toda la estructura. Contrata el módulo para guardar y activar automatizaciones.',
    readOnlyTitle: 'Configuración de solo lectura', readOnlyDescription: 'Solo administradores, gestores o usuarios con permiso pueden cambiar estas reglas.',
    connectionTitle: 'Conexión con WhatsApp', connectionDescription: 'La configuración de mensajes está separada del proveedor y seguirá válida con Meta directa o un socio oficial.',
    pending: 'Proveedor por definir', stepProvider: 'Elegir Meta directa o un socio oficial', stepNumber: 'Conectar el número de la empresa', stepTemplates: 'Aprobar y vincular las plantillas',
    readyNow: 'Se desbloquea al conectar', futureStep: 'Etapa futura', readyDescription: 'Automatizaciones, plantillas, contenido y autorización por cliente.', lockedSection: 'Conecta WhatsApp para desbloquear esta área', saveSuccess: 'Configuración de WhatsApp guardada.',
    sections: { automations: 'Automatizaciones', inbox: 'Atención', templates: 'Plantillas', campaigns: 'Campañas', history: 'Historial', connection: 'Conexión' },
  },
  fr: {
    preparationTitle: 'Connectez WhatsApp pour déverrouiller les paramètres', preparationDescription: 'Les autres sections restent visibles mais verrouillées jusqu’à la connexion officielle du numéro de l’entreprise.',
    noModuleTitle: 'Aperçu du module WhatsApp', noModuleDescription: 'Vous pouvez découvrir toute la structure. Souscrivez au module pour enregistrer et activer les automatisations.',
    readOnlyTitle: 'Paramètres en lecture seule', readOnlyDescription: 'Seuls les administrateurs, gestionnaires ou utilisateurs autorisés peuvent modifier ces règles.',
    connectionTitle: 'Connexion WhatsApp', connectionDescription: 'Les paramètres de message sont séparés du fournisseur et restent valables avec Meta direct ou un partenaire officiel.',
    pending: 'Fournisseur à définir', stepProvider: 'Choisir Meta direct ou un partenaire officiel', stepNumber: 'Connecter le numéro de l’entreprise', stepTemplates: 'Approuver et lier les modèles',
    readyNow: 'Déverrouillé après connexion', futureStep: 'Étape future', readyDescription: 'Automatisations, modèles, contenu et autorisation client.', lockedSection: 'Connectez WhatsApp pour déverrouiller cette section', saveSuccess: 'Paramètres WhatsApp enregistrés.',
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
    { value: 'simulador' as const, label: t.subTabs.simulador, icon: <Settings2 className="h-4 w-4 shrink-0" /> },
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
      {activeSubTab === 'asaas' && <SettingsAsaasContent />}
      {activeSubTab === 'simulador' && <SettingsAsaasSimulator />}
    </div>
  );
}

function WhatsappContent() {
  const { locale } = useAppLocaleContext();
  const copy = SHELL_COPY[locale];
  const { toast } = useToast();
  const { isAdminOrGestor, hasPermission } = useAuth();
  const canManage = isAdminOrGestor() || hasPermission('fn:manage_settings');
  const { hasModule, isLoading: modulesLoading } = useCompanyModules();
  const { settings, isLoading, update } = useWhatsappSettings();
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
  const isConnected = settings?.connection_status === 'connected';
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
        <NoticeBanner variant="warning" icon={Lock} title={copy.noModuleTitle}>
          {copy.noModuleDescription}
        </NoticeBanner>
      ) : !canManage ? (
        <NoticeBanner variant="neutral" icon={Lock} title={copy.readOnlyTitle}>
          {copy.readOnlyDescription}
        </NoticeBanner>
      ) : (
        <NoticeBanner variant="info" title={copy.preparationTitle}>
          {copy.preparationDescription}
        </NoticeBanner>
      )}

      <WhatsappSectionNav
        active={activeSection}
        isConnected={isConnected}
        lockedLabel={copy.lockedSection}
        onChange={setRequestedSection}
        labels={copy.sections}
      />

      {activeSection === 'automations' && (
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
      )}

      {activeSection === 'inbox' && <WhatsappInboxPreview />}
      {activeSection === 'templates' && <WhatsappTemplatesPreview />}
      {activeSection === 'campaigns' && <WhatsappCampaignsPreview />}
      {activeSection === 'history' && <WhatsappHistoryPreview />}
      {activeSection === 'connection' && <ConnectionCard copy={copy} />}
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
  return (
    <nav aria-label="Áreas da integração com WhatsApp" className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-2 sm:grid-cols-3 lg:grid-cols-6">
      {sections.map((section) => {
        const Icon = SECTION_ICONS[section];
        const selected = section === active;
        const locked = section !== 'connection' && !isConnected;
        return (
          <button
            key={section}
            type="button"
            onClick={() => onChange(section)}
            disabled={locked}
            aria-disabled={locked}
            aria-current={selected ? 'page' : undefined}
            title={locked ? lockedLabel : undefined}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              selected
                ? 'border-primary bg-primary text-white shadow-sm'
                : locked
                  ? 'cursor-not-allowed border-transparent bg-background text-muted-foreground/60'
                  : 'border-transparent bg-background text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{labels[section]}</span>
            {locked && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        );
      })}
    </nav>
  );
}

function ConnectionCard({ copy }: { copy: (typeof SHELL_COPY)[LocaleCode] }) {
  return (
    <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-5 w-5 text-primary" />
                {copy.connectionTitle}
              </CardTitle>
              <CardDescription className="mt-1 max-w-3xl">{copy.connectionDescription}</CardDescription>
            </div>
            <Badge variant="secondary"><Clock3 className="mr-1 h-3 w-3" />{copy.pending}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <ConnectionStep label={copy.stepProvider} status={copy.futureStep} />
            <ConnectionStep label={copy.stepNumber} status={copy.futureStep} />
            <ConnectionStep label={copy.stepTemplates} status={copy.futureStep} />
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {copy.readyNow}: {copy.readyDescription}
          </div>
        </CardContent>
      </Card>
  );
}

function ConnectionStep({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border px-3 py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">•</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{status}</span>
      </span>
    </div>
  );
}
