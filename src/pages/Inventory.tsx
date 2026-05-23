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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

export default function Inventory() {
  const isMobile = useIsMobile();
  const { items, isLoading, stats, deleteItem } = useInventory();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);

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

  return (
    <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
      <MobilePageHeader
        title="Estoque"
        subtitle="Controle de peças e materiais"
        icon={Package}
        actions={
          isMobile ? undefined : (
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
              onClick={openNewItem}
            >
              <Plus className="h-4 w-4" />
              Cadastrar Material
            </Button>
          )
        }
      />

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
          {categories.length > 0 && (
            <FilterButton
              activeCount={categoryFilter.length > 0 ? 1 : 0}
              onClear={() => setCategoryFilter([])}
            >
              {categoryFilterContent}
            </FilterButton>
          )}
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
                            <div className="flex items-center gap-1">
                              <Button
                                variant="edit-ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => handleEdit(item, e)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive-ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => handleDeleteClick(item, e)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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

      {/* FAB mobile-only — desktop usa botão inline no header. */}
      {isMobile && (
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
