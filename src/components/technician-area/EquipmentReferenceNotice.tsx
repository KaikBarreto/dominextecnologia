import { ChevronDown, ExternalLink } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import type { EquipmentCodeReference } from '@/data/equipmentErrorCodeReferences';
import { equipmentDocumentMirror } from '@/data/equipmentCatalogAssets';

const copy = {
  'pt-br': { title: 'Referência do manual deste equipamento', note: 'Códigos complementares para esta linha. Confira o código e siga o procedimento do manual antes de concluir o diagnóstico.', copy: 'Documento do fabricante · cópia do distribuidor', support: 'Suporte oficial do fabricante', page: 'p.', commissioning: 'Referência de comissionamento: indicações do teste inicial, conforme o manual.' },
  en: { title: 'Manual reference for this equipment', note: 'Supplementary codes for this range. Check the code and follow the manual’s procedure before concluding a diagnosis.', copy: 'Manufacturer document · distributor copy', support: 'Official manufacturer support', page: 'p.', commissioning: 'Commissioning reference: initial test indications, as described in the manual.' },
  es: { title: 'Referencia del manual de este equipo', note: 'Códigos complementarios para esta línea. Verifique el código y siga el procedimiento del manual antes de concluir el diagnóstico.', copy: 'Documento del fabricante · copia del distribuidor', support: 'Soporte oficial del fabricante', page: 'p.', commissioning: 'Referencia de puesta en marcha: indicaciones de la prueba inicial, según el manual.' },
  fr: { title: 'Référence du manuel de cet équipement', note: 'Codes complémentaires pour cette gamme. Vérifiez le code et suivez la procédure du manuel avant de conclure le diagnostic.', copy: 'Document du fabricant · copie du distributeur', support: 'Assistance officielle du fabricant', page: 'p.', commissioning: 'Référence de mise en service : indications du test initial, selon le manuel.' },
};

export function EquipmentReferenceNotice({ reference }: { reference: EquipmentCodeReference }) {
  const { locale } = useAppLocaleContext();
  const t = copy[locale];
  const documentUrl = equipmentDocumentMirror(reference.pdfSha256) ?? reference.url;
  return (
    <div className="space-y-2">
    {reference.context === 'commissioning' && <p role="note" className="text-sm font-semibold leading-relaxed">{t.commissioning}</p>}
    <details className="group border-l-2 border-primary pl-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span>{t.title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-2 pb-2">
      <p className="text-sm font-medium text-foreground">{reference.scope}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{t.note}</p>
      {reference.conditions && <p className="text-sm leading-relaxed text-muted-foreground">{reference.conditions}</p>}
      <div className="flex flex-col items-start gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-5">
        <a href={`${documentUrl}#page=${reference.pdfPage ?? reference.page}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-medium underline underline-offset-4 hover:text-primary">
          {reference.distributorCopy ? t.copy : reference.document} · {t.page} {reference.page}
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
        {reference.supportUrl && <a href={reference.supportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 underline underline-offset-4 hover:text-primary">{t.support}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>}
      </div>
      </div>
    </details>
    </div>
  );
}
