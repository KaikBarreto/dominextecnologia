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
  Boxes,
  Eye,
  FileDown,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  History,
  ShoppingCart,
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
import { useInventory, type InventoryItem } from '@/hooks/useInventory';
import { InventoryFormDialog } from '@/components/inventory/InventoryFormDialog';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
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

export default function Inventory() {
  const isMobile = useIsMobile();
  const { items, isLoading, stats, deleteItem } = useInventory();
  const { settings: companySettings } = useCompanySettings();
  const { enabled: whiteLabelEnabled } = useWhiteLabel();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('estoque');

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      fuzzyIncludes(item.name, searchQuery) ||
      fuzzyIncludes(item.sku, searchQuery) ||
      fuzzyIncludes(item.category, searchQuery);
    const matchesCategory =
      categoryFilter.length === 0 || categoryFilter.includes(item.category || '');
    return matchesSearch && matchesCategory;
  });

  const { sortedItems, sortConfig, handleSort } = useTableSort(filteredItems);
  const pagination = useDataPagination(sortedItems);

  // Lista única de categorias presentes nos itens (para o filtro).
  const categories = Array.from(
    new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c && c.trim()))),
  ).sort();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
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
    const rows = selected.map((i) => ({
      name: i.name,
      sku: i.sku ?? null,
      category: i.category ?? null,
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
      cost_price: i.cost_price ?? null,
      sale_price: i.sale_price ?? null,
    }));
    const title = 'Relatório de Estoque';
    try {
      if (exportFormat === 'excel') {
        await generateInventoryExcel({ title, rows });
      } else {
        await generateInventoryReportPdf({
          company: companySettings,
          whiteLabel: whiteLabelEnabled,
          title,
          rows,
        });
      }
    } catch (err) {
      console.error('Falha ao exportar estoque:', err);
      toast({
        variant: 'destructive',
        title: 'Erro ao exportar',
        description: 'Não foi possível gerar o arquivo. Tente novamente.',
      });
    }
  };

  // Botão Exportar com dropdown PDF/Excel (reusado no header desktop e na
  // linha de busca mobile). Visual espelha o das Movimentações.
  const exportDropdown = (compact = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" aria-label="Exportar estoque">
            <FileDown className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-1 min-h-11 rounded-xl">
            <FileDown className="h-4 w-4" /> Exportar <ChevronDown className="h-3.5 w-3.5 opacity-60" />
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

  const isLowStock = (item: InventoryItem) =>
    item.quantity !== null &&
    item.min_quantity !== null &&
    item.quantity <= item.min_quantity;

  // ------------------------------------------------------------------------
  // Stat items pro StatCarousel.
  // - Total e Baixo Estoque são contadores inteiros (natural pro carrossel).
  // - Valor Investido e Projeção de Venda são monetários: convertidos para
  //   inteiro arredondado (StatCarousel só aceita number). O label deixa
  //   "(R$)" explícito pra não soar como contagem.
  // ------------------------------------------------------------------------
  const statItems = [
    {
      key: 'total',
      label: 'Total de itens',
      count: stats.totalItems,
      icon: <Boxes className="h-4 w-4" />,
      accentColor: 'hsl(var(--primary))',
    },
    {
      key: 'cost',
      label: 'Valor investido (R$)',
      count: Math.round(stats.totalValue),
      icon: <DollarSign className="h-4 w-4" />,
      accentColor: 'hsl(var(--info))',
    },
    {
      key: 'sale',
      label: 'Projeção venda (R$)',
      count: Math.round(stats.totalSaleValue),
      icon: <TrendingUp className="h-4 w-4" />,
      accentColor: 'hsl(var(--success))',
    },
    {
      key: 'low',
      label: 'Estoque baixo',
      count: stats.lowStockItems,
      icon: <AlertTriangle className="h-4 w-4" />,
      accentColor: 'hsl(var(--warning))',
    },
  ];

  // Conteúdo do FilterSheet (mobile) — só mostra se há categorias cadastradas.
  const activeFilterCount =
    (searchQuery ? 1 : 0) + (categoryFilter.length > 0 ? 1 : 0);

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter([]);
  };

  const categoryFilterContent = (
    <FilterCheckboxGroup
      label="Categoria"
      options={categories.map((cat) => ({ value: cat, label: cat }))}
      selected={categoryFilter}
      onChange={setCategoryFilter}
      emptyLabel="Todas as categorias"
    />
  );

  // Abas: desktop = sidebar vertical (SettingsSidebarLayout); mobile = pills em
  // carrossel (o próprio layout faz a adaptação). As 3 são chãs (sem group).
  const inventoryTabs: SettingsTab[] = [
    { value: 'estoque', label: 'Estoque Atual', icon: Boxes },
    { value: 'historico', label: 'Histórico de Materiais (Kardex)', icon: History },
    { value: 'compras', label: 'Compras de Material', icon: ShoppingCart },
  ];

  return (
    <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
      <MobilePageHeader
        title="Estoque"
        subtitle="Controle de peças e materiais"
        icon={Package}
        actions={undefined}
      />

      {/* Abas: Estoque Atual / Histórico (Kardex) / Compras de Material.
          Padrão do app: desktop = sidebar vertical à esquerda; mobile = pills
          em carrossel. O SettingsSidebarLayout cuida das duas adaptações. */}
      <SettingsSidebarLayout
        tabs={inventoryTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {/* Título da aba ativa, no topo do conteúdo (cada aba tem seu título). */}
        <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-4">
          {inventoryTabs.find((t) => t.value === activeTab)?.label}
        </h2>

        {/* ===================== ABA: ESTOQUE ATUAL ===================== */}
        {activeTab === 'estoque' && (
        <div className="space-y-6">
      {/* Stats — StatCarousel adapta mobile (chips horizontais) vs desktop (grid). */}
      <StatCarousel items={statItems} loading={isLoading} />

      {/* Busca fixa no topo + filtro de categoria (sheet no mobile, inline desktop). */}
      {isMobile ? (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar material..."
              className="pl-10 h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {categories.length > 0 && (
            <FilterSheet
              triggerLabel="Filtros"
              activeCount={activeFilterCount}
              onClear={clearFilters}
            >
              {categoryFilterContent}
            </FilterSheet>
          )}
          {exportDropdown(true)}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, código ou categoria..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {categories.length > 0 && (
              <FilterButton
                activeCount={categoryFilter.length > 0 ? 1 : 0}
                onClear={() => setCategoryFilter([])}
              >
                {categoryFilterContent}
              </FilterButton>
            )}
            {exportDropdown()}
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
              onClick={openNewItem}
            >
              <Plus className="h-4 w-4" />
              Cadastrar Material
            </Button>
          </div>
        </div>
      )}

      {/* Lista */}
      {isMobile ? (
        // ---------------------------------------------------------------
        // Mobile: lista nativa MobileListItem (sem Card wrapper).
        // ---------------------------------------------------------------
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
                searchQuery || categoryFilter.length > 0
                  ? 'Nenhum item encontrado'
                  : 'Estoque vazio'
              }
              description={
                searchQuery || categoryFilter.length > 0
                  ? 'Tente uma busca ou filtro diferente'
                  : 'Toque em "Cadastrar Material" para adicionar peças ao estoque'
              }
            />
          ) : (
            <>
              <div className="rounded-xl border bg-card overflow-hidden">
                {pagination.paginatedItems.map((item) => {
                  const itemActions: ItemAction[] = [
                    {
                      key: 'view',
                      label: 'Visualizar',
                      icon: <Eye className="h-4 w-4" />,
                      onClick: () => handleEdit(item),
                    },
                    {
                      key: 'edit',
                      label: 'Editar',
                      icon: <Edit className="h-4 w-4" />,
                      variant: 'edit' as const,
                      onClick: () => handleEdit(item),
                    },
                    {
                      key: 'delete',
                      label: 'Excluir',
                      icon: <Trash2 className="h-4 w-4" />,
                      variant: 'destructive' as const,
                      onClick: () => handleDeleteClick(item),
                    },
                  ];

                  const subtitleParts: string[] = [];
                  if (item.category) subtitleParts.push(item.category);
                  subtitleParts.push(`${item.quantity ?? 0} ${item.unit || 'un'}`);
                  if (item.min_quantity !== null && item.min_quantity !== undefined) {
                    subtitleParts.push(`mín ${item.min_quantity}`);
                  }

                  return (
                    <MobileListItem
                      key={item.id}
                      onClick={() => handleEdit(item)}
                      actions={itemActions}
                      leading={
                        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                          <Package className="h-5 w-5" />
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
                        </div>
                      }
                      subtitle={subtitleParts.join(' • ')}
                      trailing={
                        isLowStock(item) ? (
                          <Badge
                            variant="warning"
                            className="text-[10px] px-2 py-0.5 whitespace-nowrap"
                          >
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Baixo
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
        // ---------------------------------------------------------------
        // Desktop: tabela original dentro do Card — 100% como estava.
        // ---------------------------------------------------------------
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Itens do Estoque
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
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-medium">
                  {searchQuery || categoryFilter.length > 0
                    ? 'Nenhum item encontrado'
                    : 'Estoque vazio'}
                </h3>
                <p className="text-muted-foreground">
                  {searchQuery || categoryFilter.length > 0
                    ? 'Tente buscar por outro termo'
                    : 'Clique em "Cadastrar Material" para adicionar peças ao estoque'}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>Nome</SortableTableHead>
                        <SortableTableHead sortKey="sku" sortConfig={sortConfig} onSort={handleSort}>SKU</SortableTableHead>
                        <SortableTableHead sortKey="category" sortConfig={sortConfig} onSort={handleSort}>Categoria</SortableTableHead>
                        <SortableTableHead sortKey="quantity" sortConfig={sortConfig} onSort={handleSort} className="text-right">Quantidade</SortableTableHead>
                        <SortableTableHead sortKey="cost_price" sortConfig={sortConfig} onSort={handleSort} className="text-right">Custo Unit.</SortableTableHead>
                        <SortableTableHead sortKey="sale_price" sortConfig={sortConfig} onSort={handleSort} className="text-right">Venda Unit.</SortableTableHead>
                        <TableHead className="w-[100px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagination.paginatedItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {item.name}
                              {isLowStock(item) && (
                                <Badge variant="warning">
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  Baixo
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.sku || '-'}</TableCell>
                          <TableCell>
                            {item.category && (
                              <Badge variant="secondary">{item.category}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.quantity || 0} {item.unit}
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
                                { label: 'Editar', icon: Edit, variant: 'edit', onClick: () => handleEdit(item) },
                                { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => handleDeleteClick(item) },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
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
      </SettingsSidebarLayout>

      {/* FAB mobile-only (só na aba de estoque) — desktop usa botão no header. */}
      {isMobile && activeTab === 'estoque' && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label="Material"
          onClick={openNewItem}
        />
      )}

      {/* Form Dialog */}
      <InventoryFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        item={editingItem}
      />

      {/* Seleção de materiais p/ exportar (PDF ou Excel). Fonte = estoque completo. */}
      <InventoryExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        format={exportFormat}
        items={items}
        onConfirm={handleExportConfirm}
      />

      {/* Confirmação de exclusão — substitui o confirm() nativo. */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir material</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o material "{itemToDelete?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
