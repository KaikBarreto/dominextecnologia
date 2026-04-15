import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X, Trophy, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { useAdminCrmStages, type AdminCrmStage } from '@/hooks/useAdminCrm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export function AdminCrmStagesTab() {
  const { stages, createStage, updateStage, deleteStage } = useAdminCrmStages();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#6B7280');
  const [editIsWon, setEditIsWon] = useState(false);
  const [editIsLost, setEditIsLost] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6B7280');

  const startEdit = (s: AdminCrmStage) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditColor(s.color);
    setEditIsWon(s.is_won);
    setEditIsLost(s.is_lost);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateStage.mutate({ id: editingId, name: editName.trim(), color: editColor, is_won: editIsWon, is_lost: editIsLost });
    setEditingId(null);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createStage.mutate({ name: newName.trim(), color: newColor, position: stages.length });
    setNewName('');
    setNewColor('#6B7280');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Etapas do CRM</CardTitle>
        <p className="text-sm text-muted-foreground">Gerencie as etapas do funil de vendas administrativo</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {stages.map((s) => (
            <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
              {editingId === s.id ? (
                <>
                  <div className="flex-1 flex items-center gap-2 flex-wrap">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 h-8 min-w-[120px]" />
                    <ColorPicker value={editColor} onChange={setEditColor} />
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <Switch id="edit-won" checked={editIsWon} onCheckedChange={(v) => { setEditIsWon(v); if (v) setEditIsLost(false); }} />
                        <Label htmlFor="edit-won" className="text-xs">Ganho</Label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Switch id="edit-lost" checked={editIsLost} onCheckedChange={(v) => { setEditIsLost(v); if (v) setEditIsWon(false); }} />
                        <Label htmlFor="edit-lost" className="text-xs">Perdido</Label>
                      </div>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={saveEdit}><Check className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                </>
              ) : (
                <>
                  <div className="h-6 w-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="flex-1 text-sm font-medium truncate">{s.name}</span>
                  {s.is_won && <Badge variant="outline" className="text-[10px] border-green-500 text-green-600"><Trophy className="h-3 w-3 mr-1" />Ganho</Badge>}
                  {s.is_lost && <Badge variant="outline" className="text-[10px] border-red-500 text-red-600"><Ban className="h-3 w-3 mr-1" />Perdido</Badge>}
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteStage.mutate(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed flex-wrap">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova etapa..." className="flex-1 h-8 min-w-[120px]" />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <Button size="sm" className="h-8" onClick={handleCreate} disabled={!newName.trim()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
