import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { icons } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { useCustomerOrigins, type CustomerOrigin } from '@/hooks/useCustomerOrigins';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ICON_OPTIONS = ['Globe', 'UserPlus', 'Megaphone', 'Handshake', 'Phone', 'Mail', 'MapPin', 'Star', 'Heart', 'Target', 'Zap', 'TrendingUp', 'Share2', 'Users'];

function IconPreview({ name, className }: { name: string; className?: string }) {
  const LucideIcon = (icons as any)[name];
  if (!LucideIcon) return null;
  return <LucideIcon className={className || 'h-4 w-4'} />;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerOriginManagerDialog({ open, onOpenChange }: Props) {
  const { origins, createOrigin, updateOrigin, deleteOrigin } = useCustomerOrigins();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('Globe');
  const [editColor, setEditColor] = useState('#6B7280');
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('Globe');
  const [newColor, setNewColor] = useState('#6B7280');

  const startEdit = (o: CustomerOrigin) => {
    setEditingId(o.id);
    setEditName(o.name);
    setEditIcon(o.icon);
    setEditColor(o.color);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateOrigin.mutate({ id: editingId, name: editName.trim(), icon: editIcon, color: editColor });
    setEditingId(null);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createOrigin.mutate({ name: newName.trim(), icon: newIcon, color: newColor });
    setNewName('');
    setNewIcon('Globe');
    setNewColor('#6B7280');
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Origens de Clientes">
      <div className="space-y-4">
        {/* Existing origins */}
        <div className="space-y-2">
          {origins.map((o) => (
            <div key={o.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
              {editingId === o.id ? (
                <>
                  <div className="flex-1 flex items-center gap-2 flex-wrap">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 h-8 min-w-[120px]" />
                    <Select value={editIcon} onValueChange={setEditIcon}>
                      <SelectTrigger className="w-[100px] h-8">
                        <div className="flex items-center gap-1.5">
                          <IconPreview name={editIcon} className="h-3.5 w-3.5" />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map((ic) => (
                          <SelectItem key={ic} value={ic}>
                            <div className="flex items-center gap-2">
                              <IconPreview name={ic} className="h-3.5 w-3.5" />
                              <span className="text-xs">{ic}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <ColorPicker value={editColor} onChange={setEditColor} />
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={saveEdit}><Check className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}><X className="h-3.5 w-3.5" /></Button>
                </>
              ) : (
                <>
                  <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: o.color }}>
                    <IconPreview name={o.icon} className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="flex-1 text-sm font-medium truncate">{o.name}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(o)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="destructive-ghost" className="h-7 w-7" onClick={() => deleteOrigin.mutate(o.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new */}
        <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed flex-wrap">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova origem..." className="flex-1 h-8 min-w-[120px]" />
          <Select value={newIcon} onValueChange={setNewIcon}>
            <SelectTrigger className="w-[100px] h-8">
              <div className="flex items-center gap-1.5">
                <IconPreview name={newIcon} className="h-3.5 w-3.5" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {ICON_OPTIONS.map((ic) => (
                <SelectItem key={ic} value={ic}>
                  <div className="flex items-center gap-2">
                    <IconPreview name={ic} className="h-3.5 w-3.5" />
                    <span className="text-xs">{ic}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ColorPicker value={newColor} onChange={setNewColor} />
          <Button size="sm" className="h-8" onClick={handleCreate} disabled={!newName.trim()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
