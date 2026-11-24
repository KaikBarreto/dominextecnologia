import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AirVent, Clock3, ChevronRight, PackageSearch, Star } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useCatalogActivity } from '@/hooks/useCatalogActivity';
import { useDataPagination } from '@/hooks/useDataPagination';
import type { EquipmentModel } from '@/hooks/useEquipmentCatalog';
import { Button } from '@/components/ui/button';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { everydayCatalogModels } from '@/lib/catalogDiscovery';
import { cn } from '@/lib/utils';
import { pickI18n } from '@/lib/i18n/pickI18n';
import { CatalogImage } from './CatalogImage';
import { CatalogFavoriteButton } from './CatalogFavoriteButton';
import { CatalogFavoritesSyncStatus } from './CatalogFavoritesSyncStatus';
import { catalogActivityCopy } from './catalogActivityCopy';

interface FeedProps { models: EquipmentModel[]; onOpen: (model: EquipmentModel) => void }
type PersonalTab = 'recent' | 'favorites';

/** Básicos em destaque; um único contexto de atalhos pessoais por domínio. */
export function CatalogActivityFeed({ models, onOpen }: FeedProps) {
  const { locale } = useAppLocaleContext();
  const t = catalogActivityCopy[locale];
  const activity = useCatalogActivity();
  const { recentIds, favoriteIds, isReady } = activity;
  const [chosenTab, setChosenTab] = useState<PersonalTab | null>(null);
  const byId = useMemo(() => new Map(models.map(model => [model.id, model])), [models]);
  const resolve = (ids: readonly string[]) => ids.flatMap(id => { const model = byId.get(id); return model ? [model] : []; });
  const recent = resolve(recentIds);
  const favorites = resolve(favoriteIds);
  const everyday = useMemo(() => everydayCatalogModels(models), [models]);
  const personal = isReady && (recent.length > 0 || favorites.length > 0);
  const activeTab = chosenTab ?? (recent.length ? 'recent' : 'favorites');
  if (!isReady && !everyday.length) return null;

  const navigation = <MobilePillTabs variant="underline" activeTab={activeTab} onTabChange={tab => setChosenTab(tab as PersonalTab)} tabs={[
    { value: 'recent', label: t.recentShort, icon: <Clock3 aria-hidden className="h-4 w-4" />, sublabel: String(recent.length) },
    { value: 'favorites', label: t.favorites, icon: <Star aria-hidden className="h-4 w-4" />, sublabel: String(favorites.length) },
  ]} />;
  const syncNotice = isReady && <div className="space-y-1">
    {!personal && <p className="text-sm leading-relaxed text-muted-foreground">{t.empty}</p>}
    <CatalogFavoritesSyncStatus activity={activity} />
    {personal && <p className="text-xs leading-relaxed text-muted-foreground">{t.local}</p>}
  </div>;

  return <div className="space-y-5 py-2 sm:space-y-7 sm:py-4">
    {personal && <FeedSection
      key={`${activeTab}:${models[0]?.domain}`}
      title={activeTab === 'recent' ? t.recent : t.favorites}
      kind={activeTab}
      empty={activeTab === 'recent' ? t.noRecent : t.noFavorites}
      models={activeTab === 'recent' ? recent : favorites}
      onOpen={onOpen}
      navigation={navigation}
    />}
    {personal && syncNotice}
    {everyday.length > 0 && <FeedSection title={t.everyday} kind="everyday" empty="" models={everyday} onOpen={onOpen} />}
    {!personal && syncNotice}
  </div>;
}

function FeedSection({ title, kind, empty, models, onOpen, navigation }: FeedProps & {
  title: string; kind: PersonalTab | 'everyday'; empty: string; navigation?: ReactNode;
}) {
  const { locale } = useAppLocaleContext();
  const t = catalogActivityCopy[locale];
  const [expanded, setExpanded] = useState(false);
  const pagination = useDataPagination(models, 10);
  const visible = expanded ? pagination.paginatedItems : models.slice(0, 3);
  const section = useRef<HTMLElement>(null);
  const listId = useId();
  const goToPage = (page: number) => { pagination.setPage(page); section.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); };
  const hasToggle = models.length > 3 || expanded;

  return <section ref={section} aria-label={title} className="grid min-w-0 scroll-mt-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3">
    <div className={cn('min-w-0', navigation ? hasToggle ? 'col-span-2 sm:col-span-1' : 'col-span-2' : hasToggle ? '' : 'col-span-2')}>
      {navigation ? <><h2 className="sr-only">{title}</h2>{navigation}</> : <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight md:text-xl"><AirVent aria-hidden className="h-5 w-5 shrink-0" />{title}</h2>}
    </div>
    {hasToggle && <Button variant="ghost" className={cn('min-h-11 justify-self-end', navigation && 'order-5 col-span-2 sm:order-none sm:col-span-1')} aria-expanded={expanded} aria-controls={listId} onClick={() => { setExpanded(value => !value); pagination.setPage(1); }}>
      {expanded ? t.less : t.all}{!expanded && <span className="hidden sm:inline"> ({models.length})</span>}
    </Button>}
    {kind === 'everyday' && <p className="col-span-2 text-sm leading-relaxed text-muted-foreground">{t.everydayHelp}</p>}
    {!models.length ? <p id={listId} className="col-span-2 py-5 text-sm leading-relaxed text-muted-foreground">{empty}</p> : <div id={listId} className={cn('col-span-2 min-w-0', !expanded ? 'grid gap-x-6 md:grid-cols-3' : 'divide-y divide-border')}>
      {visible.map((model, index) => {
        const name = pickI18n(model.i18n, locale, 'name', model.name) ?? model.name;
        const subtitle = model.code ? name.replace(model.code, '').replace(/^[ ·-]+|[ ·-]+$/g, '') : '';
        return <div key={model.id} className={cn('flex items-center gap-1', kind === 'everyday' && !expanded && models.length > 3 && index === 2 && 'hidden md:flex')}>
          <button type="button" aria-label={`${t.open}: ${model.brand?.name ?? ''} ${model.code || name}`} onClick={() => onOpen(model)} className="group flex min-h-24 min-w-0 flex-1 items-center gap-3 py-3 pr-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-white p-1">{model.image_url ? <CatalogImage src={model.image_url} alt="" containerClassName="h-full w-full" className="h-full w-full object-contain" /> : <PackageSearch aria-hidden className="h-6 w-6 text-neutral-500" />}</span>
            <span className="min-w-0 flex-1"><span className="block text-xs font-medium text-muted-foreground">{model.brand?.name}</span><span className="mt-0.5 block break-words text-base font-semibold leading-snug">{model.code || name}</span>{subtitle && <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{subtitle}</span>}</span>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
          </button>
          <CatalogFavoriteButton modelId={model.id} modelLabel={model.code || name} />
        </div>;
      })}
    </div>}
    {expanded && models.length > 10 && <div className="col-span-2 [&_button]:min-h-11"><DataTablePagination compact allowAll={false} page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={goToPage} onPageSizeChange={size => { pagination.setPageSize(size); goToPage(1); }} /></div>}
  </section>;
}
