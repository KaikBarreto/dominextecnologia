import type { ReactNode } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';

// Central oficial verificada em 15/11/2026. Ela permite procurar pelo código
// e escolher instalação, operação ou catálogo sem supor compatibilidade de PDF.
const DAIKIN_DOWNLOADS = 'https://www.daikin.com.br/profissionais/downloads';

const copy = {
  'pt-br': {
    title: 'Manuais e catálogos oficiais Daikin',
    description: 'Na central da fabricante, pesquise pelo código exato do equipamento e escolha o documento de que precisa.',
    action: 'Abrir central Daikin',
    findManual: 'Buscar manual na Daikin',
  },
  en: {
    title: 'Official Daikin manuals and catalogues',
    description: 'Search the manufacturer’s download centre using the exact equipment code, then choose the document you need.',
    action: 'Open Daikin download centre',
    findManual: 'Find manual at Daikin',
  },
  es: {
    title: 'Manuales y catálogos oficiales Daikin',
    description: 'En la central del fabricante, busque el código exacto del equipo y elija el documento que necesita.',
    action: 'Abrir central Daikin',
    findManual: 'Buscar manual en Daikin',
  },
  fr: {
    title: 'Manuels et catalogues officiels Daikin',
    description: 'Dans le centre de téléchargement du fabricant, recherchez la référence exacte de l’équipement et choisissez le document souhaité.',
    action: 'Ouvrir le centre Daikin',
    findManual: 'Trouver le manuel chez Daikin',
  },
};

function isDaikin(brandName: string): boolean {
  return /^daikin(?:\s+brasil)?$/i.test(brandName.trim());
}

/** Documento não cadastrado não é o mesmo que inexistente na fabricante. */
export function ManufacturerManualLink({ brandName, fallback }: { brandName: string; fallback: ReactNode }) {
  const { locale } = useAppLocaleContext();
  if (!isDaikin(brandName)) return <>{fallback}</>;
  const t = copy[locale];
  return (
    <Button variant="outline" size="sm" asChild className="h-auto min-h-11 w-full whitespace-normal text-center">
      <a href={DAIKIN_DOWNLOADS} target="_blank" rel="noopener noreferrer">
        <FileText className="h-4 w-4 shrink-0" />
        {t.findManual}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    </Button>
  );
}

export function ManufacturerDocuments({ brandName }: { brandName: string }) {
  const { locale } = useAppLocaleContext();
  if (!isDaikin(brandName)) return null;
  const t = copy[locale];
  return (
    <aside className="flex flex-col gap-3 border-l-2 border-primary pl-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-foreground">{t.title}</p>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{t.description}</p>
      </div>
      <Button variant="outline" asChild className="h-auto min-h-11 shrink-0 whitespace-normal text-center">
        <a href={DAIKIN_DOWNLOADS} target="_blank" rel="noopener noreferrer">
          {t.action}
          <ExternalLink className="h-4 w-4 shrink-0" />
        </a>
      </Button>
    </aside>
  );
}
