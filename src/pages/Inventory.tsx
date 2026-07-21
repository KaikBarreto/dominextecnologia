import { useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useInventory, type InventoryItem } from '@/hooks/useInventory';
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

export default function Inventory() {
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory;
  const { items, isLoading, stats, deleteItem, getQuantityForStock, getMinQuantityForStock } = useInventory();
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
  const [activeTab, setActiveTab] = useState('estoque');

  // Inline movement state
  const [inlineMovementOpen, setInlineMovementOpen] = useState(false);
  const [inlineMovementItem, setInlineMovementItem] = useState<InventoryItem | null>(null);
  const [inlineMovementType, setInlineMovementType] = useState<InlineMovementType>('entrada');

  // Estoque (depósito) ativo dentro da aba "Estoque Atual"
  const [activeStockId, setActiveStockId] = useState<string | null>(null);
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
    return matchesSearch && matchesCategory && matchesGroup && matchesLowStock;
  });

  const { sortedItems, sortConfig, handleSort } = useTableSort(filteredItems);
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

  const handleTransferClick = (item: InventoryItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
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
      count: Math.round(stats.totalValue),
      icon: <DollarSign className="h-4 w-4" />,
      accentColor: 'hsl(var(--info))',
    },
    {
      key: 'sale',
      label: t.stats.saleProjection,
      count: Math.round(stats.totalSaleValue),
      icon: <TrendingUp className="h-4 w-4" />,
      accentColor: 'hsl(var(--success))',
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
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border accent-destructive cursor-pointer"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
          />
          <span className="text-sm font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            {t.filters.lowStockOnly}
          </span>
        </label>
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

  // Botão Configurações — aparece no header (mobile: rightElement; desktop: no toolbar)
  const settingsButton = (
    <Button
      variant="outline"
      size={isMobile ? 'icon' : 'sm'}
      className={cn('shrink-0 rounded-xl', isMobile ? 'h-10 w-10' : 'gap-1.5 min-h-11')}
      onClick={() => setSettingsOpen(true)}
      aria-label={t.actions.settings}
    >
      <Settings className="h-4 w-4" />
      {!isMobile && t.actions.settings}
    </Button>
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
        actions={isMobile ? settingsButton : undefined}
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
                  />
                ) : (
                  <div className="flex gap-1 border-b">
                    {stocks.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setActiveStockId(s.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                          resolvedStockId === s.id
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {s.name}
                        {s.is_default && (
                          <Star className="h-3 w-3 text-warning fill-warning" />
                        )}
                      </button>
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
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-xl"
                  aria-label={t.ariaLabels.importXml}
                  onClick={() => setNfeImportOpen(true)}
                >
                  <FileUp className="h-4 w-4" />
                </Button>
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
                    variant="outline"
                    size="sm"
                    className="gap-1 min-h-11 rounded-xl"
                    onClick={() => setNfeImportOpen(true)}
                  >
                    <FileUp className="h-4 w-4" /> {t.actions.importXml}
                  </Button>
                  {settingsButton}
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
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    {t.cardTitle}
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
                              <SortableTableHead sortKey="cost_price" sortConfig={sortConfig} onSort={handleSort} className="text-right">{t.table.costUnit}</SortableTableHead>
                              <SortableTableHead sortKey="sale_price" sortConfig={sortConfig} onSort={handleSort} className="text-right">{t.table.saleUnit}</SortableTableHead>
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
                                    {min !== null && (
                                      <span className="ml-1 text-xs text-muted-foreground">/ {t.minShort} {min}</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.cost_price ? formatCurrency(item.cost_price) : '-'}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.sale_price ? formatCurrency(item.sale_price) : '-'}
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
      />

      {/* Dialog de transferência entre depósitos */}
      <StockTransferDialog
        open={transferOpen}
        onOpenChange={(v) => {
          setTransferOpen(v);
          if (!v) setTransferItem(null);
        }}
        item={transferItem}
        activeStockId={resolvedStockId}
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
