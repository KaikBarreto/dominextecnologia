import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Variant = 'cash' | 'sale' | 'list-detail' | 'detail' | 'kanban' | 'settings' | 'table' | 'reports' | 'metrics';
type CatalogMode = 'quick' | 'catalog';

function Line({ className }: { className?: string }) {
  return <Skeleton className={cn('h-3 motion-reduce:animate-none', className)} />;
}

function Heading() {
  return <div className="space-y-2"><Line className="h-5 w-40 max-w-full" /><Line className="w-56 max-w-full" /></div>;
}

function Toolbar() {
  return <div className="flex min-w-0 items-center gap-3 rounded-md border px-3 py-3"><Line className="h-4 w-4 shrink-0 rounded-full" /><Line className="w-44 max-w-full" /><div className="ml-auto flex gap-2"><Line className="h-4 w-4" /><Line className="h-4 w-4" /></div></div>;
}

function Tabs() {
  return <div className="flex gap-5 overflow-hidden border-b pb-3">{['w-20', 'w-24', 'w-16'].map((width, index) => <Line key={index} className={cn('h-4 shrink-0', width)} />)}</div>;
}

function Rows({ count = 5, images = false }: { count?: number; images?: boolean }) {
  return <div className="divide-y">{Array.from({ length: count }, (_, index) => <div key={index} className="flex min-w-0 items-center gap-3 py-4">
    {images && <Line className="h-11 w-11 shrink-0 rounded-lg" />}
    <div className="min-w-0 flex-1 space-y-2"><Line className={index % 2 ? 'w-3/4' : 'w-2/3'} /><Line className="w-1/2" /><Line className="h-2 w-1/3" /></div><div className="w-16 shrink-0 space-y-2"><Line className="h-4 w-full" /><Line className="h-2 w-10" /></div>
  </div>)}</div>;
}

export function PdvListRowsSkeleton({ label, count = 3 }: { label: string; count?: number }) {
  return <div role="status" aria-label={label} aria-busy="true"><span className="sr-only">{label}…</span><div aria-hidden="true"><Rows count={count} /></div></div>;
}

function Metrics() {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">{[0, 1, 2, 3].map(index => <div key={index} className="min-w-0 space-y-3"><Line className="w-28 max-w-full" /><Line className="h-7 w-32 max-w-full" /></div>)}</div>;
}

function Detail() {
  return <div className="space-y-6 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><Heading /><Line className="h-9 w-32" /></div><Line className="h-5 w-28 rounded-full" /><Tabs /><div className="space-y-2"><Heading /><Rows count={3} /></div><div className="space-y-3"><Line className="w-24" /><Line className="w-4/5" /><Line className="w-2/3" /></div></div>;
}

function ListDetail({ leading }: { leading: boolean }) {
  return <div className="grid overflow-hidden rounded-xl border bg-background lg:grid-cols-[minmax(20rem,25rem)_minmax(0,1fr)]">
    <div className="min-w-0 lg:border-r"><div className="space-y-4 border-b p-4"><div className="flex items-center justify-between gap-3"><Line className="h-4 w-32" /><Line className="h-3 w-28" /></div><Toolbar /></div><div className="px-4"><Rows count={5} images={leading} /></div><div className="flex items-center justify-between border-t p-4"><Line className="w-24" /><div className="flex gap-2"><Line className="h-8 w-8" /><Line className="h-8 w-8" /></div></div></div>
    <div className="hidden min-w-0 lg:block"><Detail /></div>
  </div>;
}

function TableBody() {
  return <><div className="hidden overflow-hidden rounded-lg border md:block"><div className="grid grid-cols-5 gap-6 border-b bg-muted/30 px-4 py-3">{[0, 1, 2, 3, 4].map(index => <Line key={index} className="w-3/4" />)}</div>{[0, 1, 2, 3, 4].map(index => <div key={index} className="grid grid-cols-5 gap-6 border-b px-4 py-5 last:border-0">{[0, 1, 2, 3, 4].map(cell => <Line key={cell} className={cell === 2 ? 'w-full' : 'w-3/4'} />)}</div>)}</div><div className="space-y-3 md:hidden">{[0, 1, 2].map(index => <div key={index} className="space-y-4 rounded-xl border p-4"><Heading /><div className="grid grid-cols-2 gap-4">{[0, 1, 2, 3].map(cell => <div key={cell} className="space-y-2"><Line className="w-20" /><Line className="h-4 w-24" /></div>)}</div><Line className="mx-auto w-24" /></div>)}</div></>;
}

