import { useState } from 'react';
import { ArrowLeft, Loader2, PackageSearch, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import {
  useRemoteConfig,
  type EquipmentModel,
} from '@/hooks/useEquipmentCatalog';

/**
 * "Como configurar" um controle remoto (Fase 1 — estrutura).
 * Foto em destaque + seções de texto. Só renderiza as seções preenchidas.
 */
export function RemoteConfig({
  model,
  onBack,
}: {
  model: EquipmentModel;
  onBack: () => void;
}) {
  const { data: config, isLoading } = useRemoteConfig(model.id);
  const [viewerOpen, setViewerOpen] = useState(false);

  const brandName = model.brand?.name ?? '';
  const tituloTopo = brandName ? `${model.name} - ${brandName}` : model.name;
  const temFoto = Boolean(model.image_url);

  const sections: { label: string; value: string | null }[] = config
    ? [
        { label: 'Como configurar', value: config.instrucoes },
        { label: 'Código universal', value: config.codigo_universal },
        { label: 'Reset', value: config.reset },
        { label: 'Desbloqueio', value: config.desbloqueio },
        { label: 'Modos', value: config.modos },
        { label: 'Observações', value: config.observacoes },
      ]
    : [];
  const visibleSections = sections.filter((s) => s.value && s.value.trim().length > 0);
  const semConfig = !isLoading && visibleSections.length === 0;

  return (
    <div className="space-y-6 pb-8">
      <Header icon={Settings2} title="Como Configurar" subtitle={tituloTopo} onBack={onBack} />

      {/* Foto em destaque */}
      {temFoto ? (
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label={`Ampliar foto de ${model.name}`}
          className="flex h-48 w-full cursor-pointer items-center justify-center rounded-2xl border border-border bg-white p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={model.image_url!}
            alt={model.name}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        </button>
      ) : (
        <div className="flex h-48 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-white">
          <PackageSearch className="h-12 w-12 text-neutral-300" />
          <span className="text-xs text-neutral-400">Sem foto</span>
        </div>
      )}

      {isLoading ? (
        <LoadingBlock />
      ) : semConfig ? (
        <EmptyState
          title="Em atualização"
          message="As instruções de configuração deste controle estão sendo cadastradas. Volte em breve."
        />
      ) : (
        <div className="space-y-3">
          {visibleSections.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                {s.value}
              </p>
            </div>
          ))}
        </div>
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
  subtitle,
  onBack,
}: {
  icon: typeof Settings2;
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className="h-6 w-6 shrink-0 text-foreground/70" />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight lg:text-2xl">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
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
