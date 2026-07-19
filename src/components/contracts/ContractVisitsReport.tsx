import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR, enUS, es, fr } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import {
  Printer,
  X,
  Loader2,
  CheckCircle2,
  Clock,
  CalendarClock,
  Ban,
  User,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useContractVisitsReport, type VisitEnrichment } from '@/hooks/useContractVisitsReport';
import { getFrequencyLabel, type Contract } from '@/hooks/useContracts';
import { osStatusLabels, type OsStatus } from '@/types/database';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';

/** Mapa LocaleCode → date-fns Locale (para formatação de datas por idioma). */
const DATE_FNS_LOCALE: Record<LocaleCode, Locale> = {
  'pt-br': ptBR,
  en: enUS,
  es,
  fr,
};

/**
 * Documento "Relatório de Visitas" de um contrato COMUM (não-PMOC). É o
 * RETROSPECTIVO — o comprovante de manutenção do período que o cliente recebe:
 * lista as VISITAS EXECUTADAS (OSs do contrato) em ordem cronológica, com
 * status, data, técnico e o resumo do que foi feito (equipamentos + conformidade
 * quando concluída). Complementa o "Plano de Manutenção" (prospectivo).
 *
 * Mesma régua de casa do Plano de Manutenção: tela-documento pronta pra IMPRIMIR
 * / salvar como PDF pelo navegador (não é edge function). Tema CLARO hardcoded
 * (nada de tokens que escurecem no dark mode) + `.print-report` (index.css)
 * esconde o resto da página, fixa A4 e força as cores. NÃO é a Planilha PMOC —
 * o PMOC tem seu próprio Dossiê/Planilha intocados.
 */

interface ContractVisitsReportProps {
  contract: Contract;
  onClose: () => void;
}

/** Parse 'YYYY-MM-DD' como data local (evita shift de fuso). */
function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}

/** Cores do selo de status (invariante — saturado + texto branco). */
const STATUS_PILL_BG: Record<OsStatus, string> = {
  concluida: 'bg-emerald-600',
  a_caminho: 'bg-sky-600',
  em_andamento: 'bg-sky-600',
  pausada: 'bg-amber-500',
  agendada: 'bg-slate-500',
  pendente: 'bg-slate-500',
  cancelada: 'bg-rose-600',
};

