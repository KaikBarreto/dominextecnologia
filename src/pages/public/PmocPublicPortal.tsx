import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  ShieldCheck,
  MapPin,
  CalendarClock,
  FileText,
  Star,
  Loader2,
  AlertCircle,
  Wrench,
  Award,
  House,
  Download,
  Building2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { PmocComplianceBadge } from '@/components/pmoc/PmocComplianceBadge';
import {
  PmocCronogramaCalendar,
  type PmocCronogramaCalendarOrder,
} from '@/components/pmoc/PmocCronogramaCalendar';
import { OsDetailPortalModal } from '@/components/pmoc/OsDetailPortalModal';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import {
  DEFAULT_HEADER_CONFIG,
  type ReportHeaderConfig,
} from '@/components/technician/ReportHeader';
import { cn } from '@/lib/utils';
import {
  fetchPmocPortal,
  buildPmocPortalUrl,
} from '@/utils/pmocPortalApi';
import type {
  PortalHealthStatus,
  PortalOsStatus,
  PortalPayload,
  PortalOsEntry,
  PortalRealDocument,
  PortalTenant,
} from '@/types/pmocPortal';
import type { OsStatus, OsType } from '@/types/database';
import dominexLogoWhite from '@/assets/logo-white-horizontal.png';

/**
 * Portal PMOC Público — redesign 2026-05-24.
 *
 * Rota: `/pmoc/unidade/:token` (fora do auth wall — ver App.tsx).
 *
 * Layout:
 *  - Header hero (identidade do tenant) sempre visível no topo.
 *  - 4 abas: Visão Geral, Cronograma, Documentos, Histórico.
 *  - Mobile: pills horizontais (via SettingsSidebarLayout).
 *  - Desktop: sidebar fixa esquerda.
 *  - Rodapé com info do tenant + bloco Dominex (se NÃO white-label).
 *
 * Plano: docs/planos/2026-05-24-pmoc-portal-publico-redesign.md
 */

const HEALTH_CONFIG: Record<PortalHealthStatus, {
  label: string;
  tone: 'success' | 'warning' | 'destructive';
  ringClass: string;
}> = {
  em_dia: { label: 'Em dia', tone: 'success', ringClass: 'ring-success/30' },
  manutencao_pendente: { label: 'Manutenção pendente', tone: 'warning', ringClass: 'ring-warning/30' },
  necessita_atencao: { label: 'Necessita atenção', tone: 'destructive', ringClass: 'ring-destructive/30' },
};

const OS_STATUS_CONFIG: Record<PortalOsStatus, { label: string; className: string }> = {
  agendada: { label: 'Agendada', className: 'bg-muted text-muted-foreground' },
  pendente: { label: 'Pendente', className: 'bg-muted text-muted-foreground' },
  a_caminho: { label: 'A caminho', className: 'bg-info/15 text-info' },
  em_andamento: { label: 'Em andamento', className: 'bg-info/15 text-info' },
  pausada: { label: 'Pausada', className: 'bg-warning/15 text-warning' },
  concluida: { label: 'Concluída', className: 'bg-success/15 text-success' },
  cancelada: { label: 'Cancelada', className: 'bg-destructive/10 text-destructive' },
};

const TABS: SettingsTab[] = [
  { value: 'visao-geral', label: 'Visão Geral', icon: House },
  { value: 'cronograma', label: 'Cronograma', icon: CalendarClock },
  { value: 'documentos', label: 'Documentos', icon: FileText },
  { value: 'historico', label: 'Histórico', icon: Wrench },
];

function parseLocal(date: string | null): Date | null {
  if (!date) return null;
  try {
    return parseISO(date.length === 10 ? `${date}T12:00:00` : date);
  } catch {
    return null;
  }
}

function formatLocal(date: string | null, fmt = 'dd/MM/yyyy'): string {
  const d = parseLocal(date);
  if (!d) return '—';
  return format(d, fmt, { locale: ptBR });
}

