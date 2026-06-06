import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AdminTask } from '@/hooks/useAdminTasks';

interface CompleteTaskModalProps {
  task: AdminTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Conclui a tarefa via hook (updateTask): status='resolvido' + observação. */
  onConfirm: (taskId: string, observation: string | null) => void;
  isLoading?: boolean;
}

/**
 * Modal de conclusão de tarefa de follow-up. Coleta uma observação opcional
 * sobre o contato e marca a tarefa como resolvida. A trigger de banco cuida de
 * registrar a interação no lead vinculado.
 */
export function CompleteTaskModal({ task, open, onOpenChange, onConfirm, isLoading }: CompleteTaskModalProps) {
  const [observation, setObservation] = useState('');

  const handleConfirm = () => {
    if (!task) return;
    onConfirm(task.id, observation.trim() || null);
    setObservation('');
    onOpenChange(false);
  };

  const step = task?.followup_step;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => { if (!o) setObservation(''); onOpenChange(o); }}
      title={step ? `Concluir Follow up ${step}/10` : 'Concluir tarefa'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isLoading ? 'Concluindo...' : 'Concluir'}
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Você pode registrar uma observação rápida sobre o contato (opcional).
        </p>
        <Label htmlFor="task-observation">Observação</Label>
        <Textarea
          id="task-observation"
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          placeholder="Ex: Cliente pediu proposta, retornar na próxima semana."
          rows={3}
          maxLength={500}
          autoFocus
        />
      </div>
    </ResponsiveModal>
  );
}
