import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Package, Search, Settings } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
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

export function EquipmentPanel() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<(Equipment & { customer?: any }) | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [equipmentToDelete, setEquipmentToDelete] = useState<Equipment | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const { equipment, isLoading, createEquipment } = useEquipment();
  const { customers } = useCustomers();
  const { categories } = useEquipmentCategories();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredEquipment = equipment.filter((eq) => {
    const matchesSearch =
      eq.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eq.identifier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eq.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eq.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eq.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || (eq as any).category_id === categoryFilter;
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

  // Unique customers that have equipment
  const customersWithEquipment = customers.filter(c => equipment.some(eq => eq.customer_id === c.id));

  return (
    <div className="space-y-6">
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
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditingEquipment(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Equipamento
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="sm:w-[180px]">
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
        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="sm:w-[200px]">
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos clientes</SelectItem>
            {customersWithEquipment.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
              {isMobile ? (
                <div className="p-3 space-y-3">
                  {pagination.paginatedItems.map((eq) => (
                    <Card key={eq.id} className="cursor-pointer" onClick={() => navigate(`/equipamentos/${eq.id}`)}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start gap-3">
                          {(eq as any).photo_url ? (
                            <img src={(eq as any).photo_url} alt={eq.name} className="h-10 w-10 rounded object-cover shrink-0" />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{eq.name}</p>
                            {eq.identifier && <p className="text-xs text-muted-foreground font-mono">{eq.identifier}</p>}
                            <p className="text-xs text-muted-foreground truncate">{eq.customer?.name || '—'}</p>
                          </div>
                          <Badge variant={(eq as any).status === 'active' ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                            {(eq as any).status === 'active' ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <div className="flex justify-end gap-1 pt-1 border-t" onClick={(e) => e.stopPropagation()}>
                          <Button variant="edit-ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingEquipment(eq); setFormOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="destructive-ghost" size="icon" className="h-7 w-7" onClick={() => { setEquipmentToDelete(eq); setDeleteDialogOpen(true); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px] text-xs uppercase tracking-wider">Foto</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Nome</TableHead>
                      <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider">Local</TableHead>
                      <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider">Cliente</TableHead>
                      <TableHead className="hidden lg:table-cell text-xs uppercase tracking-wider">Categoria</TableHead>
                      <TableHead className="hidden lg:table-cell text-xs uppercase tracking-wider">Status</TableHead>
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
                            <Button
                              variant="edit-ghost"
                              size="icon"
                              onClick={() => { setEditingEquipment(eq); setFormOpen(true); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive-ghost"
                              size="icon"
                              onClick={() => { setEquipmentToDelete(eq); setDeleteDialogOpen(true); }}
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
              )}
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
