import { useState, useRef, useCallback } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import {
  Wifi,
  WifiOff,
  QrCode,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Zap,
  Bell,
} from 'lucide-react';
import { Lock } from 'lucide-react';
import { Wallet } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { EmptyState } from '@/components/mobile/EmptyState';
import { SettingsAsaasContent } from '@/components/settings/SettingsAsaasContent';
import { useWhatsappSettings } from '@/hooks/useWhatsappSettings';
import { useWhatsappConnection } from '@/hooks/useWhatsappConnection';
import { useWhatsappQuota } from '@/hooks/useWhatsappQuota';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { cn } from '@/lib/utils';

// ─── Feature flag: quando o WhatsApp for liberado, trocar pra false ───────────
const WHATSAPP_COMING_SOON = true;

// ─── Subabas das Integrações (extensível) ────────────────────────────────────
type IntegrationSubTab = 'whatsapp' | 'asaas';

export function SettingsIntegrationContent() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.integrations;

  const [activeSubTab, setActiveSubTab] = useState<IntegrationSubTab>('whatsapp');

  const subTabs = [
    {
      value: 'whatsapp' as IntegrationSubTab,
      label: t.subTabs.whatsapp,
      icon: <WhatsAppIcon className="h-4 w-4 shrink-0" />,
    },
    {
      value: 'asaas' as IntegrationSubTab,
      label: t.subTabs.asaas,
      icon: <Wallet className="h-4 w-4 shrink-0" />,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Pills de subabas (extensível: WhatsApp + Recebimentos) */}
      <MobilePillTabs
        tabs={subTabs}
        activeTab={activeSubTab}
        onTabChange={(v) => setActiveSubTab(v as IntegrationSubTab)}
        renderSuffix={(tab) =>
          WHATSAPP_COMING_SOON && tab.value === 'whatsapp' ? (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none bg-amber-500 text-white shrink-0 pointer-events-none">
              {t.whatsapp.comingSoon.badge}
            </span>
          ) : null
        }
      />

      <div>
        {activeSubTab === 'whatsapp' && (
          WHATSAPP_COMING_SOON ? <WhatsappComingSoonCard /> : <WhatsappContent />
        )}
        {activeSubTab === 'asaas' && <SettingsAsaasContent />}
      </div>
    </div>
  );
}

// ─── Card "Em breve" do WhatsApp ──────────────────────────────────────────────
function WhatsappComingSoonCard() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.integrations.whatsapp.comingSoon;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10 px-6 text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366]">
          <WhatsAppIcon className="h-7 w-7 text-white" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold">{t.title}</h3>
          <p className="text-sm text-muted-foreground max-w-sm">{t.description}</p>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500 text-white">
          {t.badge}
        </span>
      </CardContent>
    </Card>
  );
}