export function PdvCatalogSkeleton({ mode = 'catalog', label = 'Carregando materiais' }: { mode?: CatalogMode; label?: string }) {
  return <div role="status" aria-label={label} aria-busy="true" className="min-w-0">
    <span className="sr-only">{label}…</span>
    <div aria-hidden="true" className={mode === 'quick' ? 'space-y-2' : 'grid grid-cols-2 gap-3 min-[768px]:grid-cols-3 min-[1280px]:grid-cols-4'}>
      {Array.from({ length: mode === 'quick' ? 6 : 8 }, (_, index) => <div key={index} className={cn('min-w-0 rounded-xl border bg-background p-3', mode === 'quick' ? 'flex items-center gap-3' : 'space-y-3')}>
        <Line className={mode === 'quick' ? 'h-12 w-12 shrink-0 rounded-lg' : 'aspect-[4/3] h-auto w-full rounded-lg'} />
        <div className="min-w-0 flex-1 space-y-2"><Line className="h-2 w-14" /><Line className="w-5/6" /><Line className="w-2/3" /><div className="flex justify-between gap-3 pt-1"><Line className="h-4 w-16" /><Line className="h-3 w-10" /></div></div>
      </div>)}
    </div>
  </div>;
}

function Sale({ mode, hideCart, showNumpad }: { mode: CatalogMode; hideCart: boolean; showNumpad: boolean }) {
  return <div className="space-y-3"><div className="flex items-center gap-3 overflow-hidden border-b pb-3"><Line className="h-9 w-40 shrink-0 rounded-t-lg" /><Line className="h-9 w-32 shrink-0 rounded-t-lg" /><Line className="h-8 w-8 shrink-0" /></div><div className={cn('grid min-w-0 gap-4', !hideCart && 'lg:grid-cols-[minmax(0,1.75fr)_minmax(320px,1fr)]')}>
    <div className="min-w-0 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><Heading /><Line className="h-8 w-44" /></div><Toolbar /><Tabs /><PdvCatalogSkeleton mode={mode} /></div>
    {!hideCart && <div className="hidden min-w-0 flex-col overflow-hidden rounded-xl border bg-background lg:flex"><div className="space-y-4 border-b p-4"><Heading /><Line className="h-10 w-full" /></div><div className="px-4"><Rows count={3} images /></div><div className="mt-auto space-y-3 border-t p-4"><div className="flex justify-between"><Line className="w-20" /><Line className="w-24" /></div><div className="flex justify-between"><Line className="h-5 w-20" /><Line className="h-6 w-28" /></div><Line className="h-12 w-full" />{showNumpad && <div className="grid grid-cols-3 gap-2">{Array.from({ length: 12 }, (_, key) => <Line key={key} className="h-8 w-full" />)}</div>}</div></div>}
  </div></div>;
}

function Cash() {
  return <div className="space-y-6"><div className="flex gap-3 overflow-hidden border-b pb-3">{[0, 1, 2].map(index => <div key={index} className="flex w-48 shrink-0 items-center gap-3 rounded-lg border p-3"><Line className="h-8 w-8" /><div className="flex-1 space-y-2"><Line className="w-24" /><Line className="h-2 w-20" /></div></div>)}</div><section className="grid gap-5 lg:grid-cols-2">{[0, 1].map(index => <div key={index} className="space-y-5 rounded-xl border p-5"><Heading /><Line className="h-9 w-40" /><div className="flex flex-wrap gap-3"><Line className="h-8 w-24" /><Line className="h-8 w-24" /></div></div>)}</section><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map(index => <div key={index} className="flex flex-col items-center gap-4 rounded-lg border p-4"><Line className="h-7 w-7" /><Line className="w-20 max-w-full" /></div>)}</div><div className="space-y-4 border-y py-5"><Heading /><Metrics /></div><div className="space-y-4"><div className="flex flex-wrap justify-between gap-4"><Heading /><Line className="h-9 w-56" /></div><TableBody /></div></div>;
}

