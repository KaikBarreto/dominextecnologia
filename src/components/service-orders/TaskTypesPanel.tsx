import { useState } from 'react';
import { Plus, Pencil, Trash2, CheckSquare } from 'lucide-react';
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
import { useTaskTypes } from '@/hooks/useTaskTypes';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { FABButton } from '@/components/mobile/FABButton';
import { EmptyState } from '@/components/mobile/EmptyState';

interface TaskTypeForm {
  name: string;
  color: string;
  description: string;
  is_active: boolean;
}

const defaultForm: TaskTypeForm = {
  name: '',
  color: '#8b5cf6',
  description: '',
  is_active: true,
};

export function TaskTypesPanel() {
  const { taskTypes, isLoading, createTaskType, updateTaskType, deleteTaskType } = useTaskTypes();
  const isMobile = useIsMobile();
  const { sortedItems: sortedTypes, sortConfig, handleSort } = useTableSort(taskTypes);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskTypeForm>(defaultForm);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);

  const handleNew = () => {
    setEditingId(null);
    setForm(defaultForm);
    setFormOpen(true);
  };

  const handleEdit = (tt: any) => {
    setEditingId(tt.id);
    setForm({
      name: tt.name,
      color: tt.color,
      description: tt.description || '',
      is_active: tt.is_active,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (editingId) {
      await updateTaskType.mutateAsync({ id: editingId, ...form });
    } else {
      await createTaskType.mutateAsync(form);
    }
    setFormOpen(false);
  };

  const handleDelete = async () => {
    if (toDeleteId) {
      await deleteTaskType.mutateAsync(toDeleteId);
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
      {/* Header: no mobile escondemos texto (já no MobilePageHeader da page) e o botão vira FAB. */}
      {!isMobile && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Tipos de Tarefas</h2>
            <p className="text-sm text-muted-foreground">
              Configure os tipos de tarefas utilizadas na agenda
            </p>
          </div>
          <Button onClick={handleNew}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Tipo
          </Button>
        </div>
      )}

      {taskTypes.length === 0 ? (
        isMobile ? (
          <EmptyState
            icon={<CheckSquare className="h-12 w-12" />}
            title="Nenhum tipo de tarefa"
            description="Toque em Novo Tipo para cadastrar"
          />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CheckSquare className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">Nenhum tipo de tarefa</h3>
              <p className="text-muted-foreground">Cadastre tipos de tarefas para organizar sua agenda</p>
            </CardContent>
          </Card>
        )
      ) : isMobile ? (
        /* -------------------------------------------------------------------
         * Mobile: lista nativa com MobileListItem (swipe + menu ⋮).
         * ------------------------------------------------------------------- */
        <div className="rounded-xl border bg-card overflow-hidden">
          {sortedTypes.map((tt) => {
            const itemActions: ItemAction[] = [
              {
                key: 'edit',
                label: 'Editar',
                icon: <Pencil className="h-4 w-4" />,
                variant: 'edit',
                onClick: () => handleEdit(tt),
              },
              {
                key: 'delete',
                label: 'Excluir',
                icon: <Trash2 className="h-4 w-4" />,
                variant: 'destructive',
                onClick: () => { setToDeleteId(tt.id); setDeleteDialogOpen(true); },
              },
            ];

            return (
              <MobileListItem
                key={tt.id}
                onClick={() => handleEdit(tt)}
                actions={itemActions}
                className={!tt.is_active ? 'opacity-60' : ''}
                leading={
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: tt.color }}
                  >
                    <CheckSquare className="h-5 w-5 text-white" />
                  </div>
                }
                title={tt.name}
                subtitle={
                  <span className="flex items-center gap-2 flex-wrap">
                    {tt.description && (
                      <span className="truncate">{tt.description}</span>
                    )}
                    {!tt.is_active && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inativo</Badge>
                    )}
                  </span>
                }
              />
            );
          })}
        </div>
      ) : (
        /* -------------------------------------------------------------------
         * Desktop: tabela 100% intacta.
         * ------------------------------------------------------------------- */
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}}>Cor</SortableTableHead>
                  <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>Nome</SortableTableHead>
                  <SortableTableHead sortKey="description" sortConfig={sortConfig} onSort={handleSort}>Descrição</SortableTableHead>
                  <SortableTableHead sortKey="is_active" sortConfig={sortConfig} onSort={handleSort}>Status</SortableTableHead>
                  <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="w-[100px]">Ações</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTypes.map((tt) => (
                  <TableRow key={tt.id} className={!tt.is_active ? 'opacity-60' : ''}>
                    <TableCell>
                      <div className="h-6 w-6 rounded-full" style={{ backgroundColor: tt.color }} />
                    </TableCell>
                    <TableCell className="font-medium">{tt.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {tt.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tt.is_active ? 'default' : 'secondary'} className="text-xs">
                        {tt.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="edit-ghost" size="icon" onClick={() => handleEdit(tt)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive-ghost"
                          size="icon"
                          onClick={() => { setToDeleteId(tt.id); setDeleteDialogOpen(true); }}
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

      {/* FAB mobile-only para criar novo tipo de tarefa. */}
      {isMobile && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label="Novo Tipo"
          onClick={handleNew}
        />
      )}

      <ResponsiveModal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editingId ? 'Editar Tipo de Tarefa' : 'Novo Tipo de Tarefa'}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Reunião, Entrega, Compra"
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
              placeholder="Descrição do tipo de tarefa"
            />
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
            <AlertDialogTitle>Excluir Tipo de Tarefa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este tipo de tarefa? Esta ação não pode ser desfeita.
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
