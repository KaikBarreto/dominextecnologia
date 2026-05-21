import { useState } from 'react';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Package, Search, Settings } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useEquipment, type EquipmentInput } from '@/hooks/useEquipment';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { EquipmentFormDialog } from './EquipmentFormDialog';
import { EquipmentFieldConfigDialog } from './EquipmentFieldConfigDialog';
import { useDataPagination } from '@/hooks/useDataPagination';
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

export function EquipmentPanel() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { isAdminOrGestor, hasPermission } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<(Equipment & { customer?: any }) | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [equipmentToDelete, setEquipmentToDelete] = useState<Equipment | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const canManageEquipment = isAdminOrGestor() || hasPermission('fn:manage_equipment');

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
    const matchesCategory = categoryFilter === 'all' || eq.category_id === categoryFilter;
    const matchesCustomer = customerFilter === 'all' || eq.customer_id === customerFilter;
    return matchesSearch && matchesCategory && matchesCustomer;
  });

  const { sortedItems, sortConfig, handleSort } = useTableSort(filteredEquipment);
  const pagination = useDataPagination(sortedItems);

  const handleSubmit = async (data: EquipmentInput) => {
    if (editingEquipment) {
      const { error } = await supabase.from('equipment').update(data).eq('id', editingEquipment.id);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao atualizar', description: error.message });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      toast({ title: 'Equipamento atualizado!' });
    } else {
      await createEquipment.mutateAsync(data);
    }
    setEditingEquipment(null);
  };

  const handleDelete = async () => {
    if (equipmentToDelete) {
      const { error } = await supabase.from('equipment').delete().eq('id', equipmentToDelete.id);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message });
      } else {
        queryClient.invalidateQueries({ queryKey: ['equipment'] });
        toast({ title: 'Equipamento excluído!' });
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
    setCategoryFilter('all');
    setCustomerFilter('all');
  };

  const activeFilterCount =
    (categoryFilter !== 'all' ? 1 : 0) + (customerFilter !== 'all' ? 1 : 0);

  // Stats por categoria — só renderiza no mobile e se houver categorias.
  const statItems: StatCarouselItem[] = categories.map((cat) => {
    const count = equipment.filter((eq) => eq.category_id === cat.id).length;
    return {
      key: cat.id,
      label: cat.name,
      count,
      icon: <Package className="h-4 w-4" />,
      accentColor: cat.color,
      active: categoryFilter === cat.id,
      onClick: () => setCategoryFilter(categoryFilter === cat.id ? 'all' : cat.id),
    };
  });

  // Conteúdo dos filtros — usado inline no desktop e dentro do FilterSheet no mobile.
  const filterContent = (
    <div className={cn(isMobile ? 'space-y-4' : 'grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3')}>
      <div className={isMobile ? '' : ''}>
        {isMobile && <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Categoria</label>}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className={isMobile ? 'w-full' : 'sm:w-[180px]'}>
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={isMobile ? '' : 'sm:w-[200px]'}>
        {isMobile && <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cliente</label>}
        <SearchableSelect
          options={[
            { value: 'all', label: 'Todos clientes' },
            ...customersWithEquipment.map(c => ({ value: c.id, label: c.name })),
          ]}
          value={customerFilter}
          onValueChange={setCustomerFilter}
          placeholder="Cliente"
          searchPlaceholder="Buscar cliente..."
        />
      </div>
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
                placeholder="Buscar equipamentos..."
                className="pl-10 h-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <FilterSheet
              triggerLabel="Filtros"
              activeCount={activeFilterCount}
              onClear={clearFilters}
            >
              {filterContent}
            </FilterSheet>
          </div>

          {/* StatCarousel só faz sentido se houver categorias cadastradas. */}
          {categories.length > 0 && (
            <StatCarousel items={statItems} loading={isLoading} />
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, identificador, marca ou cliente..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => setConfigOpen(true)}
                title="Configurar campos"
                size="sm"
                className="bg-gradient-to-r from-gray-700 to-gray-900 text-white hover:from-gray-800 hover:to-gray-950"
              >
                <Settings className="h-4 w-4 mr-2" />
                Configurar Campos
              </Button>
              {canManageEquipment && (
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openNewEquipment}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Equipamento
                </Button>
              )}
            </div>
          </div>

          {filterContent}
        </>
      )}

      {/* Lista — mobile: nativa via MobileListItem. Desktop: tabela em Card. */}
      {isMobile ? (
        isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : isError ? (
          <EmptyState
            icon={<Package className="h-12 w-12 text-destructive" />}
            title="Erro ao carregar equipamentos"
            description="Não foi possível conectar ao servidor. Tente novamente."
            action={{ label: 'Tentar novamente', onClick: () => refetch() }}
          />
        ) : filteredEquipment.length === 0 ? (
          <EmptyState
            icon={<Package className="h-12 w-12" />}
            title={searchTerm || categoryFilter !== 'all' || customerFilter !== 'all' ? 'Nenhum equipamento encontrado' : 'Nenhum equipamento cadastrado'}
            description={searchTerm || categoryFilter !== 'all' || customerFilter !== 'all' ? 'Tente filtros diferentes' : 'Toque em "Novo Equipamento" para começar'}
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
                          label: 'Editar',
                          icon: <Pencil className="h-4 w-4" />,
                          variant: 'edit' as const,
                          onClick: () => handleEdit(eq),
                        },
                        {
                          key: 'delete',
                          label: 'Excluir',
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
                          {eq.status === 'active' ? 'Ativo' : 'Inativo'}
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
            Lista de Equipamentos
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
                  <h3 className="text-lg font-medium">Erro ao carregar equipamentos</h3>
                  <p className="text-muted-foreground mb-4">
                    Não foi possível conectar ao servidor. Tente novamente.
                  </p>
                  <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
                </div>
              ) : filteredEquipment.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Package className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="text-lg font-medium">
                    {searchTerm || categoryFilter !== 'all' || customerFilter !== 'all' ? 'Nenhum equipamento encontrado' : 'Nenhum equipamento cadastrado'}
                  </h3>
                  <p className="text-muted-foreground">
                    {searchTerm || categoryFilter !== 'all' || customerFilter !== 'all' ? 'Tente filtros diferentes' : 'Clique em "Novo Equipamento" para começar'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px] text-xs uppercase tracking-wider">Foto</TableHead>
                          <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>Nome</SortableTableHead>
                          <SortableTableHead sortKey="location" sortConfig={sortConfig} onSort={handleSort} className="hidden sm:table-cell">Local</SortableTableHead>
                          <SortableTableHead sortKey="customer.name" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell">Cliente</SortableTableHead>
                          <SortableTableHead sortKey="category_id" sortConfig={sortConfig} onSort={handleSort} className="hidden lg:table-cell">Categoria</SortableTableHead>
                          <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort} className="hidden lg:table-cell">Status</SortableTableHead>
                          <TableHead className="w-[100px] text-xs uppercase tracking-wider">Ações</TableHead>
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
                                {(eq as any).status === 'active' ? 'Ativo' : 'Inativo'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                {canManageEquipment && (
                                  <>
                                    <Button
                                      variant="edit-ghost"
                                      size="icon"
                                      onClick={() => handleEdit(eq)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="destructive-ghost"
                                      size="icon"
                                      onClick={() => handleDeleteClick(eq)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
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
          label="Novo Equipamento"
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
            <AlertDialogTitle>Excluir equipamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{equipmentToDelete?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