export function ContractVisitsReport({ contract, onClose }: ContractVisitsReportProps) {
  const { settings } = useCompanySettings();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.contracts.contractDocs;
  const dateFnsLocale = DATE_FNS_LOCALE[locale];

  // Identidade da empresa: mesma regra dos demais documentos (white-label quando
  // ligado; padrão quando off).
  const companyName = settings?.name || 'Empresa';
  const companyLogo = settings?.white_label_enabled
    ? settings?.white_label_logo_url || settings?.logo_url
    : settings?.logo_url;
  const companyDocument = settings?.document;
  const companyAddress = [settings?.address, settings?.city, settings?.state]
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .join(', ');

  // Visitas = OSs reais do contrato, ordem cronológica (scheduled_date asc).
  // "Visita #N" é derivada (index + 1) — não existe occurrence_number.
  const visits = useMemo(() => {
    const orders = [...(contract.service_orders || [])].sort((a, b) => {
      const da = a.scheduled_date ? parseLocalDate(a.scheduled_date).getTime() : 0;
      const db = b.scheduled_date ? parseLocalDate(b.scheduled_date).getTime() : 0;
      return da - db;
    });
    return orders.map((o, i) => ({ ...o, visitNumber: i + 1 }));
  }, [contract.service_orders]);

  // Enriquecimento (técnico, data de execução, equipamentos, conformidade) — só
  // dispara quando o documento está aberto (sempre, aqui, mas o hook protege).
  const osIds = useMemo(() => visits.map((v) => v.id), [visits]);
  const { byOsId, isLoading } = useContractVisitsReport(osIds, true);

  // Resumo do período.
  const summary = useMemo(() => {
    let concluidas = 0;
    let canceladas = 0;
    let emAndamento = 0;
    let agendadas = 0;
    for (const v of visits) {
      const s = v.status as OsStatus;
      if (s === 'concluida') concluidas += 1;
      else if (s === 'cancelada') canceladas += 1;
      else if (s === 'em_andamento' || s === 'a_caminho' || s === 'pausada') emAndamento += 1;
      else agendadas += 1;
    }
    const total = visits.length;
    // % de conclusão sobre as visitas que não foram canceladas (base efetiva).
    const base = total - canceladas;
    const pct = base > 0 ? Math.round((concluidas / base) * 100) : 0;
    return { total, concluidas, canceladas, emAndamento, agendadas, pct };
  }, [visits]);

  const frequencyText = getFrequencyLabel(contract.frequency_type, contract.frequency_value);
  const startText = format(parseLocalDate(contract.start_date), 'P', { locale: dateFnsLocale });
  const todayText = format(new Date(), 'P', { locale: dateFnsLocale });
  const generatedAt = format(new Date(), 'PPP', { locale: dateFnsLocale });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#525659]">
      {/* Barra de ações (some na impressão). */}
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-black/10 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{t.reportTitle}</p>
          <p className="truncate text-xs text-gray-500">{contract.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="active:scale-95 transition-transform"
          >
            <Printer className="mr-1.5 h-4 w-4" /> {t.printButton}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t.closeAriaLabel}
            className="text-gray-700 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Folha A4 branca centralizada. Texto SEMPRE escuro hardcoded. */}
      <div className="mx-auto my-6 max-w-[820px] bg-white px-6 py-8 text-gray-900 shadow-xl sm:px-10 sm:py-10 print:my-0 print:max-w-none print:px-10 print:py-8 print:shadow-none print-report">
        {/* ── Cabeçalho ── */}
        <header className="mb-6 border-b border-gray-200 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {companyLogo && (
                <img
                  src={companyLogo}
                  alt={companyName}
                  className="h-14 w-14 shrink-0 rounded-lg object-contain"
                />
              )}
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight text-gray-900">{companyName}</h1>
                {companyDocument && <p className="text-xs text-gray-500">CNPJ: {companyDocument}</p>}
                {companyAddress && <p className="text-xs text-gray-500">{companyAddress}</p>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {t.reportEyebrow}
              </p>
              <p className="text-base font-black leading-tight text-gray-900">{t.reportTitle}</p>
            </div>
          </div>

          {/* Dados do contrato + período */}
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Field label={t.fieldContract} value={contract.name} />
            <Field label={t.fieldCustomer} value={contract.customers?.name || '-'} />
            <Field label={t.fieldVisitFrequency} value={frequencyText} />
            <Field label={t.fieldPeriod} value={`${startText} ${t.periodSeparator} ${todayText}`} />
            <Field label={t.fieldIssuedAt} value={generatedAt} />
          </div>
        </header>

        {/* ── Resumo do período ── */}
        <section className="mb-7">
          <SectionTitle>{t.sectionSummary}</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label={t.summaryVisitsTotal} value={String(summary.total)} />
            <SummaryCard label={t.summaryConcluded} value={String(summary.concluidas)} accent="emerald" />
            <SummaryCard
              label={t.summaryScheduledPending}
              value={String(summary.agendadas + summary.emAndamento)}
            />
            <SummaryCard label={t.summaryConclusion} value={`${summary.pct}%`} accent="emerald" />
          </div>
          {summary.canceladas > 0 && (
            <p className="mt-2 text-[11px] text-gray-400">
              {summary.canceladas} {t.summaryCancelledNote}
            </p>
          )}
        </section>

        {/* ── Lista de visitas ── */}
        <section className="mb-2">
          <SectionTitle>{t.sectionVisits}</SectionTitle>
          {visits.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-500">
              {t.noVisitsRegistered}
            </p>
          ) : (
            <>
              {isLoading && (
                <p className="mb-3 flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.loadingVisitDetails}
                </p>
              )}
              <div className="space-y-3">
                {visits.map((v) => (
                  <VisitBlock
                    key={v.id}
                    visitNumber={v.visitNumber}
                    orderNumber={v.order_number}
                    status={v.status as OsStatus}
                    scheduledDate={v.scheduled_date}
                    enrichment={byOsId.get(v.id)}
                    dateFnsLocale={dateFnsLocale}
                    t={t}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        <p className="mt-6 border-t border-gray-200 pt-4 text-[11px] text-gray-400">
          {t.reportFooter.replace('{companyName}', companyName)}
        </p>
      </div>
    </div>
  );
}

/** Bloco de UMA visita. Concluídas mostram resumo completo; futuras, enxuto. */
function VisitBlock({
  visitNumber,
  orderNumber,
  status,
  scheduledDate,
  enrichment,
  dateFnsLocale,
  t,
}: {
  visitNumber: number;
  orderNumber: number;
  status: OsStatus;
  scheduledDate: string | null;
  enrichment: VisitEnrichment | undefined;
  dateFnsLocale: Locale;
  t: {
    visitLabel: string;
    osLabel: string;
    lateBadge: string;
    scheduledLabel: string;
    noDate: string;
    executedLabel: string;
    executedAtSuffix: string;
    equipAttended: string;
    itemsAnswered: string;
    itemsCompliant: string;
    itemsNonCompliant: string;
  };
}) {
  const pillBg = STATUS_PILL_BG[status] ?? 'bg-slate-500';
  const pillLabel = osStatusLabels[status] ?? status;
  const isDone = status === 'concluida';
  const isCancelled = status === 'cancelada';

  const occDate = scheduledDate ? parseLocalDate(scheduledDate) : null;
  // "Hoje" no fuso Brasil (YYYY-MM-DD). Atrasada só a partir do DIA SEGUINTE:
  // scheduled_date estritamente antes de hoje, comparando por dia.
  const todaySP = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const isLate =
    !isDone && !isCancelled && !!scheduledDate && scheduledDate < todaySP;

  const executedAt = enrichment?.executedAt ? parseISO(enrichment.executedAt) : null;
  const technician = enrichment?.technicianName;
  const equipments = enrichment?.equipments ?? [];
  const conformity = enrichment?.conformity;

  const StatusIcon = isDone
    ? CheckCircle2
    : isCancelled
      ? Ban
      : status === 'em_andamento' || status === 'a_caminho' || status === 'pausada'
        ? Clock
        : CalendarClock;

  return (
    <div
      className={`break-inside-avoid rounded-lg border p-3 ${
        isDone ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200'
      }`}
    >
      {/* Cabeçalho da visita */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-xs text-gray-400">{t.visitLabel}{visitNumber}</span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
            {t.osLabel}{orderNumber}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isLate && (
            <span className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
              {t.lateBadge}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${pillBg}`}
          >
            <StatusIcon className="h-3 w-3" />
            {pillLabel}
          </span>
        </div>
      </div>

      {/* Datas + técnico */}
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-600">
        <span>
          <span className="text-gray-400">{t.scheduledLabel} </span>
          {occDate ? format(occDate, 'P', { locale: dateFnsLocale }) : t.noDate}
        </span>
        {executedAt && (
          <span>
            <span className="text-gray-400">{t.executedLabel} </span>
            {format(executedAt, `P '${t.executedAtSuffix}' HH:mm`, { locale: dateFnsLocale })}
          </span>
        )}
        {technician && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3 text-gray-400" />
            {technician}
          </span>
        )}
      </div>

      {/* Resumo do que foi feito — equipamentos + conformidade (concluídas) */}
      {equipments.length > 0 && (
        <div className="mt-2.5 border-t border-gray-100 pt-2">
          <p className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <Wrench className="h-3 w-3" />
            {equipments.length} {t.equipAttended}
          </p>
          <ul className="space-y-1">
            {equipments.map((eq) => (
              <li key={eq.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words text-gray-800">{eq.name}</span>
                {eq.meta && <span className="shrink-0 text-xs text-gray-500">{eq.meta}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isDone && conformity && conformity.total > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
          <span className="inline-flex items-center rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-medium text-white">
            {conformity.answered}/{conformity.total} {t.itemsAnswered}
          </span>
          {conformity.conforme > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">
              {conformity.conforme} {t.itemsCompliant}
            </span>
          )}
          {conformity.naoConforme > 0 && (
            <span className="inline-flex items-center rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-medium text-white">
              {conformity.naoConforme} {t.itemsNonCompliant}
            </span>
          )}
          {conformity.na > 0 && (
            <span className="inline-flex items-center rounded-full bg-slate-500 px-2 py-0.5 text-[11px] font-medium text-white">
              {conformity.na} N/A
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-0.5 break-words font-medium text-gray-900">{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">{children}</h2>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald';
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent === 'emerald' ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <p
        className={`text-2xl font-black leading-none ${
          accent === 'emerald' ? 'text-emerald-700' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  );
}
