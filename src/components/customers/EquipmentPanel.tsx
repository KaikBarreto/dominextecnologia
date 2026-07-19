import { useMemo, useState } from 'react';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Package, Search, Settings } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useEquipment, type EquipmentInput } from '@/hooks/useEquipment';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { EquipmentFormDialog } from './EquipmentFormDialog';
import { EquipmentFieldConfigDialog } from './EquipmentFieldConfigDialog';
import { useDataPagination } from '@/hooks/useDataPagination';
import { getErrorMessage } from '@/utils/errorMessages';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import type { Equipment } from '@/types/database';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FABButton } from '@/components/mobile/FABButton';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { StatCarousel, type StatCarouselItem } from '@/components/mobile/StatCarousel';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { FilterButton } from '@/components/ui/FilterButton';
import { ViewModeToggle } from '@/components/ui/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface EquipmentGridCardProps {
  eq: Equipment & { customer?: any };
  categoryName?: string | null;
  categoryColor?: string;
  isMobile: boolean;
  canManage: boolean;
  onOpen: () => void;
  onEdit: (e?: React.MouseEvent) => void;
  onDelete: (e?: React.MouseEvent) => void;
}

function EquipmentGridCard({
  eq, categoryName, categoryColor, isMobile, canManage, onOpen, onEdit, onDelete,
}: EquipmentGridCardProps) {
  const customerName = eq.customer?.name;
  const { locale } = useAppLocaleContext();
  const tEqCard = MESSAGES[locale].app.equipment;
  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md active:scale-[0.99]"
      onClick={onOpen}
    >
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {(eq as any).photo_url ? (
            <img src={(eq as any).photo_url} alt={eq.name} className="h-14 w-14 rounded-lg object-cover shrink-0" />
          ) : (
            <div
              className="h-14 w-14 rounded-lg flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: categoryColor || 'hsl(var(--muted))' }}
            >
              <Package className={cn('h-6 w-6', !categoryColor && 'text-muted-foreground')} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">
              {eq.name}
              {eq.model && <span className="text-muted-foreground font-normal"> · {eq.model}</span>}
            </p>
            {customerName && <p className="text-xs text-muted-foreground truncate">{customerName}</p>}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          {categoryName ? (
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColor }} />
              {categoryName}
            </Badge>
          ) : <span />}
          {!isMobile && canManage && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-warning" onClick={(e) => onEdit(e)} title={tEqCard.edit}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => onDelete(e)} title={tEqCard.delete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function EquipmentPanel() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { isAdminOrGestor, hasPermission } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  // Multi-select. Vazio = todas/todos (filtro inativo).
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<(Equipment & { customer?: any }) | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [equipmentToDelete, setEquipmentToDelete] = useState<Equipment | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [viewMode, setViewMode] = useViewMode('equipment-view-mode');

  const canManageEquipment = isAdminOrGestor() || hasPermission('fn:manage_equipment');
  const { locale } = useAppLocaleContext();
  const tEq = MESSAGES[locale].app.equipment;
  const tCustDetail = MESSAGES[locale].app.customers.detail;

  const { equipment, isLoading, isError, refetch, createEquipment } = useEquipment();
  const { customers } = useCustomers();
  const { categories } = useEquipmentCategories();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredEquipment = equipment.filter((eq) => {
    const matchesSearch =
      fuzzyIncludes(eq.name, searchTerm) ||
      fuzzyIncludes(eq.identifier, searchTerm) ||
      fuzzyIncludes(eq.brand, searchTerm) ||
      fuzzyIncludes(eq.model, searchTerm) ||
      fuzzyIncludes(eq.customer?.name, searchTerm);
    const matchesCategory =
      categoryFilter.length === 0 || (eq.category_id && categoryFilter.includes(eq.category_id));
    const matchesCustomer =
      customerFilter.length === 0 || (eq.customer_id && customerFilter.includes(eq.customer_id));
    return matchesSearch && matchesCategory && matchesCustomer;
  });

  // Pré-calcula campos derivados pra sort estável em colunas que dependem de
  // lookup (nome da categoria, nome do cliente). Sem isto, ordenar por
  // `category_id` ordenaria por UUID — inútil pro usuário.
  const sortableEquipment = useMemo(
    () =>
      filteredEquipment.map((eq) => ({
        ...eq,
        _category_name_sort: categories.find((c) => c.id === eq.category_id)?.name?.toLowerCase() ?? '',
        _customer_name_sort: eq.customer?.name?.toLowerCase() ?? '',
      })),
    [filteredEquipment, categories],
  );

  const { sortedItems, sortConfig, handleSort } = useTableSort(sortableEquipment);
  const pagination = useDataPagination(sortedItems);

  const handleSubmit = async (data: EquipmentInput) => {
    if (editingEquipment) {
      const { error } = await supabase.from('equipment').update(data).eq('id', editingEquipment.id);
      if (error) {
        toast({ variant: 'destructive', title: tCustDetail.equipUpdateError, description: getErrorMessage(error) });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      toast({ title: tCustDetail.equipUpdated });
    } else {
      await createEquipment.mutateAsync(data);
    }
    setEditingEquipment(null);
  };

  const handleDelete = async () => {
    if (equipmentToDelete) {
      const { error } = await supabase.from('equipment').delete().eq('id', equipmentToDelete.id);
      if (error) {
        toast({ variant: 'destructive', title: tCustDetail.equipDeleteError, description: getErrorMessage(error) });
      } else {
        queryClient.invalidateQueries({ queryKey: ['equipment'] });
        toast({ title: tCustDetail.equipDeleted });
      }
      setEquipmentToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return null;
    return categories.find(c => c.id === categoryId)?.name;
  };

  const getCategoryColor = (categoryId?: string) => {
    if (!categoryId) return undefined;
    return categories.find(c => c.id === categoryId)?.color;
  };

  // Unique customers that have equipment.
  const customersWithEquipment = customers.filter(c => equipment.some(eq => eq.customer_id === c.id));

  const openNewEquipment = () => { setEditingEquipment(null); setFormOpen(true); };
  const handleEdit = (eq: Equipment & { customer?: any }, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingEquipment(eq);
    setFormOpen(true);
  };
  const handleDeleteClick = (eq: Equipment, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEquipmentToDelete(eq);
    setDeleteDialogOpen(true);
  };
  const clearFilters = () => {
    setCategoryFilter([]);
    setCustomerFilter([]);
  };

  const activeFilterCount =
    (categoryFilter.length > 0 ? 1 : 0) + (customerFilter.length > 0 ? 1 : 0);

  // Stats por categoria — só renderiza no mobile e se houver categorias.
  const statItems: StatCarouselItem[] = categories.map((cat) => {
    const count = equipment.filter((eq) => eq.category_id === cat.id).length;
    const isActive = categoryFilter.includes(cat.id);
    return {
      key: cat.id,
      label: cat.name,
      count,
      icon: <Package className="h-4 w-4" />,
      accentColor: cat.color,
      active: isActive,
      onClick: () =>
        setCategoryFilter(
          isActive
            ? categoryFilter.filter((id) => id !== cat.id)
            : [...categoryFilter, cat.id],
        ),
    };
  });

  // Conteúdo dos filtros — multi-select com checkboxes.
  // Vazio = filtro inativo (todas categorias / todos clientes).
  const filterContent = (
    <div className="space-y-4">
      <FilterCheckboxGroup
        label={tEq.filterCategory}
        options={categories.map((cat) => ({
          value: cat.id,
          label: cat.name,
          color: cat.color,
        }))}
        selected={categoryFilter}
        onChange={setCategoryFilter}
        emptyLabel={tEq.filterAllCategories}
      />
      <FilterCheckboxGroup
        label={tEq.filterCustomer}
        options={customersWithEquipment.map((c) => ({ value: c.id, label: c.name }))}
        selected={customerFilter}
        onChange={setCustomerFilter}
        emptyLabel={tEq.filterAllCustomers}
      />
    </div>
  );

  return (
    <div className={cn('space-y-6', isMobile && 'pb-24 space-y-4')}>
      {/* Toolbar de busca + filtros + actions (varia por viewport). */}
      {isMobile ? (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={tEq.searchPlaceholderMobile}
                className="pl-10 h-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <FilterSheet
              triggerLabel={tEq.filterLabel}
              activeCount={activeFilterCount}
              onClear={clearFilters}
            >
              {filterContent}
            </FilterSheet>
            {canManageEquipment && (
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0 text-warning"
                onClick={() => setConfigOpen(true)}
                title={tEq.configureFields}
                aria-label={tEq.configureFields}
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>

          {/* StatCarousel só faz sentido se houver categorias cadastradas. */}
          {categories.length > 0 && (
            <StatCarousel items={statItems} loading={isLoading} />
          )}
        </>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={tEq.searchPlaceholder}
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <FilterButton activeCount={activeFilterCount} onClear={clearFilters}>
              {filterContent}
            </FilterButton>
            <ViewModeToggle value={viewMode} onChange={setViewMode} showLabels />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => setConfigOpen(true)}
              title={tEq.configureFields}
              size="sm"
              className="bg-gradient-to-r from-gray-700 to-gray-900 text-white hover:from-gray-800 hover:to-gray-950"
            >
              <Settings className="h-4 w-4 mr-2" />
              {tEq.configureFields}
            </Button>
            {canManageEquipment && (
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openNewEquipment}>
                <Plus className="h-4 w-4 mr-2" />
                {tEq.newEquipment}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Visualização — grade (cards) ou lista. Lista: mobile nativa / desktop tabela. */}
      {viewMode === 'grid' ? (
        isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
          </div>
        ) : isError ? (
          <EmptyState
            icon={<Package className="h-12 w-12 text-destructive" />}
            title={tEq.loadError}
            description={tEq.loadErrorDesc}
            action={{ label: tEq.retry, onClick: () => refetch() }}
          />
        ) : filteredEquipment.length === 0 ? (
          <EmptyState
            icon={<Package className="h-12 w-12" />}
            title={searchTerm || categoryFilter.length > 0 || customerFilter.length > 0 ? tEq.emptySearch : tEq.emptyNone}
            description={searchTerm || categoryFilter.length > 0 || customerFilter.length > 0 ? tEq.emptySearchDesc : tEq.emptyNoneDescAdd}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pagination.paginatedItems.map((eq) => (
                <EquipmentGridCard
                  key={eq.id}
                  eq={eq}
                  categoryName={getCategoryName(eq.category_id)}
                  categoryColor={getCategoryColor(eq.category_id)}
                  isMobile={isMobile}
                  canManage={canManageEquipment}
                  onOpen={() => navigate(`/equipamentos/${eq.id}`)}
                  onEdit={(e) => handleEdit(eq, e)}
                  onDelete={(e) => handleDeleteClick(eq, e)}
                />
              ))}
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
        )
      ) : isMobile ? (
        isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : isError ? (
          <EmptyState
            icon={<Package className="h-12 w-12 text-destructive" />}
            title={tEq.loadError}
            description={tEq.loadErrorDesc}
            action={{ label: tEq.retry, onClick: () => refetch() }}
          />
        ) : filteredEquipment.length === 0 ? (
          <EmptyState
            icon={<Package className="h-12 w-12" />}
            title={searchTerm || categoryFilter.length > 0 || customerFilter.length > 0 ? tEq.emptySearch : tEq.emptyNone}
            description={searchTerm || categoryFilter.length > 0 || customerFilter.length > 0 ? tEq.emptySearchDesc : tEq.emptyNoneDescTapMobile}
          />
        ) : (
          <>
            <div className="rounded-xl border bg-card overflow-hidden">
              {pagination.paginatedItems.map((eq) => {
                const itemActions: ItemAction[] = [
                  ...(canManageEquipment
                    ? [
                        {
                          key: 'edit',
                          label: tEq.edit,
                          icon: <Pencil className="h-4 w-4" />,
                          variant: 'edit' as const,
                          onClick: () => handleEdit(eq),
                        },
                        {
                          key: 'delete',
                          label: tEq.delete,
                          icon: <Trash2 className="h-4 w-4" />,
                          variant: 'destructive' as const,
                          onClick: () => handleDeleteClick(eq),
                        },
                      ]
                    : []),
                ];

                const categoryColor = getCategoryColor(eq.category_id);
                const categoryName = getCategoryName(eq.category_id);
                const customerName = eq.customer?.name;

                return (
                  <MobileListItem
                    key={eq.id}
                    onClick={() => navigate(`/equipamentos/${eq.id}`)}
                    actions={itemActions.length > 0 ? itemActions : undefined}
                    leading={
                      eq.photo_url ? (
                        <img
                          src={eq.photo_url}
                          alt={eq.name}
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: categoryColor || 'hsl(var(--muted))' }}
                        >
                          <Package className={cn('h-5 w-5', !categoryColor && 'text-muted-foreground')} />
                        </div>
                      )
                    }
                    title={
                      <span className="truncate">
                        {eq.name}
                        {eq.model && <span className="text-muted-foreground font-normal"> · {eq.model}</span>}
                      </span>
                    }
                    subtitle={
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        {categoryName && (
                          <span className="inline-flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColor }} />
                            {categoryName}
                          </span>
                        )}
                        {categoryName && customerName && <span className="text-muted-foreground/50">•</span>}
                        {customerName && <span className="truncate">{customerName}</span>}
                        {!categoryName && !customerName && (eq.identifier || '—')}
                      </span>
                    }
                    trailing={
                      eq.status ? (
                        <Badge
                          variant={eq.status === 'active' ? 'default' : 'secondary'}
                          className="text-[10px] px-2 py-0.5"
                        >
                          {eq.status === 'active' ? tEq.statusActive : tEq.statusInactive}
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
        )
      ) : (
        <div>
          <h2 className="text-base font-bold uppercase tracking-widest text-foreground/70 mb-4">
            {tEq.listHeading}
          </h2>
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-4 p-6">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : isError ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Package className="mb-4 h-12 w-12 text-destructive" />
                  <h3 className="text-lg font-medium">{tEq.loadError}</h3>
                  <p className="text-muted-foreground mb-4">{tEq.loadErrorDesc}</p>
                  <Button variant="outline" onClick={() => refetch()}>{tEq.retry}</Button>
                </div>
              ) : filteredEquipment.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Package className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="text-lg font-medium">
                    {searchTerm || categoryFilter.length > 0 || customerFilter.length > 0 ? tEq.emptySearch : tEq.emptyNone}
                  </h3>
                  <p className="text-muted-foreground">
                    {searchTerm || categoryFilter.length > 0 || customerFilter.length > 0 ? tEq.emptySearchDesc : tEq.emptyNoneDescClick}
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px] text-xs uppercase tracking-wider">{tEq.colPhoto}</TableHead>
                          <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>{tEq.colName}</SortableTableHead>
                          <SortableTableHead sortKey="location" sortConfig={sortConfig} onSort={handleSort} className="hidden sm:table-cell">{tEq.colLocation}</SortableTableHead>
                          <SortableTableHead sortKey="_customer_name_sort" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell">{tEq.colCustomer}</SortableTableHead>
                          <SortableTableHead sortKey="_category_name_sort" sortConfig={sortConfig} onSort={handleSort} className="hidden lg:table-cell">{tEq.colCategory}</SortableTableHead>
                          <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort} className="hidden lg:table-cell">{tEq.colStatus}</SortableTableHead>
                          <TableHead className="w-[100px] text-xs uppercase tracking-wider">{tEq.colActions}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagination.paginatedItems.map((eq) => (
                          <TableRow key={eq.id} className="cursor-pointer" onClick={() => navigate(`/equipamentos/${eq.id}`)}>
                            <TableCell>
                              {(eq as any).photo_url ? (
                                <img src={(eq as any).photo_url} alt={eq.name} className="h-10 w-10 rounded object-cover" />
                              ) : (
                                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{eq.name}</p>
                                {eq.identifier && (
                                  <p className="text-xs text-muted-foreground font-mono">{eq.identifier}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <span className="text-sm">{(eq as any).location || '-'}</span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {eq.customer?.name || '-'}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {getCategoryName((eq as any).category_id) || '-'}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <Badge variant={(eq as any).status === 'active' ? 'default' : 'secondary'}>
                                {(eq as any).status === 'active' ? tEq.statusActive : tEq.statusInactive}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div onClick={(e) => e.stopPropagation()}>
                                {canManageEquipment && (
                                  <RowActionsMenu
                                    actions={[
                                      { label: tEq.edit, icon: Pencil, variant: 'edit', onClick: () => handleEdit(eq) },
                                      { label: tEq.delete, icon: Trash2, variant: 'delete', onClick: () => handleDeleteClick(eq) },
                                    ]}
                                  />
                                )}
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
        </div>
      )}

      {/* FAB mobile — Novo Equipamento. */}
      {isMobile && canManageEquipment && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={tEq.newEquipmentShort}
          onClick={openNewEquipment}
        />
      )}

      <EquipmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        equipment={editingEquipment}
        onSubmit={handleSubmit}
        customers={customers}
        categories={categories}
        isLoading={createEquipment.isPending}
        equipmentCount={equipment.length}
      />

      <EquipmentFieldConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tEq.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {tEq.deleteConfirm.replace('{name}', equipmentToDelete?.name ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tEq.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tEq.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
