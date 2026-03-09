import { useState } from 'react';
import { Plus, Pencil, Trash2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from '@/components/ui/table';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Badge } from '@/components/ui/badge';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useIsMobile } from '@/hooks/use-mobile';

interface ServiceTypeForm {
  name: string;
  color: string;
  description: string;
  is_active: boolean;
  requires_equipment: boolean;
  number_prefix: string;
}

const defaultForm: ServiceTypeForm = {
  name: '',
  color: '#22c55e',
  description: '',
  is_active: true,
  requires_equipment: true,
  number_prefix: '',
};

export function ServiceTypesPanel() {
  const { serviceTypes, isLoading, createServiceType, updateServiceType, deleteServiceType } = useServiceTypes();
  const isMobile = useIsMobile();
  const { sortedItems: sortedTypes, sortConfig: stSortConfig, handleSort: handleStSort } = useTableSort(serviceTypes);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceTypeForm>(defaultForm);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);

  const handleNew = () => {
    setEditingId(null);
    setForm(defaultForm);
    setFormOpen(true);
  };

  const handleEdit = (st: any) => {
    setEditingId(st.id);
    setForm({
      name: st.name,
      color: st.color,
      description: st.description || '',
      is_active: st.is_active,
      requires_equipment: st.requires_equipment ?? true,
      number_prefix: (st as any).number_prefix || '',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (editingId) {
      await updateServiceType.mutateAsync({ id: editingId, ...form });
    } else {
      await createServiceType.mutateAsync(form);
    }
    setFormOpen(false);
  };

  const handleDelete = async () => {
    if (toDeleteId) {
      await deleteServiceType.mutateAsync(toDeleteId);
      setToDeleteId(null);
      setDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tipos de Serviço</h2>
          <p className="text-sm text-muted-foreground">
            Configure os tipos de serviço utilizados nas OS e na agenda
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Tipo
        </Button>
      </div>

      {serviceTypes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Wrench className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Nenhum tipo de serviço</h3>
            <p className="text-muted-foreground">Cadastre seus tipos de serviço para organizar as OS</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        /* Cards view for mobile */
        <div className="grid gap-3">
          {serviceTypes.map((st) => (
            <Card key={st.id} className={!st.is_active ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: st.color }}
                    >
                      <Wrench className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold">{st.name}</p>
                      {st.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{st.description}</p>
                      )}
                      <div className="flex gap-1 mt-1">
                        {!st.is_active && (
                          <Badge variant="secondary" className="text-xs">Inativo</Badge>
                        )}
                        {(st as any).requires_equipment && (
                          <Badge variant="outline" className="text-xs">Equipamento</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="edit-ghost" size="icon" onClick={() => handleEdit(st)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive-ghost"
                      size="icon"
                      onClick={() => { setToDeleteId(st.id); setDeleteDialogOpen(true); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Table view for desktop */
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cor</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                   <TableHead>Prefixo OS</TableHead>
                   <TableHead>Equipamento</TableHead>
                   <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceTypes.map((st) => (
                  <TableRow key={st.id} className={!st.is_active ? 'opacity-60' : ''}>
                    <TableCell>
                      <div
                        className="h-6 w-6 rounded-full"
                        style={{ backgroundColor: st.color }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{st.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {st.description || '-'}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{(st as any).number_prefix || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={(st as any).requires_equipment ? 'default' : 'secondary'} className="text-xs">
                        {(st as any).requires_equipment ? 'Sim' : 'Não'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.is_active ? 'default' : 'secondary'} className="text-xs">
                        {st.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="edit-ghost" size="icon" onClick={() => handleEdit(st)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive-ghost"
                          size="icon"
                          onClick={() => { setToDeleteId(st.id); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ResponsiveModal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editingId ? 'Editar Tipo de Serviço' : 'Novo Tipo de Serviço'}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Manutenção Preventiva"
            />
          </div>
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-10 w-10 rounded cursor-pointer border-0"
              />
              <Input
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descrição do tipo de serviço"
            />
          </div>
          <div className="space-y-2">
            <Label>Prefixo de Numeração OS</Label>
            <div className="flex items-center gap-3">
              <Input
                value={form.number_prefix}
                onChange={(e) => setForm({ ...form, number_prefix: e.target.value })}
                placeholder="Ex: MP, MC, INS"
                className="w-40"
              />
              <span className="text-sm font-mono text-muted-foreground whitespace-nowrap">
                → {form.number_prefix || 'OS'}-2026-0001
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.requires_equipment}
              onCheckedChange={(checked) => setForm({ ...form, requires_equipment: checked })}
            />
            <Label>Vinculado a equipamento</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_active}
              onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
            />
            <Label>Ativo</Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>
              {editingId ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Tipo de Serviço</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este tipo de serviço? Esta ação não pode ser desfeita.
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
