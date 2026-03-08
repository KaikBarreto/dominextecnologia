import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { XCircle } from 'lucide-react';

const LOSS_REASONS = [
  'Preço alto',
  'Concorrente escolhido',
  'Sem orçamento',
  'Não respondeu',
  'Projeto cancelado',
  'Fora do escopo',
  'Outro',
];

interface LossReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, details: string) => void;
  leadTitle?: string;
}

export function LossReasonDialog({ open, onOpenChange, onConfirm, leadTitle }: LossReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  const handleConfirm = () => {
    onConfirm(reason, details);
    setReason('');
    setDetails('');
  };

  const handleCancel = () => {
    setReason('');
    setDetails('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            Motivo da Perda
          </DialogTitle>
        </DialogHeader>

        {leadTitle && (
          <p className="text-sm text-muted-foreground">
            Registre o motivo da perda do negócio <strong>"{leadTitle}"</strong>
          </p>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {LOSS_REASONS.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Detalhes (opcional)</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Adicione mais detalhes sobre a perda..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={!reason}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Confirmar Perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
