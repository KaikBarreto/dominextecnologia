import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  AdminTaskType,
  AdminTaskPriority,
  TASK_TYPE_CONFIG,
  TASK_TYPE_OPTIONS,
} from '@/hooks/useAdminTasks';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';

/**
 * Opção de responsável da aba Tarefas. Fonte: view `salespeople_basic`
 * (usuários do admin Auctus), NÃO profiles globais. `user_id` é o auth uid
 * que vai pra `admin_tasks.assigned_to` (mesma régua de `admin_leads.responsible_id`).
 */
export interface TaskAdminOption {
  user_id: string;
  full_name: string;
  photo_url: string | null;
}

interface TaskCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (task: {
    title: string;
    description?: string | null;
    type: AdminTaskType;
    priority: AdminTaskPriority;
    due_date?: string | null;
    assigned_to?: string | null;
  }) => void;
  admins: TaskAdminOption[];
  isLoading?: boolean;
}

// Tipos manuais: todos menos follow-up (esse é gerado automaticamente pela cadência).
const MANUAL_TYPE_OPTIONS = TASK_TYPE_OPTIONS.filter(t => t !== 'follow-up');

export function TaskCreateDialog({ open, onOpenChange, onSubmit, admins, isLoading }: TaskCreateDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<AdminTaskType>('chamado');
  const [priority, setPriority] = useState<AdminTaskPriority>('media');
  const [assignedTo, setAssignedTo] = useState<string>('none');
  const [dueDate, setDueDate] = useState('');

  const reset = () => {
    setTitle(''); setDescription(''); setType('chamado'); setPriority('media');
    setAssignedTo('none'); setDueDate('');
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error('Informe um título pra tarefa.');
      return;
    }
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      type,
      priority,
      due_date: dueDate || null,
      assigned_to: assignedTo === 'none' ? null : assignedTo,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}
      title="Nova Tarefa"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || isLoading}>
            {isLoading ? 'Criando...' : 'Criar Tarefa'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Título *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Descreva a tarefa..." />
        </div>

        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes adicionais..." rows={3} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as AdminTaskType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MANUAL_TYPE_OPTIONS.map(t => (
                  <SelectItem key={t} value={t}>{TASK_TYPE_CONFIG[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as AdminTaskPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguém</SelectItem>
                {admins.map(a => (
                  <SelectItem key={a.user_id} value={a.user_id} className="cursor-pointer">
                    <div className="flex items-center gap-2">
                      <SalespersonAvatar name={a.full_name} photoUrl={a.photo_url} size="sm" />
                      <span>{a.full_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Data limite</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
