import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck,
  CalendarClock,
  FileText,
  Loader2,
  AlertCircle,
  Wrench,
  Award,
  House,
  Download,
  Lock,
  Repeat,
  ExternalLink,
  ClipboardCheck,
  MapPin,
  Send,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useToast } from '@/hooks/use-toast';
import DarkVeil from '@/components/ui/DarkVeil';
import { parseISO } from 'date-fns';
import { PublicAppLocaleProvider, useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { formatDate, formatDateTime } from '@/lib/format';
import { MESSAGES } from '@/lib/i18n/messages';
import { detectMachineLocale } from '@/lib/i18n/detectLocale';

import { PmocComplianceBadge } from '@/components/pmoc/PmocComplianceBadge';
import { PmocExecutionHistoryView } from '@/components/pmoc/PmocExecutionHistoryView';
import type { ContractActivityExecutionRow } from '@/hooks/useContractPmocExecution';
import {
  PmocCronogramaCalendar,
  type PmocCronogramaCalendarOrder,
} from '@/components/pmoc/PmocCronogramaCalendar';
import { OsDetailPortalModal } from '@/components/pmoc/OsDetailPortalModal';
import {
  DEFAULT_HEADER_CONFIG,
  type ReportHeaderConfig,
} from '@/components/technician/ReportHeader';
import { cn } from '@/lib/utils';
import {
  fetchPmocPortal,
  buildPmocPortalUrl,
  PortalModuleUnavailableError,
  PortalPrivateError,
} from '@/utils/pmocPortalApi';
import PortalUnavailable from '@/components/portal/PortalUnavailable';
import { PublicPortalShell, type PortalNavSection } from '@/components/portal/PublicPortalShell';
import { PortalContactButton } from '@/components/portal/PortalContactButton';
import { idealForeground } from '@/lib/colorContrast';
import { supabaseAnon } from '@/integrations/supabase/anonClient';
import { getErrorMessage } from '@/utils/errorMessages';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import type {
  PortalHealthStatus,
  PortalOsStatus,
  PortalPayload,
  PortalOsEntry,
  PortalOccurrenceEntry,
  PortalRealDocument,
  PortalTenant,
  PortalExecutionRow,
} from '@/types/pmocPortal';
import type { OsStatus, OsType } from '@/types/database';
import {
  getDocumentValidityStatus,
  getValidityLabel,
} from '@/lib/documentValidity';

/**
 * Portal do Contrato (público) — PMOC e não-PMOC.
 *
 * Rotas: `/contrato/unidade/:token` (+ alias legado `/pmoc/unidade/:token`) — fora do auth wall.
 *
 * Layout (app-nativo via PublicPortalShell):
 *  - Header hero branded (identidade do tenant).
 *  - Abas: Visão Geral, Cronograma, Ocorrências, Histórico (+ Documentos só PMOC).
 *  - Mobile: pills horizontais rolando horizontalmente.
 *  - Desktop: sidebar fixa esquerda (grid 3 colunas, espelha TechnicianOS).
 *  - Rodapé sticky escuro: "Próxima manutenção {data}" + CTA "Abrir chamado nesta unidade".
 *
 * Gating:
 *  - Documentos: SÓ contrato PMOC + `documents_released`.
 *  - Histórico PMOC: SÓ contrato PMOC + `documents_released`.
 *  - "Abrir chamado": customer_id do payload; insere em service_orders via anon.
 */

// ── Constantes de estilo ──────────────────────────────────────────────────────

const HEALTH_STYLE: Record<PortalHealthStatus, {
  tone: 'success' | 'warning' | 'destructive';
}> = {
  em_dia: { tone: 'success' },
  manutencao_pendente: { tone: 'warning' },
  necessita_atencao: { tone: 'destructive' },
};

const OS_STATUS_CLASS: Record<PortalOsStatus, string> = {
  agendada: 'bg-muted text-muted-foreground',
  pendente: 'bg-muted text-muted-foreground',
  a_caminho: 'bg-info/15 text-info',
  em_andamento: 'bg-info/15 text-info',
  pausada: 'bg-warning/15 text-warning',
  concluida: 'bg-success/15 text-success',
  cancelada: 'bg-destructive/10 text-destructive',
};

// Teal padrão Dominex — idêntico ao CustomerPortal.
const PORTAL_ACCENT_PRIMARY = '#00C684';

type PublicPortalMessages = typeof MESSAGES['pt-br']['app']['pmoc']['publicPortal'];

// ── Abas ──────────────────────────────────────────────────────────────────────

function buildNavSections(
  isPmoc: boolean,
  hasExecutionHistory: boolean,
  t: PublicPortalMessages,
): PortalNavSection[] {
  const sections: PortalNavSection[] = [
    { value: 'visao-geral', label: t.tabOverview, icon: <House className="h-4 w-4 shrink-0" /> },
    { value: 'cronograma', label: t.tabSchedule, icon: <CalendarClock className="h-4 w-4 shrink-0" /> },
    { value: 'ocorrencias', label: t.tabOccurrences, icon: <Repeat className="h-4 w-4 shrink-0" /> },
  ];
  if (isPmoc) {
    sections.push({ value: 'documentos', label: t.tabDocuments, icon: <FileText className="h-4 w-4 shrink-0" /> });
  }
  sections.push({ value: 'historico', label: t.tabHistory, icon: <Wrench className="h-4 w-4 shrink-0" /> });
  if (isPmoc && hasExecutionHistory) {
    sections.push({ value: 'historico-pmoc', label: t.tabHistoryPmoc, icon: <ClipboardCheck className="h-4 w-4 shrink-0" /> });
  }
  return sections;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseLocal(date: string | null): Date | null {
  if (!date) return null;
  try {
    return parseISO(date.length === 10 ? `${date}T12:00:00` : date);
  } catch {
    return null;
  }
}

function formatLocal(
  date: string | null,
  locale: string = 'pt-br',
  timezone: string = 'America/Sao_Paulo',
): string {
  if (!date) return '—';
  try {
    return formatDate(date, locale as any, timezone);
  } catch {
    return '—';
  }
}

// ── SEO ───────────────────────────────────────────────────────────────────────

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

function toOgLocale(locale: string): string {
  switch (locale) {
    case 'en': return 'en_US';
    case 'es': return 'es_ES';
    case 'fr': return 'fr_FR';
    default:   return 'pt_BR';
  }
}

function usePortalSeo(
  payload: PortalPayload | undefined,
  token: string | undefined,
  themeColor: string,
  locale: string,
) {
  useEffect(() => {
    if (!payload || !token) return;

    const isPmoc = payload.is_pmoc !== false;
    const unitName = payload.unit.name ?? 'Unidade';
    const tSeo = MESSAGES[locale as keyof typeof MESSAGES]?.app?.pmoc?.publicPortal ?? MESSAGES['pt-br'].app.pmoc.publicPortal;
    const seoBase = isPmoc ? tSeo.seoTitle : tSeo.seoTitleContract;
    const seoDescBase = isPmoc ? tSeo.seoDesc : tSeo.seoDescContract;
    const title = `${seoBase} — ${unitName} | ${payload.tenant.name}`;
    const description = isPmoc
      ? `${seoDescBase} ${unitName}.`
      : `${seoDescBase.replace('{unit}', unitName)}`;
    const url = buildPmocPortalUrl(token);

    document.title = title;
    setMeta('name', 'description', description);
    setMeta('name', 'robots', 'index, follow');
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:locale', toOgLocale(locale));
    if (payload.tenant.logo_url) {
      setMeta('property', 'og:image', payload.tenant.logo_url);
      setMeta('name', 'twitter:image', payload.tenant.logo_url);
    }
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setThemeColor(themeColor || DEFAULT_THEME_COLOR);

    setJsonLd('pmoc-portal', {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: `${seoBase} — ${unitName}`,
      description,
      provider: { '@type': 'Organization', name: payload.tenant.name },
      areaServed: payload.unit.address ?? undefined,
      url,
      ...(isPmoc
        ? {
            additionalType: 'https://en.wikipedia.org/wiki/HVAC',
            termsOfService:
              'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm',
          }
        : {}),
    });

    return () => {
      document.title = 'Dominex — Gestão de Equipes de Campo e Ordens de Serviço';
      setThemeColor(DEFAULT_THEME_COLOR);
    };
  }, [payload, token, themeColor, locale]);
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function PmocPublicPortal() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['pmoc-portal', token],
    enabled: !!token,
    retry: (failureCount, err) => {
      if (err instanceof PortalModuleUnavailableError) return false;
      if (err instanceof PortalPrivateError) return false;
      if (err instanceof Error && err.message === 'portal_not_found') return false;
      return failureCount < 2;
    },
    queryFn: () => fetchPmocPortal(token!),
  });

  if (isLoading) return <PortalSkeleton />;

  if (isError) {
    if (error instanceof PortalModuleUnavailableError) {
      return <PortalUnavailable companyName={error.companyName} />;
    }
    if (error instanceof PortalPrivateError) {
      return <PortalPrivate token={token!} companyName={error.companyName} />;
    }
    const isNotFound = error instanceof Error && error.message === 'portal_not_found';
    return isNotFound ? <PortalNotFound /> : <PortalNetworkError onRetry={() => refetch()} retrying={isFetching} />;
  }

  if (!data) return <PortalNotFound />;

  return (
    <PublicAppLocaleProvider
      language={data.tenant.language}
      currency={data.tenant.currency}
      timezone={data.tenant.timezone}
    >
      <PortalContent payload={data} token={token!} />
    </PublicAppLocaleProvider>
  );
}