// ─── Conteúdo da subaba WhatsApp ──────────────────────────────────────────────
function WhatsappContent() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.integrations.whatsapp;

  const { settings, isLoading: loadingSettings, companyId, update } = useWhatsappSettings();
  const { connect, isConnecting, qrCode, isError: connectionError, errorMessage } = useWhatsappConnection(companyId);
  const { used, limit, unlimited, tierName, isLoading: loadingQuota } = useWhatsappQuota(companyId);

  // Gate do add-on: sem o módulo 'whatsapp' contratado, o tenant vê o estado
  // "recurso não contratado" (padrão do projeto) em vez do QR/toggles. O gate
  // real de envio já é server-side (edge whatsapp-send via company_has_module).
  const { hasModule, isLoading: modulesLoading } = useCompanyModules();

  // Auto-save com debounce para os toggles
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedUpdate = useCallback(
    (field: string, value: boolean) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        update.mutate({ [field]: value } as any);
      }, 800);
    },
    [update],
  );

  const handleToggle = (field: string) => (checked: boolean) => {
    debouncedUpdate(field, checked);
  };

  // ── Seção Conexão ─────────────────────────────────────────────────────────
  const status = settings?.connection_status ?? 'disconnected';

  const statusConfig = {
    connected: {
      label: t.connection.statusConnected,
      className: 'bg-emerald-600 text-white',
      icon: <Wifi className="h-3.5 w-3.5" />,
    },
    qr: {
      label: t.connection.statusQr,
      className: 'bg-amber-500 text-white',
      icon: <QrCode className="h-3.5 w-3.5" />,
    },
    disconnected: {
      label: t.connection.statusDisconnected,
      className: 'bg-slate-500 text-white',
      icon: <WifiOff className="h-3.5 w-3.5" />,
    },
    banned: {
      label: t.connection.statusBanned,
      className: 'bg-red-600 text-white',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
    },
  } as const;

  const currentStatus = statusConfig[status] ?? statusConfig.disconnected;

  // Cota: percentual de uso
  const usagePercent = limit != null && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const isNearLimit = !unlimited && limit != null && usagePercent >= 80;

  if (loadingSettings || modulesLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-sm">{t.loading}</span>
      </div>
    );
  }

  // Add-on não contratado: estado dedicado, sem expor QR/toggles/cota.
  if (!hasModule('whatsapp')) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<Lock className="h-full w-full" />}
            title={t.notContracted.title}
            description={t.notContracted.description}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── SEÇÃO: MASTER ON/OFF ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
              <div>
                <CardTitle className="text-base">{t.masterToggle.title}</CardTitle>
                <CardDescription className="text-sm">{t.masterToggle.description}</CardDescription>
              </div>
            </div>
            <Switch
              checked={settings?.enabled ?? false}
              onCheckedChange={handleToggle('enabled')}
              disabled={update.isPending}
              aria-label={t.masterToggle.ariaLabel}
            />
          </div>
        </CardHeader>
      </Card>

      {/* ── SEÇÃO: CONEXÃO ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t.connection.sectionTitle}</CardTitle>
          </div>
          <CardDescription>{t.connection.sectionDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Status badge + número conectado */}
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                currentStatus.className,
              )}
            >
              {currentStatus.icon}
              {currentStatus.label}
            </span>

            {status === 'connected' && settings?.connected_number && (
              <span className="text-sm text-muted-foreground">
                {settings.connected_number}
              </span>
            )}
          </div>

          {/* QR code (quando a edge retornar) */}
          {qrCode && (
            <div className="flex flex-col items-center gap-3 p-4 rounded-lg border bg-muted/20">
              <p className="text-sm text-center text-muted-foreground">{t.connection.qrInstructions}</p>
              <img
                src={`data:image/png;base64,${qrCode}`}
                alt="QR Code WhatsApp"
                className="w-48 h-48 rounded-lg border bg-white"
              />
            </div>
          )}

          {/* Erro de conexão */}
          {connectionError && (
            <div className="flex items-start gap-2 rounded-md border border-border bg-card p-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-destructive">{t.connection.errorTitle}</p>
                {errorMessage && (
                  <p className="text-xs text-muted-foreground mt-0.5">{errorMessage}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{t.connection.errorHint}</p>
              </div>
            </div>
          )}

          {/* Botão de conectar */}
          {status !== 'connected' && (
            <Button
              onClick={connect}
              disabled={isConnecting || status === 'banned'}
              className="w-full sm:w-auto"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.connection.connecting}
                </>
              ) : (
                <>
                  <QrCode className="mr-2 h-4 w-4" />
                  {t.connection.btnConnect}
                </>
              )}
            </Button>
          )}

          {status === 'connected' && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              {t.connection.connectedDesc}
            </div>
          )}

          {status === 'banned' && (
            <p className="text-sm text-destructive">{t.connection.bannedDesc}</p>
          )}
        </CardContent>
      </Card>

      {/* ── SEÇÃO: GATILHOS ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t.triggers.sectionTitle}</CardTitle>
          </div>
          <CardDescription>{t.triggers.sectionDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            <TriggerRow
              label={t.triggers.aCaminho.label}
              description={t.triggers.aCaminho.description}
              checked={settings?.trigger_a_caminho ?? false}
              onCheckedChange={handleToggle('trigger_a_caminho')}
              disabled={update.isPending}
            />
            <TriggerRow
              label={t.triggers.emAndamento.label}
              description={t.triggers.emAndamento.description}
              checked={settings?.trigger_em_andamento ?? false}
              onCheckedChange={handleToggle('trigger_em_andamento')}
              disabled={update.isPending}
            />
            <TriggerRow
              label={t.triggers.concluida.label}
              description={t.triggers.concluida.description}
              checked={settings?.trigger_concluida ?? false}
              onCheckedChange={handleToggle('trigger_concluida')}
              disabled={update.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── SEÇÃO: PLANO / COTA ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t.quota.sectionTitle}</CardTitle>
          </div>
          <CardDescription>{t.quota.sectionDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingQuota ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t.loading}
            </div>
          ) : (
            <>
              {/* Tier atual */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">{t.quota.currentPlan}</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground">
                  {tierName || `Nível 1`}
                </span>
              </div>

              <Separator />

              {/* Barra de consumo */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t.quota.usageLabel}</span>
                  <span className={cn('font-semibold tabular-nums', isNearLimit && 'text-amber-600')}>
                    {unlimited
                      ? t.quota.unlimited
                      : `${used.toLocaleString('pt-BR')} / ${limit?.toLocaleString('pt-BR')}`}
                  </span>
                </div>

                {!unlimited && limit != null && (
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        usagePercent >= 100
                          ? 'bg-destructive'
                          : usagePercent >= 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-500',
                      )}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                )}

                {isNearLimit && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t.quota.nearLimitWarning}
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">{t.quota.resetHint}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Linha de trigger (linha de tabela limpa) ──────────────────────────────
interface TriggerRowProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

function TriggerRow({ label, description, checked, onCheckedChange, disabled }: TriggerRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}
