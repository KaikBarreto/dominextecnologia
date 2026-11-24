import { ExternalLink } from 'lucide-react';
import { equipmentDocumentMirror, getEquipmentAssetReference } from '@/data/equipmentCatalogAssets';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import type { CatalogModelProvenance } from '@/data/curatedEquipmentModels';

const copy = {
  'pt-br': { image: 'Imagem representativa da família · confira a etiqueta do equipamento', illustration: 'Ilustração técnica do fabricante · não é fotografia', manual: 'Documento da família', exactManual: 'Documento deste modelo', source: 'Fonte e modelos abrangidos', reviewed: 'Conferido em' },
  en: { image: 'Representative family image · check the equipment label', illustration: 'Manufacturer technical illustration · not a photograph', manual: 'Family document', exactManual: 'Document for this model', source: 'Source and covered models', reviewed: 'Reviewed on' },
  es: { image: 'Imagen representativa de la familia · consulta la etiqueta del equipo', illustration: 'Ilustración técnica del fabricante · no es fotografía', manual: 'Documento de la familia', exactManual: 'Documento de este modelo', source: 'Fuente y modelos incluidos', reviewed: 'Revisado el' },
  fr: { image: 'Image représentative de la gamme · vérifiez la plaque', illustration: 'Illustration technique du fabricant · pas une photographie', manual: 'Document de la gamme', exactManual: 'Document de ce modèle', source: 'Source et modèles concernés', reviewed: 'Vérifié le' },
};

const provenanceCopy = {
  'pt-br': { indoor: 'Unidade interna', outdoor: 'Unidade externa', system: 'Equipamento', series: 'Série configurável', combination: 'Combinação publicada', configuration: 'Configuração de catálogo', source: 'Fonte do modelo', pages: 'Páginas do PDF' },
  en: { indoor: 'Indoor unit', outdoor: 'Outdoor unit', system: 'Equipment', series: 'Configurable series', combination: 'Published combination', configuration: 'Catalogue configuration', source: 'Model source', pages: 'PDF pages' },
  es: { indoor: 'Unidad interior', outdoor: 'Unidad exterior', system: 'Equipo', series: 'Serie configurable', combination: 'Combinación publicada', configuration: 'Configuración de catálogo', source: 'Fuente del modelo', pages: 'Páginas PDF' },
  fr: { indoor: 'Unité intérieure', outdoor: 'Unité extérieure', system: 'Équipement', series: 'Gamme configurable', combination: 'Combinaison publiée', configuration: 'Configuration du catalogue', source: 'Source du modèle', pages: 'Pages PDF' },
};

export function CatalogModelIdentity({ reference }: { reference?: CatalogModelProvenance }) {
  const { locale } = useAppLocaleContext();
  if (!reference) return null;
  const t = provenanceCopy[locale];
  return <p className="mt-2 text-center text-sm font-medium text-foreground">{reference.record_scope === 'model' ? t[reference.unit_kind] : t[reference.record_scope]} · {reference.line}</p>;
}

export function CatalogModelReference({ reference }: { reference?: CatalogModelProvenance }) {
  const { locale } = useAppLocaleContext();
  if (!reference) return null;
  const t = provenanceCopy[locale];
  const sourceUrl = reference.source_kind === 'pdf' ? equipmentDocumentMirror(reference.source_sha256) ?? reference.source_url : reference.source_url;
  return <details className="mt-3 text-left text-xs text-muted-foreground">
    <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground">{t.source}</summary>
    <div className="space-y-2 pb-2 leading-relaxed">
      <p className="font-medium text-foreground">{reference.document}</p>
      {reference.note && <p>{reference.note}</p>}
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4">{t.source}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>
      <p>{reference.pages.length > 0 && <>{t.pages}: {reference.pages.join(', ')} · </>}{reference.reviewed_at}</p>
    </div>
  </details>;
}

export function CatalogImagePreview({ model, open, onClose }: { model: { id: string; name: string; image_url: string | null; manual_url: string | null }; open: boolean; onClose: () => void }) {
  const { locale } = useAppLocaleContext();
  const imageReference = getEquipmentAssetReference(model, 'image_url');
  const representative = imageReference?.scope === 'family';
  if (!model.image_url) return null;
  const caption = imageReference?.image_kind === 'technical_illustration' ? copy[locale].illustration : representative ? copy[locale].image : undefined;
  return <ImagePreviewModal src={model.image_url} alt={caption ? `${model.name} · ${caption}` : model.name} caption={caption} open={open} onClose={onClose} />;
}

export function CatalogPhotoCaption({ model }: { model: { id: string; image_url: string | null; manual_url: string | null } }) {
  const { locale } = useAppLocaleContext();
  const reference = getEquipmentAssetReference(model, 'image_url');
  if (reference?.scope !== 'family') return null;
  return <p className="px-3 py-2 text-center text-xs leading-relaxed text-muted-foreground">{reference.image_kind === 'technical_illustration' ? copy[locale].illustration : copy[locale].image}</p>;
}

export function CatalogDocumentReference({ model }: { model: { id: string; image_url: string | null; manual_url: string | null; catalog_reference?: CatalogModelProvenance } }) {
  const { locale } = useAppLocaleContext();
  const reference = getEquipmentAssetReference(model, 'manual_url');
  if (!reference || model.catalog_reference?.document === reference.document) return null;
  const t = copy[locale];
  return <details className="mt-3 text-left text-xs text-muted-foreground">
    <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground">{reference.scope === 'family' ? t.manual : t.exactManual} · {t.source}</summary>
    <div className="space-y-2 pb-2 leading-relaxed">
      <p className="font-medium text-foreground">{reference.document}</p>
      {reference.note && <p>{reference.note}</p>}
      <a className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4" href={reference.evidence_url} target="_blank" rel="noopener noreferrer">{t.source}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>
      <p>{t.reviewed}: {reference.reviewed_at}</p>
    </div>
  </details>;
}
