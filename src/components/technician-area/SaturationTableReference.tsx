import { ChevronDown, ExternalLink } from 'lucide-react';
import { FONTES_TABELAS_SATURACAO } from '@/data/refrigerantSaturationSources';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';

const copy = {
  'pt-br': { title: 'Fonte da tabela de saturação', reviewed: 'Conferência documental', pages: 'Página PDF', note: 'A consulta usa os pontos publicados nesta fonte e interpola entre eles, sem extrapolar o intervalo disponível.' },
  en: { title: 'Saturation table source', reviewed: 'Document review', pages: 'PDF page', note: 'The lookup uses the points published in this source and interpolates between them, without extrapolating outside the available range.' },
  es: { title: 'Fuente de la tabla de saturación', reviewed: 'Revisión documental', pages: 'Página PDF', note: 'La consulta usa los puntos publicados e interpola entre ellos, sin extrapolar fuera del intervalo disponible.' },
  fr: { title: 'Source du tableau de saturation', reviewed: 'Revue documentaire', pages: 'Page PDF', note: 'La consultation utilise les points publiés et interpole entre eux, sans extrapoler hors de la plage disponible.' },
};

export function SaturationTableReference({ refrigerantId }: { refrigerantId: string }) {
  const { locale } = useAppLocaleContext();
  const source = FONTES_TABELAS_SATURACAO[refrigerantId.replace(/-/g, '')];
  if (!source) return null;
  const t = copy[locale];
  return <details className="group border-l-2 border-border pl-4">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      {t.title}<ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
    </summary>
    <div className="space-y-2 pb-3 text-sm leading-relaxed">
      <a href={`${source.url}#page=${source.pages[0]}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-medium underline underline-offset-4">{source.title}<ExternalLink className="h-4 w-4 shrink-0" /></a>
      <p className="text-muted-foreground">{t.pages}: {source.pages.join(', ')} · {t.reviewed}: {new Intl.DateTimeFormat(locale === 'pt-br' ? 'pt-BR' : locale, { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(`${source.reviewedAt}T12:00:00Z`))}</p>
      <p className="text-muted-foreground">{t.note}</p>
    </div>
  </details>;
}
