import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { useIsMobile, useMediaBreakpoint } from '@/hooks/use-mobile';
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
  ClipboardList,
  BarChart3,
  ArrowLeft,
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
import { useAccessibleInventoryIds } from '@/hooks/useAccessibleInventoryIds';
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
import { StatCarousel } from '@/components/mobile/StatCarousel';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { MobileListToolbar } from '@/components/mobile/MobileListToolbar';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { FilterButton } from '@/components/ui/FilterButton';
import { SearchField } from '@/components/ui/search-field-actions';
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
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useToast } from '@/hooks/use-toast';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { InventoryKardexTab } from '@/components/inventory/InventoryKardexTab';
import { MaterialPurchasesTab } from '@/components/inventory/MaterialPurchasesTab';
import { NfeImportDialog } from '@/components/inventory/NfeImportDialog';
import { InventoryCountsTab } from '@/components/inventory/InventoryCountsTab';
import { StockPositionTab } from '@/components/inventory/StockPositionTab';
import { InventoryReportsTab } from '@/components/inventory/InventoryReportsTab';
import { formatMoney, formatNumber } from '@/lib/format';
import { InventoryItemThumbnail } from '@/components/inventory/InventoryItemThumbnail';
import {
  getGeneralLowStockLevelCount,
  getGeneralStockQuantity,
} from '@/lib/inventoryGeneralStock';
import { StockLocationNavigator } from '@/components/inventory/StockLocationNavigator';

/** Sentinela somente de UI; nunca é enviada ao banco como `stock_id`. */
const GENERAL_STOCK_VIEW = '__general_stock__';
const GENERAL_STOCK_UI = {
  'pt-br': {
    label: 'Estoque geral', selectTitle: 'Selecione um local de estoque',
    selectDescription: 'A visão geral é somente consolidada. Escolha Loja, Galpão, Van ou outro local antes de movimentar quantidades.',
    belowOne: 'local abaixo do mínimo', belowMany: 'locais abaixo do mínimo', perLocation: 'Por local',
    locationsTitle: 'Locais de estoque', availableOne: '1 local disponível', availableMany: '{count} locais disponíveis',
    consolidated: 'Visão consolidada', itemOne: '1 item', itemMany: '{count} itens',
    lowOne: '1 baixo', lowMany: '{count} baixos', backToLocations: 'Voltar aos locais', configure: 'Configurar local',
  },
  en: {
    label: 'Overall stock', selectTitle: 'Select an inventory location',
    selectDescription: 'The overall view is consolidated and read-only. Select a store, warehouse, van or another location before changing quantities.',
    belowOne: 'location below minimum', belowMany: 'locations below minimum', perLocation: 'By location',
    locationsTitle: 'Inventory locations', availableOne: '1 location available', availableMany: '{count} locations available',
    consolidated: 'Consolidated view', itemOne: '1 item', itemMany: '{count} items',
    lowOne: '1 low', lowMany: '{count} low', backToLocations: 'Back to locations', configure: 'Configure location',
  },
  es: {
    label: 'Stock general', selectTitle: 'Selecciona una ubicación de stock',
    selectDescription: 'La vista general es consolidada y de solo lectura. Selecciona una tienda, depósito, vehículo u otra ubicación antes de cambiar cantidades.',
    belowOne: 'ubicación bajo el mínimo', belowMany: 'ubicaciones bajo el mínimo', perLocation: 'Por ubicación',
    locationsTitle: 'Ubicaciones de stock', availableOne: '1 ubicación disponible', availableMany: '{count} ubicaciones disponibles',
    consolidated: 'Vista consolidada', itemOne: '1 artículo', itemMany: '{count} artículos',
    lowOne: '1 bajo', lowMany: '{count} bajos', backToLocations: 'Volver a ubicaciones', configure: 'Configurar ubicación',
  },
  fr: {
    label: 'Stock général', selectTitle: 'Sélectionnez un emplacement de stock',
    selectDescription: `La vue générale est consolidée et en lecture seule. Sélectionnez un magasin, dépôt, véhicule ou autre emplacement avant de modifier les quantités.`,
    belowOne: 'emplacement sous le minimum', belowMany: 'emplacements sous le minimum', perLocation: 'Par emplacement',
    locationsTitle: 'Emplacements de stock', availableOne: '1 emplacement disponible', availableMany: '{count} emplacements disponibles',
    consolidated: 'Vue consolidée', itemOne: '1 article', itemMany: '{count} articles',
    lowOne: '1 bas', lowMany: '{count} bas', backToLocations: 'Retour aux emplacements', configure: `Configurer l'emplacement`,
  },
} as const;

