import { useState, useEffect } from 'react';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  DollarSign,
  Edit,
  Trash2,
  TrendingUp,
  TrendingDown,
  Boxes,
  Eye,
  FileDown,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  History,
  ShoppingCart,
  FileUp,
  ArrowRightLeft,
  Settings,
  Star,
  ClipboardList,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useInventory, type InventoryItem } from '@/hooks/useInventory';
import { StockConfiguratorDialog } from '@/components/inventory/StockConfiguratorDialog';
import { useStocks } from '@/hooks/useStocks';
import { useMaterialGroups } from '@/hooks/useMaterialGroups';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { InventoryFormDialog } from '@/components/inventory/InventoryFormDialog';
import { StockTransferDialog } from '@/components/inventory/StockTransferDialog';
import { InventorySettingsDialog } from '@/components/inventory/InventorySettingsDialog';
import {
  InlineMovementDialog,
  type InlineMovementType,
} from '@/components/inventory/InlineMovementDialog';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { StatCarousel } from '@/components/mobile/StatCarousel';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { FilterButton } from '@/components/ui/FilterButton';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import {
  InventoryExportDialog,
  type ExportFormat,
} from '@/components/inventory/InventoryExportDialog';
import { generateInventoryReportPdf } from '@/utils/inventoryPdfGenerator';
import { generateInventoryExcel } from '@/utils/inventoryExcelGenerator';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useToast } from '@/hooks/use-toast';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { InventoryKardexTab } from '@/components/inventory/InventoryKardexTab';
import { MaterialPurchasesTab } from '@/components/inventory/MaterialPurchasesTab';
import { NfeImportDialog } from '@/components/inventory/NfeImportDialog';
import { InventoryCountsTab } from '@/components/inventory/InventoryCountsTab';
import { StockPositionTab } from '@/components/inventory/StockPositionTab';
import { formatMoney } from '@/lib/format';

