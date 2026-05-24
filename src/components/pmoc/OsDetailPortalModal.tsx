import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, CheckCircle2, Wrench, User, Star, FileText } from 'lucide-react';

import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { cn } from '@/lib/utils';
import type { PortalOsEntry, PortalOsStatus } from '@/types/pmocPortal';

/**
 * Modal de detalhe de uma OS no portal público PMOC.
 *
 * Mobile = drawer de baixo (regra Dominex: modais no mobile sempre são drawer).
 * Desktop = dialog centralizado.
 *
 * Mostra apenas dados públicos da OS:
 *  - Datas (agendada / realizada).
 *  - Tipo de serviço.
 *  - Descrição pública (truncada server-side).
 *  - Fotos (grid clicável + viewer).
 *  - Avaliação (se concluída e avaliada).
 *  - Técnico — só PRIMEIRO NOME (decisão LGPD).
 *
 * Plano: docs/planos/2026-05-24-pmoc-portal-publico-redesign.md §3.4
 */

const OS_STATUS_CONFIG: Record<PortalOsStatus, { label: string; className: string }> = {
  agendada: { label: 'Agendada', className: 'bg-muted text-muted-foreground' },
  pendente: { label: 'Pendente', className: 'bg-muted text-muted-foreground' },
  a_caminho: { label: 'A caminho', className: 'bg-info/15 text-info' },
  em_andamento: { label: 'Em andamento', className: 'bg-info/15 text-info' },
  pausada: { label: 'Pausada', className: 'bg-warning/15 text-warning' },
  concluida: { label: 'Concluída', className: 'bg-success/15 text-success' },
  cancelada: { label: 'Cancelada', className: 'bg-destructive/10 text-destructive' },
};

function parseLocal(date: string | null): Date | null {
  if (!date) return null;
  try {
    return parseISO(date.length === 10 ? `${date}T12:00:00` : date);
  } catch {
    return null;
  }
}

function formatLocal(date: string | null, fmt = "dd 'de' MMMM 'de' yyyy"): string {
  const d = parseLocal(date);
  if (!d) return '—';
  return format(d, fmt, { locale: ptBR });
}

interface OsDetailPortalModalProps {
  os: PortalOsEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OsDetailPortalModal({ os, open, onOpenChange }: OsDetailPortalModalProps) {
  const [photoPreview, setPhotoPreview] = useState<{ images: string[]; index: number } | null>(null);

  if (!os) return null;

  const statusCfg = OS_STATUS_CONFIG[os.status] ?? OS_STATUS_CONFIG.agendada;
  const photos = os.public_photos ?? [];
  const photoUrls = photos.map((p) => p.url);
  const hasRating = os.rating != null && os.rating > 0;

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={os.number != null ? `OS #${os.number}` : 'Detalhes da manutenção'}
      >
        <div className="space-y-5 py-1">
          {/* Status */}
          <div>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                statusCfg.className,
              )}
            >
              {os.status_label || statusCfg.label}
            </span>
          </div>

          {/* Datas */}
          <Block icon={Calendar} title="Datas">
            <Row label="Agendada" value={formatLocal(os.scheduled_date)} />
            {os.completed_at && (
              <Row label="Realizada" value={formatLocal(os.completed_at)} />
            )}
          </Block>

          {/* Tipo de serviço */}
          {os.service_type_label && (
            <Block icon={Wrench} title="Serviço">
              <p className="text-sm text-foreground">{os.service_type_label}</p>
            </Block>
          )}

          {/* Descrição */}
          {os.public_description && (
            <Block icon={FileText} title="Descrição">
              <p className="break-words text-sm text-foreground/90">
                {os.public_description}
              </p>
            </Block>
          )}

          {/* Fotos */}
          {photos.length > 0 && (
            <Block icon={FileText} title={`Fotos (${photos.length})`}>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((photo, i) => (
                  <button
                    key={`${photo.url}-${i}`}
                    type="button"
                    onClick={() => setPhotoPreview({ images: photoUrls, index: i })}
                    className={cn(
                      'group relative aspect-square overflow-hidden rounded-xl border border-border',
                      'shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
                      'transition-transform duration-100 active:scale-95',
                    )}
                    aria-label={photo.alt ?? `Foto ${i + 1}`}
                  >
                    <img
                      src={photo.url}
                      alt={photo.alt ?? ''}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </button>
                ))}
              </div>
            </Block>
          )}

          {/* Avaliação (só faz sentido em OS concluída e avaliada) */}
          {hasRating && (
            <Block icon={Star} title="Avaliação">
              <div className="flex items-center gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      'h-4 w-4',
                      i < (os.rating ?? 0)
                        ? 'fill-warning text-warning'
                        : 'fill-muted text-muted',
                    )}
                    aria-hidden="true"
                  />
                ))}
                <span className="ml-1 text-sm font-semibold">{os.rating?.toFixed(1)}</span>
              </div>
              {os.rating_comment && (
                <p className="mt-2 break-words text-sm italic text-foreground/80">
                  "{os.rating_comment}"
                </p>
              )}
            </Block>
          )}

          {/* Técnico — só primeiro nome (LGPD) */}
          {os.technician_first_name && (
            <Block icon={User} title="Técnico responsável">
              <p className="text-sm">
                {os.status === 'concluida' ? 'Atendido por' : 'Atribuída a'}{' '}
                <span className="font-medium">{os.technician_first_name}</span>
              </p>
            </Block>
          )}

          {/* Marcador legal */}
          {os.status === 'concluida' && (
            <div className="flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-foreground/80">
                Manutenção registrada conforme exigido pela{' '}
                <span className="font-medium">Lei Federal 13.589/2018 (PMOC)</span>.
              </p>
            </div>
          )}
        </div>
      </ResponsiveModal>

      {photoPreview && (
        <ImagePreviewModal
          open={!!photoPreview}
          src={photoPreview.images[photoPreview.index]}
          images={photoPreview.images}
          currentIndex={photoPreview.index}
          onNavigate={(i) => setPhotoPreview((p) => (p ? { ...p, index: i } : p))}
          onClose={() => setPhotoPreview(null)}
        />
      )}
    </>
  );
}

// -----------------------------------------------------------------------------

function Block({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Calendar;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
