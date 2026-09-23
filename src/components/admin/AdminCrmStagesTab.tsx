import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X, Trophy, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { useAdminCrmStages, type AdminCrmStage } from '@/hooks/useAdminCrm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ICON_OPTIONS, IconPreview } from '@/components/customers/originIcons';

/** Seletor de ícone da etapa — mesmo componente e mesmo comportamento do
 *  StageManagerDialog do CRM do tenant (inclusive o valor sentinela 'none',
 *  porque SelectItem com value="" quebra o Radix). */
function StageIconSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <Select value={value ?? 'none'} onValueChange={(v) => onChange(v === 'none' ? null : v)}>
      <SelectTrigger className="w-[100px] h-8 shrink-0" aria-label="Ícone da etapa">
        <div className="flex items-center gap-1.5">
          {value ? <IconPreview name={value} className="h-3.5 w-3.5" /> : null}
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Nenhum</SelectItem>
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
  );
}

export function AdminCrmStagesTab() {
  const { stages, createStage, updateStage, deleteStage } = useAdminCrmStages();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#6B7280');
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [editIsWon, setEditIsWon] = useState(false);
  const [editIsLost, setEditIsLost] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6B7280');
  const [newIcon, setNewIcon] = useState<string | null>(null);

  const startEdit = (s: AdminCrmStage) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditColor(s.color);
    setEditIcon(s.icon ?? null);
    setEditIsWon(s.is_won);
    setEditIsLost(s.is_lost);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateStage.mutate({ id: editingId, name: editName.trim(), color: editColor, icon: editIcon, is_won: editIsWon, is_lost: editIsLost });
    setEditingId(null);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createStage.mutate({ name: newName.trim(), color: newColor, icon: newIcon, position: stages.length });
    setNewName('');
    setNewColor('#6B7280');
    setNewIcon(null);
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
                    <StageIconSelect value={editIcon} onChange={setEditIcon} />
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
                  {s.icon && <IconPreview name={s.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="flex-1 text-sm font-medium truncate">{s.name}</span>
                  {s.is_won && <Badge variant="outline" className="text-[10px] border-green-500 text-green-600"><Trophy className="h-3 w-3 mr-1" />Ganho</Badge>}
                  {s.is_lost && <Badge variant="outline" className="text-[10px] border-red-500 text-red-600"><Ban className="h-3 w-3 mr-1" />Perdido</Badge>}
                  <RowActionsMenu
                    triggerClassName="h-7 w-7"
                    actions={[
                      { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => startEdit(s) },
                      { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => deleteStage.mutate(s.id) },
                    ]}
                  />
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed flex-wrap">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova etapa..." className="flex-1 h-8 min-w-[120px]" />
          <StageIconSelect value={newIcon} onChange={setNewIcon} />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <Button size="sm" className="h-8" onClick={handleCreate} disabled={!newName.trim()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
