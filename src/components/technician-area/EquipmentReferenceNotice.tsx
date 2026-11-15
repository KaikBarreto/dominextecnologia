import { ChevronDown, ExternalLink } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import type { EquipmentCodeReference } from '@/data/equipmentErrorCodeReferences';

const copy = {
  'pt-br': { title: 'Referência do manual deste equipamento', note: 'Códigos complementares para esta linha. Confira o código e siga o procedimento do manual antes de concluir o diagnóstico.', copy: 'Manual Samsung · cópia do distribuidor', support: 'Suporte oficial Samsung', page: 'p.' },
  en: { title: 'Manual reference for this equipment', note: 'Supplementary codes for this range. Check the code and follow the manual’s procedure before concluding a diagnosis.', copy: 'Samsung manual · distributor copy', support: 'Official Samsung support', page: 'p.' },
  es: { title: 'Referencia del manual de este equipo', note: 'Códigos complementarios para esta línea. Verifique el código y siga el procedimiento del manual antes de concluir el diagnóstico.', copy: 'Manual Samsung · copia del distribuidor', support: 'Soporte oficial Samsung', page: 'p.' },
  fr: { title: 'Référence du manuel de cet équipement', note: 'Codes complémentaires pour cette gamme. Vérifiez le code et suivez la procédure du manuel avant de conclure le diagnostic.', copy: 'Manuel Samsung · copie du distributeur', support: 'Assistance officielle Samsung', page: 'p.' },
};

export function EquipmentReferenceNotice({ reference }: { reference: EquipmentCodeReference }) {
  const { locale } = useAppLocaleContext();
  const t = copy[locale];
  return (
    <details className="group border-l-2 border-primary pl-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span>{t.title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-2 pb-2">
      <p className="text-sm font-medium text-foreground">{reference.scope}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{t.note}</p>
      <div className="flex flex-col items-start gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-5">
        <a href={`${reference.url}#page=${reference.page}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-medium underline underline-offset-4 hover:text-primary">
          {reference.distributorCopy ? t.copy : reference.document} · {t.page} {reference.page}
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
        {reference.supportUrl && <a href={reference.supportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 underline underline-offset-4 hover:text-primary">{t.support}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>}
      </div>
      </div>
    </details>
  );
}
