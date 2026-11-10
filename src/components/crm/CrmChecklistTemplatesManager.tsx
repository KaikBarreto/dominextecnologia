import { useState } from 'react';
import { Check, CheckSquare2, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DuplicateEntityDialog } from '@/components/ui/DuplicateEntityDialog';
import { Input } from '@/components/ui/input';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  createCrmCardItemId,
  useCrmChecklistTemplates,
  type CrmChecklistTemplate,
  type CrmChecklistTemplateItem,
} from '@/hooks/useCrmCardTools';

interface CrmChecklistTemplatesManagerProps {
  admin?: boolean;
}

export function CrmChecklistTemplatesManager({ admin = false }: CrmChecklistTemplatesManagerProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm.checklistTemplates;
  const {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
  } = useCrmChecklistTemplates(admin);
  const [editing, setEditing] = useState<CrmChecklistTemplate | null>(null);
  const [duplicating, setDuplicating] = useState<CrmChecklistTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [items, setItems] = useState<CrmChecklistTemplateItem[]>([]);
  const [newItem, setNewItem] = useState('');

  const reset = () => {
    setEditing(null);
    setCreating(false);
    setName('');
    setItems([]);
    setNewItem('');
  };

  const beginEdit = (template: CrmChecklistTemplate) => {
    setCreating(false);
    setEditing(template);
    setName(template.name);
    setItems(template.items);
    setNewItem('');
  };

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    setItems((current) => [...current, { id: createCrmCardItemId(), text }]);
    setNewItem('');
  };

  const save = () => {
    if (!name.trim() || items.length === 0) return;
    if (editing) updateTemplate.mutate({ id: editing.id, name, items }, { onSuccess: reset });
    else createTemplate.mutate({ name, items }, { onSuccess: reset });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Modelos de checklist</h3>
          <p className="text-sm text-muted-foreground">Padronize etapas que podem ser aplicadas a qualquer oportunidade.</p>
        </div>
        {!creating && !editing && (
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1.5 h-4 w-4" /> Novo modelo</Button>
        )}
      </div>

      {(creating || editing) && (
        <div className="space-y-3 rounded-xl bg-muted/40 p-3 sm:p-4">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do checklist" autoFocus />
          <div className="space-y-1.5">
            {items.map((item, index) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm">
                <span className="w-5 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
                <span className="flex-1">{item.text}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} aria-label={`Remover ${item.text}`}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              placeholder="Novo item do checklist"
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addItem(); } }}
            />
            <Button type="button" variant="outline" onClick={addItem} disabled={!newItem.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={reset}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={!name.trim() || items.length === 0 || createTemplate.isPending || updateTemplate.isPending}>
              <Check className="mr-1.5 h-4 w-4" /> Salvar modelo
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando modelos...</p>
      ) : templates.length === 0 ? (
        <div className="rounded-xl bg-muted/30 px-4 py-8 text-center">
          <CheckSquare2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nenhum modelo cadastrado</p>
          <p className="text-sm text-muted-foreground">Crie um checklist reutilizável para seu processo comercial.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <div key={template.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{template.name}</p>
                <p className="text-xs text-muted-foreground">{template.items.length} {template.items.length === 1 ? 'item' : 'itens'}</p>
              </div>
              <RowActionsMenu
                ariaLabel={`Ações de ${template.name}`}
                actions={[
                  {
                    label: t.actionDuplicate,
                    icon: Copy,
                    onClick: () => setDuplicating(template),
                  },
                  {
                    label: 'Editar',
                    icon: Pencil,
                    variant: 'edit',
                    onClick: () => beginEdit(template),
                  },
                  {
                    label: 'Excluir',
                    icon: Trash2,
                    variant: 'delete',
                    onClick: () => deleteTemplate.mutate(template.id),
                  },
                ]}
              />
            </div>
          ))}
        </div>
      )}

      <DuplicateEntityDialog
        open={!!duplicating}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDuplicating(null);
        }}
        initialName={duplicating ? `${duplicating.name} - ${t.duplicateNameSuffix}` : ''}
        isPending={duplicateTemplate.isPending}
        maxNameLength={100}
        labels={{
          title: t.duplicateTitle,
          description: t.duplicateDescription,
          nameLabel: t.duplicateNameLabel,
          quantityLabel: t.duplicateQuantityLabel,
          quantityHint: t.duplicateQuantityHint,
          copyHint: t.duplicateCopyHint,
          cancel: t.duplicateCancel,
          confirm: t.duplicateConfirm,
          confirming: t.duplicateConfirming,
          nameRequired: t.duplicateNameRequired,
          quantityInvalid: t.duplicateQuantityInvalid,
        }}
        onConfirm={async (baseName, copyCount) => {
          if (!duplicating) return;
          await duplicateTemplate.mutateAsync({ source: duplicating, baseName, copyCount });
          setDuplicating(null);
        }}
      />
    </div>
  );
}
