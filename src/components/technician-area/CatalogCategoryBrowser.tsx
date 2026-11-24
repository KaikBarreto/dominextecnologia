import { AirVent, ArrowRight, ChevronRight, Factory, Fan, Layers3, PackageSearch, Refrigerator, Settings2 } from 'lucide-react';
import { catalogDiscoveryRank } from '@/lib/catalogDiscovery';
import type { CatalogSection, CatalogSectionKey } from '@/lib/catalogOrganization';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { catalogNavigationCopy } from './catalogNavigationCopy';

const icons = { split: AirVent, vrf: Layers3, industrial: Factory, air: Fan, appliances: Refrigerator, compressors: Settings2, remotes: Settings2, other: PackageSearch };

export function CatalogCategoryBrowser({ sections, onSelect, onViewAll }: { sections: CatalogSection[]; onSelect: (key: CatalogSectionKey) => void; onViewAll: () => void }) {
  const { locale } = useAppLocaleContext(); const t = catalogNavigationCopy[locale];
  return <section className="space-y-5" aria-label={t.browse}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl font-bold tracking-tight md:text-2xl">{t.browse}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.browseHelp}</p></div>
      <Button variant="ghost" className="min-h-11" onClick={onViewAll}>{t.allModels}<ArrowRight className="h-4 w-4" /></Button>
    </div>
    <div className="grid gap-x-8 md:grid-cols-2">
      {sections.map(section => {
        const Icon = icons[section.key];
        return <button key={section.key} type="button" onClick={() => onSelect(section.key)} className="group flex min-h-24 items-center gap-4 border-b border-border py-5 text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Icon className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1"><span className="block text-base font-semibold md:text-lg">{t.sections[section.key]}</span><span className="mt-1 block text-sm text-muted-foreground">{formatNumber(section.models.length, locale)} {t.items} · {formatNumber(section.families.length, locale)} {t.families.toLowerCase()}</span></span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" />
        </button>;
      })}
    </div>
  </section>;
}

export function CatalogFamilyBrowser({ section, onSelect, onViewAll }: { section: CatalogSection; onSelect: (family: string) => void; onViewAll: () => void }) {
  const { locale } = useAppLocaleContext(); const t = catalogNavigationCopy[locale];
  const rank = (family: CatalogSection['families'][number]) => Math.min(...family.models.map(catalogDiscoveryRank));
  const families = [...section.families].sort((a, b) => rank(a) - rank(b));
  return <section className="space-y-4" aria-label={t.families}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold md:text-2xl">{t.sections[section.key]}</h2><Button variant="ghost" className="min-h-11" onClick={onViewAll}>{t.categoryModels}<ArrowRight className="h-4 w-4" /></Button></div>
    <div className="grid gap-x-8 md:grid-cols-2">
      {families.map(family => <button key={family.key} type="button" onClick={() => onSelect(family.key)} className="group flex min-h-20 items-center justify-between gap-4 border-b border-border py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0"><span className="block break-words text-base font-semibold">{family.name}</span><span className="mt-1 block text-sm text-muted-foreground">{formatNumber(family.models.length, locale)} {t.items}</span></span><ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" />
      </button>)}
    </div>
  </section>;
}