// ----- SEO --------------------------------------------------------------------

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setJsonLd(id: string, json: Record<string, unknown>) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector<HTMLScriptElement>(`script[data-jsonld="${id}"]`);
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.setAttribute('data-jsonld', id);
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(json);
}

const DEFAULT_THEME_COLOR = '#5555FF';

function setThemeColor(color: string) {
  if (typeof document === 'undefined') return;
  const el = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (el) el.setAttribute('content', color);
}

function usePortalSeo(
  payload: PortalPayload | undefined,
  token: string | undefined,
  themeColor: string,
) {
  useEffect(() => {
    if (!payload || !token) return;

    const unitName = payload.unit.name ?? 'Unidade';
    const title = `PMOC — ${unitName} | ${payload.tenant.name}`;
    const description = `Plano de Manutenção, Operação e Controle conforme Lei Federal 13.589/2018. Histórico, documentos e status sanitário da unidade ${unitName}.`;
    const url = buildPmocPortalUrl(token);

    document.title = title;

    setMeta('name', 'description', description);
    setMeta('name', 'robots', 'index, follow');
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:locale', 'pt_BR');
    if (payload.tenant.logo_url) {
      setMeta('property', 'og:image', payload.tenant.logo_url);
      setMeta('name', 'twitter:image', payload.tenant.logo_url);
    }
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);

    // Onda 1.4.0 — status bar do navegador casa com o bg do header configurado
    // (espelha o do Relatório de Serviço). Feel app nativo no iOS Safari.
    setThemeColor(themeColor || DEFAULT_THEME_COLOR);

    setJsonLd('pmoc-portal', {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: `PMOC — ${unitName}`,
      description,
      provider: { '@type': 'Organization', name: payload.tenant.name },
      areaServed: payload.unit.address ?? undefined,
      url,
      additionalType: 'https://en.wikipedia.org/wiki/HVAC',
      termsOfService: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm',
    });

    return () => {
      document.title = 'Dominex — Gestão de Equipes de Campo e Ordens de Serviço';
      setThemeColor(DEFAULT_THEME_COLOR);
    };
  }, [payload, token, themeColor]);
}

// ----- Página -----------------------------------------------------------------

export default function PmocPublicPortal() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['pmoc-portal', token],
    enabled: !!token,
    retry: (failureCount, err) => {
      if (err instanceof Error && err.message === 'portal_not_found') return false;
      return failureCount < 2;
    },
    queryFn: () => fetchPmocPortal(token!),
  });

  if (isLoading) return <PortalSkeleton />;

  if (isError) {
    const isNotFound = error instanceof Error && error.message === 'portal_not_found';
    return isNotFound ? <PortalNotFound /> : <PortalNetworkError onRetry={() => refetch()} retrying={isFetching} />;
  }

  if (!data) return <PortalNotFound />;

  return <PortalContent payload={data} token={token!} />;
}

// ----- Conteúdo ---------------------------------------------------------------

