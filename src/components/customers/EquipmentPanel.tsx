import { useState } from 'react';
import { Plus, Pencil, Trash2, Package, Search } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useEquipment, type EquipmentInput } from '@/hooks/useEquipment';
import { useCustomers } from '@/hooks/useCustomers';
import { EquipmentFormDialog } from './EquipmentFormDialog';
import type { Equipment } from '@/types/database';

export function EquipmentPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<(Equipment & { customer?: any }) | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [equipmentToDelete, setEquipmentToDelete] = useState<Equipment | null>(null);

  const { equipment, isLoading, createEquipment } = useEquipment();
  const { customers } = useCustomers();

  const filteredEquipment = equipment.filter((eq) =>
    eq.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    eq.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    eq.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    eq.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (data: EquipmentInput) => {
    if (editingEquipment) {
      // Update - we need to add update to hook
      const { supabase } = await import('@/integrations/supabase/client');
      await supabase.from('equipment').update(data).eq('id', editingEquipment.id);
      // Invalidate
      const { useQueryClient } = await import('@tanstack/react-query');
    } else {
      await createEquipment.mutateAsync(data);
    }
    setEditingEquipment(null);
  };

  const handleDelete = async () => {
    if (equipmentToDelete) {
      const { supabase } = await import('@/integrations/supabase/client');
      await supabase.from('equipment').delete().eq('id', equipmentToDelete.id);
      setEquipmentToDelete(null);
      setDeleteDialogOpen(false);
    }
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
        <Button onClick={() => { setEditingEquipment(null); setFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Equipamento
        </Button>
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
                    <TableHead className="hidden lg:table-cell">Local</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEquipment.map((eq) => (
                    <TableRow key={eq.id}>
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
                          {eq.capacity && <p className="text-xs text-muted-foreground">{eq.capacity}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {eq.customer?.name || '-'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {eq.location || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
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
        isLoading={createEquipment.isPending}
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
