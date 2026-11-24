import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, Boxes, CalendarClock, FileDown,
  FileSpreadsheet, FileText, GitCompareArrows, History, Loader2, PackageCheck,
  Plus, RefreshCw, Scale, Search, SlidersHorizontal, Warehouse, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useInventory } from '@/hooks/useInventory';
import { useMaterialGroups } from '@/hooks/useMaterialGroups';
import { useStocks } from '@/hooks/useStocks';
import {
  fetchAllFiscalInventory, fetchAllFiscalMovements, useFiscalInventory,
  useFiscalMovements, useFiscalOpeningBalance, type FiscalInventoryFilters,
  type FiscalMovementFilters,
} from '@/hooks/useFiscalInventory';
import { exportFiscalInventoryExcel, exportFiscalInventoryPdf } from '@/utils/fiscalInventoryExport';
import { cn } from '@/lib/utils';

type View = 'current' | 'dated' | 'movements' | 'report' | 'comparison' | 'nfe' | 'nfse';

const PAGE_SIZE = 50;
const POSITION_VIEWS: View[] = ['current', 'dated', 'report', 'comparison'];
const MOVEMENT_VIEWS: View[] = ['movements', 'nfe'];
const qty = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(value);
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const localDateTimeValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const toIso = (value: string) => value ? new Date(value).toISOString() : null;

const VIEW_META: Record<View, { label: string; title: string; description: string; icon: typeof Boxes }> = {
  current: { label: 'Saldo atual', title: 'Saldo atual', description: 'Saldo fiscal atualizado por material. Não altera o estoque operacional.', icon: Boxes },
  dated: { label: 'Posição em uma data', title: 'Posição em uma data', description: 'Reconstitua o saldo fiscal existente no encerramento da data escolhida.', icon: CalendarClock },
  movements: { label: 'Movimentações', title: 'Movimentações fiscais', description: 'Kardex auditável com saldo antes, movimentação e saldo depois.', icon: History },
  report: { label: 'Relatório de estoque', title: 'Relatório de estoque fiscal', description: 'Posição valorizada, agrupada pelos filtros atuais e pronta para exportação.', icon: Warehouse },
  comparison: { label: 'Fiscal × Operacional', title: 'Fiscal × Operacional', description: 'Concilie o saldo reconhecido pelas notas com o controle interno de materiais.', icon: GitCompareArrows },
  nfe: { label: 'NF-e', title: 'Movimentos por NF-e', description: 'Entradas, saídas e estornos originados por NF-e modelo 55 autorizada.', icon: FileText },
  nfse: { label: 'NFS-e', title: 'NFS-e e estoque', description: 'Notas de serviço não movimentam quantidade de materiais no estoque fiscal.', icon: Wrench },
};

