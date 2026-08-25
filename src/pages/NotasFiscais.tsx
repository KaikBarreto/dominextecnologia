import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  FileText,
  Plus,
  Settings,
  Shield,
  Loader2,
  LayoutDashboard,
} from 'lucide-react';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useFiscalSettings } from '@/hooks/useFiscalSettings';
import { useNfse, useNfseListPolling, type NfseEmission } from '@/hooks/useNfse';
import { NfseQuotaBadge } from '@/components/fiscal/NfseQuotaBadge';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { FISCAL_SCREEN_PERMISSION } from '@/components/fiscal/fiscalPermissions';
import { isNfseTerminal } from '@/components/fiscal/nfseStatus';
import { NovaNotaModal } from '@/components/fiscal/NovaNotaModal';
import {
  NfseDetailModal,
  type NfseDetailAction,
} from '@/components/fiscal/NfseDetailModal';
import { NfseVisaoGeral } from '@/components/fiscal/NfseVisaoGeral';
import { FiscalSettingsModal } from '@/components/fiscal/FiscalSettingsModal';
import { NfseListTab } from '@/components/fiscal/NfseListTab';

/** Normaliza string pra busca (ignora acento/caixa). */
const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function NotasFiscais() {
  const isMobile = useIsMobile();
  const { hasScreenAccess } = useAuth();
  const { hasModule, isLoading: modulesLoading } = useCompanyModules();
  const { companyId } = useUserCompany();
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;
  const { emissions, isLoading, refetch: refetchEmissions } = useNfse();
  const { settings, isLoading: settingsLoading } = useFiscalSettings();

  // "Config fiscal incompleta": `pode_emitir` é o sinal autoritativo do backend
  // (vira true só depois do onboarding Fisqal — empresa + certificado prontos).
  // Enquanto false, a empresa não consegue emitir, então guiamos pra config.
  const fiscalConfigured = settings.pode_emitir;
  // Mostrar as abas/listagem assim que HÁ atividade fiscal (empresa já registrada
  // OU qualquer nota/rascunho), mesmo antes de `pode_emitir` — senão um rascunho
  // salvo fica invisível até o onboarding concluir. A ação de EMITIR continua
  // travada por `fiscalConfigured` (canEmit).
  const hasFiscalActivity =
    settings.pode_emitir || !!settings.fisqal_company_id || emissions.length > 0;

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<'visao-geral' | 'nfse'>('visao-geral');
  const [novaOpen, setNovaOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<NfseEmission | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailAction, setDetailAction] = useState<NfseDetailAction | null>(null);

  // Deep-link `?config=1` (rota legada /notas-fiscais/configuracoes) abre o modal
  // de configuração fiscal e limpa o param pra não re-disparar em re-renders.
  useEffect(() => {
    if (searchParams.get('config') === '1') {
      setSettingsOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('config');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const customerName = useMemo(() => {
    return (id: string | null) => (id ? t.list.customerFallback : t.list.customerFallback);
  }, [t.list.customerFallback]);

  // Notas NÃO-terminais → polling automático em lote enquanto a tela está
  // aberta. A Visão Geral usa `emissions` do `useNfse`.
  const pendingIds = useMemo(
    () =>
      emissions
        .filter((e) => !isNfseTerminal(e.status))
        .slice(0, 10)
        .map((e) => e.id),
    [emissions],
  );
  useNfseListPolling(pendingIds);

  // Pós-emissão: abre o detalhe da nota recém-criada já em polling automático.
  const handleEmitted = (created?: NfseEmission | null) => {
    if (created) openDetail(created);
  };

  // ---- Gate duplo (módulo `nfe` + permissão de tela) ----
  if (!modulesLoading && (!hasModule('nfe') || !hasScreenAccess(FISCAL_SCREEN_PERMISSION))) {
    return (
      <div className="container max-w-3xl py-4">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            {t.access.noAccess}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const openDetail = (e: NfseEmission, action: NfseDetailAction | null = null) => {
    setSelected(e);
    setDetailAction(action);
    setDetailOpen(true);
  };

  // Botão de acesso à config fiscal.
  const configButton = (
    <Button
      variant="outline"
      className="gap-2"
      aria-label={t.actions.fiscalSettings}
      onClick={() => setSettingsOpen(true)}
    >
      <Settings className="h-4 w-4" />
      <span className="hidden sm:inline">{t.actions.fiscalSettings}</span>
    </Button>
  );

  // Sub-navegação com rótulos traduzidos.
  const navTabs: SettingsTab[] = [
    { value: 'visao-geral', label: t.tabs.overview, icon: LayoutDashboard },
    { value: 'nfse', label: t.tabs.list, icon: FileText },
  ];

  // Estado vazio guiado: config incompleta → manda configurar; config OK sem
  // notas → manda emitir. Vale pras duas abas enquanto ainda sem notas emitidas.
  const renderGuidedEmpty = () => {
    if (!fiscalConfigured) {
      return (
        <EmptyState
          icon={<Settings className="h-10 w-10" />}
          title={t.empty.configTitle}
          description={t.empty.configDescription}
          action={{ label: t.empty.configAction, onClick: () => setSettingsOpen(true) }}
        />
      );
    }
    return (
      <EmptyState
        icon={<FileText className="h-10 w-10" />}
        title={t.empty.noNotesTitle}
        description={t.empty.noNotesDescription}
        action={{ label: t.empty.noNotesAction, onClick: () => setNovaOpen(true) }}
      />
    );
  };

  const anyLoading = isLoading || settingsLoading;
  // Mostramos o estado guiado único só quando ainda não configurado.
  // Se configurado, mostramos sempre as abas (a listagem tem seu próprio estado vazio).
  const showGuidedEmpty = !anyLoading && !hasFiscalActivity;

  return (
    <div className={cn('space-y-6', isMobile && 'pb-24 space-y-4')}>
      <MobilePageHeader
        title={t.page.title}
        subtitle={t.page.subtitle}
        icon={FileText}
        actions={
          <>
            {configButton}
            <Button onClick={() => setNovaOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> {t.actions.newNote}
            </Button>
          </>
        }
      />

      {/* Medidor de consumo mensal de NFS-e */}
      <NfseQuotaBadge companyId={companyId} />

      {anyLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : showGuidedEmpty ? (
        // Sem config: estado guiado único (sem sub-nav, não há o que navegar).
        renderGuidedEmpty()
      ) : (
        <SettingsSidebarLayout
          tabs={navTabs}
          activeTab={tab}
          onTabChange={(v) => setTab(v as 'visao-geral' | 'nfse')}
        >
          {tab === 'visao-geral' ? (
            /* ---- Visão Geral: agrega, não repete a listagem ---- */
            <NfseVisaoGeral
              emissions={emissions}
              customerName={customerName}
              onOpenDetail={(e) => openDetail(e)}
            />
          ) : (
            /* ---- NFS-e: listagem paginada com ações por linha ---- */
            <NfseListTab
              canEmit={fiscalConfigured}
              onNewNote={() => setNovaOpen(true)}
            />
          )}
        </SettingsSidebarLayout>
      )}

      {/* Modal Nova Nota (header) */}
      <NovaNotaModal
        open={novaOpen}
        onOpenChange={setNovaOpen}
        onEmitted={handleEmitted}
        onSaved={() => refetchEmissions()}
      />
      <NfseDetailModal
        emission={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        initialAction={detailAction}
      />
      <FiscalSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