function PortalContent({ payload, token }: { payload: PortalPayload; token: string }) {
  const {
    unit,
    contract,
    responsible_technician,
    tenant,
    schedule = [],
    history = [],
    documents = [],
  } = payload;

  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('visao-geral');
  const [selectedOS, setSelectedOS] = useState<PortalOsEntry | null>(null);

  // Onda 1.4.0 — Header do portal espelha o do Relatório de Serviço.
  // Quando white-label: usa os configs do tenant (com fallback campo-a-campo
  // pro DEFAULT_HEADER_CONFIG). Quando NÃO white-label: usa o default inteiro.
  const headerConfig: ReportHeaderConfig = useMemo(() => {
    const rh = tenant.report_header;
    if (!rh || !tenant.white_label_enabled) return DEFAULT_HEADER_CONFIG;
    return {
      bgColor: rh.bg_color || DEFAULT_HEADER_CONFIG.bgColor,
      textColor: rh.text_color || DEFAULT_HEADER_CONFIG.textColor,
      logoSize: rh.logo_size || DEFAULT_HEADER_CONFIG.logoSize,
      showLogoBg: rh.show_logo_bg ?? DEFAULT_HEADER_CONFIG.showLogoBg,
      logoBgColor: rh.logo_bg_color || DEFAULT_HEADER_CONFIG.logoBgColor,
      statusBarColor: rh.status_bar_color || DEFAULT_HEADER_CONFIG.statusBarColor,
      logoType: (rh.logo_type as 'full' | 'icon') || DEFAULT_HEADER_CONFIG.logoType,
    };
  }, [tenant.report_header, tenant.white_label_enabled]);

  // Resolve o logo a usar (igual ao ReportHeader: se logoType='icon' usa icon_url
  // do white-label, fallback pro logo_url do tenant).
  const resolvedLogo = useMemo(() => {
    if (headerConfig.logoType === 'icon') {
      return tenant.report_header?.icon_url || tenant.logo_url;
    }
    return tenant.logo_url;
  }, [headerConfig.logoType, tenant.logo_url, tenant.report_header]);

  // SEO + theme-color (cor do header) — precisa ser depois de headerConfig.
  usePortalSeo(payload, token, headerConfig.bgColor);

  // Sticky bar com blur no mobile: aparece quando o hero "saiu" do viewport.
  // Mantém o nome da unidade visível no topo, sensação de navigation bar nativa.
  const heroSentinelRef = useRef<HTMLDivElement | null>(null);
  const [heroOffscreen, setHeroOffscreen] = useState(false);
  useEffect(() => {
    if (!isMobile) {
      setHeroOffscreen(false);
      return;
    }
    const sentinel = heroSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entry]) => setHeroOffscreen(!entry.isIntersecting),
      { rootMargin: '0px', threshold: 0 },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [isMobile]);

  // Mescla schedule + history pro calendário (readOnly). Cada OS é convertida
  // em pseudo-ServiceOrder pra reaproveitar o componente da agenda.
  const calendarOrders = useMemo<PmocCronogramaCalendarOrder[]>(
    () => osEntriesToCalendarOrders([...schedule, ...history], unit.name ?? 'Unidade'),
    [schedule, history, unit.name],
  );

  // Map de id (pseudo) -> entrada original, pro click no calendário abrir o modal.
  const osById = useMemo(() => {
    const map = new Map<string, PortalOsEntry>();
    for (const os of [...schedule, ...history]) {
      if (os.number != null) map.set(`portal-${os.number}`, os);
    }
    return map;
  }, [schedule, history]);

  const lastUpdate = useMemo(
    () => format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
    [],
  );

  const portalUrl = buildPmocPortalUrl(token);

  const handleCalendarClick = (order: PmocCronogramaCalendarOrder) => {
    const original = osById.get(order.id);
    if (original) setSelectedOS(original);
  };

  const logoPx = headerConfig.logoSize;
  const hasAddress = !!unit.address;
  const tenantAddress = tenant.address ?? null;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Sticky bar mobile com blur — aparece quando o hero sai do viewport.
          Mantém o nome da unidade visível como navigation bar de app nativo. */}
      <div
        aria-hidden={!heroOffscreen}
        className={cn(
          'fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md lg:hidden',
          'transition-all duration-200 ease-out',
          heroOffscreen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-full opacity-0',
        )}
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-4 pb-2 pt-1">
          {resolvedLogo ? (
            <img
              src={resolvedLogo}
              alt=""
              className="h-6 w-6 shrink-0 rounded-md bg-muted object-contain p-0.5"
              aria-hidden="true"
            />
          ) : (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {unit.name ?? 'Unidade'}
          </p>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              contract.health_status === 'em_dia' && 'bg-success/15 text-success',
              contract.health_status === 'manutencao_pendente' && 'bg-warning/15 text-warning',
              contract.health_status === 'necessita_atencao' && 'bg-destructive/10 text-destructive',
            )}
          >
            {HEALTH_CONFIG[contract.health_status]?.label ?? '—'}
          </span>
        </div>
      </div>

      {/* Onda 1.4.0 — Header empresa (espelha ReportHeader do técnico).
          Coluna direita troca "OS #/tipo" por "Nome unidade + Saúde".
          Cores e logo vêm do `headerConfig` (white-label) ou DEFAULT. */}
      <header
        className="p-4 sm:p-6"
        style={{
          background: headerConfig.bgColor,
          color: headerConfig.textColor,
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
        }}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          {/* Logo + dados empresa */}
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {resolvedLogo ? (
              <img
                src={resolvedLogo}
                alt={tenant.name}
                className="shrink-0 rounded-lg object-contain"
                style={{
                  height: `${logoPx}px`,
                  width: `${logoPx}px`,
                  ...(headerConfig.showLogoBg
                    ? {
                        backgroundColor: headerConfig.logoBgColor || 'rgba(255,255,255,0.95)',
                        padding: '6px',
                      }
                    : {}),
                }}
              />
            ) : (
              <div
                className="flex shrink-0 items-center justify-center rounded-lg"
                style={{
                  height: `${logoPx}px`,
                  width: `${logoPx}px`,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                }}
              >
                <Building2
                  style={{
                    width: logoPx * 0.4,
                    height: logoPx * 0.4,
                    color: headerConfig.textColor,
                    opacity: 0.7,
                  }}
                  aria-hidden="true"
                />
              </div>
            )}
            <div className="min-w-0">
              <h1
                className="break-words text-base font-bold leading-tight sm:text-xl"
                style={{ color: headerConfig.textColor }}
              >
                {tenant.name || 'Empresa'}
              </h1>
              {tenant.document && (
                <p
                  className="text-xs sm:text-sm"
                  style={{ color: headerConfig.textColor, opacity: 0.9 }}
                >
                  CNPJ: {tenant.document}
                </p>
              )}
              {(tenant.phone || tenant.email) && (
                <div
                  className="mt-0.5 flex flex-col gap-x-4 gap-y-0 text-xs sm:flex-row sm:flex-wrap"
                  style={{ color: headerConfig.textColor, opacity: 0.8 }}
                >
                  {tenant.phone && <span>{tenant.phone}</span>}
                  {tenant.email && <span className="break-all">{tenant.email}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Endereço da EMPRESA (mobile — inline, igual ReportHeader) */}
          {tenantAddress && (
            <p
              className="text-xs sm:hidden"
              style={{ color: headerConfig.textColor, opacity: 0.75 }}
            >
              {tenantAddress}
              {tenant.city && `, ${tenant.city}`}
              {tenant.state && ` - ${tenant.state}`}
              {tenant.zip_code && ` | CEP: ${tenant.zip_code}`}
            </p>
          )}

          {/* Coluna direita: nome da UNIDADE + badge de saúde
              (substitui o "OS #N + tipo" do ReportHeader) */}
          <div className="flex shrink-0 items-center justify-between gap-2 sm:ml-auto sm:flex-col sm:items-end">
            <div
              className="break-words text-right text-base font-bold leading-tight sm:text-xl"
              style={{ color: headerConfig.textColor }}
            >
              {unit.name ?? 'Unidade'}
            </div>
            <HealthBadge
              status={contract.health_status}
              overdueCount={contract.overdue_count}
              textColor={headerConfig.textColor}
            />
          </div>
        </div>

        {/* Endereço da EMPRESA (desktop — embaixo, igual ReportHeader) */}
        {tenantAddress && (
          <p
            className="mx-auto mt-2 hidden w-full max-w-5xl text-xs sm:block"
            style={{ color: headerConfig.textColor, opacity: 0.75 }}
          >
            {tenantAddress}
            {tenant.city && `, ${tenant.city}`}
            {tenant.state && ` - ${tenant.state}`}
            {tenant.zip_code && ` | CEP: ${tenant.zip_code}`}
          </p>
        )}

        {/* Endereço da UNIDADE — abaixo do header de empresa, contextualiza o portal */}
        {hasAddress && (
          <p
            className="mx-auto mt-3 flex w-full max-w-5xl items-start gap-1.5 text-xs sm:text-sm"
            style={{ color: headerConfig.textColor, opacity: 0.85 }}
          >
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
            <span className="break-words">
              {[unit.address, unit.city, unit.state].filter(Boolean).join(' — ')}
            </span>
          </p>
        )}
      </header>

      {/* Status bar fina (espelha ReportHeader). Texto: contexto PMOC legal. */}
      <div
        className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide sm:text-sm"
        style={{ backgroundColor: headerConfig.statusBarColor, color: '#ffffff' }}
      >
        Plano de Manutenção, Operação e Controle — Lei 13.589/2018
      </div>

      {/* Sentinel pra detectar quando o hero sai do viewport (sticky bar aparece). */}
      <div ref={heroSentinelRef} aria-hidden="true" className="h-px w-full" />

      {/* Abas + conteúdo */}
      <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-6 sm:px-6">
        <SettingsSidebarLayout
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        >
          {/* key força remount + animação suave a cada troca de aba — feel de app nativo. */}
          <div key={activeTab} className="animate-in fade-in duration-150">
            {activeTab === 'visao-geral' && (
              <TabOverview
                contract={contract}
                responsibleTechnician={responsible_technician}
              />
            )}
            {activeTab === 'cronograma' && (
              <TabSchedule
                orders={calendarOrders}
                onOsClick={handleCalendarClick}
              />
            )}
            {activeTab === 'documentos' && (
              <TabDocuments documents={documents} />
            )}
            {activeTab === 'historico' && (
              <TabHistory history={history} onOsClick={setSelectedOS} />
            )}
          </div>
        </SettingsSidebarLayout>
      </main>

      {/* Rodapé */}
      <PortalFooter
        tenant={tenant}
        portalUrl={portalUrl}
        lastUpdate={lastUpdate}
      />

      {/* Modal global de detalhe de OS */}
      <OsDetailPortalModal
        os={selectedOS}
        open={!!selectedOS}
        onOpenChange={(open) => {
          if (!open) setSelectedOS(null);
        }}
      />
    </div>
  );
}

