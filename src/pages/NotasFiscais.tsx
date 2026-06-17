import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText,
  Plus,
  Settings,
  Search,
  Shield,
  Loader2,
  SlidersHorizontal,
  Eye,
  RefreshCw,
  FileCode,
  Ban,
  History,
  LayoutDashboard,
} from 'lucide-react';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { EmptyState } from '@/components/mobile/EmptyState';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useCustomers } from '@/hooks/useCustomers';
import { useFiscalSettings } from '@/hooks/useFiscalSettings';
import { useNfse, useNfseListPolling, type NfseEmission } from '@/hooks/useNfse';
import { NfseQuotaBadge } from '@/components/fiscal/NfseQuotaBadge';
import { formatBRL } from '@/utils/currency';
import { FISCAL_SCREEN_PERMISSION } from '@/components/fiscal/fiscalPermissions';
import {
  NfseStatusBadge,
  NFSE_STATUS_FILTER_OPTIONS,
  isNfseTerminal,
} from '@/components/fiscal/nfseStatus';
import { NovaNotaModal } from '@/components/fiscal/NovaNotaModal';
import {
  NfseDetailModal,
  type NfseDetailAction,
} from '@/components/fiscal/NfseDetailModal';
import { NfseVisaoGeral } from '@/components/fiscal/NfseVisaoGeral';
import { FiscalSettingsModal } from '@/components/fiscal/FiscalSettingsModal';

