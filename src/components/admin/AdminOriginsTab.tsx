import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { useCompanyOrigins, type CompanyOrigin } from '@/hooks/useCompanyOrigins';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ICON_OPTIONS = ['Globe', 'UserPlus', 'Megaphone', 'Handshake', 'Phone', 'Mail', 'MapPin', 'Star', 'Heart', 'Target', 'Zap', 'TrendingUp', 'Share2', 'Users'];

function IconPreview({ name, className }: { name: string; className?: string }) {
  const LucideIcon = (LucideIcons as any)[name];
  if (!LucideIcon) return null;
  return <LucideIcon className={className || 'h-4 w-4'} />;
}

export function AdminOriginsTab() {
  const { origins, createOrigin, updateOrigin, deleteOrigin } = useCompanyOrigins();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('Globe');
  const [editColor, setEditColor] = useState('#6B7280');
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('Globe');
  const [newColor, setNewColor] = useState('#6B7280');

  const startEdit = (o: CompanyOrigin) => {
    setEditingId(o.id);
    setEditName(o.name);
    setEditIcon(o.icon || 'Globe');
    setEditColor(o.color || '#6B7280');
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Origens de Empresas</CardTitle>
        <p className="text-sm text-muted-foreground">Gerencie as origens de captação de novos clientes</p>
      </CardHeader>
      <CardContent className="space-y-4">
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
                  <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: o.color || '#6B7280' }}>
                    <IconPreview name={o.icon || 'Globe'} className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="flex-1 text-sm font-medium truncate">{o.name}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(o)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteOrigin.mutate(o.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </>
              )}
            </div>
          ))}
        </div>

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
      </CardContent>
    </Card>
  );
}