// ----- Abas -------------------------------------------------------------------

function TabOverview({
  contract,
  responsibleTechnician,
}: {
  contract: PortalPayload['contract'];
  responsibleTechnician: PortalPayload['responsible_technician'];
}) {
  return (
    <div className="space-y-6">
      <Section title="Contrato" icon={CalendarClock}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoCard label="Plano" value={contract.name ?? '—'} />
          <InfoCard label="Frequência" value={contract.frequency_label} />
          <InfoCard
            label="Próxima manutenção"
            value={contract.next_pmoc_generation_date
              ? formatLocal(contract.next_pmoc_generation_date)
              : 'A definir'}
          />
          <InfoCard label="Início do contrato" value={formatLocal(contract.start_date)} />
          <InfoCard
            label="Conformidade"
            value={contract.compliance_text}
            valueClassName="text-info"
          />
          <InfoCard label="Status" value={contract.status_label} />
        </div>
      </Section>

      {responsibleTechnician && (
        <Section title="Responsável Técnico" icon={Award}>
          <div
            className={cn(
              'flex items-start gap-3 rounded-2xl border border-border bg-card p-4',
              'shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm',
            )}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-info/10 text-info">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-base font-semibold">
                {responsibleTechnician.full_name ?? '—'}
              </p>
              {responsibleTechnician.cft_crea && (
                <p className="break-words text-xs text-muted-foreground">
                  {responsibleTechnician.cft_crea}
                </p>
              )}
              {responsibleTechnician.modality && (
                <p className="break-words text-xs text-muted-foreground">
                  {responsibleTechnician.modality}
                </p>
              )}
              {responsibleTechnician.registry_number && (
                <p className="break-words text-xs text-muted-foreground">
                  Registro: {responsibleTechnician.registry_number}
                </p>
              )}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

function TabSchedule({
  orders,
  onOsClick,
}: {
  orders: PmocCronogramaCalendarOrder[];
  onOsClick: (order: PmocCronogramaCalendarOrder) => void;
}) {
  return (
    <div className="space-y-3">
      <PmocCronogramaCalendar
        serviceOrders={orders}
        view="month"
        readOnly
        showControls
        onOSClick={onOsClick}
      />
      {orders.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Ainda não há manutenções registradas para esta unidade.
        </p>
      )}
      <p className="text-center text-[11px] text-muted-foreground">
        Toque em uma manutenção do calendário para ver detalhes.
      </p>
    </div>
  );
}

function TabDocuments({ documents }: { documents: PortalRealDocument[] }) {
  const available = documents.filter((d) => d.available);
  const unavailable = documents.filter((d) => !d.available);

  return (
    <div className="space-y-4">
      {available.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {available.map((doc) => (
            <RealDocumentCard key={doc.type} doc={doc} />
          ))}
        </div>
      )}
      {unavailable.length > 0 && (
        <>
          {available.length > 0 && (
            <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Em breve
            </h3>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {unavailable.map((doc) => (
              <RealDocumentCard key={doc.type} doc={doc} />
            ))}
          </div>
        </>
      )}
      {documents.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Os documentos serão disponibilizados em breve.
        </p>
      )}
    </div>
  );
}

function TabHistory({
  history,
  onOsClick,
}: {
  history: PortalOsEntry[];
  onOsClick: (os: PortalOsEntry) => void;
}) {
  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Nenhuma manutenção concluída ainda.
        </p>
      </div>
    );
  }

  const sorted = [...history].sort((a, b) => {
    const da = parseLocal(a.completed_at || a.scheduled_date)?.getTime() ?? 0;
    const db = parseLocal(b.completed_at || b.scheduled_date)?.getTime() ?? 0;
    return db - da;
  });

  return (
    <ol className="space-y-3">
      {sorted.map((entry) => (
        <HistoryItem
          key={`${entry.number}-${entry.completed_at ?? entry.scheduled_date}`}
          entry={entry}
          onClick={() => onOsClick(entry)}
        />
      ))}
    </ol>
  );
}

// ----- Subcomponentes ---------------------------------------------------------

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Wrench;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Onda 1.4.0 — `textColor` recebido do header config (white-label ou default).
 * Como o header agora pode ter bg claro ou escuro, o badge usa fundo translúcido
 * a partir do próprio `textColor` (rgba dinâmico) pra contrastar em ambos os
 * cenários sem precisar saber qual é qual.
 */
function HealthBadge({
  status,
  overdueCount,
  textColor = '#ffffff',
}: {
  status: PortalHealthStatus;
  overdueCount: number;
  textColor?: string;
}) {
  const cfg = HEALTH_CONFIG[status] ?? HEALTH_CONFIG.em_dia;
  // Fundo translúcido derivado do textColor pra contrastar em qualquer bg.
  const isLight = textColor === '#ffffff' || textColor.toLowerCase() === '#fff';
  const bgTint = isLight ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)';
  return (
    <div
      className="flex shrink-0 flex-col items-end gap-0.5 rounded-xl px-3 py-2 backdrop-blur-sm"
      style={{ backgroundColor: bgTint, color: textColor }}
      aria-label={`Status sanitário: ${cfg.label}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest opacity-80">
        Status
      </span>
      <span className="flex items-center gap-1.5 text-sm font-bold leading-tight">
        <span className={cn('h-2 w-2 rounded-full ring-2', `bg-${cfg.tone}`, cfg.ringClass)} />
        {cfg.label}
      </span>
      {overdueCount > 0 && (
        <span className="text-[10px] opacity-80">
          {overdueCount} {overdueCount === 1 ? 'pendência' : 'pendências'}
        </span>
      )}
    </div>
  );
}

function InfoCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-2xl border border-border bg-card p-3.5',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 break-words text-sm font-medium leading-relaxed', valueClassName)}>
        {value}
      </p>
    </div>
  );
}

function RealDocumentCard({ doc }: { doc: PortalRealDocument }) {
  const available = doc.available && !!doc.pdf_url;
  const sub = available && doc.generated_at
    ? `Atualizado em ${formatLocal(doc.generated_at)}${doc.version ? ` — v${doc.version}` : ''}`
    : 'Disponível em breve';

  const showPendingSignature = available && doc.signature_status === 'pending';

  return (
    <div
      className={cn(
        'flex min-h-[96px] flex-col gap-2 rounded-2xl border p-4 transition-colors',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm',
        available ? 'border-border bg-card' : 'border-dashed border-border bg-muted/30',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            available ? 'bg-info/10 text-info' : 'bg-muted text-muted-foreground',
          )}
        >
          <FileText className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium leading-snug">{doc.label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{sub}</p>
          {showPendingSignature && (
            <span
              className={cn(
                'mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                'bg-warning/15 text-[10px] font-semibold uppercase tracking-wide text-warning',
              )}
              title="Documento gerado com linha em branco pra assinar à mão"
            >
              <AlertCircle className="h-2.5 w-2.5" aria-hidden="true" />
              Assinatura pendente
            </span>
          )}
        </div>
      </div>

      {available && doc.pdf_url && (
        <a
          href={doc.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl',
            'bg-primary px-4 text-sm font-semibold text-primary-foreground',
            'transition-all duration-100 hover:bg-primary/90 active:scale-[0.98]',
          )}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Baixar PDF
        </a>
      )}
    </div>
  );
}

function HistoryItem({
  entry,
  onClick,
}: {
  entry: PortalOsEntry;
  onClick: () => void;
}) {
  const statusCfg = OS_STATUS_CONFIG[entry.status] ?? OS_STATUS_CONFIG.agendada;
  const displayDate = entry.completed_at || entry.scheduled_date;
  const photos = entry.public_photos ?? [];

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'block w-full min-h-11 rounded-2xl border border-border bg-card p-3.5 text-left',
          'shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm',
          'transition-all duration-100 hover:bg-accent/30 active:scale-[0.98] active:bg-accent/40 sm:p-4',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">
                OS #{entry.number}
              </span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  statusCfg.className,
                )}
              >
                {entry.status_label || statusCfg.label}
              </span>
              {entry.rating != null && entry.rating > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                  <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                  {entry.rating}
                </span>
              )}
            </div>
            <p className="text-sm font-medium leading-relaxed">{formatLocal(displayDate)}</p>
            {entry.service_type_label && (
              <p className="text-xs leading-relaxed text-muted-foreground">{entry.service_type_label}</p>
            )}
          </div>
        </div>

        {entry.public_description && (
          <p className="mt-2 line-clamp-2 break-words text-sm leading-relaxed text-foreground/90">
            {entry.public_description}
          </p>
        )}

        {entry.technician_first_name && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Executado por <span className="font-medium">{entry.technician_first_name}</span>
          </p>
        )}

        {photos.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {photos.length} {photos.length === 1 ? 'foto anexada' : 'fotos anexadas'} — toque para ver
          </p>
        )}
      </button>
    </li>
  );
}

// ----- Rodapé -----------------------------------------------------------------

function PortalFooter({
  tenant,
  portalUrl,
  lastUpdate,
}: {
  tenant: PortalTenant;
  portalUrl: string;
  lastUpdate: string;
}) {
  const tenantLocation = [tenant.city, tenant.state].filter(Boolean).join(' / ');
  const hasContactBlock = !!(tenant.address || tenantLocation);

  return (
    <footer
      className="mx-auto mt-10 w-full max-w-5xl space-y-6 px-4 pt-8 sm:px-6"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <PmocComplianceBadge variant="footer" />

      {/* Bloco do tenant (sempre que houver endereço/cidade) */}
      {hasContactBlock && (
        <div
          className={cn(
            'rounded-2xl border border-border bg-card p-4',
            'shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm',
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold leading-snug">{tenant.name}</p>
              {tenant.address && (
                <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">
                  {tenant.address}
                </p>
              )}
              {tenantLocation && (
                <p className="break-words text-xs leading-relaxed text-muted-foreground">
                  {tenantLocation}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1 text-center">
        <p className="text-[11px] text-muted-foreground">
          Portal atualizado em {lastUpdate}
        </p>
        <p className="break-all text-[11px] text-muted-foreground">{portalUrl}</p>
      </div>

      {/* Bloco Dominex — só aparece pra tenants NÃO white-label */}
      {!tenant.white_label_enabled && (
        <div className="flex flex-col items-center gap-1 pb-2 pt-2">
          <img
            src={dominexLogoWhite}
            alt="Dominex"
            className="h-5 object-contain invert dark:invert-0"
          />
          <span className="text-[10px] tracking-wide text-muted-foreground/80">
            www.dominex.app
          </span>
        </div>
      )}
    </footer>
  );
}

// ----- Conversão pro calendar -------------------------------------------------

/**
 * Converte entradas do portal (schedule + history) em pseudo-ServiceOrders pro
 * componente de calendar reaproveitar a renderização.
 *
 * - Só campos que o calendar consome (id, order_number, status, date, customer).
 * - Status do portal mapeia 1:1 pro tipo `OsStatus` (compartilham strings).
 */
function osEntriesToCalendarOrders(
  entries: PortalOsEntry[],
  customerName: string,
): PmocCronogramaCalendarOrder[] {
  return entries
    .filter((h) => h.number != null)
    .map((h) => ({
      id: `portal-${h.number}`,
      order_number: h.number,
      customer_id: 'portal-customer',
      os_type: 'manutencao_preventiva' as OsType,
      status: (h.status as OsStatus) ?? 'agendada',
      scheduled_date: h.scheduled_date,
      scheduled_time: undefined,
      description: h.public_description ?? undefined,
      created_at: h.scheduled_date,
      updated_at: h.completed_at ?? h.scheduled_date,
      contract_id: undefined,
      customer: { id: 'portal-customer', name: customerName },
      equipment: null,
    })) as unknown as PmocCronogramaCalendarOrder[];
}

// ----- Estados de loading/erro ------------------------------------------------

function PortalSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div
        className="bg-muted px-4 pb-8 sm:px-6"
        style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}
      >
        <div className="mx-auto w-full max-w-5xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 animate-pulse rounded-xl bg-muted-foreground/20" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-muted-foreground/20" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted-foreground/20" />
            </div>
          </div>
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted-foreground/20" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted-foreground/20" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded-2xl bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PortalNotFound() {
  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <AlertCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-xl font-bold leading-tight">Portal não encontrado</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Este link de QR Code não está mais ativo ou pode ter sido renovado.
        Procure a empresa responsável pela manutenção para obter o link atualizado.
      </p>
      <a
        href="https://dominex.app"
        className={cn(
          'mt-6 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-primary px-6',
          'text-sm font-semibold text-primary-foreground',
          'transition-all duration-100 hover:bg-primary/90 active:scale-[0.98]',
        )}
      >
        Ir para o Dominex
      </a>
    </div>
  );
}

function PortalNetworkError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
        <AlertCircle className="h-8 w-8 text-warning" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-xl font-bold leading-tight">Não foi possível carregar</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Verifique sua conexão e tente novamente.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className={cn(
          'mt-6 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl bg-primary px-6',
          'text-sm font-semibold text-primary-foreground',
          'transition-all duration-100 hover:bg-primary/90 active:scale-[0.98]',
          'disabled:opacity-60 disabled:active:scale-100',
        )}
      >
        {retrying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Tentar novamente
      </button>
    </div>
  );
}
