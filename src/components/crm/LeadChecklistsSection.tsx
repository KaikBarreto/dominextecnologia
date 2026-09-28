import { useState } from 'react';
import { CheckSquare2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  createCrmCardItemId,
  useCrmChecklistTemplates,
  useLeadCardTools,
  type CrmLeadChecklist,
} from '@/hooks/useCrmCardTools';

interface LeadChecklistsSectionProps {
  leadId: string;
  admin?: boolean;
}

export function LeadChecklistsSection({ leadId, admin = false }: LeadChecklistsSectionProps) {
  const { templates } = useCrmChecklistTemplates(admin);
  const { checklists, updateCardTools } = useLeadCardTools(leadId, admin);
  const [adding, setAdding] = useState(false);
  const [templateId, setTemplateId] = useState('blank');
  const [title, setTitle] = useState('');
  const [newItems, setNewItems] = useState<Record<string, string>>({});

  const save = (next: CrmLeadChecklist[]) => updateCardTools.mutate({ checklists: next });

  const addChecklist = () => {
    const template = templates.find((item) => item.id === templateId);
    const checklistTitle = title.trim() || template?.name || '';
    if (!checklistTitle) return;
    save([...checklists, {
      id: createCrmCardItemId(),
      title: checklistTitle,
      templateId: template?.id ?? null,
      items: template?.items.map((item) => ({ ...item, id: createCrmCardItemId(), done: false })) ?? [],
    }]);
    setTitle('');
    setTemplateId('blank');
    setAdding(false);
  };

  const updateOne = (id: string, change: (checklist: CrmLeadChecklist) => CrmLeadChecklist) => {
    save(checklists.map((checklist) => checklist.id === id ? change(checklist) : checklist));
  };

  return (
    <section className="space-y-3" aria-label="Checklists da oportunidade">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <CheckSquare2 className="h-4 w-4" /> Checklists
        </h3>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => setAdding((value) => !value)}>
          <Plus className="h-3.5 w-3.5" /> Adicionar checklist
        </Button>
      </div>

      {adding && (
        <div className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-2">
          <Select value={templateId} onValueChange={(value) => { setTemplateId(value); const found = templates.find((item) => item.id === value); if (found) setTitle(found.name); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="blank">Checklist em branco</SelectItem>
              {templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Nome do checklist" />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
            <Button size="sm" onClick={addChecklist} disabled={!title.trim()}>Adicionar</Button>
          </div>
        </div>
      )}

      {checklists.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">Nenhum checklist nesta oportunidade.</p>
      ) : checklists.map((checklist) => {
        const completed = checklist.items.filter((item) => item.done).length;
        const progress = checklist.items.length ? Math.round((completed / checklist.items.length) * 100) : 0;
        return (
          <div key={checklist.id} className="space-y-3 rounded-xl bg-muted/30 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{checklist.title}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-9 text-xs text-muted-foreground">{progress}%</span>
                  <Progress value={progress} className="h-2" />
                </div>
              </div>
              <Button type="button" size="icon" variant="destructive-ghost" className="h-8 w-8" aria-label={`Excluir ${checklist.title}`} onClick={() => save(checklists.filter((item) => item.id !== checklist.id))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-1">
              {checklist.items.map((item) => (
                <div key={item.id} className="group flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-background/70">
                  <Checkbox checked={item.done} onCheckedChange={(checked) => updateOne(checklist.id, (current) => ({ ...current, items: current.items.map((row) => row.id === item.id ? { ...row, done: checked === true } : row) }))} />
                  <span className={item.done ? 'flex-1 text-sm text-muted-foreground line-through' : 'flex-1 text-sm'}>{item.text}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Remover ${item.text}`} onClick={() => updateOne(checklist.id, (current) => ({ ...current, items: current.items.filter((row) => row.id !== item.id) }))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={(event) => {
              event.preventDefault();
              const text = (newItems[checklist.id] ?? '').trim();
              if (!text) return;
              updateOne(checklist.id, (current) => ({ ...current, items: [...current.items, { id: createCrmCardItemId(), text, done: false }] }));
              setNewItems((current) => ({ ...current, [checklist.id]: '' }));
            }}>
              <Input value={newItems[checklist.id] ?? ''} onChange={(event) => setNewItems((current) => ({ ...current, [checklist.id]: event.target.value }))} placeholder="Adicionar item" className="h-9" />
              <Button type="submit" size="sm" variant="outline" disabled={!(newItems[checklist.id] ?? '').trim()}><Plus className="h-4 w-4" /></Button>
            </form>
          </div>
        );
      })}
    </section>
  );
}
