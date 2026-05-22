import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { useEquipment } from '@/hooks/useEquipment';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EquipmentCategoryManagerDialog({ open, onOpenChange }: Props) {
  const isMobile = useIsMobile();
  const { categories, createCategory, updateCategory, deleteCategory } = useEquipmentCategories();
  const { equipment } = useEquipment();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Contagem de equipamentos por categoria — usado no subtitle do MobileListItem.
  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const eq of equipment) {
      if (!eq.category_id) continue;
      map.set(eq.category_id, (map.get(eq.category_id) ?? 0) + 1);
    }
    return map;
  }, [equipment]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createCategory.mutate({ name: newName, color: newColor });
    setNewName('');
    setNewColor('#3b82f6');
  };

  const handleUpdate = () => {
    if (!editingId || !editName.trim()) return;
    updateCategory.mutate({ id: editingId, name: editName, color: editColor });
    setEditingId(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteCategory.mutate(deleteId);
    setDeleteId(null);
  };

  const startEdit = (id: string, name: string, color: string) => {
    setEditingId(id);
    setEditName(name);
    setEditColor(color);
  };

  // Bloco "adicionar nova" — usado tanto no desktop quanto no mobile.
  const addBlock = (
    <div className="flex gap-2">
      <Input
        placeholder="Nome da categoria"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        className="flex-1"
        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
      />
      <input
        type="color"
        value={newColor}
        onChange={(e) => setNewColor(e.target.value)}
        className="h-9 w-9 rounded border cursor-pointer"
        aria-label="Cor da categoria"
      />
      <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Categorias de Equipamentos">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Crie categorias para organizar seus equipamentos.
          </p>

          {addBlock}

          {/* Lista — mobile usa MobileListItem; desktop mantém o layout inline original. */}
          {isMobile ? (
            categories.length === 0 ? (
              <EmptyState
                icon={<Tag className="h-12 w-12" />}
                title="Nenhuma categoria criada"
                description="Use o campo acima para adicionar a primeira categoria."
              />
            ) : (
              <div className="rounded-xl border bg-card overflow-hidden">
                {categories.map((cat) => {
                  const isEditing = editingId === cat.id;
                  const count = countByCategory.get(cat.id) ?? 0;

                  if (isEditing) {
                    // Edição inline — preserva UX de digitação + color picker.
                    return (
                      <div
                        key={cat.id}
                        className="flex items-center gap-2 border-b border-border/60 last:border-b-0 px-4 py-3 bg-card"
                      >
                        <div
                          className="h-8 w-8 rounded-md shrink-0 border"
                          style={{ backgroundColor: editColor || cat.color }}
                          aria-hidden
                        />
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 h-9"
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
                          autoFocus
                        />
                        <input
                          type="color"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="h-9 w-9 rounded border cursor-pointer"
                          aria-label="Cor da categoria"
                        />
                        <Button size="sm" variant="outline" onClick={handleUpdate}>Salvar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                      </div>
                    );
                  }

                  const actions: ItemAction[] = [
                    {
                      key: 'edit',
                      label: 'Editar',
                      icon: <Pencil className="h-4 w-4" />,
                      variant: 'edit',
                      onClick: () => startEdit(cat.id, cat.name, cat.color),
                    },
                    {
                      key: 'delete',
                      label: 'Excluir',
                      icon: <Trash2 className="h-4 w-4" />,
                      variant: 'destructive',
                      onClick: () => setDeleteId(cat.id),
                    },
                  ];

                  return (
                    <MobileListItem
                      key={cat.id}
                      leading={
                        <div
                          className="h-10 w-10 rounded-lg shrink-0 border"
                          style={{ backgroundColor: cat.color }}
                          aria-hidden
                        />
                      }
                      title={cat.name}
                      subtitle={count === 1 ? '1 equipamento' : `${count} equipamentos`}
                      actions={actions}
                    />
                  );
                })}
              </div>
            )
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  {editingId === cat.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 h-8"
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
                      />
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="h-8 w-8 rounded border cursor-pointer"
                      />
                      <Button size="sm" variant="outline" onClick={handleUpdate}>Salvar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium">{cat.name}</span>
                      <Button variant="edit-ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(cat.id, cat.name, cat.color)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="destructive-ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(cat.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-4">Nenhuma categoria criada</p>
              )}
            </div>
          )}
        </div>
      </ResponsiveModal>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Equipamentos com esta categoria perderão a associação.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