// ── Conteúdo ──────────────────────────────────────────────────────────────────

function PortalContent({ payload, token }: { payload: PortalPayload; token: string }) {
  const {
    unit,
    contract,
    responsible_technician,
    tenant,
    schedule = [],
    history = [],
    occurrences = [],
    documents = [],
    documents_released,
    execution_history = [],
    is_pmoc,
    viewer_can_fill,
  } = payload;

  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pmoc.publicPortal;
  const { toast } = useToast();

  const isPmoc = is_pmoc !== false;
  const canFill = viewer_can_fill === true;
  const documentsReleased = documents_released !== false;

  const executionRows = useMemo<ContractActivityExecutionRow[]>(
    () =>
      (execution_history as PortalExecutionRow[]).map((r) => ({
        company_id: '',
        contract_id: '',
        contract_name: null,
        plan_activity_id: null,
        contract_item_id: null,
        responded_by: null,
        ...r,
      })),
    [execution_history],
  );
  const hasExecutionHistory = isPmoc && executionRows.length > 0;

  const navSections = useMemo(
    () => buildNavSections(isPmoc, hasExecutionHistory, t),
    [isPmoc, hasExecutionHistory, t],
  );
  const [activeTab, setActiveTab] = useState('visao-geral');
  const [selectedOS, setSelectedOS] = useState<PortalOsEntry | null>(null);

  // ── Cor de marca (anti-FOUC: inline, nunca localStorage, nunca CSS var global) ──
  // Segue exatamente o mesmo padrão do CustomerPortal: branco-label usa a cor
  // configurada; sem white-label usa teal padrão Dominex. NUNCA null.
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

  // brandColor: white-label usa a cor do header config; sem white-label cai no
  // teal padrão Dominex. Nunca null (garante header branded sempre colorido).
  const brandColor = useMemo(() => {
    if (tenant.white_label_enabled && headerConfig.bgColor) return headerConfig.bgColor;
    return PORTAL_ACCENT_PRIMARY;
  }, [tenant.white_label_enabled, headerConfig.bgColor]);

  const headerTextColor = idealForeground(brandColor);

  // Logo a usar (espelha ReportHeader)
  const resolvedLogo = useMemo(() => {
    if (headerConfig.logoType === 'icon') {
      return tenant.report_header?.icon_url || tenant.logo_url;
    }
    return tenant.logo_url;
  }, [headerConfig.logoType, tenant.logo_url, tenant.report_header]);

  usePortalSeo(payload, token, brandColor, locale);

  // ── Modal de chamado ──────────────────────────────────────────────────────
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  // customer_id e company_id vem de payload.contract (exposto na edge desde 1.10.0).
  // Leitura defensiva: pode ser null em payloads antigos ou de outra versão.
  const customerId = contract.customer_id ?? null;
  const companyId = contract.company_id ?? null;

  const handleSubmitTicket = async () => {
    if (ticketDesc.trim().length < 10) return;
    if (!customerId || !companyId) {
      toast({
        variant: 'destructive',
        title: t.ticketErrorTitle,
        description: !customerId
          ? 'customer_id indisponível neste portal.'
          : 'company_id indisponível neste portal.',
      });
      return;
    }
    setTicketSubmitting(true);
    try {
      // A RLS "Public can create portal tickets" permite anon INSERT com origin='portal'.
      // O trigger check_portal_ticket_antispam() valida >= 10 chars e rate-limit no server.
      // company_id: obrigatorio no INSERT (NOT NULL, sem auto-preenchimento no anon).
      // Vem de contract.company_id exposto no payload da edge.
      const insertPayload = normalizeOptionalForeignKeys({
        customer_id: customerId,
        company_id: companyId,
        description: ticketDesc.trim(),
        os_type: 'manutencao_corretiva',
        status: 'pendente',
        origin: 'portal',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any, ['customer_id', 'company_id']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabaseAnon.from('service_orders').insert(insertPayload as any);
      if (error) throw error;
      toast({ title: t.ticketSuccess });
      setShowTicketModal(false);
      setTicketDesc('');
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: t.ticketErrorTitle, description: getErrorMessage(err) });
    } finally {
      setTicketSubmitting(false);
    }
  };

  // ── Calendário ────────────────────────────────────────────────────────────
  const calendarOrders = useMemo<PmocCronogramaCalendarOrder[]>(
    () => osEntriesToCalendarOrders([...schedule, ...history], unit.name ?? 'Unidade'),
    [schedule, history, unit.name],
  );
  const osById = useMemo(() => {
    const map = new Map<string, PortalOsEntry>();
    for (const os of [...schedule, ...history]) {
      if (os.number != null) map.set(`portal-${os.number}`, os);
    }
    return map;
  }, [schedule, history]);

  const lastUpdate = useMemo(() => {
    try {
      return formatDateTime(new Date().toISOString(), locale, timezone);
    } catch {
      return new Date().toLocaleDateString('pt-BR', { timeZone: timezone });
    }
  }, [locale, timezone]);

  const portalUrl = buildPmocPortalUrl(token);

  const handleCalendarClick = (order: PmocCronogramaCalendarOrder) => {
    const original = osById.get(order.id);
    if (original) setSelectedOS(original);
  };

  // ── Subtítulo e badge de saúde ───────────────────────────────────────────
  const subtitle = isPmoc ? t.subtitlePmoc : t.subtitleContract;

  const healthBadge = (
    <HealthBadge
      status={contract.health_status}
      overdueCount={contract.overdue_count}
    />
  );

  // ── Footer status ─────────────────────────────────────────────────────────
  const nextMaintDate = contract.next_pmoc_generation_date
    ? formatLocal(contract.next_pmoc_generation_date, locale, timezone)
    : null;
  const footerStatus = nextMaintDate
    ? `${t.footerNextOccurrence}: ${nextMaintDate}`
    : null;

  return (
    <PublicPortalShell
      brandColor={brandColor}
      logoUrl={resolvedLogo}
      title={tenant.name || 'Empresa'}
      subtitle={subtitle}
      badge={healthBadge}
      headerAction={
        <PortalContactButton
          phone={tenant.phone}
          email={tenant.email}
          textColor={headerTextColor}
        />
      }
      navSections={navSections}
      activeSection={activeTab}
      onSectionChange={setActiveTab}
      footerStatus={footerStatus ?? undefined}
      footerCtaLabel={customerId && companyId ? t.openTicketHere : undefined}
      onFooterCta={() => setShowTicketModal(true)}
      navLabel={t.sidebarNavLabel}
    >
      {/* Endereço da unidade (sob as pills no mobile, visível no topo do main) */}
      {unit.address && (
        <p className="mb-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="break-words">
            {[unit.address, unit.city, unit.state].filter(Boolean).join(', ')}
          </span>
        </p>
      )}

      {/* Conteúdo das abas */}
      <div key={activeTab} className="animate-in fade-in duration-150">
        {activeTab === 'visao-geral' && (
          <TabOverview
            contract={contract}
            responsibleTechnician={responsible_technician}
            isPmoc={isPmoc}
          />
        )}
        {activeTab === 'cronograma' && (
          <TabSchedule
            orders={calendarOrders}
            onOsClick={handleCalendarClick}
          />
        )}
        {activeTab === 'ocorrencias' && (
          <TabOccurrences
            occurrences={occurrences}
            canFill={canFill}
            onOsClick={setSelectedOS}
          />
        )}
        {/* Documentos: SÓ contrato PMOC. */}
        {isPmoc && activeTab === 'documentos' && (
          <TabDocuments documents={documents} released={documentsReleased} />
        )}
        {activeTab === 'historico' && (
          <TabHistory history={history} onOsClick={setSelectedOS} />
        )}
        {/* Histórico PMOC: prova da Planilha tarefa-a-tarefa. Só PMOC + liberado. */}
        {isPmoc && activeTab === 'historico-pmoc' && (
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold sm:text-lg">{t.historyPmocTitle}</h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t.historyPmocDesc}
              </p>
            </div>
            <PmocExecutionHistoryView rows={executionRows} showHeader={false} />
          </div>
        )}
      </div>

      {/* Rodapé legal (Dominex, URL, PMOC compliance) dentro do corpo rolável */}
      <PortalFooter
        tenant={tenant}
        portalUrl={portalUrl}
        lastUpdate={lastUpdate}
        isPmoc={isPmoc}
      />

      {/* Spacer pro rodapé fixo não cobrir o último card */}
      <div className="h-6" />

      {/* Modal de detalhe de OS */}
      <OsDetailPortalModal
        os={selectedOS}
        open={!!selectedOS}
        onOpenChange={(open) => {
          if (!open) setSelectedOS(null);
        }}
      />

      {/* Modal de chamado — não fecha ao clicar fora (regra-lei UI) */}
      <ResponsiveModal
        open={showTicketModal}
        onOpenChange={(v) => {
          if (!v && ticketSubmitting) return;
          setShowTicketModal(v);
        }}
        title={t.ticketModalTitle}
      >
        <div className="space-y-4 p-1">
          <div>
            <Label>{t.ticketProblemLabel}</Label>
            <Textarea
              value={ticketDesc}
              onChange={(e) => setTicketDesc(e.target.value)}
              placeholder={t.ticketProblemPlaceholder}
              rows={4}
            />
            {ticketDesc.length > 0 && ticketDesc.trim().length < 10 && (
              <p className="mt-1 text-xs text-destructive">{t.ticketDescMinLength}</p>
            )}
          </div>
          <Button
            className="w-full"
            onClick={handleSubmitTicket}
            disabled={ticketSubmitting || ticketDesc.trim().length < 10}
          >
            {ticketSubmitting
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t.ticketSubmitting}</>
              : <><Send className="h-4 w-4 mr-2" />{t.ticketSubmit}</>}
          </Button>
        </div>
      </ResponsiveModal>
    </PublicPortalShell>
  );
}