function MultiFilter({ label, items, selected, onChange }: {
  label: string;
  items: Array<{ id: string; name: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const summary = selected.length === 0 ? 'Todos' : selected.length === 1
    ? items.find((item) => item.id === selected[0])?.name ?? '1 selecionado'
    : `${selected.length} selecionados`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-10 min-w-0 justify-between gap-2 sm:min-w-44">
          <span className="truncate">{label}: {summary}</span>
          <SlidersHorizontal className="h-4 w-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[120] max-h-80 w-64 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={selected.length === 0} onCheckedChange={() => onChange([])}>
          Todos
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {items.map((item) => (
          <DropdownMenuCheckboxItem
            key={item.id}
            checked={selected.includes(item.id)}
            onCheckedChange={(checked) => onChange(checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))}
          >
            {item.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatCard({ label, value, detail, tone, icon: Icon }: {
  label: string; value: string; detail: string; tone: 'blue' | 'emerald' | 'amber' | 'rose'; icon: typeof Boxes;
}) {
  const tones = {
    blue: 'from-blue-700 to-blue-600 shadow-blue-950/15',
    emerald: 'from-emerald-700 to-emerald-600 shadow-emerald-950/15',
    amber: 'from-amber-600 to-orange-600 shadow-amber-950/15',
    rose: 'from-rose-700 to-red-600 shadow-rose-950/15',
  };
  return (
    <Card className={cn('overflow-hidden border-0 bg-gradient-to-br text-white shadow-lg', tones[tone])}>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/80">{label}</p>
          <p className="mt-2 truncate text-2xl font-black sm:text-3xl">{value}</p>
          <p className="mt-1 text-sm text-white/75">{detail}</p>
        </div>
        <span className="rounded-2xl bg-white/15 p-3"><Icon className="h-6 w-6" /></span>
      </CardContent>
    </Card>
  );
}

export function FiscalInventoryWorkspace() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('current');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [currentAt, setCurrentAt] = useState(() => new Date().toISOString());
  const [at, setAt] = useState(() => localDateTimeValue(new Date()));
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState(() => localDateTimeValue(new Date()));
  const [stockIds, setStockIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [models, setModels] = useState<number[]>([55, 65]);
  const [onlyDivergent, setOnlyDivergent] = useState(false);
  const [includeZero, setIncludeZero] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [opening, setOpening] = useState({ stockId: '', inventoryId: '', targetBalance: '', effectiveAt: localDateTimeValue(new Date()), notes: '' });
  const [exporting, setExporting] = useState(false);
  const { stocks, defaultStock } = useStocks();
  const { groups } = useMaterialGroups();
  const { items: inventory } = useInventory();
  const activeInventory = inventory.filter((item) => item.archived_at == null);
  const openingBalance = useFiscalOpeningBalance();
  const isPositionView = POSITION_VIEWS.includes(view);
  const isMovementView = MOVEMENT_VIEWS.includes(view);
  const effectiveModels = useMemo(() => (view === 'nfe' ? [55] : models), [view, models]);
  const positionReference = view === 'dated' ? toIso(at) ?? currentAt : currentAt;

  const positionFilters = useMemo<FiscalInventoryFilters>(() => ({
    at: positionReference, stockIds, groupIds, models: effectiveModels, query,
    onlyDivergent, includeZero, includeArchived,
  }), [positionReference, stockIds, groupIds, effectiveModels, query, onlyDivergent, includeZero, includeArchived]);
  const movementFilters = useMemo<FiscalMovementFilters>(() => ({
    dateStart: toIso(dateStart), dateEnd: toIso(dateEnd), stockIds, groupIds,
    models: effectiveModels, events: [], query,
  }), [dateStart, dateEnd, stockIds, groupIds, effectiveModels, query]);
  const position = useFiscalInventory(positionFilters, page, PAGE_SIZE, isPositionView);
  const movements = useFiscalMovements(movementFilters, page, PAGE_SIZE, isMovementView);
  const rows = position.data ?? [];
  const movementRows = movements.data ?? [];
  const totalCount = isPositionView ? rows[0]?.total_count ?? 0 : isMovementView ? movementRows[0]?.total_count ?? 0 : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const summary = rows[0] ?? null;
  const divergentCount = rows.filter((row) => Math.abs(row.divergence) > 0.000001).length;
  const isLoading = isPositionView ? position.isLoading : isMovementView ? movements.isLoading : false;
  const error = isPositionView ? position.error : isMovementView ? movements.error : null;
  const meta = VIEW_META[view];

  const resetPage = <T,>(setter: (value: T) => void, value: T) => { setter(value); setPage(1); };
  const toggleModel = (model: number) => {
    if (models.includes(model) && models.length === 1) {
      toast.info('Mantenha pelo menos um modelo selecionado.');
      return;
    }
    resetPage(setModels, models.includes(model) ? models.filter((item) => item !== model) : [...models, model]);
  };
  const filtersLabel = [
    stockIds.length ? `${stockIds.length} local(is)` : 'todos os locais',
    groupIds.length ? `${groupIds.length} grupo(s)` : 'todos os grupos',
    effectiveModels.length === 2 ? 'NF-e e NFC-e' : effectiveModels[0] === 55 ? 'NF-e' : 'NFC-e',
    onlyDivergent ? 'somente divergentes' : 'todos os saldos',
    query.trim() ? `busca: ${query.trim()}` : null,
  ].filter(Boolean).join(' · ');

  const handleViewChange = (value: string) => {
    const next = value as View;
    setView(next);
    setPage(1);
    if (next !== 'dated' && POSITION_VIEWS.includes(next)) setCurrentAt(new Date().toISOString());
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!isPositionView && !isMovementView) return;
    setExporting(true);
    try {
      const allPosition = isPositionView ? await fetchAllFiscalInventory(positionFilters) : undefined;
      const allMovements = isMovementView ? await fetchAllFiscalMovements(movementFilters) : undefined;
      const input = {
        view: isPositionView ? 'position' as const : 'movements' as const,
        reportTitle: meta.title,
        fileSlug: view,
        positionRows: allPosition,
        movementRows: allMovements,
        filtersLabel,
        referenceLabel: isPositionView
          ? new Date(positionFilters.at).toLocaleString('pt-BR')
          : `${dateStart ? new Date(dateStart).toLocaleString('pt-BR') : 'início'} até ${dateEnd ? new Date(dateEnd).toLocaleString('pt-BR') : 'agora'}`,
      };
      if (format === 'pdf') await exportFiscalInventoryPdf(input);
      else await exportFiscalInventoryExcel(input);
      toast.success(`${format === 'pdf' ? 'PDF' : 'Excel'} gerado com os filtros atuais.`);
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const saveOpening = async () => {
    const targetBalance = Number(opening.targetBalance.replace(',', '.'));
    if (!opening.stockId || !opening.inventoryId || !Number.isFinite(targetBalance) || !opening.effectiveAt) {
      toast.error('Preencha local, material, saldo fiscal e data de vigência.');
      return;
    }
    try {
      await openingBalance.mutateAsync({
        stockId: opening.stockId, inventoryId: opening.inventoryId, targetBalance,
        effectiveAt: new Date(opening.effectiveAt).toISOString(), notes: opening.notes,
      });
      toast.success('Saldo inicial fiscal registrado no histórico.');
      setOpeningOpen(false);
      setCurrentAt(new Date().toISOString());
      setOpening({ stockId: defaultStock?.id ?? '', inventoryId: '', targetBalance: '', effectiveAt: localDateTimeValue(new Date()), notes: '' });
    } catch (cause) { toast.error((cause as Error).message); }
  };

  const positionTable = (
    <Table className="min-w-[920px]">
      <TableHeader><TableRow className="bg-muted/55">
        <TableHead>Local / material</TableHead><TableHead>Grupo</TableHead><TableHead className="text-right">Saldo fiscal</TableHead>
        {(view === 'report' || view === 'comparison') && <TableHead className="text-right">Saldo operacional</TableHead>}
        {view === 'comparison' && <TableHead className="text-right">Divergência</TableHead>}
        {view === 'report' && <TableHead className="text-right">Custo unitário</TableHead>}
        {(view === 'report' || view === 'comparison') && <TableHead className="text-right">Valor fiscal</TableHead>}
      </TableRow></TableHeader>
      <TableBody>{rows.length ? rows.map((row) => <TableRow key={`${row.stock_id}:${row.inventory_id}`}>
        <TableCell><div className="font-semibold">{row.material_name}</div><div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground"><span>{row.stock_name}</span>{row.sku ? <span>· {row.sku}</span> : null}</div></TableCell>
        <TableCell><Badge variant="secondary" className="whitespace-nowrap">{row.group_name ?? 'Sem grupo'}</Badge></TableCell>
        <TableCell className="text-right font-semibold tabular-nums">{qty(row.fiscal_balance)} {row.unit ?? ''}</TableCell>
        {(view === 'report' || view === 'comparison') && <TableCell className="text-right tabular-nums">{qty(row.operational_balance)} {row.unit ?? ''}</TableCell>}
        {view === 'comparison' && <TableCell className="text-right"><Badge className={cn('border-0 text-white', Math.abs(row.divergence) < 0.000001 ? 'bg-emerald-700' : 'bg-rose-700')}>{qty(row.divergence)}</Badge></TableCell>}
        {view === 'report' && <TableCell className="text-right tabular-nums">{money(row.cost_price)}</TableCell>}
        {(view === 'report' || view === 'comparison') && <TableCell className="text-right font-semibold tabular-nums">{money(row.fiscal_value)}</TableCell>}
      </TableRow>) : <TableRow><TableCell colSpan={7} className="h-44 text-center text-muted-foreground">Nenhuma posição encontrada com estes filtros.</TableCell></TableRow>}</TableBody>
    </Table>
  );

  const movementTable = (
    <Table className="min-w-[1320px]">
      <TableHeader><TableRow className="bg-muted/55"><TableHead>Data</TableHead><TableHead>Local / material</TableHead><TableHead>Documento</TableHead><TableHead>Evento</TableHead><TableHead className="text-right">Saldo antes</TableHead><TableHead className="text-right">Movimentação</TableHead><TableHead className="text-right">Saldo depois</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
      <TableBody>{movementRows.length ? movementRows.map((row) => <TableRow key={row.id}>
        <TableCell className="whitespace-nowrap">{new Date(row.occurred_at).toLocaleString('pt-BR')}</TableCell>
        <TableCell><div className="font-semibold">{row.material_name}</div><div className="text-xs text-muted-foreground">{row.stock_name}{row.sku ? ` · ${row.sku}` : ''}</div></TableCell>
        <TableCell><Badge className={cn('border-0 text-white', row.source_event === 'opening' ? 'bg-slate-700' : row.document_model === 55 ? 'bg-blue-700' : 'bg-violet-700')}>{row.source_event === 'opening' ? 'Saldo inicial' : row.document_model === 55 ? 'NF-e' : 'NFC-e'} {row.source_event !== 'opening' && row.document_number ? `nº ${row.document_number}` : ''}</Badge></TableCell>
        <TableCell><Badge className={cn('border-0 text-white', row.source_event === 'authorized' ? 'bg-emerald-700' : row.source_event === 'cancelled' ? 'bg-rose-700' : 'bg-slate-700')}>{row.source_event === 'authorized' ? 'Autorização' : row.source_event === 'cancelled' ? 'Cancelamento' : 'Implantação'}</Badge></TableCell>
        <TableCell className="text-right tabular-nums">{qty(row.balance_before)} {row.unit ?? ''}</TableCell>
        <TableCell className={cn('text-right font-bold tabular-nums', row.quantity >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{row.quantity >= 0 ? '+' : ''}{qty(row.quantity)} {row.unit ?? ''}</TableCell>
        <TableCell className="text-right font-semibold tabular-nums">{qty(row.balance_after)} {row.unit ?? ''}</TableCell>
        <TableCell className="text-right tabular-nums">{money(row.total_cost)}</TableCell>
      </TableRow>) : <TableRow><TableCell colSpan={8} className="h-44 text-center text-muted-foreground">Nenhuma movimentação fiscal encontrada com estes filtros.</TableCell></TableRow>}</TableBody>
    </Table>
  );

  return (
    <div className="min-w-0 space-y-6">
      <div className="overflow-x-auto border-b border-border/70">
        <Tabs value={view} onValueChange={handleViewChange}>
          <TabsList className="inline-flex h-auto min-w-max justify-start gap-1 bg-transparent p-0">
            {(Object.entries(VIEW_META) as Array<[View, typeof VIEW_META[View]]>).map(([value, item]) => { const Icon = item.icon; return <TabsTrigger key={value} value={value} className="gap-2 rounded-b-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-slate-950 data-[state=active]:bg-slate-950 data-[state=active]:text-white"><Icon className="h-4 w-4" />{item.label}</TabsTrigger>; })}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div><h2 className="text-2xl font-black tracking-tight sm:text-3xl">{meta.title}</h2><p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">{meta.description}</p></div>
        <div className="flex flex-wrap gap-2">
          {(view === 'current' || view === 'dated') && <Button variant="outline" className="gap-2" onClick={() => { setOpening((current) => ({ ...current, stockId: current.stockId || defaultStock?.id || '' })); setOpeningOpen(true); }}><Plus className="h-4 w-4" /> Informar saldo inicial</Button>}
          {(isPositionView || isMovementView) && <DropdownMenu><DropdownMenuTrigger asChild><Button className="gap-2 bg-slate-950 text-white hover:bg-slate-800" disabled={exporting || isLoading}>{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Exportar</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="z-[120] w-52"><DropdownMenuItem onClick={() => handleExport('pdf')}><ArrowDownToLine className="mr-2 h-4 w-4" /> PDF</DropdownMenuItem><DropdownMenuItem onClick={() => handleExport('excel')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
        </div>
      </div>

      {(view === 'report' || view === 'comparison') && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Saldo fiscal" value={money(summary?.total_fiscal_value ?? 0)} detail="Valor reconhecido fiscalmente" tone="blue" icon={PackageCheck} /><StatCard label="Saldo operacional" value={money(summary?.total_operational_value ?? 0)} detail="Valor no controle interno" tone="emerald" icon={Boxes} /><StatCard label="Divergência" value={money(summary?.total_divergence_value ?? 0)} detail="Fiscal menos operacional" tone="amber" icon={Scale} /><StatCard label="Materiais divergentes" value={qty(onlyDivergent ? totalCount : divergentCount)} detail={onlyDivergent ? 'no filtro atual' : 'na página atual'} tone="rose" icon={History} /></div>}

      {view === 'nfse' ? (
        <Card className="overflow-hidden border-0 bg-slate-950 text-white shadow-lg"><CardContent className="flex min-h-64 flex-col items-start justify-center gap-5 p-6 sm:p-10"><span className="rounded-2xl bg-white/10 p-4"><Wrench className="h-8 w-8" /></span><div className="max-w-2xl"><h3 className="text-xl font-black">Serviço não altera saldo de material</h3><p className="mt-2 text-sm leading-6 text-slate-300">A NFS-e registra prestação de serviço e valores fiscais, mas não dá entrada nem saída em quantidade de estoque. Materiais usados no atendimento continuam sendo baixados pelo fluxo operacional correspondente.</p></div><Button variant="secondary" className="gap-2" onClick={() => navigate('/notas-fiscais/nfse')}><FileText className="h-4 w-4" /> Abrir NFS-e / Serviços</Button></CardContent></Card>
      ) : <>
        <Card className="border-border/70 shadow-sm"><CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => resetPage(setQuery, event.target.value)} placeholder={isPositionView ? 'Buscar material ou código…' : 'Buscar material, código, número ou chave…'} className="pl-9" /></div><MultiFilter label="Locais" items={stocks.map(({ id, name }) => ({ id, name }))} selected={stockIds} onChange={(ids) => resetPage(setStockIds, ids)} /><MultiFilter label="Grupos" items={groups.map(({ id, name }) => ({ id, name }))} selected={groupIds} onChange={(ids) => resetPage(setGroupIds, ids)} /></div>
          <div className="flex flex-col gap-4 border-t border-border/60 pt-4 xl:flex-row xl:items-center xl:justify-between"><div className="flex flex-wrap items-center gap-2">
            {view === 'nfe' ? <Badge className="border-0 bg-blue-700 px-3 py-2 text-white">Somente NF-e modelo 55</Badge> : <><Button type="button" size="sm" variant="outline" onClick={() => toggleModel(55)} className={cn(models.includes(55) && 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800 hover:text-white')}>NF-e</Button><Button type="button" size="sm" variant="outline" onClick={() => toggleModel(65)} className={cn(models.includes(65) && 'border-violet-700 bg-violet-700 text-white hover:bg-violet-800 hover:text-white')}>NFC-e</Button></>}
            <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
            {view === 'dated' ? <label className="flex w-full flex-col gap-2 text-sm sm:w-auto sm:flex-row sm:items-center"><span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" />Posição em</span><Input type="datetime-local" value={at} onChange={(event) => resetPage(setAt, event.target.value)} className="h-9 w-full sm:w-auto" /></label> : isMovementView ? <div className="grid w-full gap-2 text-sm sm:w-auto sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center"><span>De</span><Input type="datetime-local" value={dateStart} onChange={(event) => resetPage(setDateStart, event.target.value)} className="h-9 w-full" /><span>até</span><Input type="datetime-local" value={dateEnd} onChange={(event) => resetPage(setDateEnd, event.target.value)} className="h-9 w-full" /></div> : <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={() => setCurrentAt(new Date().toISOString())}><RefreshCw className="h-4 w-4" /> Atualizar posição</Button>}
          </div>{isPositionView && <div className="flex flex-wrap gap-x-5 gap-y-3"><label className="flex items-center gap-2 text-sm"><Switch checked={onlyDivergent} onCheckedChange={(value) => resetPage(setOnlyDivergent, value)} /> Somente divergentes</label><label className="flex items-center gap-2 text-sm"><Switch checked={includeZero} onCheckedChange={(value) => resetPage(setIncludeZero, value)} /> Incluir zerados</label><label className="flex items-center gap-2 text-sm"><Switch checked={includeArchived} onCheckedChange={(value) => resetPage(setIncludeArchived, value)} /> Incluir arquivados</label></div>}</div>
        </CardContent></Card>

        <Card className="min-w-0 overflow-hidden border-border/70 shadow-sm">
          {isLoading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : error ? <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center"><p className="text-sm font-medium text-destructive">{(error as Error).message}</p><Button variant="outline" size="sm" onClick={() => void (isPositionView ? position.refetch() : movements.refetch())}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></div> : <div className="overflow-x-auto">{isPositionView ? positionTable : movementTable}</div>}
          <div className="flex flex-col gap-3 border-t border-border/70 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-muted-foreground">{totalCount.toLocaleString('pt-BR')} registro(s) · página {page} de {totalPages}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ArrowLeft className="mr-1 h-4 w-4" /> Anterior</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Próxima <ArrowRight className="ml-1 h-4 w-4" /></Button></div></div>
        </Card>
      </>}

      <Dialog open={openingOpen} onOpenChange={setOpeningOpen}><DialogContent className="z-[130] max-w-lg"><DialogHeader><DialogTitle>Informar saldo inicial fiscal</DialogTitle><DialogDescription>Registra um ajuste append-only até a data escolhida. O histórico anterior não é apagado.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="space-y-2"><Label>Local</Label><Select value={opening.stockId} onValueChange={(stockId) => setOpening((current) => ({ ...current, stockId }))}><SelectTrigger><SelectValue placeholder="Selecione o local" /></SelectTrigger><SelectContent>{stocks.map((stock) => <SelectItem key={stock.id} value={stock.id}>{stock.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Material</Label><Select value={opening.inventoryId} onValueChange={(inventoryId) => setOpening((current) => ({ ...current, inventoryId }))}><SelectTrigger><SelectValue placeholder="Selecione o material" /></SelectTrigger><SelectContent className="max-h-72">{activeInventory.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ''}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Saldo fiscal alvo</Label><Input inputMode="decimal" value={opening.targetBalance} onChange={(event) => setOpening((current) => ({ ...current, targetBalance: event.target.value }))} placeholder="0,0000" /></div><div className="space-y-2"><Label>Válido em</Label><Input type="datetime-local" value={opening.effectiveAt} onChange={(event) => setOpening((current) => ({ ...current, effectiveAt: event.target.value }))} /></div></div><div className="space-y-2"><Label>Observação</Label><Textarea value={opening.notes} onChange={(event) => setOpening((current) => ({ ...current, notes: event.target.value }))} placeholder="Ex.: inventário fiscal de implantação" /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpeningOpen(false)}>Cancelar</Button><Button onClick={saveOpening} disabled={openingBalance.isPending}>{openingBalance.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Registrar saldo</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