/** Normaliza string pra busca (ignora acento/caixa). */
const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default function NotasFiscais() {
  const { hasScreenAccess } = useAuth();
  const { hasModule, isLoading: modulesLoading } = useCompanyModules();
  const { companyId } = useUserCompany();
  const { emissions, isLoading } = useNfse();
  const { customers } = useCustomers();
  const { settings, isLoading: settingsLoading } = useFiscalSettings();

  // "Config fiscal incompleta": `pode_emitir` é o sinal autoritativo do backend
  // (vira true só depois do onboarding Fisqal — empresa + certificado prontos).
  // Enquanto false, a empresa não consegue emitir, então guiamos pra config.
  const fiscalConfigured = settings.pode_emitir;

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<'visao-geral' | 'nfse'>('visao-geral');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
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
    const map = new Map<string, string>();
    (customers ?? []).forEach((c) => map.set(c.id, c.name));
    return (id: string | null) => (id ? map.get(id) ?? 'Cliente' : 'Cliente');
  }, [customers]);

  // Busca UNIVERSAL: quando há texto, procura no dataset completo e ignora o
  // filtro de status. Filtro de status só vale com a busca vazia.
  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return emissions.filter((e) => {
      if (q) {
        const haystack = normalize(
          [
            e.numero_nfse ?? '',
            e.descricao_servico ?? '',
            e.chave_acesso ?? '',
            e.protocolo ?? '',
            customerName(e.customer_id),
          ].join(' '),
        );
        return haystack.includes(q);
      }
      return statusFilter.length === 0 || statusFilter.includes(e.status);
    });
  }, [emissions, search, statusFilter, customerName]);

  // Notas NÃO-terminais → polling automático em lote enquanto a tela está
  // aberta. Capado pra não pollar lista gigante (as recentes ficam no topo).
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
            Você não tem acesso ao módulo de Notas Fiscais. Fale com o administrador da sua empresa.
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

  /** Monta as ações por nota (menu ⋮ + swipe). */
  const buildActions = (e: NfseEmission): ItemAction[] => {
    const actions: ItemAction[] = [
      {
        key: 'view',
        label: 'Ver detalhe',
        icon: <Eye className="h-4 w-4" />,
        onClick: () => openDetail(e),
      },
      {
        key: 'refresh',
        label: 'Atualizar status',
        icon: <RefreshCw className="h-4 w-4" />,
        onClick: () => openDetail(e, 'refresh'),
      },
    ];
    if (e.pdf_url) {
      actions.push({
        key: 'pdf',
        label: 'Baixar PDF',
        icon: <FileText className="h-4 w-4" />,
        onClick: () => openDetail(e, 'pdf'),
      });
    }
    if (e.xml_url) {
      actions.push({
        key: 'xml',
        label: 'Baixar XML',
        icon: <FileCode className="h-4 w-4" />,
        onClick: () => openDetail(e, 'xml'),
      });
    }
    actions.push({
      key: 'history',
      label: 'Histórico',
      icon: <History className="h-4 w-4" />,
      onClick: () => openDetail(e),
    });
    if (e.status === 'autorizada') {
      actions.push({
        key: 'cancel',
        label: 'Cancelar',
        icon: <Ban className="h-4 w-4" />,
        variant: 'destructive',
        onClick: () => openDetail(e, 'cancel'),
      });
    }
    return actions;
  };

  const filterButton = (
    <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 shrink-0">
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {statusFilter.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
              {statusFilter.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle>Filtros</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <FilterCheckboxGroup
            label="Status"
            options={NFSE_STATUS_FILTER_OPTIONS}
            selected={statusFilter}
            onChange={setStatusFilter}
            emptyLabel="Todos"
          />
        </div>
        <div className="sticky bottom-0 border-t bg-background px-5 py-3 flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setStatusFilter([])}
            disabled={statusFilter.length === 0}
          >
            Limpar
          </Button>
          <Button className="flex-1" onClick={() => setFilterOpen(false)}>
            Aplicar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );

  // Botão de acesso à config fiscal — rótulo "Configurações fiscais" (ícone + texto).
  // No mobile vira só ícone pra não estourar o header compacto; o rótulo continua
  // acessível via aria-label e nos estados vazios.
  const configButton = (
    <Button
      variant="outline"
      className="gap-2"
      aria-label="Configurações fiscais"
      onClick={() => setSettingsOpen(true)}
    >
      <Settings className="h-4 w-4" />
      <span className="hidden sm:inline">Configurações fiscais</span>
    </Button>
  );

  // Sub-navegação Visão Geral / NFS-e: sidebar lateral no desktop + pills no
  // mobile, reusando o MESMO componente do Relatório Financeiro
  // (SettingsSidebarLayout). Sem pill-dentro-de-pill.
  const navTabs: SettingsTab[] = [
    { value: 'visao-geral', label: 'Visão Geral', icon: LayoutDashboard },
    { value: 'nfse', label: 'NFS-e', icon: FileText },
  ];

  // Estado vazio guiado: config incompleta → manda configurar; config OK sem
  // notas → manda emitir. Vale pras duas abas.
  const renderGuidedEmpty = () => {
    if (!fiscalConfigured) {
      return (
        <EmptyState
          icon={<Settings className="h-10 w-10" />}
          title="Configure seus dados fiscais"
          description="Configure seus dados fiscais para começar a emitir notas."
          action={{ label: 'Configurações fiscais', onClick: () => setSettingsOpen(true) }}
        />
      );
    }
    return (
      <EmptyState
        icon={<FileText className="h-10 w-10" />}
        title="Nenhuma nota emitida ainda"
        description="Emita sua primeira NFS-e para acompanhá-la aqui."
        action={{ label: 'Nova Nota', onClick: () => setNovaOpen(true) }}
      />
    );
  };

  const anyLoading = isLoading || settingsLoading;
  const showGuidedEmpty = !anyLoading && (!fiscalConfigured || emissions.length === 0);

  return (
    <div className="container max-w-4xl py-4 space-y-5">
      <MobilePageHeader
        title="Notas Fiscais"
        subtitle="Emita e acompanhe suas NFS-e."
        icon={FileText}
        actions={
          <>
            {configButton}
            <Button onClick={() => setNovaOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Nota
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
        // Sem config OU sem nenhuma nota: estado guiado único (sem sub-nav, pois
        // não há o que navegar ainda).
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
            /* ---- NFS-e: listagem + ações por nota ---- */
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por número, cliente, descrição, chave..."
                    className="pl-9"
                  />
                </div>
                {filterButton}
              </div>

              {search.trim() && statusFilter.length > 0 && (
                <p className="text-[11px] text-muted-foreground italic">
                  Buscando em todas as notas — o filtro de status fica suspenso enquanto há busca.
                </p>
              )}

              {filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p>Nenhuma nota encontrada com esses filtros.</p>
                </div>
              ) : (
                <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border/60">
                  {filtered.map((e) => (
                    <MobileListItem
                      key={e.id}
                      onClick={() => openDetail(e)}
                      leading={<FileText className="h-5 w-5 text-muted-foreground" />}
                      title={
                        e.numero_nfse ? `Nota nº ${e.numero_nfse}` : customerName(e.customer_id)
                      }
                      subtitle={
                        <span>
                          {customerName(e.customer_id)} · {formatDate(e.created_at)}
                          {e.valor_servico != null ? ` · ${formatBRL(e.valor_servico)}` : ''}
                        </span>
                      }
                      trailing={<NfseStatusBadge status={e.status} />}
                      actions={buildActions(e)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </SettingsSidebarLayout>
      )}

      <NovaNotaModal open={novaOpen} onOpenChange={setNovaOpen} onEmitted={handleEmitted} />
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
