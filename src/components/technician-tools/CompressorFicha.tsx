import { useState } from 'react';
import { ArrowLeft, Cpu, Download, Loader2, PackageSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { CatalogImage } from './CatalogImage';
import { getRefrigerante } from '@/lib/refrigerantes';
import { RefrigeranteInflamavel } from './RefrigeranteInflamavel';
import { idealForeground } from '@/lib/colorContrast';
import {
  useCompressorSpec,
  type EquipmentModel,
} from '@/hooks/useEquipmentCatalog';

/** Remove caracteres inválidos de nome de arquivo e colapsa espaços. */
function sanitizarNomeArquivo(nome: string): string {
  return nome
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Baixa o datasheet (PDF) salvando com nome legível em vez do UUID do storage.
 * Fallback para window.open se o fetch do blob falhar (ex: CORS).
 */
async function baixarDatasheet(url: string, nome: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(u);
  } catch {
    window.open(url, '_blank');
  }
}

/**
 * Ficha técnica de um compressor (Fase 1 — estrutura).
 * Foto em destaque + tabela de campos preenchidos. Gás reusa model.refrigerant.
 */
export function CompressorFicha({
  model,
  onBack,
}: {
  model: EquipmentModel;
  onBack: () => void;
}) {
  const { data: spec, isLoading } = useCompressorSpec(model.id);
  const [viewerOpen, setViewerOpen] = useState(false);

  const brandName = model.brand?.name ?? '';
  const tituloTopo = brandName ? `${model.name} - ${brandName}` : model.name;
  const temFoto = Boolean(model.image_url);
  const temManual = Boolean(model.manual_url);

  // Campos da ficha, na ordem do briefing. Só entram os preenchidos.
  const rows: { label: string; value: string | null }[] = spec
    ? [
        { label: 'HP', value: spec.hp },
        { label: 'Capacidade', value: spec.capacidade_btu },
        { label: 'Aplicação', value: spec.aplicacao },
        { label: 'Tensão', value: spec.tensao },
        { label: 'Frequência', value: spec.frequencia },
        { label: 'Deslocamento', value: spec.deslocamento_cm3 },
        { label: 'RLA', value: spec.rla != null ? String(spec.rla) : null },
        { label: 'LRA', value: spec.lra != null ? String(spec.lra) : null },
        { label: 'Capacitor de trabalho', value: spec.capacitor_trabalho },
        { label: 'Capacitor de partida', value: spec.capacitor_partida },
        { label: 'Relé / Protetor', value: spec.rele_protetor },
        { label: 'Óleo', value: spec.oleo },
        { label: 'Conexões', value: spec.conexoes },
        { label: 'Equivalências', value: spec.equivalencias },
        { label: 'Observações', value: spec.observacoes },
      ]
    : [];
  const visibleRows = rows.filter((r) => r.value && r.value.trim().length > 0);
  // Gás vem do próprio modelo (não da ficha).
  const gas = model.refrigerant?.trim() || null;
  const semFicha = !isLoading && visibleRows.length === 0 && !gas;

  return (
    <div className="space-y-6 pb-8">
      <Header
        icon={Cpu}
        eyebrow="Ficha Técnica"
        title={tituloTopo}
        onBack={onBack}
      />

      {/* Foto em destaque */}
      {temFoto ? (
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label={`Ampliar foto de ${model.name}`}
          className="flex h-48 w-full cursor-pointer items-center justify-center rounded-2xl border border-border bg-white p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CatalogImage
            src={model.image_url!}
            alt={model.name}
            containerClassName="h-full w-full"
            className="h-full w-full object-contain"
          />
        </button>
      ) : (
        <div className="flex h-48 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-white">
          <PackageSearch className="h-12 w-12 text-neutral-300" />
          <span className="text-xs text-neutral-400">Sem foto</span>
        </div>
      )}

      {/* Ficha */}
      {isLoading ? (
        <LoadingBlock />
      ) : semFicha ? (
        <EmptyState
          title="Ficha em atualização"
          message="A ficha técnica deste compressor está sendo cadastrada. Volte em breve."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {gas && (
              <li className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium text-muted-foreground">Gás</span>
                {(() => {
                  const cor = getRefrigerante(gas)?.cor ?? '#6b7280';
                  return (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="rounded-md px-2 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: cor, color: idealForeground(cor) }}
                      >
                        {gas}
                      </span>
                      <RefrigeranteInflamavel refrigId={gas} />
                    </span>
                  );
                })()}
              </li>
            )}
            {visibleRows.map((r) => (
              <li key={r.label} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="shrink-0 text-sm font-medium text-muted-foreground">{r.label}</span>
                <span className="min-w-0 text-right text-sm font-semibold text-foreground">
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Datasheet (reusa manual_url) */}
      {temManual && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            baixarDatasheet(
              model.manual_url!,
              sanitizarNomeArquivo(`Datasheet ${model.name} - ${brandName}.pdf`),
            )
          }
        >
          <Download className="h-4 w-4" />
          Datasheet
        </Button>
      )}

      {temFoto && (
        <ImagePreviewModal
          src={model.image_url!}
          alt={model.name}
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Blocos auxiliares (espelham os de Equipamentos.tsx)                 */
/* ------------------------------------------------------------------ */

function Header({
  icon: Icon,
  title,
  eyebrow,
  onBack,
}: {
  icon: typeof Cpu;
  title: string;
  /** Rótulo pequeno acima do título (ex: "Ficha Técnica"). */
  eyebrow?: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Icon className="mt-0.5 h-6 w-6 shrink-0 text-foreground/70" />
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </p>
          )}
          {/* Nome do modelo em destaque (título da página, alto contraste). */}
          <h1 className="text-lg font-semibold leading-snug tracking-tight text-foreground lg:text-2xl">
            {title}
          </h1>
        </div>
      </div>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <PackageSearch className="h-10 w-10 text-muted-foreground" />
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
