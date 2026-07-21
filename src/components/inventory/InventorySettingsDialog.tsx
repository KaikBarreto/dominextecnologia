import { useState, useRef } from 'react';
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  Check,
  X,
  Star,
  Settings,
  Warehouse,
} from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useMaterialGroups, type MaterialGroup } from '@/hooks/useMaterialGroups';
import { useStocks, type Stock } from '@/hooks/useStocks';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

type SettingsTab = 'grupos' | 'depositos';

interface InventorySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InventorySettingsDialog({ open, onOpenChange }: InventorySettingsDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.settingsDialog;
  const [activeTab, setActiveTab] = useState<SettingsTab>('grupos');

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      className="sm:max-w-[560px]"
    >
      {/* Abas internas: Grupos de Material | Depósitos */}
      <div className="flex gap-1 border-b mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('grupos')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'grupos'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Settings className="h-4 w-4" />
          {t.tabGroups}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('depositos')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'depositos'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Warehouse className="h-4 w-4" />
          {t.tabStocks}
        </button>
      </div>

      {activeTab === 'grupos' && <MaterialGroupsPanel />}
      {activeTab === 'depositos' && <StocksPanel />}
    </ResponsiveModal>
  );
}

// ---------------------------------------------------------------------------
// Painel de Grupos de Material
// ---------------------------------------------------------------------------
function MaterialGroupsPanel() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.settingsDialog.groups;
  const { groups, createGroup, updateGroup, deleteGroup, reorderGroups } = useMaterialGroups();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6B7280');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createGroup.mutate(
      { name: newName.trim(), color: newColor },
      { onSuccess: () => { setNewName(''); setNewColor('#6B7280'); } },
    );
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteGroup.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id) setDragOverId(id);
  };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const fromIdx = groups.findIndex((g) => g.id === draggedId);
    const toIdx = groups.findIndex((g) => g.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...groups];
    const [removed] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, removed);
    reorderGroups.mutate(newOrder.map((g) => g.id));
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="space-y-4">
      {/* Lista */}
      <div className="space-y-1">
        {groups.map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            isEditing={editingId === group.id}
            isDragging={draggedId === group.id}
            isDragOver={dragOverId === group.id}
            onEdit={() => setEditingId(group.id)}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={(name, color) => {
              updateGroup.mutate({ id: group.id, name, color }, { onSuccess: () => setEditingId(null) });
            }}
            onDelete={() => setDeleteId(group.id)}
            onDragStart={(e) => handleDragStart(e, group.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, group.id)}
            onDrop={(e) => handleDrop(e, group.id)}
            dragNodeRef={dragNodeRef}
          />
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">{t.empty}</p>
        )}
      </div>

      {/* Criar novo grupo */}
      <div className="border-t pt-4 space-y-2">
        <Label>{t.newGroup}</Label>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t.namePlaceholder}
            className="flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
          />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <Button
            type="button"
            size="icon"
            onClick={handleCreate}
            disabled={!newName.trim() || createGroup.isPending}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Confirm delete */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteCancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface GroupRowProps {
  group: MaterialGroup;
  isEditing: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (name: string, color: string) => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  dragNodeRef: React.MutableRefObject<HTMLDivElement | null>;
}

function GroupRow({
  group,
  isEditing,
  isDragging,
  isDragOver,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: GroupRowProps) {
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color ?? '#6B7280');

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 h-8"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit(name.trim(), color);
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
        <ColorPicker value={color} onChange={setColor} />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-success hover:text-success"
          onClick={() => onSaveEdit(name.trim(), color)}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancelEdit}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors select-none',
        isDragging && 'opacity-40',
        isDragOver && 'border-primary bg-primary/5',
      )}
    >
      <div className="cursor-grab text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </div>
      <div
        className="h-4 w-4 rounded-full shrink-0"
        style={{ backgroundColor: group.color ?? '#6B7280' }}
      />
      <span className="flex-1 text-sm truncate">{group.name}</span>
      <RowActionsMenu
        actions={[
          { label: 'Editar', icon: Pencil, variant: 'edit', onClick: onEdit },
          { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: onDelete },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel de Depósitos
// ---------------------------------------------------------------------------
function StocksPanel() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.settingsDialog.stocks;
  const { stocks, createStock, renameStock, deleteStock, setDefaultStock } = useStocks();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    createStock.mutate(newName.trim(), { onSuccess: () => setNewName('') });
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteStock.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
    }
  };

  const stockToDelete = stocks.find((s) => s.id === deleteId);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {stocks.map((stock) => (
          <StockRow
            key={stock.id}
            stock={stock}
            isEditing={editingId === stock.id}
            onEdit={() => setEditingId(stock.id)}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={(name) => {
              renameStock.mutate({ id: stock.id, name }, { onSuccess: () => setEditingId(null) });
            }}
            onDelete={() => setDeleteId(stock.id)}
            onSetDefault={() => setDefaultStock.mutate(stock.id)}
          />
        ))}
        {stocks.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">{t.empty}</p>
        )}
      </div>

      {/* Criar novo depósito */}
      <div className="border-t pt-4 space-y-2">
        <Label>{t.newStock}</Label>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t.namePlaceholder}
            className="flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
          />
          <Button
            type="button"
            size="icon"
            onClick={handleCreate}
            disabled={!newName.trim() || createStock.isPending}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Confirm delete */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteDescription.replace('{name}', stockToDelete?.name ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteCancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface StockRowProps {
  stock: Stock;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (name: string) => void;
  onDelete: () => void;
  onSetDefault: () => void;
}

function StockRow({ stock, isEditing, onEdit, onCancelEdit, onSaveEdit, onDelete, onSetDefault }: StockRowProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.settingsDialog.stocks;
  const [name, setName] = useState(stock.name);

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 h-8"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit(name.trim());
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-success hover:text-success"
          onClick={() => onSaveEdit(name.trim())}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancelEdit}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border">
      <Warehouse className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm truncate">{stock.name}</span>
      {stock.is_default && (
        <span className="text-xs font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
          {t.defaultBadge}
        </span>
      )}
      <RowActionsMenu
        actions={[
          ...(!stock.is_default
            ? [{ label: t.setDefault, icon: Star, variant: 'default' as const, onClick: onSetDefault }]
            : []),
          { label: t.rename, icon: Pencil, variant: 'edit' as const, onClick: onEdit },
          ...(!stock.is_default
            ? [{ label: t.delete, icon: Trash2, variant: 'delete' as const, onClick: onDelete }]
            : []),
        ]}
      />
    </div>
  );
}
