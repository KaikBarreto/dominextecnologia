import { useState } from 'react';
import { Package, Tag, Plus, Pencil, Trash2 } from 'lucide-react';
import { EquipmentPanel } from '@/components/customers/EquipmentPanel';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function EquipmentPage() {
  const [activeTab, setActiveTab] = useState('equipamentos');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Equipamentos</h1>
        <p className="text-muted-foreground">Gerencie equipamentos e categorias</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-52 shrink-0">
          <div className="flex lg:flex-col gap-1">
            {[
              { key: 'equipamentos', label: 'Equipamentos', icon: Package },
              { key: 'categorias', label: 'Categorias', icon: Tag },
            ].map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 text-left w-full',
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          {activeTab === 'equipamentos' && <EquipmentPanel />}
          {activeTab === 'categorias' && <CategoriesPanel />}
        </div>
      </div>
    </div>
  );
}

function CategoriesPanel() {
  const { categories, createCategory, updateCategory, deleteCategory } = useEquipmentCategories();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createCategory.mutate({ name: newName, color: newColor });
    setNewName('');
    setNewColor('#3b82f6');
    setCreateOpen(false);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">
          Categorias de Equipamentos
        </h2>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Categoria
        </Button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {categories.map((cat) => (
          <Card key={cat.id}>
            <CardContent className="flex items-center gap-3 p-4">
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
                  {cat.description && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">{cat.description}</span>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(cat.id); setEditName(cat.name); setEditColor(cat.color); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(cat.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ))}
        {categories.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center">
            <Tag className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Nenhuma categoria criada</h3>
            <p className="text-muted-foreground">Crie categorias para organizar seus equipamentos</p>
          </div>
        )}
      </div>

      {/* Create Category Modal */}
      <ResponsiveModal open={createOpen} onOpenChange={setCreateOpen} title="Nova Categoria">
        <div className="space-y-4">
          <div>
            <Label>Nome da categoria</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Split, Cassete, VRF..."
              className="mt-1"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-9 w-9 rounded border cursor-pointer"
              />
              <span className="text-sm text-muted-foreground">{newColor}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleCreate}
              disabled={!newName.trim() || createCategory.isPending}
            >
              Criar
            </Button>
          </div>
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
    </div>
  );
}