// ── Abas ──────────────────────────────────────────────────────────────────────

function TabOverview({
  contract,
  responsibleTechnician,
  isPmoc,
}: {
  contract: PortalPayload['contract'];
  responsibleTechnician: PortalPayload['responsible_technician'];
  isPmoc: boolean;
}) {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pmoc.publicPortal;
  const fmt = (d: string | null) => formatLocal(d, locale, timezone);
  return (
    <div className="space-y-6">
      <Section title={t.sectionContract} icon={CalendarClock}>
        {/* Campos do contrato: container único dividido por linhas (regra UI "lista limpa"). */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
          <InfoRow label={isPmoc ? t.infoCardPlan : t.infoCardContract} value={contract.name ?? '—'} />
          <InfoRow label={t.infoCardFrequency} value={contract.frequency_label} />
          <InfoRow
            label={isPmoc ? t.infoCardNextMaint : t.infoCardNextService}
            value={contract.next_pmoc_generation_date
              ? fmt(contract.next_pmoc_generation_date)
              : t.infoCardTbd}
          />
          <InfoRow label={t.infoCardContractStart} value={fmt(contract.start_date)} />
          {isPmoc && (
            <InfoRow
              label={t.infoCardCompliance}
              value={contract.compliance_text}
              valueClassName="text-info"
            />
          )}
          <InfoRow label={t.infoCardStatus} value={contract.status_label} />
        </div>
      </Section>

      {responsibleTechnician && (
        <Section title={t.sectionResponsibleTech} icon={Award}>
          {/* Responsável Técnico: container único com avatar + campos agrupados. */}
          <div
            className={cn(
              'overflow-hidden rounded-2xl border border-border bg-card',
              'shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm',
            )}
          >
            {/* Linha de identidade (avatar + nome) */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info/10 text-info">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="break-words text-sm font-semibold">
                {responsibleTechnician.full_name ?? '—'}
              </p>
            </div>
            {/* Campos extras separados por divisor */}
            {responsibleTechnician.cft_crea && (
              <InfoRow label={t.rtCftCrea} value={responsibleTechnician.cft_crea} />
            )}
            {responsibleTechnician.modality && (
              <InfoRow label={t.rtModality} value={responsibleTechnician.modality} />
            )}
            {responsibleTechnician.registry_number && (
              <InfoRow
                label={t.rtRegistryPrefix.replace(/\s*:\s*$/, '')}
                value={responsibleTechnician.registry_number}
              />
            )}
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
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pmoc.publicPortal;
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
          {t.scheduleEmpty}
        </p>
      )}
      <p className="text-center text-[11px] text-muted-foreground">
        {t.scheduleHint}
      </p>
    </div>
  );
}

/**
 * Aba "Ocorrências" — linha do tempo completa das visitas do contrato.
 * OS em `a_caminho`/`em_andamento` ganham link "Acompanhar ao vivo" (Task 2.2).
 */
function TabOccurrences({
  occurrences,
  canFill,
  onOsClick,
}: {
  occurrences: PortalOccurrenceEntry[];
  canFill: boolean;
  onOsClick: (os: PortalOsEntry) => void;
}) {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pmoc.publicPortal;
  const fmt = (d: string | null) => formatLocal(d, locale, timezone);

  if (occurrences.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t.occurrencesEmpty}
        </p>
      </div>
    );
  }

  const TERMINAL: PortalOsStatus[] = ['concluida', 'cancelada'];
  const LIVE_STATUSES: PortalOsStatus[] = ['a_caminho', 'em_andamento'];

  return (
    <ol className="space-y-3">
      {occurrences.map((entry, i) => {
        const statusClass = OS_STATUS_CLASS[entry.status] ?? OS_STATUS_CLASS.agendada;
        const statusLabel = entry.status_label || (
          entry.status === 'agendada' ? t.osStatusAgendada :
          entry.status === 'pendente' ? t.osStatusPendente :
          entry.status === 'a_caminho' ? t.osStatusACaminho :
          entry.status === 'em_andamento' ? t.osStatusEmAndamento :
          entry.status === 'pausada' ? t.osStatusPausada :
          entry.status === 'concluida' ? t.osStatusConcluida :
          entry.status === 'cancelada' ? t.osStatusCancelada :
          entry.status
        );
        const displayDate = entry.completed_at || entry.scheduled_date;
        const showFill = canFill && !TERMINAL.includes(entry.status);
        // "Acompanhar ao vivo": OS ativa — link /os-tecnico/:id?modo=cliente (Task 2.2)
        const isLive = LIVE_STATUSES.includes(entry.status);

        return (
          <li key={`${entry.id}-${i}`}>
            <div
              className={cn(
                'block w-full rounded-2xl border border-border bg-card p-3.5',
                'shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm sm:p-4',
              )}
            >
              <button
                type="button"
                onClick={() => onOsClick(entry)}
                className="block w-full min-h-11 text-left transition-all duration-100 hover:opacity-90 active:scale-[0.99]"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs text-muted-foreground">
                    OS #{entry.number}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      statusClass,
                    )}
                  >
                    {statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium leading-relaxed">{fmt(displayDate)}</p>
                {entry.service_type_label && (
                  <p className="text-xs leading-relaxed text-muted-foreground">{entry.service_type_label}</p>
                )}
                {entry.public_description && (
                  <p className="mt-2 line-clamp-2 break-words text-sm leading-relaxed text-foreground/90">
                    {entry.public_description}
                  </p>
                )}
              </button>

              {/* Acompanhar ao vivo (Task 2.2) */}
              {isLive && (
                <a
                  href={`${typeof window !== 'undefined' ? window.location.origin : ''}/os-tecnico/${entry.id}?modo=cliente`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl',
                    'bg-primary px-4 text-sm font-semibold text-primary-foreground',
                    'transition-all duration-100 hover:bg-primary/90 active:scale-[0.98]',
                  )}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {t.trackLive}
                </a>
              )}

              {/* Preencher OS (viewer logado da empresa dona) */}
              {showFill && (
                <a
                  href={`${typeof window !== 'undefined' ? window.location.origin : ''}/os-tecnico/${entry.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl',
                    'bg-primary px-4 text-sm font-semibold text-primary-foreground',
                    'transition-all duration-100 hover:bg-primary/90 active:scale-[0.98]',
                  )}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {t.fillOs}
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TabDocuments({
  documents,
  released,
}: {
  documents: PortalRealDocument[];
  released: boolean;
}) {
  const available = documents.filter((d) => d.available);
  const unavailable = documents.filter((d) => !d.available);
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pmoc.publicPortal;

  if (!released || documents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t.docsEmpty}
        </p>
      </div>
    );
  }

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
              {t.docsComingSoon}
            </h3>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {unavailable.map((doc) => (
              <RealDocumentCard key={doc.type} doc={doc} />
            ))}
          </div>
        </>
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
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pmoc.publicPortal;

  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t.historyEmpty}
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

// ── Subcomponentes ────────────────────────────────────────────────────────────

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
 * Badge de saúde saturado: bg sólido por status + texto branco.
 * Regra-lei Dominex: fundo saturado + texto/ícone branco. Nunca outline dessaturado.
 */
function HealthBadge({
  status,
  overdueCount,
}: {
  status: PortalHealthStatus;
  overdueCount: number;
}) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pmoc.publicPortal;
  const style = HEALTH_STYLE[status] ?? HEALTH_STYLE.em_dia;
  const label = status === 'em_dia' ? t.healthEmDia
    : status === 'manutencao_pendente' ? t.healthManutencaoPendente
    : t.healthNecessitaAtencao;
  const bgClass = style.tone === 'success'
    ? 'bg-success'
    : style.tone === 'warning'
      ? 'bg-warning'
      : 'bg-destructive';
  return (
    <div
      className={cn(
        bgClass,
        'text-white shadow-sm',
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1',
      )}
      aria-label={`${t.healthBadgeStatusLabel}: ${label}${overdueCount > 0 ? ` (${overdueCount} ${overdueCount === 1 ? t.healthBadgePendenciaSingular : t.healthBadgePendenciaPlural})` : ''}`}
    >
      <span className="text-xs font-semibold leading-none">
        {label}
      </span>
      {overdueCount > 0 && (
        <span className="text-[10px] text-white/85">
          ({overdueCount})
        </span>
      )}
    </div>
  );
}

/**
 * Linha de campo dentro de um container agrupado.
 * Rótulo pequeno em cima (uppercase, muted) + valor embaixo.
 * Padding lateral uniforme para alinhar com a linha de avatar do RT.
 */
function InfoRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-0.5 break-words text-sm font-medium leading-relaxed', valueClassName)}>
        {value}
      </p>
    </div>
  );
}

function RealDocumentCard({ doc }: { doc: PortalRealDocument }) {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pmoc.publicPortal;
  const fmt = (d: string | null) => formatLocal(d, locale, timezone);
  const available = doc.available && !!doc.pdf_url;
  const sub = available && doc.generated_at
    ? `${t.docUpdatedAt} ${fmt(doc.generated_at)}${doc.version ? ` — v${doc.version}` : ''}`
    : t.docAvailableSoon;

  const showPendingSignature = available && doc.signature_status === 'pending';
  const validUntil = doc.valid_until ?? null;
  const validityStatus = getDocumentValidityStatus(validUntil);
  const showValidity = available && validityStatus !== 'sem_validade';
  const validityPillClass =
    validityStatus === 'vencido'
      ? 'bg-destructive/15 text-destructive'
      : validityStatus === 'vence_em_breve'
        ? 'bg-warning/15 text-warning'
        : 'bg-success/15 text-success';

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
          {showValidity && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t.docValidUntil} {fmt(validUntil)}
              </span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5',
                  'text-[10px] font-semibold uppercase tracking-wide',
                  validityPillClass,
                )}
              >
                {getValidityLabel(validityStatus, locale)}
              </span>
            </div>
          )}
          {showPendingSignature && (
            <span
              className={cn(
                'mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                'bg-warning/15 text-[10px] font-semibold uppercase tracking-wide text-warning',
              )}
              title={t.docPendingSignatureTooltip}
            >
              <AlertCircle className="h-2.5 w-2.5" aria-hidden="true" />
              {t.docPendingSignature}
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
          {t.docDownloadPdf}
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
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pmoc.publicPortal;
  const fmt = (d: string | null) => formatLocal(d, locale, timezone);
  const statusClass = OS_STATUS_CLASS[entry.status] ?? OS_STATUS_CLASS.agendada;
  const statusLabel = entry.status_label || (
    entry.status === 'agendada' ? t.osStatusAgendada :
    entry.status === 'pendente' ? t.osStatusPendente :
    entry.status === 'a_caminho' ? t.osStatusACaminho :
    entry.status === 'em_andamento' ? t.osStatusEmAndamento :
    entry.status === 'pausada' ? t.osStatusPausada :
    entry.status === 'concluida' ? t.osStatusConcluida :
    entry.status === 'cancelada' ? t.osStatusCancelada :
    entry.status
  );
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
                  statusClass,
                )}
              >
                {statusLabel}
              </span>
              {entry.rating != null && entry.rating > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                  <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                  {entry.rating}
                </span>
              )}
            </div>
            <p className="text-sm font-medium leading-relaxed">{fmt(displayDate)}</p>
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
            {t.historyExecutedBy} <span className="font-medium">{entry.technician_first_name}</span>
          </p>
        )}

        {photos.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {photos.length} {photos.length === 1 ? t.historyPhotoSingular : t.historyPhotoPlural} — {t.historyPhotoHint}
          </p>
        )}
      </button>
    </li>
  );
}

// ── Rodapé legal do documento (dentro do corpo, NÃO o rodapé sticky do shell) ──
// Contém: badge de conformidade PMOC + "atualizado em" + URL do portal.
// Copyright/versao ficam no rodape sticky (PortalStickyFooter / desktopFooter)
// para nao duplicar com o SystemFooter que ja esta la.

function PortalFooter({
  tenant: _tenant,
  portalUrl,
  lastUpdate,
  isPmoc,
}: {
  tenant: PortalTenant;
  portalUrl: string;
  lastUpdate: string;
  isPmoc: boolean;
}) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pmoc.publicPortal;
  return (
    <footer className="mt-10 space-y-6 pt-8 pb-2">
      {isPmoc && <PmocComplianceBadge variant="footer" />}

      <div className="space-y-1 text-center">
        <p className="text-[11px] text-muted-foreground">
          {t.footerUpdatedAt} {lastUpdate}
        </p>
        <p className="break-all text-[11px] text-muted-foreground">{portalUrl}</p>
      </div>
    </footer>
  );
}

// ── Conversão pro calendar ─────────────────────────────────────────────────────

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

// ── Estados de loading/erro ───────────────────────────────────────────────────

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

function useMachineLocaleMessages() {
  const machineLocale = detectMachineLocale();
  const locale = machineLocale ?? 'pt-br';
  return MESSAGES[locale].app.pmoc.publicPortal;
}

function PortalPrivate({ token, companyName }: { token: string; companyName?: string | null }) {
  const t = useMachineLocaleMessages();
  const portalPath = `/contrato/unidade/${token}`;
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden p-4">
      <div className="absolute inset-0 z-0">
        <DarkVeil hueShift={53} speed={0.5} />
      </div>
      <div
        className="relative z-10 w-full max-w-md space-y-6 px-6 text-center"
        style={{
          paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
          <Lock className="h-8 w-8 text-white" aria-hidden="true" />
        </div>
        {companyName && (
          <p className="text-sm font-medium uppercase tracking-widest text-white/50">
            {companyName}
          </p>
        )}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
            {t.privateTitle}
          </h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-white/60">
            {t.privateDesc}
          </p>
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-white/40">
            {t.privateHint}
          </p>
        </div>
        <a href={`/login?redirect=${encodeURIComponent(portalPath)}`}>
          <Button size="lg" className="mt-2">{t.privateLoginBtn}</Button>
        </a>
      </div>
    </div>
  );
}

function PortalNotFound() {
  const t = useMachineLocaleMessages();
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
      <h1 className="mt-6 text-xl font-bold leading-tight">{t.notFoundTitle}</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t.notFoundDesc}
      </p>
      <a
        href="https://dominex.app"
        className={cn(
          'mt-6 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-primary px-6',
          'text-sm font-semibold text-primary-foreground',
          'transition-all duration-100 hover:bg-primary/90 active:scale-[0.98]',
        )}
      >
        {t.notFoundBtn}
      </a>
    </div>
  );
}

function PortalNetworkError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const t = useMachineLocaleMessages();
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
      <h1 className="mt-6 text-xl font-bold leading-tight">{t.networkErrorTitle}</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t.networkErrorDesc}
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
        {t.networkErrorBtn}
      </button>
    </div>
  );
}
