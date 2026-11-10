import { useEffect, useState } from 'react';
import { EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PartyLabelBadge } from '@/components/customers/PartyLabelBadge';
import { usePartyLabels, type PartyLabel, type PartyLabelScope } from '@/hooks/usePartyLabels';

export function PartyLabelsManager({ scope }: { scope: Exclude<PartyLabelScope, 'all'> }) {
  const { labels, createLabel, updateLabel, deleteLabel } = usePartyLabels(scope);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = labels.find((item) => item.id === selectedId) ?? null;
  const [name, setName] = useState('');
  const [color, setColor] = useState('#DC2626');
  const [showInPortal, setShowInPortal] = useState(false);

  useEffect(() => {
    if (creating) { setName(''); setColor('#DC2626'); setShowInPortal(false); return; }
    if (selected) { setName(selected.name); setColor(selected.color); setShowInPortal(selected.show_in_portal); }
  }, [creating, selected]);

  const save = async () => {
    if (!name.trim()) return;
    if (selected && !creating) await updateLabel.mutateAsync({ id: selected.id, name: name.trim(), color, show_in_portal: showInPortal });
    else {
      const created = await createLabel.mutateAsync({ name: name.trim(), color, show_in_portal: showInPortal });
      setSelectedId(created.id); setCreating(false);
    }
  };
  const remove = async (label: PartyLabel) => {
    if (!window.confirm(`Excluir a etiqueta “${label.name}”? Ela será removida dos cadastros vinculados.`)) return;
    await deleteLabel.mutateAsync(label.id);
    if (selectedId === label.id) setSelectedId(null);
  };
  const preview: PartyLabel = { id: 'preview', company_id: '', name: name || 'ETIQUETA', color, is_active: true, scope, show_in_portal: showInPortal, created_at: '' };
  const noun = scope === 'equipment' ? 'equipamentos' : 'clientes e fornecedores';

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Etiquetas</h2><p className="text-sm text-muted-foreground">Classifique {noun} com cores fáceis de reconhecer.</p></div><Button size="sm" onClick={() => { setSelectedId(null); setCreating(true); }}><Plus className="mr-1 h-4 w-4" />Nova etiqueta</Button></div>
    {(selected || creating) && <div className="space-y-5 rounded-lg border bg-muted/10 p-4">
      <div className="space-y-2"><Label>Nome da etiqueta</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: BLOQUEADO" /></div>
      <div className="space-y-2"><Label>Cor saturada</Label><div className="flex items-center gap-3"><ColorPicker value={color} onChange={setColor} /><PartyLabelBadge label={preview} /></div></div>
      <label className="flex items-center justify-between rounded-lg border p-3"><span><span className="block text-sm">Mostrar nos portais</span><span className="block text-xs text-muted-foreground">Libera esta classificação para o cliente.</span></span><Switch checked={showInPortal} onCheckedChange={setShowInPortal} /></label>
      {selected && !creating && <label className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm">Etiqueta ativa</span><Switch checked={selected.is_active} onCheckedChange={(checked) => updateLabel.mutate({ id: selected.id, is_active: checked })} /></label>}
      <div className="flex flex-wrap justify-between gap-2">{selected && !creating ? <Button variant="ghost" className="text-destructive hover:bg-destructive hover:text-white" onClick={() => remove(selected)} disabled={deleteLabel.isPending}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={() => { setCreating(false); setSelectedId(null); }}>Cancelar</Button><Button onClick={save} disabled={!name.trim() || createLabel.isPending || updateLabel.isPending}>Salvar etiqueta</Button></div></div>
    </div>}
    <div className="overflow-hidden rounded-lg border">{labels.length ? labels.map((item) => <div key={item.id} className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0"><PartyLabelBadge label={item} />{!item.is_active && <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}<div className="ml-auto flex items-center gap-1"><Button size="sm" variant="ghost" onClick={() => { setCreating(false); setSelectedId(item.id); }}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white" onClick={() => remove(item)} disabled={deleteLabel.isPending} aria-label={`Excluir etiqueta ${item.name}`} title="Excluir etiqueta"><Trash2 className="h-3.5 w-3.5" /></Button></div></div>) : <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma etiqueta cadastrada.</p>}</div>
  </section>;
}
