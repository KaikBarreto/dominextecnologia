import { ChevronDown, ExternalLink } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import type { ModeloSuperaquecimento } from '@/lib/superaquecimentoModelos';

const copy = {
  'pt-br': { title: 'Procedimento deste modelo', weight: 'Carga por peso', plate: 'Conferir a placa e o manual', range: 'Verificação por SH/SC', details: 'Manual, modelos e condições', models: 'Modelos abrangidos', conditions: 'Condições de medição', reviewed: 'Conferido em', page: 'Página PDF', mismatch: 'O fluido selecionado difere do perfil. Confira a placa do equipamento; a faixa do manual não será aplicada a esta medição.', originalCopy: 'Documento do fabricante · cópia do distribuidor' },
  en: { title: 'Procedure for this model', weight: 'Charge by weight', plate: 'Check the nameplate and manual', range: 'SH/SC verification', details: 'Manual, models and conditions', models: 'Models covered', conditions: 'Measurement conditions', reviewed: 'Reviewed on', page: 'PDF page', mismatch: 'The selected refrigerant differs from this profile. Check the nameplate; the manual range will not be applied to this measurement.', originalCopy: 'Manufacturer document · distributor copy' },
  es: { title: 'Procedimiento de este modelo', weight: 'Carga por peso', plate: 'Consultar placa y manual', range: 'Verificación por SH/SC', details: 'Manual, modelos y condiciones', models: 'Modelos incluidos', conditions: 'Condiciones de medición', reviewed: 'Revisado el', page: 'Página PDF', mismatch: 'El refrigerante seleccionado difiere del perfil. Consulta la placa; la franja del manual no se aplicará a esta medición.', originalCopy: 'Documento del fabricante · copia del distribuidor' },
  fr: { title: 'Procédure pour ce modèle', weight: 'Charge au poids', plate: 'Consulter la plaque et le manuel', range: 'Vérification SH/SC', details: 'Manuel, modèles et conditions', models: 'Modèles concernés', conditions: 'Conditions de mesure', reviewed: 'Vérifié le', page: 'Page PDF', mismatch: 'Le fluide sélectionné diffère du profil. Vérifiez la plaque ; la plage du manuel ne sera pas appliquée à cette mesure.', originalCopy: 'Document du fabricant · copie du distributeur' },
};

export function DocumentedProfileNotice({ model, refrigerantMatches }: { model: ModeloSuperaquecimento; refrigerantMatches: boolean }) {
  const { locale } = useAppLocaleContext();
  if (!model.fonteUrl) return null;
  const t = copy[locale];
  return <section aria-label={t.title} className="space-y-3 border-l-2 border-primary pl-4">
    <p className="text-base font-semibold">{model.metodoCarga === 'peso' ? t.weight : model.metodoCarga === 'placa' ? t.plate : t.range}</p>
    <p className="text-sm leading-relaxed text-muted-foreground">{model.nota}</p>
    {!refrigerantMatches && <p role="alert" className="text-sm font-medium leading-relaxed text-amber-700 dark:text-amber-400">{t.mismatch}</p>}
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">{t.details}<ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary>
      <div className="space-y-3 pb-3 text-sm leading-relaxed">
        <div><p className="font-semibold">{t.models}</p><p className="break-words text-muted-foreground">{model.modelosAbrangidos?.join(' · ')}</p></div>
        {model.condicoes && <div><p className="font-semibold">{t.conditions}</p><p className="text-muted-foreground">{model.condicoes}</p></div>}
        <a href={`${model.fonteUrl}#page=${model.fontePaginas?.[0] ?? 1}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-medium underline underline-offset-4">{model.fonteDocumento}<ExternalLink className="h-4 w-4 shrink-0" /></a>
        {model.copiaDistribuidor && <p className="text-muted-foreground">{t.originalCopy}</p>}
        <p className="text-muted-foreground">{t.page}: {model.fontePaginas?.join(', ')} · {t.reviewed}: {model.revisadoEm}</p>
      </div>
    </details>
  </section>;
}