function Settings({ section }: { section: string }) {
  if (section === 'devices') return <div className="max-w-5xl space-y-5 rounded-lg border bg-card p-5 sm:p-7"><div className="flex items-start justify-between gap-5"><div className="space-y-2"><Line className="h-7 w-44 max-w-full" /><Line className="w-48 max-w-full" /></div><Line className="h-6 w-11 shrink-0 rounded-full" /></div><Line className="w-3/4" /><div className="space-y-3 border-t pt-4"><Line className="w-36" /><Line className="w-5/6" /><Line className="h-9 w-32" /></div></div>;
  if (section === 'operation') return <div className="max-w-5xl space-y-5 rounded-lg border bg-card p-5 sm:p-7"><Heading /><div className="grid gap-3 xl:grid-cols-3">{[0, 1, 2].map(index => <div key={index} className="space-y-4 rounded-xl border p-4"><Line className="h-4 w-32" /><div className="flex h-28 items-center justify-around gap-4"><Line className="h-12 w-12 rounded-full" /><Line className="h-12 w-12 rounded-full" /></div><Line className="w-full" /><Line className="w-4/5" /></div>)}</div><Line className="ml-auto h-9 w-32" /></div>;
  return <div className={cn('grid gap-7', section === 'receipts' && 'xl:grid-cols-[minmax(0,1fr)_minmax(300px,440px)]')}><div className="space-y-7 rounded-lg border bg-card p-5 sm:p-7">{Array.from({ length: section === 'cash' ? 2 : 3 }, (_, index) => <div key={index} className="space-y-4 border-b pb-5 last:border-0"><Heading /><div className="grid grid-cols-2 gap-3"><Line className="h-10 w-full" /><Line className="h-10 w-full" /></div><Line className="w-3/4" /></div>)}</div>{section === 'receipts' && <div className="space-y-5 rounded-xl border p-5"><Heading /><div className="mx-auto max-w-72 space-y-4 border bg-background p-5"><Line className="mx-auto h-5 w-24" /><Rows count={4} /><Line className="h-5 w-full" /></div></div>}</div>;
}

/** Placeholders reproduzem a geometria, sem anunciar valores ou oferecer ações falsas. */
export function PdvPageSkeleton({ variant, label = 'Carregando dados do PDV', columns = 3, catalogMode = 'catalog', hideCart = false, showNumpad = false, settingsSection = 'operation', listLeading = false, className }: {
  variant: Variant;
  label?: string;
  columns?: 2 | 3;
  catalogMode?: CatalogMode;
  hideCart?: boolean;
  showNumpad?: boolean;
  settingsSection?: string;
  listLeading?: boolean;
  className?: string;
}) {
  return <div role="status" aria-label={label} aria-busy="true" className={cn('min-w-0', className)}>
    <span className="sr-only">{label}…</span>
    <div aria-hidden="true">
      {variant === 'list-detail' ? <ListDetail leading={listLeading} /> : variant === 'detail' ? <Detail /> : variant === 'cash' ? <Cash /> : variant === 'sale' ? <Sale mode={catalogMode} hideCart={hideCart} showNumpad={showNumpad} /> : variant === 'settings' ? <Settings section={settingsSection} /> : variant === 'metrics' ? <Metrics /> : variant === 'kanban' ? <div className="space-y-4"><div className="max-w-xl"><Toolbar /></div><div className="md:hidden"><Tabs /></div><div className={cn('grid min-w-0 gap-4', columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>{Array.from({ length: columns }, (_, index) => <div key={index} className={cn('overflow-hidden rounded-2xl border', index > 0 && 'hidden md:block')}><div className="flex justify-between gap-3 border-b p-4"><Line className="h-4 w-28" /><Line className="h-5 w-7 rounded-full" /></div><div className="space-y-3 p-3">{[0, 1].map(card => <div key={card} className="space-y-4 rounded-xl border bg-background p-4"><Heading /><Line className="h-2 w-28" /><Line className="h-5 w-24" /><Line className="h-10 w-full" /></div>)}</div></div>)}</div></div> : <div className="space-y-5">{variant === 'reports' && <Metrics />}<TableBody /></div>}
    </div>
  </div>;
}
