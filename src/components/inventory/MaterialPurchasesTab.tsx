import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ClipboardList,
  ClipboardPlus,
  PackagePlus,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { FilterButton } from '@/components/ui/FilterButton';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import {
  ListDetailLayout,
  type ListDetailItem,
  type ListDetailSortOption,
} from '@/components/ui/ListDetailLayout';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useCanRegisterDirectMaterialPurchase } from '@/hooks/useCanRegisterDirectMaterialPurchase';
import { useCompras, type CompraListRow, type CompraStatus } from '@/hooks/useCompras';
import { useLowStock } from '@/hooks/useLowStock';
import { formatDate as formatLocalizedDate, formatMoney } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import { safeTimeZone } from '@/lib/timezone';
import { CompraDetailView } from './CompraDetailView';
import { CompraEditorDialog } from './CompraEditorDialog';
import { DirectMaterialPurchaseDialog } from './DirectMaterialPurchaseDialog';
import { SuppliersDialog } from './SuppliersDialog';

const STATUS_VARIANT: Record<string, 'info' | 'success' | 'destructive'> = {
  aberta: 'info',
  concluida: 'success',
  cancelada: 'destructive',
};

const STATUS_FILTER_KEYS: CompraStatus[] = ['aberta', 'concluida', 'cancelada'];

const PURCHASES_UI = {
  'pt-br': {
    subtitle: 'Acompanhe requisições, cotações, ordens e compras já realizadas.', newPurchase: 'Nova compra',
    requestTitle: 'Criar requisição', requestDescription: 'Planejar materiais, comparar fornecedores e gerar ordens de compra.',
    directTitle: 'Registrar compra direta', directDescription: 'Lançar uma compra já realizada no estoque e no Financeiro.',
    listTitle: 'Compras e requisições', listDescription: 'Selecione um registro para acompanhar os materiais e a próxima ação.',
    listEmpty: 'Nenhuma compra encontrada com os filtros atuais.', searchPlaceholder: 'Buscar por código, título ou fornecedor...',
    selectTitle: 'Selecione uma compra', selectDescription: 'Os materiais, cotações, ordens e recebimentos aparecerão aqui.',
    errorTitle: 'Não foi possível carregar as compras', errorDescription: 'Tente atualizar a página. Nenhuma informação foi alterada.',
    requestType: 'Requisição', directType: 'Compra direta', material: 'material', materials: 'materiais', quotes: 'cotações', pendingValue: 'A definir',
    sortRecent: 'Mais recentes', sortOldest: 'Mais antigas', sortHighest: 'Maior valor', sortLowest: 'Menor valor',
  },
  en: {
    subtitle: 'Track requests, quotes, orders and completed purchases.', newPurchase: 'New purchase',
    requestTitle: 'Create request', requestDescription: 'Plan materials, compare suppliers and create purchase orders.',
    directTitle: 'Record direct purchase', directDescription: 'Post a completed purchase to inventory and Finance.',
    listTitle: 'Purchases and requests', listDescription: 'Select a record to review materials and the next action.',
    listEmpty: 'No purchases match the current filters.', searchPlaceholder: 'Search by code, title or supplier...',
    selectTitle: 'Select a purchase', selectDescription: 'Materials, quotes, orders and receipts will appear here.',
    errorTitle: 'Purchases could not be loaded', errorDescription: 'Refresh the page and try again. No information was changed.',
    requestType: 'Request', directType: 'Direct purchase', material: 'material', materials: 'materials', quotes: 'quotes', pendingValue: 'To be defined',
    sortRecent: 'Most recent', sortOldest: 'Oldest', sortHighest: 'Highest value', sortLowest: 'Lowest value',
  },
  es: {
    subtitle: 'Acompaña solicitudes, cotizaciones, órdenes y compras realizadas.', newPurchase: 'Nueva compra',
    requestTitle: 'Crear solicitud', requestDescription: 'Planificar materiales, comparar proveedores y generar órdenes de compra.',
    directTitle: 'Registrar compra directa', directDescription: 'Registrar una compra realizada en inventario y Finanzas.',
    listTitle: 'Compras y solicitudes', listDescription: 'Selecciona un registro para revisar materiales y la próxima acción.',
    listEmpty: 'No hay compras con los filtros actuales.', searchPlaceholder: 'Buscar por código, título o proveedor...',
    selectTitle: 'Selecciona una compra', selectDescription: 'Los materiales, cotizaciones, órdenes y recepciones aparecerán aquí.',
    errorTitle: 'No se pudieron cargar las compras', errorDescription: 'Actualiza la página e inténtalo nuevamente. No se modificó información.',
    requestType: 'Solicitud', directType: 'Compra directa', material: 'material', materials: 'materiales', quotes: 'cotizaciones', pendingValue: 'Por definir',
    sortRecent: 'Más recientes', sortOldest: 'Más antiguas', sortHighest: 'Mayor valor', sortLowest: 'Menor valor',
  },
  fr: {
    subtitle: 'Suivez les demandes, devis, commandes et achats effectués.', newPurchase: 'Nouvel achat',
    requestTitle: 'Créer une demande', requestDescription: 'Planifier les matériaux, comparer les fournisseurs et créer des commandes.',
    directTitle: 'Enregistrer un achat direct', directDescription: 'Enregistrer un achat effectué dans le stock et les Finances.',
    listTitle: 'Achats et demandes', listDescription: 'Sélectionnez un dossier pour consulter les matériaux et la prochaine action.',
    listEmpty: 'Aucun achat ne correspond aux filtres actuels.', searchPlaceholder: 'Rechercher par code, titre ou fournisseur...',
    selectTitle: 'Sélectionnez un achat', selectDescription: 'Les matériaux, devis, commandes et réceptions apparaîtront ici.',
    errorTitle: 'Impossible de charger les achats', errorDescription: 'Actualisez la page et réessayez. Aucune information n’a été modifiée.',
    requestType: 'Demande', directType: 'Achat direct', material: 'matériau', materials: 'matériaux', quotes: 'devis', pendingValue: 'À définir',
    sortRecent: 'Plus récents', sortOldest: 'Plus anciens', sortHighest: 'Valeur la plus élevée', sortLowest: 'Valeur la plus basse',
  },
} as const;

