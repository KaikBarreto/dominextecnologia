import { useState } from 'react';
import { Plus, Pencil, Trash2, Package, Search, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { EquipmentFormDialog } from './EquipmentFormDialog';
import { EquipmentDetailDialog } from './EquipmentDetailDialog';
import { EquipmentFieldConfigDialog } from './EquipmentFieldConfigDialog';
import { EquipmentCategoryManagerDialog } from './EquipmentCategoryManagerDialog';
import type { Equipment } from '@/types/database';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function EquipmentPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<(Equipment & { customer?: any }) | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [equipmentToDelete, setEquipmentToDelete] = useState<Equipment | null>(null);
  const [detailEquipment, setDetailEquipment] = useState<(Equipment & { customer?: any }) | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const { equipment, isLoading, createEquipment } = useEquipment();
  const { customers } = useCustomers();
  const { categories } = useEquipmentCategories();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredEquipment = equipment.filter((eq) =>
    eq.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    eq.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    eq.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    eq.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, marca, modelo ou cliente..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setConfigOpen(true)}
            title="Configurar campos"
            className="bg-gradient-to-r from-gray-700 to-gray-900 text-white hover:from-gray-800 hover:to-gray-950"
          >
            <Settings className="mr-2 h-4 w-4" />
            Configurar Campos
          </Button>
          <Button onClick={() => { setEditingEquipment(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Equipamento
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Lista de Equipamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredEquipment.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">
                {searchTerm ? 'Nenhum equipamento encontrado' : 'Nenhum equipamento cadastrado'}
              </h3>
              <p className="text-muted-foreground">
                {searchTerm ? 'Tente uma busca diferente' : 'Clique em "Novo Equipamento" para começar'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden sm:table-cell">Marca/Modelo</TableHead>
                    <TableHead className="hidden md:table-cell">Cliente</TableHead>
                    <TableHead className="hidden lg:table-cell">Categoria</TableHead>
                    <TableHead className="hidden lg:table-cell">Status</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEquipment.map((eq) => (
                    <TableRow key={eq.id} className="cursor-pointer" onClick={() => setDetailEquipment(eq)}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{eq.name}</p>
                          {eq.serial_number && (
                            <p className="text-xs text-muted-foreground">S/N: {eq.serial_number}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="text-sm">
                          {eq.brand && <span>{eq.brand}</span>}
                          {eq.model && <span className="text-muted-foreground"> {eq.model}</span>}
                        </div>
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
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditingEquipment(eq); setFormOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
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
        </CardContent>
      </Card>

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

      <EquipmentDetailDialog
        open={!!detailEquipment}
        onOpenChange={(open) => { if (!open) setDetailEquipment(null); }}
        equipment={detailEquipment}
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