export default function Inventory() {
  const location = useLocation();
  const navigate = useNavigate();
  const inventoryNavigation = location.state as {
    inventoryTab?: string;
    openNewPurchase?: boolean;
  } | null;
  const isMobile = useIsMobile();
  const isStockCompact = useMediaBreakpoint(1280);
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory;
  const generalStockUi = GENERAL_STOCK_UI[locale];
  const {
    items,
    stockLevels,
    isLoading,
    stats,
    deleteItem,
    getQuantityForStock,
    getMinQuantityForStock,
    getPresenceForStock,
  } = useInventory();
  const { accessibleIds, isLoading: isLoadingAccessible } = useAccessibleInventoryIds();
  const { stocks, defaultStock } = useStocks();
  const { groups } = useMaterialGroups();
  const { settings: companySettings } = useCompanySettings();
  const { enabled: whiteLabelEnabled } = useWhiteLabel();
  const { toast } = useToast();
  const { hasModule } = useCompanyModules();
  // Agrupamento Loja × Operacional dos locais — só existe com o módulo PDV.
  const pdvEnabled = hasModule('pdv');

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
  const [activeTab, setActiveTab] = useState(inventoryNavigation?.inventoryTab ?? 'estoque');

  // Atalhos vindos do Caixa são consumidos uma única vez. Limpar o state
  // evita reabrir a compra caso a pessoa troque de aba e volte para Compras.
  useEffect(() => {
    if (!inventoryNavigation?.inventoryTab && !inventoryNavigation?.openNewPurchase) return;
    navigate(location.pathname, { replace: true, state: null });
  }, [inventoryNavigation?.inventoryTab, inventoryNavigation?.openNewPurchase, location.pathname, navigate]);

  // Inline movement state
  const [inlineMovementOpen, setInlineMovementOpen] = useState(false);
  const [inlineMovementItem, setInlineMovementItem] = useState<InventoryItem | null>(null);
  const [inlineMovementType, setInlineMovementType] = useState<InlineMovementType>('entrada');

  // A visão consolidada é o primeiro contexto da aba. Um local real só passa a
  // ser ativo depois de escolha explícita — evita movimentar o depósito padrão
  // enquanto a pessoa acredita estar agindo sobre o total geral.
  const [activeStockId, setActiveStockId] = useState<string | null>(GENERAL_STOCK_VIEW);
  const [stockDetailOpen, setStockDetailOpen] = useState(false);

  // Configurador de itens por local (engrenagem na pill)
  const [configuratorStockId, setConfiguratorStockId] = useState<string | null>(null);
  const [configuratorOpen, setConfiguratorOpen] = useState(false);

  // Se o local ativo foi excluído, volta para a visão geral.
  useEffect(() => {
    if (
      activeStockId
      && activeStockId !== GENERAL_STOCK_VIEW
      && stocks.length > 0
      && !stocks.some((s) => s.id === activeStockId)
    ) {
      setActiveStockId(GENERAL_STOCK_VIEW);
    }
  }, [stocks, activeStockId]);

  const isGeneralStockView = activeStockId === GENERAL_STOCK_VIEW;
  const resolvedStockId = isGeneralStockView
    ? null
    : activeStockId ?? defaultStock?.id ?? null;

  const getGeneralQuantity = (inventoryId: string) =>
    getGeneralStockQuantity(stockLevels, inventoryId);
  const getGeneralLowCount = (inventoryId: string) =>
    getGeneralLowStockLevelCount(stockLevels, inventoryId);

  // Quantidade do item no estoque selecionado
  const getItemQty = (item: InventoryItem): number =>
    isGeneralStockView
      ? getGeneralQuantity(item.id)
      : resolvedStockId
      ? getQuantityForStock(item.id, resolvedStockId)
      : 0;

  // Mínimo do item no estoque selecionado
  const getItemMinQty = (item: InventoryItem): number | null =>
    resolvedStockId ? getMinQuantityForStock(item.id, resolvedStockId) : null;

  const isLowStockForActiveStock = (item: InventoryItem) => {
    if (isGeneralStockView) return getGeneralLowCount(item.id) > 0;
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
    // Filtro de acesso por local: enquanto carrega, não esconde nada (evita flash).
    const matchesAccessible = isLoadingAccessible ? true : accessibleIds.has(item.id);
    return matchesSearch && matchesCategory && matchesGroup && matchesLowStock && matchesPresence && matchesAccessible;
  });

  // Enriquece cada item com effectiveQty (saldo do local ativo) para que a
  // ordenação pela coluna "Quantidade" bata com o que a coluna exibe.
  const filteredItemsWithEffectiveQty = filteredItems.map((item) => ({
    ...item,
    quantity: getItemQty(item),
  }));
  const { sortedItems, sortConfig, handleSort } = useTableSort(filteredItemsWithEffectiveQty);
  const pagination = useDataPagination(sortedItems);

  // Categorias presentes nos itens (filtro legado)
  const categories = Array.from(
    new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c && c.trim()))),
  ).sort();

  const formatCurrency = (value: number) => formatMoney(value, currency, locale);
  const formatQuantity = (value: number, unit: string | null | undefined) =>
    `${formatNumber(value, locale, { maximumFractionDigits: 4 })} ${unit?.trim() || t.unitFallback}`;

  const requireSpecificStock = () => {
    toast({
      title: generalStockUi.selectTitle,
      description: generalStockUi.selectDescription,
    });
  };

  const handleEdit = (item: InventoryItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isGeneralStockView) {
      requireSpecificStock();
      return;
    }
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
    if (isGeneralStockView) {
      requireSpecificStock();
      return;
    }
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
    if (isGeneralStockView) {
      requireSpecificStock();
      return;
    }
    setEditingItem(null);
    setDialogOpen(true);
  };

  const openConfigurator = (stockId: string) => {
    setConfiguratorStockId(stockId);
    setConfiguratorOpen(true);
  };

  const selectStockContext = (stockId: string) => {
    setActiveStockId(stockId);
    if (isStockCompact) setStockDetailOpen(true);
  };

  const openExport = (format: ExportFormat) => {
    setExportFormat(format);
    setExportOpen(true);
  };

  const handleExportConfirm = async (selected: InventoryItem[]) => {
    const activeStock = stocks.find((s) => s.id === resolvedStockId);
    const rows = selected.map((i) => {
      const qty = isGeneralStockView
        ? getGeneralQuantity(i.id)
        : resolvedStockId
        ? getQuantityForStock(i.id, resolvedStockId)
        : 0;
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
        await generateInventoryExcel({
          title,
          rows,
          locale,
          currency,
          stockName: isGeneralStockView ? generalStockUi.label : activeStock?.name,
          timezone,
        });
      } else {
        await generateInventoryReportPdf({
          company: companySettings,
          whiteLabel: whiteLabelEnabled,
          title,
          rows,
          locale,
          currency,
          stockName: isGeneralStockView ? generalStockUi.label : activeStock?.name,
          timezone,
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

  // Local específico: catálogo presente naquele local. Geral: catálogo que a
  // RPC de acesso autorizou. As quantidades consolidadas abaixo vêm SOMENTE de
  // `stockLevels`, já filtrado por RLS, nunca de `inventory.quantity`.
  const accessibleInventoryItems = items.filter((i) => {
    const accessible = isLoadingAccessible ? true : accessibleIds.has(i.id);
    return accessible;
  });
  const activeStockItems = accessibleInventoryItems.filter((i) => {
    return isGeneralStockView || !resolvedStockId
      ? true
      : getPresenceForStock(i.id, resolvedStockId);
  });
  const activeStatTotalItems = activeStockItems.length;
  const activeStatTotalValue = activeStockItems.reduce((acc, i) => {
    const qty = getItemQty(i);
    return acc + qty * (i.cost_price ?? 0);
  }, 0);
  const activeStatLowStock = activeStockItems.filter(isLowStockForActiveStock).length;
  const generalLowStockCount = accessibleInventoryItems.filter((item) => getGeneralLowCount(item.id) > 0).length;
  const stockNavigationItems = stocks.map((stock) => {
    const stockItems = accessibleInventoryItems.filter((item) => getPresenceForStock(item.id, stock.id));
    const lowStockCount = stockItems.filter((item) => {
      const minimum = getMinQuantityForStock(item.id, stock.id);
      return minimum !== null && getQuantityForStock(item.id, stock.id) < minimum;
    }).length;
    return {
      id: stock.id,
      name: stock.name,
      groupLabel: pdvEnabled
        ? stock.purpose === 'pdv' ? t.stocks.groupStore : t.stocks.groupOperational
        : null,
      purpose: stock.purpose,
      isDefault: stock.is_default === true,
      itemCount: stockItems.length,
      lowStockCount,
    };
  });
  const activeStock = stocks.find((stock) => stock.id === resolvedStockId) ?? null;

  const pluralized = (count: number, singular: string, plural: string) =>
    count === 1 ? singular : plural.replace('{count}', String(count));
  const stockNavigatorLabels = {
    title: generalStockUi.locationsTitle,
    available: (count: number) => pluralized(count, generalStockUi.availableOne, generalStockUi.availableMany),
    consolidated: generalStockUi.consolidated,
    items: (count: number) => pluralized(count, generalStockUi.itemOne, generalStockUi.itemMany),
    lowStock: (count: number) => pluralized(count, generalStockUi.lowOne, generalStockUi.lowMany),
    configure: generalStockUi.configure,
  };

  // O card de KPI mobile (StatCarousel) tem largura fixa (~112px) e imprime o
  // valor em fonte grande sem truncar — "R$ 12.345,67" estoura a pílula. No
  // mobile usamos notação compacta ("R$ 12 mil") só para esse valor; desktop
  // (grid com mais espaço) mantém o formato completo.
  const investedDisplay = isMobile
    ? new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        notation: 'compact',
        maximumFractionDigits: 0,
      }).format(activeStatTotalValue)
    : formatMoney(activeStatTotalValue, currency, locale);

  const statItems = [
    {
      key: 'total',
      label: t.stats.totalItems,
      count: activeStatTotalItems,
      icon: <Boxes className="h-4 w-4" />,
      accentColor: 'hsl(var(--primary))',
    },
    {
      key: 'cost',
      label: t.stats.invested,
      count: activeStatTotalValue,
      displayValue: investedDisplay,
      icon: <DollarSign className="h-4 w-4" />,
      accentColor: 'hsl(var(--info))',
    },
    {
      key: 'low',
      label: t.stats.lowStock,
      count: activeStatLowStock,
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

  // Navegação principal horizontal em todas as larguras. No mobile usamos
  // rótulos curtos para preservar leitura sem comprimir as abas.
  const inventoryTabs = [
    { value: 'estoque', label: t.tabs.current, icon: Boxes },
    { value: 'historico', label: isMobile ? t.tabs.kardexShort : t.tabs.kardex, icon: History },
    { value: 'compras', label: isMobile ? t.tabs.purchasesShort : t.tabs.purchases, icon: ShoppingCart },
    { value: 'inventarios', label: t.tabs.inventories, icon: ClipboardList },
    { value: 'posicao', label: isMobile ? t.tabs.positionShort : t.tabs.position, icon: BarChart3 },
    { value: 'relatorio', label: t.tabs.report, icon: FileSpreadsheet },
  ];

  // Subabas dos depósitos dentro da aba Estoque Atual — mobile renderiza pílulas
  // próprias com flex-wrap (ver bloco isMobile abaixo); desktop usa abas underline.

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
    const lowLocations = isGeneralStockView ? getGeneralLowCount(item.id) : 0;
    if (isGeneralStockView ? lowLocations === 0 : min === null || qty >= min) return null;
    const tooltip = isGeneralStockView
      ? `${lowLocations} ${lowLocations === 1 ? generalStockUi.belowOne : generalStockUi.belowMany}`
      : t.lowStockTooltip
        .replace('{qty}', formatQuantity(qty, item.unit))
        .replace('{min}', formatQuantity(min ?? 0, item.unit));
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0 cursor-help" tabIndex={0} aria-label={tooltip}>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div
      className={cn(
        'space-y-6 min-w-0 w-full max-w-full overflow-x-hidden',
        // FAB (só na aba "estoque") flutua a h-12 (48px) a partir de 96px do
        // fundo — sem folga extra, ele cobre o nome do último material da
        // lista. pb-40 (160px) garante que a última linha fique sempre visível
        // acima do botão.
        isMobile && (activeTab === 'estoque' ? 'pb-40' : 'pb-24'),
      )}
    >
      <MobilePageHeader
        title={t.header.title}
        subtitle={t.header.subtitle}
        icon={Package}
        actions={headerRightButtons}
        compactOnMobile
      />

      <MobilePillTabs
        variant="underline"
        level="screen"
        className="mx-0"
        tabs={inventoryTabs.map((tab) => {
          const Icon = tab.icon;
          return {
            value: tab.value,
            label: tab.label,
            icon: <Icon className="h-4 w-4" />,
          };
        })}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="min-w-0">

        {/* ===================== ABA: ESTOQUE ATUAL ===================== */}
        {activeTab === 'estoque' && (
          <div
            className={cn(
              'grid min-w-0 items-start gap-4',
              stocks.length > 0 && !isStockCompact && 'xl:grid-cols-[17rem_minmax(0,1fr)]',
            )}
          >
            {stocks.length > 0 && (!isStockCompact || !stockDetailOpen) && (
              <StockLocationNavigator
                generalId={GENERAL_STOCK_VIEW}
                generalLabel={generalStockUi.label}
                generalItemCount={accessibleInventoryItems.length}
                generalLowStockCount={generalLowStockCount}
                items={stockNavigationItems}
                selectedId={isGeneralStockView ? GENERAL_STOCK_VIEW : resolvedStockId ?? GENERAL_STOCK_VIEW}
                labels={stockNavigatorLabels}
                onSelect={selectStockContext}
                onConfigure={openConfigurator}
                className={cn(
                  isStockCompact && 'mx-auto w-full max-w-2xl',
                  !isStockCompact && 'sticky top-4',
                )}
              />
            )}

            {(!isStockCompact || stockDetailOpen || stocks.length === 0) && (
              <div className="min-w-0 space-y-4">
                {isStockCompact && stocks.length > 0 && (
                  <div className="flex min-w-0 items-center gap-2 border-b pb-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setStockDetailOpen(false)}
                      className="h-9 shrink-0 gap-1.5 px-2"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      {generalStockUi.backToLocations}
                    </Button>
                    <span className="min-w-0 border-l pl-3 text-sm font-semibold">
                      {isGeneralStockView ? generalStockUi.label : activeStock?.name}
                    </span>
                  </div>
                )}

                <StatCarousel items={statItems} loading={isLoading} variant="saturated" />

            {/* No mobile a busca continua em uma faixa própria para preservar
                alvos de toque. No desktop ela divide o cabeçalho do detalhe. */}
            {isMobile && (
              <MobileListToolbar
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder={t.search.placeholderShort}
                trailing={exportDropdown(true)}
              >
                {hasAnyFilter && (
                  <FilterSheet
                    triggerLabel={t.filters.button}
                    activeCount={activeFilterCount}
                    onClear={clearFilters}
                    triggerClassName="h-10"
                  >
                    {filterContent}
                  </FilterSheet>
                )}
              </MobileListToolbar>
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
                        const belowMin = isLowStockForActiveStock(item);
                        const itemGroup = groups.find((g) => g.id === item.group_id);

                        const itemActions: ItemAction[] = [
                          {
                            key: 'view',
                            label: t.rowActions.view,
                            icon: <Eye className="h-4 w-4" />,
                            onClick: () => handleEdit(item),
                          },
                          ...(!isGeneralStockView
                            ? [
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
                              ]
                            : []),
                          ...(!isGeneralStockView && stocks.length > 1
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
                        subtitleParts.push(formatQuantity(qty, item.unit));
                        if (isGeneralStockView) {
                          const lowLocations = getGeneralLowCount(item.id);
                          if (lowLocations > 0) {
                            subtitleParts.push(
                              `${lowLocations} ${lowLocations === 1 ? generalStockUi.belowOne : generalStockUi.belowMany}`,
                            );
                          }
                        } else if (min !== null) {
                          subtitleParts.push(`${t.minShort} ${formatQuantity(min, item.unit)}`);
                        }

                        return (
                          <MobileListItem
                            key={item.id}
                            onClick={() => handleEdit(item)}
                            actions={itemActions}
                            leading={
                              <InventoryItemThumbnail
                                name={item.name}
                                imageUrl={item.image_url}
                                accentColor={itemGroup?.color}
                              />
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
                <CardHeader className="space-y-0 border-b p-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <CardTitle className="flex min-w-[10rem] max-w-[13rem] flex-1 items-center gap-2 text-xl leading-tight">
                      <Package className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 break-words">
                        {isGeneralStockView ? generalStockUi.label : activeStock?.name ?? t.cardTitle}
                      </span>
                    </CardTitle>
                    <SearchField
                      containerClassName="min-w-[11rem] max-w-[18rem] flex-[1.4]"
                      placeholder={t.search.placeholderShort}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      actions={hasAnyFilter ? (
                        <FilterButton
                          activeCount={activeFilterCount}
                          onClear={clearFilters}
                          embedded
                        >
                          {filterContent}
                        </FilterButton>
                      ) : undefined}
                    />
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      {exportDropdown(true)}
                      <Button
                        className="h-10 gap-2 bg-primary px-3 text-primary-foreground hover:bg-primary/90"
                        onClick={openNewItem}
                      >
                        <Plus className="h-4 w-4" />
                        {t.actions.register}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
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
                              <SortableTableHead
                                sortKey="quantity"
                                sortConfig={sortConfig}
                                onSort={handleSort}
                                className="w-24 min-w-[6rem] whitespace-nowrap px-2 text-right"
                              >
                                {t.table.quantity}
                              </SortableTableHead>
                              <TableHead className="text-right">{t.table.minQty}</TableHead>
                              <SortableTableHead sortKey="cost_price" sortConfig={sortConfig} onSort={handleSort} className="text-right">{t.table.costUnit}</SortableTableHead>
                              <TableHead className="w-[100px]">{t.table.actions}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagination.paginatedItems.map((item) => {
                              const qty = getItemQty(item);
                              const min = getItemMinQty(item);
                              const belowMin = isLowStockForActiveStock(item);
                              const itemGroup = groups.find((g) => g.id === item.group_id);
                              return (
                                <TableRow key={item.id} className={belowMin ? 'bg-destructive/5' : undefined}>
                                  <TableCell className="font-medium">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                      <InventoryItemThumbnail
                                        name={item.name}
                                        imageUrl={item.image_url}
                                        accentColor={itemGroup?.color}
                                        className="h-9 w-9"
                                      />
                                      <div className="flex min-w-0 items-center gap-1.5">
                                        <LowStockIcon item={item} />
                                        <span className="min-w-0 break-words">{item.name}</span>
                                      </div>
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
                                  <TableCell className="w-24 min-w-[6rem] whitespace-nowrap px-2 text-right tabular-nums">
                                    <span className={belowMin ? 'text-destructive font-semibold' : ''}>
                                      {formatNumber(qty, locale, { maximumFractionDigits: 4 })}
                                    </span>
                                    {' '}{item.unit || t.unitFallback}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {isGeneralStockView
                                      ? generalStockUi.perLocation
                                      : min !== null
                                        ? formatQuantity(min, item.unit)
                                        : '-'}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.cost_price ? formatCurrency(item.cost_price) : '-'}
                                  </TableCell>
                                  <TableCell>
                                    <RowActionsMenu
                                      actions={[
                                        ...(!isGeneralStockView
                                          ? [
                                              { label: t.rowActions.edit, icon: Edit, variant: 'edit' as const, onClick: () => handleEdit(item) },
                                              { label: t.rowActions.registerEntrada, icon: TrendingUp, variant: 'default' as const, onClick: () => handleInlineMovement(item, 'entrada') },
                                              { label: t.rowActions.registerSaida, icon: TrendingDown, variant: 'default' as const, onClick: () => handleInlineMovement(item, 'saida') },
                                            ]
                                          : []),
                                        ...(!isGeneralStockView && stocks.length > 1
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
          </div>
        )}

        {/* ===================== ABA: HISTÓRICO (KARDEX) ===================== */}
        {activeTab === 'historico' && <InventoryKardexTab />}

        {/* ===================== ABA: COMPRAS DE MATERIAL ===================== */}
        {activeTab === 'compras' && (
          <MaterialPurchasesTab openNewOnMount={inventoryNavigation?.openNewPurchase === true} />
        )}

        {/* ===================== ABA: INVENTÁRIOS ===================== */}
        {activeTab === 'inventarios' && <InventoryCountsTab />}

        {/* ===================== ABA: POSIÇÃO DE ESTOQUE ===================== */}
        {activeTab === 'posicao' && <StockPositionTab />}

        {/* ===================== ABA: RELATÓRIOS (COMPRAS + CURVA ABC) ===================== */}
        {activeTab === 'relatorio' && <InventoryReportsTab />}
      </div>

      {/* FAB mobile-only (só na aba de estoque) */}
      {isMobile && activeTab === 'estoque' && (stocks.length === 0 || stockDetailOpen) && (
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
        items={activeStockItems}
        onConfirm={handleExportConfirm}
        activeStockId={isGeneralStockView ? GENERAL_STOCK_VIEW : resolvedStockId}
        getQuantityForStock={(inventoryId, stockId) =>
          stockId === GENERAL_STOCK_VIEW
            ? getGeneralQuantity(inventoryId)
            : getQuantityForStock(inventoryId, stockId)
        }
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
