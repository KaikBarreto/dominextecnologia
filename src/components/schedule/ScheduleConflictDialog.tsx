import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ScheduleConflictItem } from '@/lib/scheduleBooking';

interface ScheduleConflictDialogProps {
  open: boolean;
  conflicts: ScheduleConflictItem[];
  canOverride: boolean;
  isLoading?: boolean;
  onCancel: () => void;
  onOverride: (reason: string) => void;
}

export function ScheduleConflictDialog({
  open,
  conflicts,
  canOverride,
  isLoading = false,
  onCancel,
  onOverride,
}: ScheduleConflictDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  const conflictLabels = conflicts.slice(0, 3).map((conflict) => {
    const number = conflict.order_number ? `OS #${conflict.order_number}` : 'Outro atendimento';
    const names = conflict.assignee_names?.join(', ');
    const time = conflict.scheduled_time?.slice(0, 5);
    return [number, names, time].filter(Boolean).join(' · ');
  });

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !isLoading) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Conflito de agenda
          </AlertDialogTitle>
          <AlertDialogDescription>
            Já existe outro atendimento nesse horário para um dos responsáveis.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {conflictLabels.length > 0 && (
          <ul className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
            {conflictLabels.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}
          </ul>
        )}

        {canOverride ? (
          <div className="space-y-2">
            <Label htmlFor="schedule-conflict-reason">Justificativa obrigatória</Label>
            <Textarea
              id="schedule-conflict-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explique por que os atendimentos podem ficar no mesmo horário."
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">A autorização e a justificativa serão registradas para auditoria.</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Escolha outro horário ou outro responsável. Você não possui permissão para autorizar sobreposição.
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading} onClick={onCancel}>Voltar</AlertDialogCancel>
          {canOverride && (
            <AlertDialogAction
              disabled={isLoading || reason.trim().length < 10}
              onClick={(event) => {
                event.preventDefault();
                onOverride(reason.trim());
              }}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Autorizar conflito
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
