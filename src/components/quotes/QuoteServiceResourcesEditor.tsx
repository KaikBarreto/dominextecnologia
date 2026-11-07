import { useMemo, useState } from 'react';
import { AlertTriangle, Car, ChevronDown, ChevronLeft, ChevronRight, Gift, HardHat, Package, Pencil, Search, Trash2, Wrench, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { CostResource, CostResourceCategory } from '@/hooks/useCostResources';
import { useIsMobile } from '@/hooks/use-mobile';
import { ContextualCostResourceEditor } from '@/components/service-orders/ContextualCostResourceEditor';
import { cn, fuzzyIncludesAny } from '@/lib/utils';
import type { QuoteCostLine } from './QuoteServiceCostEditor';

interface QuoteServiceResourcesEditorProps {
  lines: QuoteCostLine[];
  resources: CostResource[];
  hours: number;
  formatMoney: (value: number) => string;
  onChange: (lines: QuoteCostLine[]) => void;
}

const categoryMeta: Record<CostResourceCategory, { label: string; icon: typeof Wrench }> = {
  vehicle: { label: 'Veículos', icon: Car },
  tool: { label: 'Ferramentas', icon: Wrench },
  epi: { label: 'EPIs', icon: HardHat },
  gift: { label: 'Brindes', icon: Gift },
  other: { label: 'Outros', icon: Package },
};
const categoryOrder = Object.keys(categoryMeta) as CostResourceCategory[];
const pageSize = 8;
const matchesResource = (line: QuoteCostLine, resource: CostResource) => line.resourceId === resource.id || line.sourceId === resource.id;
const lineTotal = (line: QuoteCostLine) => Math.max(0, line.quantity || 0) * Math.max(0, line.unitCost || 0);
const formatQuantity = (quantity: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(quantity);

/** Seleção local: mantém o mesmo cálculo e o snapshot, sem persistir no catálogo. */
export function QuoteServiceResourcesEditor({ lines, resources, hours, formatMoney, onChange }: QuoteServiceResourcesEditorProps) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CostResourceCategory | 'all'>('all');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [unavailableExpanded, setUnavailableExpanded] = useState(() => !isMobile);
  const [editingResource, setEditingResource] = useState<CostResource | null>(null);
  const selectedLines = lines.filter(line => line.source === 'resource' || line.source === 'gift');
  const selectedTotal = selectedLines.reduce((sum, line) => sum + lineTotal(line), 0);
  const unavailableLines = selectedLines.filter(line => !resources.some(resource => resource.is_active !== false && matchesResource(line, resource)));
  const serviceHours = Math.max(0, hours);

  const activeResources = useMemo(() => resources
    .filter(resource => resource.is_active !== false)
    .sort((left, right) => categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category) || left.name.localeCompare(right.name, 'pt-BR')),
  [resources]);
  const candidates = activeResources.filter(resource => (
    (!selectedOnly || selectedLines.some(line => matchesResource(line, resource)))
    && (!search.trim() || fuzzyIncludesAny([resource.name, categoryMeta[resource.category]?.label], search.trim()))
  ));
  const filtered = candidates.filter(resource => category === 'all' || resource.category === category);
  const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const activePage = Math.min(page, lastPage);
  const visibleResources = filtered.slice(activePage * pageSize, (activePage + 1) * pageSize);
  const groups = categoryOrder.map(key => ({ key, resources: visibleResources.filter(resource => resource.category === key) })).filter(group => group.resources.length > 0);

  const toggleResource = (resource: CostResource, checked: boolean) => {
    const existing = lines.find(line => matchesResource(line, resource));
    if (!checked) {
      if (existing) onChange(lines.filter(line => line.id !== existing.id));
      return;
    }
    if (existing) return;
    const isGift = resource.category === 'gift';
    onChange([...lines, {
      id: crypto.randomUUID(), label: resource.name, quantity: 1,
      unitCost: isGift ? Number(resource.total_monthly_cost ?? 0) : Number(resource.hourly_rate ?? 0) * serviceHours,
      source: isGift ? 'gift' : 'resource', sourceId: resource.id, resourceId: resource.id,
    }]);
  };

  const resetFilters = () => { setSearch(''); setCategory('all'); setSelectedOnly(false); setPage(0); };

  return (<>
    <section className="min-w-0 space-y-6" aria-label="Recursos da composição do serviço">
      <header className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <h5 className="text-xl font-semibold tracking-tight sm:text-2xl">Recursos vinculados</h5>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Recursos para {formatQuantity(serviceHours)}h de serviço. Brindes por execução.</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-lg bg-primary px-5 py-4 text-primary-foreground sm:block sm:min-w-48">
          <p className="text-sm text-primary-foreground/70">{selectedLines.length} {selectedLines.length === 1 ? 'recurso selecionado' : 'recursos selecionados'}</p>
          <p className="break-words text-xl font-bold tabular-nums sm:mt-1" aria-label="Total de recursos vinculados">{formatMoney(selectedTotal)}</p>
        </div>
      </header>

      <div className="space-y-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input aria-label="Buscar recursos" placeholder="Buscar recurso pelo nome..." value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} className="h-12 pl-11 pr-12 text-base" />
            {search && <Button type="button" variant="cancel-ghost" size="icon" className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2" aria-label="Limpar busca de recursos" onClick={() => { setSearch(''); setPage(0); }}><X className="h-4 w-4" /></Button>}
          </div>
          <Button type="button" variant="outline" aria-pressed={selectedOnly} onClick={() => { setSelectedOnly(previous => !previous); setPage(0); }} className={cn('h-12 gap-3 px-4 text-sm font-semibold', selectedOnly && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}>
            Só selecionados <span className={cn('flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs', selectedOnly ? 'bg-primary-foreground text-primary' : 'bg-zinc-100 text-zinc-700')}>{selectedLines.length}</span>
          </Button>
        </div>

        <div className="flex min-w-0 gap-1 overflow-x-auto border-b no-scrollbar" aria-label="Categorias de recursos">
          {(['all', ...categoryOrder] as const).map(key => {
            const count = key === 'all' ? candidates.length : candidates.filter(resource => resource.category === key).length;
            const meta = key === 'all' ? { label: 'Todos', icon: Package } : categoryMeta[key];
            const Icon = meta.icon;
            return <button key={key} type="button" aria-pressed={category === key} onClick={() => { setCategory(key); setPage(0); }} className={cn('flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-100', category === key ? 'border-zinc-950 text-foreground dark:border-zinc-100' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              <Icon className="h-4 w-4" aria-hidden="true" /><span>{meta.label}</span><span className="text-xs font-normal tabular-nums">{count}</span>
            </button>;
          })}
        </div>
      </div>

      {unavailableLines.length > 0 && <section aria-label="Recursos selecionados indisponíveis">
        <details open={unavailableExpanded} onToggle={event => setUnavailableExpanded(event.currentTarget.open)} className="group">
          <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-100 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-2.5 py-1 text-xs font-semibold text-white"><AlertTriangle className="h-3.5 w-3.5" />{unavailableLines.length} {unavailableLines.length === 1 ? 'recurso indisponível' : 'recursos indisponíveis'}</span>
            <span className="ml-auto text-sm font-bold tabular-nums">{formatMoney(unavailableLines.reduce((sum, line) => sum + lineTotal(line), 0))}</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="mb-3 mt-2 text-sm leading-relaxed text-muted-foreground">Continuam na composição deste orçamento. Revise ou remova o que não será utilizado.</p>
          <ul className="space-y-2">
          {unavailableLines.map(line => {
            const catalogResource = resources.find(resource => matchesResource(line, resource));
            const inactive = catalogResource?.is_active === false;
            return <li key={line.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-lg bg-primary px-4 py-4 text-primary-foreground sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="min-w-0"><p className="break-words text-base font-semibold leading-snug">{line.label}</p><p className="mt-1 text-sm text-primary-foreground/70">{inactive ? 'Inativo no catálogo' : 'Fora do catálogo atual'} · {formatQuantity(line.quantity)} × {formatMoney(line.unitCost)}</p></div>
              <strong className="col-start-1 break-words text-base tabular-nums sm:col-start-2 sm:row-start-1">{formatMoney(lineTotal(line))}</strong>
              <div className="col-start-2 row-start-1 flex items-center gap-1 sm:col-start-3">
                {catalogResource && <Button type="button" variant="edit-ghost" size="icon" aria-label={`Editar cadastro do recurso ${catalogResource.name}`} title="Editar cadastro do recurso" className="h-11 w-11 text-primary-foreground" onClick={() => setEditingResource(catalogResource)}><Pencil className="h-4 w-4" /></Button>}
                <Button type="button" variant="destructive-ghost" size="icon" aria-label={`Remover recurso ${line.label}`} className="h-11 w-11 text-primary-foreground" onClick={() => onChange(lines.filter(candidate => candidate.id !== line.id))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </li>;
          })}
          </ul>
        </details>
      </section>}

      {filtered.length === 0 ? <div className="space-y-3 border-y py-10 text-center">
        <Package className="mx-auto h-8 w-8 text-zinc-400" aria-hidden="true" />
        <p className="text-base font-semibold">{activeResources.length === 0 ? 'Nenhum recurso ativo está cadastrado.' : selectedOnly && !search && category === 'all' ? 'Nenhum recurso ativo selecionado.' : 'Nenhum recurso encontrado neste filtro.'}</p>
        <p className="text-sm text-muted-foreground">{activeResources.length === 0 ? unavailableLines.length > 0 ? 'Os recursos já incluídos continuam na composição acima.' : 'Cadastre os recursos da empresa para utilizá-los nos orçamentos.' : 'Tente outro nome ou escolha outra categoria.'}</p>
        {(search || selectedOnly || category !== 'all') && <Button type="button" variant="outline" onClick={resetFilters}>Limpar filtros</Button>}
      </div> : <div className="space-y-6">
        {groups.map(group => {
          const meta = categoryMeta[group.key]; const Icon = meta.icon;
          return <section key={group.key} aria-label={`Recursos de ${meta.label}`}>
            <h6 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-700 dark:text-zinc-300"><Icon className="h-4 w-4" />{meta.label}</h6>
            <div className="space-y-2">{group.resources.map(resource => {
              const linked = lines.find(line => matchesResource(line, resource));
              const isGift = resource.category === 'gift';
              const unitCost = isGift ? Number(resource.total_monthly_cost ?? 0) : Number(resource.hourly_rate ?? 0) * serviceHours;
              const shownCost = linked ? lineTotal(linked) : unitCost;
              return <div key={resource.id} className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] items-start gap-x-2 rounded-lg border-b px-4 py-4 transition-colors', linked ? 'border-primary bg-primary text-primary-foreground' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900')}>
                <label className="grid min-w-0 cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 gap-y-2 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto] sm:gap-x-4">
                <Checkbox aria-label={`Incluir recurso ${resource.name}`} checked={!!linked} onCheckedChange={checked => toggleResource(resource, checked === true)} className={cn('mt-1 h-5 w-5', linked && 'border-primary-foreground data-[state=checked]:border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary')} />
                <span className="min-w-0"><span className="block break-words text-base font-semibold leading-snug">{resource.name}</span><span className={cn('mt-1.5 block text-sm leading-relaxed', linked ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{isGift ? 'Por execução' : `${formatQuantity(serviceHours)}h × ${formatMoney(Number(resource.hourly_rate ?? 0))}`}{linked && linked.quantity !== 1 ? ` · Quantidade: ${formatQuantity(linked.quantity)}` : ''}</span></span>
                <span className="col-start-2 break-words text-base font-bold tabular-nums sm:col-start-3 sm:row-start-1 sm:self-center sm:text-right">{formatMoney(shownCost)}</span>
                </label>
                <Button type="button" variant="edit-ghost" size="icon" aria-label={`Editar cadastro do recurso ${resource.name}`} title="Editar cadastro do recurso" className={cn('-mt-1 h-11 w-11', linked && 'text-primary-foreground')} onClick={() => setEditingResource(resource)}><Pencil className="h-4 w-4" /></Button>
              </div>;
            })}</div>
          </section>;
        })}
      </div>}

      <footer className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{filtered.length > 0 ? `Mostrando ${activePage * pageSize + 1} a ${Math.min((activePage + 1) * pageSize, filtered.length)} de ${filtered.length} ${filtered.length === 1 ? 'recurso' : 'recursos'}` : '0 recursos neste filtro'}</p>
          {lastPage > 0 && <div className="flex items-center gap-2" aria-label="Paginação de recursos">
            <Button type="button" variant="outline" size="icon" aria-label="Página anterior de recursos" disabled={activePage === 0} onClick={() => setPage(activePage - 1)} className="h-11 w-11"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-14 text-center text-sm font-semibold tabular-nums">{activePage + 1} / {lastPage + 1}</span>
            <Button type="button" size="icon" aria-label="Próxima página de recursos" disabled={activePage === lastPage} onClick={() => setPage(activePage + 1)} className="h-11 w-11 bg-primary text-primary-foreground hover:bg-primary/90"><ChevronRight className="h-4 w-4" /></Button>
          </div>}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">O total considera toda a seleção, inclusive os itens fora do filtro.</p>
      </footer>
    </section>
    {editingResource && <ContextualCostResourceEditor resource={editingResource} onClose={() => setEditingResource(null)} />}
  </>);
}
