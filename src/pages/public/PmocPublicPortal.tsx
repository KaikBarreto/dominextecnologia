import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  Image as ImageIcon,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { PmocComplianceBadge } from '@/components/pmoc/PmocComplianceBadge';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { cn } from '@/lib/utils';
import {
  fetchPmocPortal,
  buildPmocPortalUrl,
} from '@/utils/pmocPortalApi';
import type {
  PortalHealthStatus,
  PortalOsStatus,
  PortalPayload,
  PortalHistoryEntry,
} from '@/types/pmocPortal';

/**
 * Portal PMOC Público (Onda B — v1.9.1).
 *
 * Rota: `/pmoc/unidade/:token` (fora do auth wall — ver App.tsx).
 *
 * Layout mobile-first (375px é a régua). Desktop adapta com max-width central.
 * Lê dados via `fetchPmocPortal` (mock por enquanto; vira fetch real quando
 * a edge function `pmoc-portal-share` for deployada pelo dev-database).
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-B-portal-publico.md §3.4b
 */

const HEALTH_CONFIG: Record<PortalHealthStatus, {
  label: string;
  tone: 'success' | 'warning' | 'destructive';
  bgClass: string;
  textClass: string;
  ringClass: string;
}> = {
  em_dia: {
    label: 'Em dia',
    tone: 'success',
    bgClass: 'bg-success/15',
    textClass: 'text-success',
    ringClass: 'ring-success/30',
  },
  manutencao_pendente: {
    label: 'Manutenção pendente',
    tone: 'warning',
    bgClass: 'bg-warning/15',
    textClass: 'text-warning',
    ringClass: 'ring-warning/30',
  },
  necessita_atencao: {
    label: 'Necessita atenção',
    tone: 'destructive',
    bgClass: 'bg-destructive/15',
    textClass: 'text-destructive',
    ringClass: 'ring-destructive/30',
  },
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

const INITIAL_HISTORY_COUNT = 5;
const MORE_HISTORY_STEP = 10;

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
  if (!d) return '-';
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

function usePortalSeo(payload: PortalPayload | undefined, token: string | undefined) {
  useEffect(() => {
    if (!payload || !token) return;

    const title = `PMOC — ${payload.unit.name} | ${payload.tenant.name}`;
    const description = `Plano de Manutenção, Operação e Controle conforme Lei Federal 13.589/2018. Histórico, documentos e status sanitário da unidade ${payload.unit.name}.`;
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

    setJsonLd('pmoc-portal', {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: `PMOC — ${payload.unit.name}`,
      description,
      provider: {
        '@type': 'Organization',
        name: payload.tenant.name,
      },
      areaServed: payload.unit.address ?? undefined,
      url,
      additionalType: 'https://en.wikipedia.org/wiki/HVAC',
      termsOfService: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm',
    });

    return () => {
      document.title = 'Dominex — Gestão de Equipes de Campo e Ordens de Serviço';
    };
  }, [payload, token]);
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

  usePortalSeo(data, token);

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
  const { unit, contract, responsible_technician, tenant, history, documents_placeholder } = payload;

  const primaryColor = tenant.primary_color || '#5555FF';
  const heroStyle = useMemo(
    () => ({
      background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
    }),
    [primaryColor],
  );

  const lastUpdate = useMemo(() => format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }), []);

  const portalUrl = buildPmocPortalUrl(token);

  return (
    <div className="min-h-screen bg-background pb-16 text-foreground">
      {/* Seção 1 — Hero */}
      <header
        className="relative px-4 pb-8 pt-6 text-white sm:px-6 sm:pt-8"
        style={heroStyle}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {tenant.logo_url ? (
                <img
                  src={tenant.logo_url}
                  alt={tenant.name}
                  className="h-10 w-10 shrink-0 rounded-lg bg-white/95 object-contain p-1 sm:h-12 sm:w-12"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15 sm:h-12 sm:w-12">
                  <ShieldCheck className="h-6 w-6 text-white" aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">
                  {tenant.name}
                </p>
                <p className="text-[11px] opacity-70">Portal PMOC</p>
              </div>
            </div>
            <HealthBadge status={contract.health_status} overdueCount={contract.overdue_count} />
          </div>

          <div className="space-y-2">
            <h1 className="break-words text-2xl font-bold leading-tight sm:text-3xl">
              {unit.name}
            </h1>
            <p className="text-sm opacity-90">{unit.customer_name}</p>
            {unit.address && (
              <p className="flex items-start gap-1.5 text-sm opacity-90">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="break-words">{unit.address}</span>
              </p>
            )}
          </div>

          <div className="rounded-lg bg-white/15 backdrop-blur-sm">
            <PmocComplianceBadge
              variant="ribbon"
              className="border-white/30 bg-transparent text-white [&_p]:text-white [&_span]:bg-white/20"
            />
          </div>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pt-6 sm:px-6">
        {/* Seção 2 — Responsável Técnico */}
        {responsible_technician && (
          <Section title="Responsável Técnico" icon={Award}>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-info/10 text-info">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-base font-semibold">
                  {responsible_technician.full_name}
                </p>
                {responsible_technician.cft_crea && (
                  <p className="break-words text-xs text-muted-foreground">
                    {responsible_technician.cft_crea}
                  </p>
                )}
                {responsible_technician.modality && (
                  <p className="break-words text-xs text-muted-foreground">
                    {responsible_technician.modality}
                  </p>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* Seção 3 — Cronograma */}
        <Section title="Cronograma" icon={CalendarClock}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoCard
              label="Próxima manutenção"
              value={contract.next_pmoc_generation_date
                ? formatLocal(contract.next_pmoc_generation_date)
                : 'A definir'}
            />
            <InfoCard label="Frequência" value={contract.frequency_label} />
            <InfoCard label="Início do contrato" value={formatLocal(contract.start_date)} />
            <InfoCard
              label="Conformidade"
              value={contract.compliance_text}
              valueClassName="text-info"
            />
          </div>
        </Section>

        {/* Seção 4 — Histórico */}
        <Section title="Histórico de manutenções" icon={Wrench}>
          <HistoryList items={history} />
        </Section>

        {/* Seção 5 — Documentos */}
        <Section title="Documentos" icon={FileText}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {documents_placeholder.map(doc => (
              <DocumentPlaceholderCard
                key={doc.type}
                label={doc.label}
                available={doc.available}
              />
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Os documentos serão disponibilizados em breve.
          </p>
        </Section>

      </main>

      {/* Seção 7 — Rodapé */}
      <footer className="mx-auto mt-10 w-full max-w-3xl space-y-3 px-4 pt-8 sm:px-6">
        <PmocComplianceBadge variant="footer" />
        <p className="text-center text-[11px] text-muted-foreground">
          Portal atualizado em {lastUpdate}
        </p>
        <p className="break-all text-center text-[11px] text-muted-foreground">
          {portalUrl}
        </p>
        <p className="text-center text-xs text-muted-foreground">
          Powered by{' '}
          <a
            href="https://dominex.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline"
          >
            Dominex
          </a>
        </p>
      </footer>
    </div>
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

function HealthBadge({
  status,
  overdueCount,
}: {
  status: PortalHealthStatus;
  overdueCount: number;
}) {
  const cfg = HEALTH_CONFIG[status];
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col items-end gap-0.5 rounded-lg bg-white/15 px-3 py-2',
        'backdrop-blur-sm',
      )}
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
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 break-words text-sm font-medium', valueClassName)}>
        {value}
      </p>
    </div>
  );
}

function DocumentPlaceholderCard({ label, available }: { label: string; available: boolean }) {
  return (
    <div
      className={cn(
        'flex min-h-[80px] items-start gap-3 rounded-lg border p-4 transition-colors',
        available
          ? 'border-border bg-card hover:bg-accent/40'
          : 'border-dashed border-border bg-muted/30',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          available ? 'bg-info/10 text-info' : 'bg-muted text-muted-foreground',
        )}
      >
        <FileText className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {available ? 'Disponível para download' : 'Disponível em breve'}
        </p>
      </div>
    </div>
  );
}

function HistoryList({ items }: { items: PortalHistoryEntry[] }) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_HISTORY_COUNT);
  const [preview, setPreview] = useState<{ images: string[]; index: number } | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhuma manutenção registrada ainda.
        </p>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => {
    const da = parseLocal(a.completed_date || a.scheduled_date)?.getTime() ?? 0;
    const db = parseLocal(b.completed_date || b.scheduled_date)?.getTime() ?? 0;
    return db - da;
  });

  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  return (
    <>
      <ol className="space-y-3">
        {visible.map(entry => (
          <HistoryItem
            key={entry.os_number}
            entry={entry}
            onOpenPhoto={(images, index) => setPreview({ images, index })}
          />
        ))}
      </ol>

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount(c => c + MORE_HISTORY_STEP)}
          className={cn(
            'mt-4 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border',
            'bg-card text-sm font-semibold transition-colors hover:bg-accent',
          )}
        >
          Ver mais ({sorted.length - visibleCount} restantes)
        </button>
      )}

      {preview && (
        <ImagePreviewModal
          open={!!preview}
          src={preview.images[preview.index]}
          images={preview.images}
          currentIndex={preview.index}
          onNavigate={i => setPreview(p => (p ? { ...p, index: i } : p))}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

function HistoryItem({
  entry,
  onOpenPhoto,
}: {
  entry: PortalHistoryEntry;
  onOpenPhoto: (images: string[], index: number) => void;
}) {
  const statusCfg = OS_STATUS_CONFIG[entry.status] ?? OS_STATUS_CONFIG.agendada;
  const displayDate = entry.completed_date || entry.scheduled_date;
  const photos = entry.public_photos ?? [];
  const photoUrls = photos.map(p => p.url);

  return (
    <li className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">
              OS #{entry.os_number}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                statusCfg.className,
              )}
            >
              {statusCfg.label}
            </span>
            {entry.rating != null && entry.rating > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                {entry.rating}
              </span>
            )}
          </div>
          <p className="text-sm font-medium">{formatLocal(displayDate)}</p>
          {entry.service_type_label && (
            <p className="text-xs text-muted-foreground">{entry.service_type_label}</p>
          )}
        </div>
      </div>

      {entry.description && (
        <p className="mt-2 break-words text-sm text-foreground/90">
          {entry.description}
        </p>
      )}

      {entry.technician_first_name && (
        <p className="mt-2 text-xs text-muted-foreground">
          Executado por <span className="font-medium">{entry.technician_first_name}</span>
        </p>
      )}

      {photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos.slice(0, 4).map((photo, i) => (
            <button
              key={`${photo.url}-${i}`}
              type="button"
              onClick={() => onOpenPhoto(photoUrls, i)}
              className={cn(
                'group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border',
                'sm:h-20 sm:w-20',
              )}
              aria-label={photo.caption ?? `Foto ${i + 1}`}
            >
              <img
                src={photo.url}
                alt={photo.caption ?? ''}
                loading="lazy"
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              {photos.length > 4 && i === 3 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold text-white">
                  +{photos.length - 4}
                </span>
              )}
            </button>
          ))}
          {photos.length === 0 && (
            <div className="flex h-16 items-center gap-1 text-xs text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Sem fotos
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ----- Estados de loading/erro ------------------------------------------------

function PortalSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-muted px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 animate-pulse rounded-lg bg-muted-foreground/20" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-muted-foreground/20" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted-foreground/20" />
            </div>
          </div>
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted-foreground/20" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted-foreground/20" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PortalNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <AlertCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-xl font-bold">Portal não encontrado</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Este link de QR Code não está mais ativo ou pode ter sido renovado.
        Procure a empresa responsável pela manutenção para obter o link atualizado.
      </p>
      <a
        href="https://dominex.app"
        className={cn(
          'mt-6 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-6',
          'text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90',
        )}
      >
        Ir para o Dominex
      </a>
    </div>
  );
}

function PortalNetworkError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
        <AlertCircle className="h-8 w-8 text-warning" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-xl font-bold">Não foi possível carregar</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Verifique sua conexão e tente novamente.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className={cn(
          'mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-6',
          'text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90',
          'disabled:opacity-60',
        )}
      >
        {retrying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Tentar novamente
      </button>
    </div>
  );
}