export default function Inventory() {
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory;
  const { items, isLoading, stats, deleteItem, getQuantityForStock, getMinQuantityForStock, getPresenceForStock } = useInventory();
  const { stocks, defaultStock } = useStocks();
  const { groups } = useMaterialGroups();
  const { settings: companySettings } = useCompanySettings();
  const { enabled: whiteLabelEnabled } = useWhiteLabel();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [nfeImportOpen, setNfeImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null);
  /** Local pré-selecionado como origem quando a transferência vem de um atalho
   *  de presença bloqueada. null = comportamento padrão (usa activeStockId). */
  const [transferFromStockId, setTransferFromStockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('estoque');

  // Inline movement state
  const [inlineMovementOpen, setInlineMovementOpen] = useState(false);
  const [inlineMovementItem, setInlineMovementItem] = useState<InventoryItem | null>(null);
  const [inlineMovementType, setInlineMovementType] = useState<InlineMovementType>('entrada');

  // Estoque (depósito) ativo dentro da aba "Estoque Atual"
  const [activeStockId, setActiveStockId] = useState<string | null>(null);

  // Configurador de itens por local (engrenagem na pill)
  const [configuratorStockId, setConfiguratorStockId] = useState<string | null>(null);
  const [configuratorOpen, setConfiguratorOpen] = useState(false);

  // Se o local ativo foi excluído, redefine para null (cai no defaultStock).
  useEffect(() => {
    if (activeStockId && stocks.length > 0 && !stocks.some((s) => s.id === activeStockId)) {
      setActiveStockId(null);
    }
  }, [stocks, activeStockId]);

  // Inicializa com o estoque padrão quando ele carregar
  const resolvedStockId = activeStockId ?? defaultStock?.id ?? null;

  // Quantidade do item no estoque selecionado
  const getItemQty = (item: InventoryItem): number =>
    resolvedStockId
      ? getQuantityForStock(item.id, resolvedStockId)
      : (item.quantity ?? 0);

  // Mínimo do item no estoque selecionado
  const getItemMinQty = (item: InventoryItem): number | null =>
    resolvedStockId ? getMinQuantityForStock(item.id, resolvedStockId) : null;

  const isLowStockForActiveStock = (item: InventoryItem) => {
    const qty = getItemQty(item);
    const min = getItemMinQty(item);
    return min !== null && qty < min;
  };

  // Itens filtrados considerando busca, grupo, estoque ativo e filtro de estoque baixo
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      fuzzyIncludes(item.name, searchQuery) ||
      fuzzyIncludes(item.sku, searchQuery) ||
      fuzzyIncludes(item.category, searchQuery);
    const matchesCategory =
      categoryFilter.length === 0 || categoryFilter.includes(item.category || '');
    const matchesGroup =
      groupFilter.length === 0 || groupFilter.includes(item.group_id || '');
    // filtro de estoque baixo só aplica se busca vazia (padrão busca universal)
    const matchesLowStock = !lowStockOnly || searchQuery ? true : isLowStockForActiveStock(item);
    // Filtro de presença: quando há um local selecionado e NÃO há busca ativa,
    // mostra só os materiais presentes naquele local.
    // Com busca ativa, a busca é universal (ignora presença — [[feedback_busca_universal_telas_listagem]]).
    const matchesPresence =
      !resolvedStockId || searchQuery
        ? true
        : getPresenceForStock(item.id, resolvedStockId);
    return matchesSearch && matchesCategory && matchesGroup && matchesLowStock && matchesPresence;
  });

  // Enriquece cada item com effectiveQty (saldo do local ativo) para que a
  // ordenação pela coluna "Quantidade" bata com o que a coluna exibe.
  const filteredItemsWithEffectiveQty = filteredItems.map((item) => ({
    ...item,
    quantity: resolvedStockId ? getQuantityForStock(item.id, resolvedStockId) : (item.quantity ?? 0),
  }));
  const { sortedItems, sortConfig, handleSort } = useTableSort(filteredItemsWithEffectiveQty);
  const pagination = useDataPagination(sortedItems);

  // Categorias presentes nos itens (filtro legado)
  const categories = Array.from(
    new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c && c.trim()))),
  ).sort();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'BRL',
    }).format(value);

  const handleEdit = (item: InventoryItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleDeleteClick = (item: InventoryItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  /** Abre o dialog de transferência a partir do menu de ações (origem = activeStockId normal). */
  const handleTransferClick = (item: InventoryItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTransferFromStockId(null);
    setTransferItem(item);
    setTransferOpen(true);
  };

  /** Abre o dialog de transferência a partir de atalho de presença bloqueada,
   *  pré-selecionando fromStockId como origem. */
  const handleTransferFromBlockedStock = (item: InventoryItem, fromStockId: string) => {
    setTransferFromStockId(fromStockId);
    setTransferItem(item);
    setTransferOpen(true);
  };

  const handleInlineMovement = (item: InventoryItem, type: InlineMovementType, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setInlineMovementItem(item);
    setInlineMovementType(type);
    setInlineMovementOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (itemToDelete) {
      await deleteItem.mutateAsync(itemToDelete.id);
      setItemToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingItem(null);
  };

  const openNewItem = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };

  const openConfigurator = (stockId: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setConfiguratorStockId(stockId);
    setConfiguratorOpen(true);
  };

  const openExport = (format: ExportFormat) => {
    setExportFormat(format);
    setExportOpen(true);
  };

  const handleExportConfirm = async (selected: InventoryItem[]) => {
    const activeStock = stocks.find((s) => s.id === resolvedStockId);
    const rows = selected.map((i) => {
      const qty = resolvedStockId
        ? getQuantityForStock(i.id, resolvedStockId)
        : (i.quantity ?? null);
      const min = resolvedStockId
        ? getMinQuantityForStock(i.id, resolvedStockId)
        : null;
      return {
        name: i.name,
        sku: i.sku ?? null,
        category: i.category ?? null,
        quantity: qty,
        min_quantity: min,
        unit: i.unit ?? null,
        cost_price: i.cost_price ?? null,
        sale_price: i.sale_price ?? null,
      };
    });
    const title = t.export.reportTitle;
    try {
      if (exportFormat === 'excel') {
        await generateInventoryExcel({ title, rows, locale, currency, stockName: activeStock?.name });
      } else {
        await generateInventoryReportPdf({
          company: companySettings,
          whiteLabel: whiteLabelEnabled,
          title,
          rows,
          locale,
          currency,
          stockName: activeStock?.name,
        });
      }
    } catch (err) {
      console.error('Falha ao exportar estoque:', err);
      toast({
        variant: 'destructive',
        title: t.export.errorTitle,
        description: t.export.errorDescription,
      });
    }
  };

  const exportDropdown = (compact = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" aria-label={t.ariaLabels.exportStock}>
            <FileDown className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-1 min-h-11 rounded-xl">
            <FileDown className="h-4 w-4" /> {t.actions.export} <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => openExport('pdf')}
          className="gap-2 cursor-pointer focus:bg-info focus:text-white hover:bg-info hover:text-white"
        >
          <FileText className="h-4 w-4" /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => openExport('excel')}
          className="gap-2 cursor-pointer focus:bg-success focus:text-white hover:bg-success hover:text-white"
        >
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const statItems = [
    {
      key: 'total',
      label: t.stats.totalItems,
      count: stats.totalItems,
      icon: <Boxes className="h-4 w-4" />,
      accentColor: 'hsl(var(--primary))',
    },
    {
      key: 'cost',
      label: t.stats.invested,
      count: stats.totalValue,
      displayValue: formatMoney(stats.totalValue, currency, locale),
      icon: <DollarSign className="h-4 w-4" />,
      accentColor: 'hsl(var(--info))',
    },
    {
      key: 'low',
      label: t.stats.lowStock,
      count: stats.lowStockItems,
      icon: <AlertTriangle className="h-4 w-4" />,
      accentColor: 'hsl(var(--warning))',
    },
  ];

  const activeFilterCount =
    (searchQuery ? 1 : 0) +
    (categoryFilter.length > 0 ? 1 : 0) +
    (groupFilter.length > 0 ? 1 : 0) +
    (lowStockOnly ? 1 : 0);

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter([]);
    setGroupFilter([]);
    setLowStockOnly(false);
  };

  const filterContent = (
    <>
      {/* Filtro de estoque baixo */}
      <div className="space-y-2">
        <button
          type="button"
          className="flex items-center gap-2.5 cursor-pointer w-full text-left"
          onClick={() => setLowStockOnly((v) => !v)}
        >
          <Checkbox
            checked={lowStockOnly}
            onCheckedChange={(v) => setLowStockOnly(!!v)}
            className="pointer-events-none"
          />
          <span className="text-sm font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            {t.filters.lowStockOnly}
          </span>
        </button>
      </div>
      {groups.length > 0 && (
        <FilterCheckboxGroup
          label={t.groupFilter.label}
          options={groups.map((g) => ({
            value: g.id,
            label: g.name,
            color: g.color ?? undefined,
          }))}
          selected={groupFilter}
          onChange={setGroupFilter}
          emptyLabel={t.groupFilter.empty}
        />
      )}
      {categories.length > 0 && (
        <FilterCheckboxGroup
          label={t.filters.category}
          options={categories.map((cat) => ({ value: cat, label: cat }))}
          selected={categoryFilter}
          onChange={setCategoryFilter}
          emptyLabel={t.filters.categoryEmpty}
        />
      )}
    </>
  );

  // Há filtros disponíveis (inclui low-stock toggle)
  const hasAnyFilter = true;

  const inventoryTabs: SettingsTab[] = [
    { value: 'estoque', label: t.tabs.current, icon: Boxes },
    { value: 'historico', label: t.tabs.kardex, icon: History },
    { value: 'compras', label: t.tabs.purchases, icon: ShoppingCart },
    { value: 'inventarios', label: t.tabs.inventories, icon: ClipboardList },
    { value: 'posicao', label: t.tabs.position, icon: BarChart3 },
  ];

  // Subabas dos depósitos dentro da aba Estoque Atual
  const stockPillTabs = stocks.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  // Botões Importar XML e Configurações — ficam no canto superior direito do header (sempre)
  const headerRightButtons = (
    <div className="flex items-center gap-1.5 shrink-0">
      <Button
        variant="outline"
        className="h-9 w-9 lg:w-auto lg:px-3 shrink-0 rounded-xl gap-1.5"
        aria-label={t.ariaLabels.importXml}
        onClick={() => setNfeImportOpen(true)}
      >
        <FileUp className="h-4 w-4 shrink-0" />
        <span className="hidden lg:inline">{t.actions.importXml}</span>
      </Button>
      <Button
        variant="outline"
        className="h-9 w-9 lg:w-auto lg:px-3 shrink-0 rounded-xl gap-1.5"
        onClick={() => setSettingsOpen(true)}
        aria-label={t.actions.settings}
      >
        <Settings className="h-4 w-4 shrink-0" />
        <span className="hidden lg:inline">{t.actions.settings}</span>
      </Button>
    </div>
  );

  // Ícone de alerta abaixo do mínimo com tooltip
  const LowStockIcon = ({ item }: { item: InventoryItem }) => {
    const qty = getItemQty(item);
    const min = getItemMinQty(item);
    if (min === null || qty >= min) return null;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0 cursor-help" tabIndex={0} aria-label={t.lowStockTooltip.replace('{qty}', String(qty)).replace('{min}', String(min))}>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            {t.lowStockTooltip.replace('{qty}', String(qty)).replace('{min}', String(min))}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
      <MobilePageHeader
        title={t.header.title}
        subtitle={t.header.subtitle}
        icon={Package}
        actions={headerRightButtons}
      />

      <SettingsSidebarLayout
        tabs={inventoryTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {activeTab !== 'compras' && activeTab !== 'inventarios' && activeTab !== 'posicao' && (
          <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-4">
            {inventoryTabs.find((tab) => tab.value === activeTab)?.label}
          </h2>
        )}

        {/* ===================== ABA: ESTOQUE ATUAL ===================== */}
        {activeTab === 'estoque' && (
          <div className="space-y-4">
            {/* Stats */}
            <StatCarousel items={statItems} loading={isLoading} />

            {/* Subabas dos depósitos (quando há mais de 1) */}
            {stocks.length > 1 && (
              <>
                {isMobile ? (
                  <MobilePillTabs
                    tabs={stockPillTabs}
                    activeTab={resolvedStockId ?? ''}
                    onTabChange={setActiveStockId}
                    renderSuffix={(tab) => (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={t.stockConfigurator.gearIconLabel}
                        onClick={(e) => openConfigurator(tab.value, e)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openConfigurator(tab.value, e);
                          }
                        }}
                        className="flex items-center justify-center h-6 w-6 rounded-full cursor-pointer text-current opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </span>
                    )}
                  />
                ) : (
                  <div className="flex gap-1 border-b">
                    {stocks.map((s) => (
                      // Container da pill — não é <button> para evitar button-in-button
                      // ao aninhar a engrenagem. A área de troca de aba é um <span role="tab">.
                      <div
                        key={s.id}
                        className={cn(
                          'inline-flex items-center border-b-2 -mb-px transition-colors',
                          resolvedStockId === s.id
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground',
                        )}
                      >
                        {/* Área clicável de troca de aba */}
                        <span
                          role="tab"
                          aria-selected={resolvedStockId === s.id}
                          tabIndex={0}
                          onClick={() => setActiveStockId(s.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveStockId(s.id); } }}
                          className="flex items-center gap-1.5 pl-3 pr-1 py-2 text-sm font-medium cursor-pointer select-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm"
                        >
                          {s.name}
                          {s.is_default && (
                            <Star className="h-3 w-3 text-warning fill-warning" />
                          )}
                        </span>
                        {/* Engrenagem de configuração — irmã da área de aba, não filha */}
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={t.stockConfigurator.gearIconLabel}
                          onClick={(e) => openConfigurator(s.id, e)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openConfigurator(s.id, e);
                            }
                          }}
                          className="flex items-center justify-center h-6 w-6 mr-1 rounded cursor-pointer opacity-40 hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Barra de busca + filtros */}
            {isMobile ? (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t.search.placeholderShort}
                    className="pl-10 h-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                {hasAnyFilter && (
                  <FilterSheet
                    triggerLabel={t.filters.button}
                    activeCount={activeFilterCount}
                    onClear={clearFilters}
                  >
                    {filterContent}
                  </FilterSheet>
                )}
                {exportDropdown(true)}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t.search.placeholderFull}
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-auto">
                  {hasAnyFilter && (
                    <FilterButton
                      activeCount={activeFilterCount}
                      onClear={clearFilters}
                    >
                      {filterContent}
                    </FilterButton>
                  )}
                  {exportDropdown()}
                  <Button
                    className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                    onClick={openNewItem}
                  >
                    <Plus className="h-4 w-4" />
                    {t.actions.register}
                  </Button>
                </div>
              </div>
            )}

            {/* Lista */}
            {isMobile ? (
              <>
                {isLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : filteredItems.length === 0 ? (
                  <EmptyState
                    icon={<Package className="h-12 w-12" />}
                    title={
                      searchQuery || categoryFilter.length > 0 || groupFilter.length > 0 || lowStockOnly
                        ? t.empty.noneFoundTitle
                        : t.empty.noneTitle
                    }
                    description={
                      searchQuery || categoryFilter.length > 0 || groupFilter.length > 0 || lowStockOnly
                        ? t.empty.noneFoundDescription
                        : t.empty.noneDescriptionMobile
                    }
                  />
                ) : (
                  <>
                    <div className="rounded-xl border bg-card overflow-hidden">
                      {pagination.paginatedItems.map((item) => {
                        const qty = getItemQty(item);
                        const min = getItemMinQty(item);
                        const belowMin = min !== null && qty < min;
                        const itemGroup = groups.find((g) => g.id === item.group_id);

                        const itemActions: ItemAction[] = [
                          {
                            key: 'view',
                            label: t.rowActions.view,
                            icon: <Eye className="h-4 w-4" />,
                            onClick: () => handleEdit(item),
                          },
                          {
                            key: 'edit',
                            label: t.rowActions.edit,
                            icon: <Edit className="h-4 w-4" />,
                            variant: 'edit' as const,
                            onClick: () => handleEdit(item),
                          },
                          {
                            key: 'entrada',
                            label: t.rowActions.registerEntrada,
                            icon: <TrendingUp className="h-4 w-4" />,
                            onClick: () => handleInlineMovement(item, 'entrada'),
                          },
                          {
                            key: 'saida',
                            label: t.rowActions.registerSaida,
                            icon: <TrendingDown className="h-4 w-4" />,
                            onClick: () => handleInlineMovement(item, 'saida'),
                          },
                          ...(stocks.length > 1
                            ? [{
                                key: 'transfer',
                                label: t.rowActions.transfer,
                                icon: <ArrowRightLeft className="h-4 w-4" />,
                                onClick: () => handleTransferClick(item),
                              }]
                            : []),
                          {
                            key: 'delete',
                            label: t.rowActions.delete,
                            icon: <Trash2 className="h-4 w-4" />,
                            variant: 'destructive' as const,
                            onClick: () => handleDeleteClick(item),
                          },
                        ];

                        const subtitleParts: string[] = [];
                        if (itemGroup) subtitleParts.push(itemGroup.name);
                        else if (item.category) subtitleParts.push(item.category);
                        subtitleParts.push(`${qty} ${item.unit || t.unitFallback}`);
                        if (min !== null) {
                          subtitleParts.push(`${t.minShort} ${min}`);
                        }

                        return (
                          <MobileListItem
                            key={item.id}
                            onClick={() => handleEdit(item)}
                            actions={itemActions}
                            leading={
                              <div
                                className="h-10 w-10 rounded-full flex items-center justify-center"
                                style={
                                  itemGroup?.color
                                    ? { backgroundColor: `${itemGroup.color}22`, color: itemGroup.color }
                                    : undefined
                                }
                              >
                                <Package className="h-5 w-5" style={!itemGroup?.color ? { color: 'hsl(var(--primary))' } : undefined} />
                              </div>
                            }
                            title={
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="truncate">{item.name}</span>
                                {item.sku && (
                                  <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                                    {item.sku}
                                  </span>
                                )}
                                {belowMin && (
                                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                )}
                              </div>
                            }
                            subtitle={subtitleParts.join(' · ')}
                            trailing={
                              belowMin ? (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px] px-2 py-0.5 whitespace-nowrap"
                                >
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  {t.badge.low}
                                </Badge>
                              ) : undefined
                            }
                          />
                        );
                      })}
                    </div>
                    <DataTablePagination
                      page={pagination.page}
                      totalPages={pagination.totalPages}
                      totalItems={pagination.totalItems}
                      from={pagination.from}
                      to={pagination.to}
                      pageSize={pagination.pageSize}
                      onPageChange={pagination.setPage}
                      onPageSizeChange={pagination.setPageSize}
                    />
                  </>
                )}
              </>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 flex-wrap">
                    <Package className="h-5 w-5 shrink-0" />
                    <span>{t.cardTitle}</span>
                    {resolvedStockId && stocks.find((s) => s.id === resolvedStockId) && (
                      <span className="text-sm font-normal text-muted-foreground/70">
                        {t.stockLocationSuffix.replace('{stock}', stocks.find((s) => s.id === resolvedStockId)!.name)}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <EmptyState
                      size="compact"
                      icon={<Package className="h-12 w-12" />}
                      title={
                        searchQuery || categoryFilter.length > 0 || groupFilter.length > 0 || lowStockOnly
                          ? t.empty.noneFoundTitle
                          : t.empty.noneTitle
                      }
                      description={
                        searchQuery || categoryFilter.length > 0 || groupFilter.length > 0 || lowStockOnly
                          ? t.empty.noneFoundDescription
                          : t.empty.noneDescriptionDesktop
                      }
                    />
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>{t.table.name}</SortableTableHead>
                              <SortableTableHead sortKey="sku" sortConfig={sortConfig} onSort={handleSort}>{t.table.sku}</SortableTableHead>
                              <SortableTableHead sortKey="category" sortConfig={sortConfig} onSort={handleSort}>{t.table.category}</SortableTableHead>
                              <SortableTableHead sortKey="quantity" sortConfig={sortConfig} onSort={handleSort} className="text-right">{t.table.quantity}</SortableTableHead>
                              <TableHead className="text-right">{t.table.minQty}</TableHead>
                              <SortableTableHead sortKey="cost_price" sortConfig={sortConfig} onSort={handleSort} className="text-right">{t.table.costUnit}</SortableTableHead>
                              <TableHead className="w-[100px]">{t.table.actions}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagination.paginatedItems.map((item) => {
                              const qty = getItemQty(item);
                              const min = getItemMinQty(item);
                              const belowMin = min !== null && qty < min;
                              const itemGroup = groups.find((g) => g.id === item.group_id);
                              return (
                                <TableRow key={item.id} className={belowMin ? 'bg-destructive/5' : undefined}>
                                  <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                      <LowStockIcon item={item} />
                                      {item.name}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">{item.sku || '-'}</TableCell>
                                  <TableCell>
                                    {itemGroup ? (
                                      <div className="flex items-center gap-1.5">
                                        <div
                                          className="h-2.5 w-2.5 rounded-full shrink-0"
                                          style={{ backgroundColor: itemGroup.color ?? '#6B7280' }}
                                        />
                                        <Badge variant="secondary">{itemGroup.name}</Badge>
                                      </div>
                                    ) : item.category ? (
                                      <Badge variant="secondary">{item.category}</Badge>
                                    ) : null}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={belowMin ? 'text-destructive font-semibold' : ''}>
                                      {qty}
                                    </span>
                                    {' '}{item.unit}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {min !== null ? min : '-'}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.cost_price ? formatCurrency(item.cost_price) : '-'}
                                  </TableCell>
                                  <TableCell>
                                    <RowActionsMenu
                                      actions={[
                                        { label: t.rowActions.edit, icon: Edit, variant: 'edit', onClick: () => handleEdit(item) },
                                        { label: t.rowActions.registerEntrada, icon: TrendingUp, variant: 'default', onClick: () => handleInlineMovement(item, 'entrada') },
                                        { label: t.rowActions.registerSaida, icon: TrendingDown, variant: 'default', onClick: () => handleInlineMovement(item, 'saida') },
                                        ...(stocks.length > 1
                                          ? [{ label: t.rowActions.transfer, icon: ArrowRightLeft, variant: 'default' as const, onClick: () => handleTransferClick(item) }]
                                          : []),
                                        { label: t.rowActions.delete, icon: Trash2, variant: 'delete', onClick: () => handleDeleteClick(item) },
                                      ]}
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      <DataTablePagination
                        page={pagination.page}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.totalItems}
                        from={pagination.from}
                        to={pagination.to}
                        pageSize={pagination.pageSize}
                        onPageChange={pagination.setPage}
                        onPageSizeChange={pagination.setPageSize}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ===================== ABA: HISTÓRICO (KARDEX) ===================== */}
        {activeTab === 'historico' && <InventoryKardexTab />}

        {/* ===================== ABA: COMPRAS DE MATERIAL ===================== */}
        {activeTab === 'compras' && <MaterialPurchasesTab />}

        {/* ===================== ABA: INVENTÁRIOS ===================== */}
        {activeTab === 'inventarios' && <InventoryCountsTab />}

        {/* ===================== ABA: POSIÇÃO DE ESTOQUE ===================== */}
        {activeTab === 'posicao' && <StockPositionTab />}
      </SettingsSidebarLayout>

      {/* FAB mobile-only (só na aba de estoque) */}
      {isMobile && activeTab === 'estoque' && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={t.actions.fabLabel}
          onClick={openNewItem}
        />
      )}

      {/* Form Dialog (criar/editar material) */}
      <InventoryFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        item={editingItem}
        activeStockId={resolvedStockId}
        onOpenTransfer={handleTransferFromBlockedStock}
      />

      {/* Dialog de transferência entre depósitos */}
      <StockTransferDialog
        open={transferOpen}
        onOpenChange={(v) => {
          setTransferOpen(v);
          if (!v) { setTransferItem(null); setTransferFromStockId(null); }
        }}
        item={transferItem}
        activeStockId={resolvedStockId}
        initialFromStockId={transferFromStockId}
      />

      {/* Dialog de configurações (grupos + depósitos) */}
      <InventorySettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Importação via XML de NF-e */}
      <NfeImportDialog open={nfeImportOpen} onOpenChange={setNfeImportOpen} />

      {/* Seleção de materiais p/ exportar */}
      <InventoryExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        format={exportFormat}
        items={items}
        onConfirm={handleExportConfirm}
        activeStockId={resolvedStockId}
        getQuantityForStock={getQuantityForStock}
      />

      {/* Movimentação inline (entrada/saída) */}
      <InlineMovementDialog
        open={inlineMovementOpen}
        onOpenChange={(v) => {
          setInlineMovementOpen(v);
          if (!v) setInlineMovementItem(null);
        }}
        item={inlineMovementItem}
        movementType={inlineMovementType}
        activeStockId={resolvedStockId}
      />

      {/* Configurador de itens por local (engrenagem na pill) */}
      {configuratorOpen && configuratorStockId && stocks.find((s) => s.id === configuratorStockId) && (
        <StockConfiguratorDialog
          open={configuratorOpen}
          onOpenChange={(v) => {
            setConfiguratorOpen(v);
            if (!v) setConfiguratorStockId(null);
          }}
          stock={stocks.find((s) => s.id === configuratorStockId)!}
          onOpenTransfer={handleTransferFromBlockedStock}
        />
      )}

      {/* Confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.delete.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.delete.description.replace('{name}', itemToDelete?.name ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.delete.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.delete.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