function formatDate(iso: string, locale: LocaleCode, timezone: string | null | undefined): string {
  return formatLocalizedDate(iso, locale, safeTimeZone(timezone));
}

function purchaseValue(compra: CompraListRow): number | null {
  if (compra.flow_type === 'compra_direta') return compra.direct_total;
  return compra.accepted_total ?? compra.lowest_total;
}

function purchaseDate(compra: CompraListRow): string {
  return compra.flow_type === 'compra_direta' && compra.purchase_date
    ? compra.purchase_date
    : compra.created_at;
}

export function MaterialPurchasesTab({ openNewOnMount = false }: { openNewOnMount?: boolean }) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const UI = PURCHASES_UI[locale];
  const t = MESSAGES[locale].app.inventory.purchases;
  const { compras, isLoading, error } = useCompras();
  const { lowStockRows } = useLowStock();
  const canRegisterDirectPurchase = useCanRegisterDirectMaterialPurchase();

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(openNewOnMount);
  const [directPurchaseOpen, setDirectPurchaseOpen] = useState(false);
  const [editing, setEditing] = useState<CompraListRow | null>(null);
  const [selectedCompraId, setSelectedCompraId] = useState<string | null>(null);
  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('all');

  const statusLabelMap: Record<string, string> = {
    aberta: t.status.open,
    concluida: t.status.completed,
    cancelada: t.status.cancelled,
  };

  const visibleCompras = useMemo(
    () => filterByDate(compras, 'purchase_date', 'created_at').filter(
      (compra) => statusFilter.length === 0 || statusFilter.includes(compra.status),
    ),
    [compras, filterByDate, statusFilter],
  );
  const selectedCompra = useMemo(
    () => compras.find((compra) => compra.id === selectedCompraId) ?? null,
    [compras, selectedCompraId],
  );

  useEffect(() => {
    if (selectedCompraId && !isLoading && !visibleCompras.some((compra) => compra.id === selectedCompraId)) {
      setSelectedCompraId(null);
    }
  }, [isLoading, selectedCompraId, visibleCompras]);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (compra: CompraListRow) => {
    setEditing(compra);
    setEditorOpen(true);
  };

  const statusFilterContent = (
    <FilterCheckboxGroup
      label={t.filters.status}
      options={STATUS_FILTER_KEYS.map((key) => ({ value: key, label: statusLabelMap[key] ?? key }))}
      selected={statusFilter}
      onChange={setStatusFilter}
      emptyLabel={t.filters.statusEmpty}
    />
  );

  const compraById = useMemo(
    () => new Map(visibleCompras.map((compra) => [compra.id, compra])),
    [visibleCompras],
  );

  const listItems = useMemo<ListDetailItem[]>(
    () => visibleCompras.map((compra) => {
      const isDirect = compra.flow_type === 'compra_direta';
      const supplier = isDirect ? compra.direct_supplier_name : compra.accepted_supplier_name;
      const materialsLabel = `${compra.material_count} ${compra.material_count === 1 ? UI.material : UI.materials}`;
      const quotesLabel = !isDirect && compra.cotacao_count > 0
        ? `${compra.cotacao_count} ${UI.quotes}`
        : null;
      const typeLabel = isDirect ? UI.directType : UI.requestType;
      const value = purchaseValue(compra);
      return {
        id: compra.id,
        title: `#${compra.numero} · ${compra.title}`,
        subtitle: [typeLabel, supplier, materialsLabel, quotesLabel, formatDate(purchaseDate(compra), locale, timezone)]
          .filter(Boolean)
          .join(' · '),
        searchText: [
          compra.numero,
          compra.title,
          compra.notes,
          supplier,
          typeLabel,
          statusLabelMap[compra.status],
        ].filter(Boolean).join(' '),
        leading: (
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${isDirect ? 'bg-success text-success-foreground' : 'bg-info text-info-foreground'}`}>
            {isDirect ? <PackagePlus className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
          </span>
        ),
        trailing: (
          <span className="flex max-w-28 flex-col items-end gap-1 text-right">
            <span className="whitespace-nowrap text-xs font-bold tabular-nums">
              {value == null ? UI.pendingValue : formatMoney(value, currency, locale)}
            </span>
            <Badge variant={STATUS_VARIANT[compra.status] ?? 'info'} className="text-[9px]">
              {statusLabelMap[compra.status] ?? compra.status}
            </Badge>
          </span>
        ),
      };
    }),
    // statusLabelMap é derivado exclusivamente de t, coberto pela troca de locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency, locale, timezone, visibleCompras],
  );

  const sortOptions = useMemo<ListDetailSortOption[]>(() => {
    const byDate = (a: ListDetailItem, b: ListDetailItem) =>
      new Date(purchaseDate(compraById.get(a.id)!)).getTime()
      - new Date(purchaseDate(compraById.get(b.id)!)).getTime();
    const byValue = (a: ListDetailItem, b: ListDetailItem) =>
      (purchaseValue(compraById.get(a.id)!) ?? 0) - (purchaseValue(compraById.get(b.id)!) ?? 0);
    return [
      { value: 'recent', label: UI.sortRecent, compare: (a, b) => byDate(b, a) },
      { value: 'oldest', label: UI.sortOldest, compare: byDate },
      { value: 'highest', label: UI.sortHighest, compare: (a, b) => byValue(b, a) },
      { value: 'lowest', label: UI.sortLowest, compare: byValue },
    ];
  }, [UI, compraById]);

  const uniqueLowStockCount = useMemo(
    () => new Set(lowStockRows.map((row) => row.inventory_id)).size,
    [lowStockRows],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground sm:text-xl">{t.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{UI.subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <DateRangeFilter
            value={range}
            preset={preset}
            onPresetChange={setPreset}
            onRangeChange={setRange}
          />
          <Button variant="outline" className="gap-1.5" onClick={() => setSuppliersOpen(true)}>
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">{t.actions.suppliers}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-1.5">
                <ClipboardPlus className="h-4 w-4" />
                {UI.newPurchase}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-1.5">
              <DropdownMenuItem className="items-start gap-3 px-3 py-2.5" onSelect={openNew}>
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                <span>
                  <span className="block font-semibold">{UI.requestTitle}</span>
                  <span className="mt-0.5 block whitespace-normal text-xs text-muted-foreground">
                    {UI.requestDescription}
                  </span>
                </span>
              </DropdownMenuItem>
              {canRegisterDirectPurchase && (
                <DropdownMenuItem
                  className="items-start gap-3 px-3 py-2.5"
                  onSelect={() => setDirectPurchaseOpen(true)}
                >
                  <PackagePlus className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>
                    <span className="block font-semibold">{UI.directTitle}</span>
                    <span className="mt-0.5 block whitespace-normal text-xs text-muted-foreground">
                      {UI.directDescription}
                    </span>
                  </span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {uniqueLowStockCount > 0 && (
        <NoticeBanner
          variant="warning"
          icon={AlertTriangle}
          onClick={openNew}
          action={t.lowStockAlert.action}
        >
          {uniqueLowStockCount === 1
            ? t.lowStockAlert.singular.replace('{count}', String(uniqueLowStockCount))
            : t.lowStockAlert.plural.replace('{count}', String(uniqueLowStockCount))}
        </NoticeBanner>
      )}

      {isLoading ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            {[1, 2, 3, 4, 5].map((index) => <Skeleton key={index} className="h-16 w-full" />)}
          </div>
          <Skeleton className="hidden min-h-[28rem] w-full lg:block" />
        </div>
      ) : error ? (
        <EmptyState
          size="compact"
          icon={<ShoppingCart className="h-10 w-10" />}
          title={UI.errorTitle}
          description={UI.errorDescription}
        />
      ) : (
        <ListDetailLayout
          items={listItems}
          selectedId={selectedCompraId ?? undefined}
          listTitle={UI.listTitle}
          listDescription={UI.listDescription}
          listFilters={(
            <FilterButton
              activeCount={statusFilter.length > 0 ? 1 : 0}
              onClear={() => setStatusFilter([])}
              embedded
            >
              {statusFilterContent}
            </FilterButton>
          )}
          sortOptions={sortOptions}
          pageSize={25}
          storageKey="inventory-material-purchases"
          searchPlaceholder={UI.searchPlaceholder}
          emptyLabel={UI.listEmpty}
          mobileDetailOpen={selectedCompraId != null}
          onSelect={setSelectedCompraId}
        >
          {selectedCompra ? (
            <CompraDetailView
              compra={selectedCompra}
              onBack={() => setSelectedCompraId(null)}
              onEdit={openEdit}
              embedded
            />
          ) : (
            <div className="flex min-h-[24rem] items-center justify-center">
              <EmptyState
                size="compact"
                icon={<ShoppingCart className="h-10 w-10" />}
                title={UI.selectTitle}
                description={UI.selectDescription}
                action={compras.length === 0 ? { label: UI.requestTitle, onClick: openNew } : undefined}
              />
            </div>
          )}
        </ListDetailLayout>
      )}

      <SuppliersDialog open={suppliersOpen} onOpenChange={setSuppliersOpen} />
      <CompraEditorDialog open={editorOpen} onOpenChange={setEditorOpen} compra={editing} />
      <DirectMaterialPurchaseDialog
        open={directPurchaseOpen}
        onOpenChange={setDirectPurchaseOpen}
      />
    </div>
  );
}
