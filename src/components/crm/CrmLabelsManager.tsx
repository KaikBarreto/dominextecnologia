import { useState } from 'react';
import { Check, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCrmLabels, type CrmLabel } from '@/hooks/useCrmCardTools';

interface CrmLabelsManagerProps {
  admin?: boolean;
}

const DEFAULT_COLOR = '#2563EB';

export function CrmLabelsManager({ admin = false }: CrmLabelsManagerProps) {
  const { labels, isLoading, createLabel, updateLabel, deleteLabel } = useCrmLabels(admin);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CrmLabel | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);

  const reset = () => {
    setCreating(false);
    setEditing(null);
    setName('');
    setColor(DEFAULT_COLOR);
  };

  const beginEdit = (label: CrmLabel) => {
    setCreating(false);
    setEditing(label);
    setName(label.name);
    setColor(label.color);
  };

  const save = () => {
    if (!name.trim()) return;
    if (editing) {
      updateLabel.mutate({ id: editing.id, name, color }, { onSuccess: reset });
    } else {
      createLabel.mutate({ name, color }, { onSuccess: reset });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Etiquetas</h3>
          <p className="text-sm text-muted-foreground">Crie marcadores coloridos para identificar oportunidades rapidamente.</p>
        </div>
        {!creating && !editing && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Nova etiqueta
          </Button>
        )}
      </div>

      {(creating || editing) && (
        <div className="rounded-xl bg-muted/40 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:items-end">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Cor
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="block h-10 w-14 cursor-pointer rounded-lg border border-input bg-background p-1"
                aria-label="Cor da etiqueta"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Nome
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Urgente, Renovação, Cliente VIP" autoFocus />
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={!name.trim() || createLabel.isPending || updateLabel.isPending}>
                <Check className="mr-1.5 h-4 w-4" /> Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={reset}><X className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando etiquetas...</p>
      ) : labels.length === 0 ? (
        <div className="rounded-xl bg-muted/30 px-4 py-8 text-center">
          <Tag className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nenhuma etiqueta cadastrada</p>
          <p className="text-sm text-muted-foreground">Crie a primeira para usar nos cards do funil.</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {labels.map((label) => (
            <div key={label.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2.5">
              <span className="inline-flex min-w-0 items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-white" style={{ backgroundColor: label.color }}>
                <Tag className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label.name}</span>
              </span>
              <div className="flex shrink-0 items-center">
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar ${label.name}`} onClick={() => beginEdit(label)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="destructive-ghost" className="h-8 w-8" aria-label={`Excluir ${label.name}`} onClick={() => deleteLabel.mutate(label.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
