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
import { FloatingActionButton } from '@/components/ui/floating-action-button';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useFiscalSettings } from '@/hooks/useFiscalSettings';
import { useNfse, useNfseListPolling, type NfseEmission } from '@/hooks/useNfse';
import { useNfseEmissionsPaged } from '@/hooks/useNfseEmissionsPaged';
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
import { NfseStatsCards, type NfseStats } from '@/components/fiscal/NfseStatsCards';
import { NfseComoFunciona } from '@/components/fiscal/NfseComoFunciona';
import { nfseRowToEmission, type NfseListRow } from '@/components/fiscal/nfseRow';
import { FiscalSettingsModal } from '@/components/fiscal/FiscalSettingsModal';
import { NfseListTab } from '@/components/fiscal/NfseListTab';

/** Quantas notas o atalho "Últimas emissões" mostra. */
const RECENT_LIMIT = 5;

/**
 * Data-pura (YYYY-MM-DD) a partir do Date LOCAL.
 * `toISOString()` converteria pra UTC e jogaria o dia 1º às 00h de Brasília
 * pro dia 30 do mês anterior — o recorte de período viria errado por um dia.
 */
function toIsoDate(d: Date | undefined): string | null {
  if (!d) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function NotasFiscais() {
  const isMobile = useIsMobile();
  const { hasScreenAccess } = useAuth();
  const { hasModule, isLoading: modulesLoading } = useCompanyModules();
  const { companyId } = useUserCompany();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;
  const { emissions, isLoading, refetch: refetchEmissions } = useNfse();
  const { settings, readyToEmit, isLoading: settingsLoading } = useFiscalSettings();

  // "Config fiscal completa" = município liberado + empresa registrada +
  // certificado enviado (critério único em useFiscalSettings). `pode_emitir`
  // sozinho só diz que o município é coberto e liberava o botão Emitir antes
  // do certificado existir, o que dava erro na hora de emitir.
  const fiscalConfigured = readyToEmit;
  // Mostrar as abas/listagem assim que HÁ atividade fiscal (empresa já registrada
  // OU qualquer nota/rascunho), mesmo antes de `pode_emitir` — senão um rascunho
  // salvo fica invisível até o onboarding concluir. A ação de EMITIR continua
  // travada por `fiscalConfigured` (canEmit).
  const hasFiscalActivity =
    settings.pode_emitir || !!settings.provider_company_id || emissions.length > 0;

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<'visao-geral' | 'nfse'>('visao-geral');
  const [novaOpen, setNovaOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<NfseEmission | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailAction, setDetailAction] = useState<NfseDetailAction | null>(null);

  // ── Período (header) ───────────────────────────────────────────────────────
  // Abre em "Todos os tempos": quem tem poucas notas no mês não pode achar que
  // a tela está vazia. O mesmo recorte alimenta os cards e a listagem.
  const { preset, range, setPreset, setRange } = useDateRangeFilter('all');
  const dateStart = useMemo(() => toIsoDate(range.from), [range.from]);
  const dateEnd = useMemo(() => toIsoDate(range.to), [range.to]);

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

  // ── Indicadores do topo ────────────────────────────────────────────────────
  // Contados sobre a lista COMPLETA da empresa (`useNfse`), não sobre uma
  // página: card de indicador que conta só a página vira número mentiroso.
  //
  // O recorte de período usa a competência quando ela vem no dado e cai no
  // `created_at` quando não vem — hoje a consulta da lista completa não traz a
  // competência, então na prática o filtro do card ainda é pela data de criação.
  const stats = useMemo<NfseStats>(() => {
    let autorizadas = 0;
    let processando = 0;
    let rejeitadas = 0;
    let canceladas = 0;

    for (const e of emissions) {
      const ref = e.data_competencia || e.created_at;
      if (ref) {
        const day = String(ref).slice(0, 10);
        if (dateStart && day < dateStart) continue;
        if (dateEnd && day > dateEnd) continue;
      }
      switch (e.status) {
        // Cancelamento pedido mas ainda não efetivado: a nota continua válida e
        // com efeito fiscal, então conta junto das autorizadas.
        case 'autorizada':
        case 'cancelamento_pendente':
          autorizadas += 1;
          break;
        case 'processando':
        case 'pendente':
          processando += 1;
          break;
        case 'rejeitada':
        case 'falhou':
          rejeitadas += 1;
          break;
        case 'cancelada':
          canceladas += 1;
          break;
        default:
          break;
      }
    }
    return { autorizadas, processando, rejeitadas, canceladas };
  }, [emissions, dateStart, dateEnd]);

  // ── Últimas emissões (Visão Geral) ─────────────────────────────────────────
  // Vem da RPC paginada (e não da lista do `useNfse`) porque só ela devolve a
  // COMPETÊNCIA e a descrição do serviço — os dois campos que faltavam pro
  // atalho mostrar a mesma data da listagem e um título que não repete o nome
  // do cliente.
  const {
    rows: recentRows,
    loading: recentLoading,
    fetch: fetchRecent,
    refetch: refetchRecent,
  } = useNfseEmissionsPaged();

  useEffect(() => {
    fetchRecent({
      dateStart,
      dateEnd,
      sortKey: 'created_at',
      sortDir: 'desc',
      page: 1,
      pageSize: RECENT_LIMIT,
    });
  }, [fetchRecent, dateStart, dateEnd]);

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
    refetchRecent();
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

  const openDetailFromRow = (row: NfseListRow) => openDetail(nfseRowToEmission(row));

  // Seletor de período — mesmo estado nas duas superfícies.
  const periodFilter = (
    <DateRangeFilter
      value={range}
      preset={preset}
      onPresetChange={setPreset}
      onRangeChange={setRange}
    />
  );

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
            {/* No mobile o seletor de período desce pra linha do medidor: com
                três botões o header quebrava em duas fileiras e sobrava um
                buraco antes do conteúdo. */}
            {!isMobile && periodFilter}
            {configButton}
          </>
        }
      />

      {/* Medidor de consumo mensal de NFS-e (+ período, no mobile) */}
      <div className="flex flex-wrap items-center gap-2">
        <NfseQuotaBadge companyId={companyId} />
        {isMobile && periodFilter}
      </div>

      {/* Explicação em linguagem leiga — fechada por padrão */}
      <NfseComoFunciona />

      {anyLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : showGuidedEmpty ? (
        // Sem config: estado guiado único (sem sub-nav, não há o que navegar).
        renderGuidedEmpty()
      ) : (
        <>
          {/* Indicadores ACIMA do menu de abas: valem pras duas abas. */}
          <NfseStatsCards stats={stats} loading={isLoading} />

          <SettingsSidebarLayout
            tabs={navTabs}
            activeTab={tab}
            onTabChange={(v) => setTab(v as 'visao-geral' | 'nfse')}
          >
            {tab === 'visao-geral' ? (
              /* ---- Visão Geral: atalho das últimas emissões ---- */
              <NfseVisaoGeral
                rows={recentRows}
                loading={recentLoading}
                onOpenDetail={openDetailFromRow}
              />
            ) : (
              /* ---- NFS-e: listagem paginada com ações por linha ---- */
              <NfseListTab
                canEmit={fiscalConfigured}
                dateStart={dateStart}
                dateEnd={dateEnd}
              />
            )}
          </SettingsSidebarLayout>
        </>
      )}

      {/* Ação principal da tela: emitir. Fica flutuando pra continuar ao
          alcance mesmo com a lista rolada — antes era um botão no topo, que
          saía de vista assim que o usuário descia na lista. */}
      <FloatingActionButton
        icon={<Plus className="h-6 w-6 lg:h-4 lg:w-4" />}
        label={t.actions.newNote}
        onClick={() => setNovaOpen(true)}
      />

      {/* Modal Nova Nota (header) */}
      <NovaNotaModal
        open={novaOpen}
        onOpenChange={setNovaOpen}
        onEmitted={handleEmitted}
        onSaved={() => {
          refetchEmissions();
          refetchRecent();
        }}
      />
      <NfseDetailModal
        emission={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        initialAction={detailAction}
        onChanged={() => {
          refetchEmissions();
          refetchRecent();
        }}
      />
      <FiscalSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
