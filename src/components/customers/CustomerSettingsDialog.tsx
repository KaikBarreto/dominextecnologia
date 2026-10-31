import { useEffect, useMemo, useState } from 'react';
import { Braces, Eye, EyeOff, Globe2, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { CustomerOriginManagerContent } from '@/components/customers/CustomerOriginManagerDialog';
import { PartyLabelsManager } from '@/components/customers/PartyLabelsManager';
import { usePartyFieldConfig, type PartyEntityType, type PartyFieldConfig, type PartyFieldType } from '@/hooks/usePartyFieldConfig';

interface Props { open: boolean; onOpenChange: (open: boolean) => void }

const FIELD_TYPES: Array<{ value: PartyFieldType; label: string }> = [
  { value: 'text', label: 'Texto' }, { value: 'number', label: 'Número' }, { value: 'date', label: 'Data' },
  { value: 'select', label: 'Lista de opções' }, { value: 'boolean', label: 'Sim/Não' },
];

function FieldsManager({ entityType }: { entityType: PartyEntityType }) {
  const { fields, createField, updateField, deleteField } = usePartyFieldConfig(entityType);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = fields.find((item) => item.id === selectedId) ?? null;
  const [draft, setDraft] = useState({ label: '', field_type: 'text' as PartyFieldType, options: '', is_required: false, is_visible: true, is_visible_in_portal: false });

  useEffect(() => {
    if (creating) {
      setDraft({ label: '', field_type: 'text', options: '', is_required: false, is_visible: true, is_visible_in_portal: false });
    } else if (selected) {
      setDraft({ label: selected.label, field_type: selected.field_type, options: (selected.options ?? []).join(', '), is_required: selected.is_required, is_visible: selected.is_visible, is_visible_in_portal: selected.is_visible_in_portal });
    }
  }, [creating, selected, entityType]);

  const payload = useMemo(() => ({
    label: draft.label.trim(), field_type: draft.field_type,
    options: draft.field_type === 'select' ? draft.options.split(',').map((item) => item.trim()).filter(Boolean) : null,
    is_required: draft.is_required, is_visible: draft.is_visible,
    is_visible_in_portal: entityType === 'customer' && draft.is_visible_in_portal,
  }), [draft, entityType]);

  const save = async () => {
    if (!payload.label) return;
    if (selected && !creating) await updateField.mutateAsync({ id: selected.id, ...payload });
    else {
      const created = await createField.mutateAsync({ ...payload, field_key: `custom_${Date.now()}`, position: fields.length });
      setSelectedId(created.id); setCreating(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{entityType === 'customer' ? 'Campos de clientes' : 'Campos de fornecedores'}</h2><p className="text-sm text-muted-foreground">Crie informações adicionais para cadastro, ficha e portal.</p></div><Button size="sm" onClick={() => { setSelectedId(null); setCreating(true); }}><Plus className="mr-1 h-4 w-4" />Novo campo</Button></div>
      {(selected || creating) && (
        <div className="space-y-4 rounded-lg border bg-muted/10 p-4">
          <div className="space-y-2"><Label>Nome do campo</Label><Input value={draft.label} onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))} /></div>
          <div className="space-y-2"><Label>Tipo</Label><Select value={draft.field_type} onValueChange={(value) => setDraft((prev) => ({ ...prev, field_type: value as PartyFieldType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FIELD_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div>
          {draft.field_type === 'select' && <div className="space-y-2"><Label>Opções, separadas por vírgula</Label><Input value={draft.options} onChange={(event) => setDraft((prev) => ({ ...prev, options: event.target.value }))} placeholder="Ativo, Inativo, Em análise" /></div>}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm">Visível</span><Switch checked={draft.is_visible} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, is_visible: checked }))} /></label>
            <label className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm">Obrigatório</span><Switch checked={draft.is_required} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, is_required: checked }))} /></label>
            {entityType === 'customer' && <label className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2"><span className="text-sm">Mostrar no Portal do Cliente</span><Switch checked={draft.is_visible_in_portal} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, is_visible_in_portal: checked }))} /></label>}
          </div>
          <div className="flex flex-wrap justify-between gap-2">{selected && !creating ? <Button variant="ghost" className="text-destructive hover:bg-destructive hover:text-white" onClick={async () => { await deleteField.mutateAsync(selected.id); setSelectedId(null); }}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={() => { setCreating(false); setSelectedId(null); }}>Cancelar</Button><Button onClick={save} disabled={!payload.label}>Salvar campo</Button></div></div>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border">{fields.length ? fields.map((field) => <div key={field.id} className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0"><span className="min-w-0 flex-1 truncate text-sm font-medium">{field.label}</span>{field.is_visible ? <Eye className="h-3.5 w-3.5 text-muted-foreground" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}<Button size="sm" variant="ghost" onClick={() => { setCreating(false); setSelectedId(field.id); }}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button></div>) : <p className="p-6 text-center text-sm text-muted-foreground">Nenhum campo personalizado.</p>}</div>
    </section>
  );
}

export function CustomerSettingsDialog({ open, onOpenChange }: Props) {
  const [section, setSection] = useState<'origins' | 'labels' | 'fields'>('origins');
  const [fieldEntityType, setFieldEntityType] = useState<PartyEntityType>('customer');
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Configurações de clientes e fornecedores" className="sm:max-w-4xl">
      <div className="overflow-hidden rounded-lg border md:grid md:min-h-[30rem] md:grid-cols-[14rem_1fr]">
        <aside className="flex gap-1 overflow-x-auto border-b bg-muted/20 p-2 md:block md:space-y-1 md:border-b-0 md:border-r">
          {([
            ['origins', 'Origens', Globe2, 'Canais de aquisição'],
            ['labels', 'Etiquetas', Tag, 'Cores e classificações'],
            ['fields', 'Campos personalizados', Braces, 'Informações adicionais'],
          ] as const).map(([value, label, Icon, description]) => <button key={value} type="button" onClick={() => setSection(value)} className={cn('flex min-w-max items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors md:w-full', section === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><span><span className="block text-sm font-medium">{label}</span><span className={cn('hidden text-xs md:block', section === value ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{description}</span></span></button>)}
        </aside>
        <div className="min-w-0 p-4 sm:p-5">
          {section === 'origins' && <div className="space-y-5"><div><h2 className="font-semibold">Origens</h2><p className="text-sm text-muted-foreground">Gerencie os canais usados para identificar a origem dos clientes.</p></div><CustomerOriginManagerContent /></div>}
          {section === 'labels' && <PartyLabelsManager scope="party" />}
          {section === 'fields' && <div className="space-y-4"><div className="inline-flex rounded-lg bg-muted p-1"><button type="button" onClick={() => setFieldEntityType('customer')} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', fieldEntityType === 'customer' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Clientes</button><button type="button" onClick={() => setFieldEntityType('supplier')} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', fieldEntityType === 'supplier' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Fornecedores</button></div><FieldsManager entityType={fieldEntityType} /></div>}
        </div>
      </div>
    </ResponsiveModal>
  );
}
