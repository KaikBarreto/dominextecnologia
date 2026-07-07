import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PunchType } from '@/hooks/useTimeRecords';

const TYPE_OPTIONS: { value: PunchType; label: string }[] = [
  { value: 'clock_in', label: 'Entrada' },
  { value: 'break_start', label: 'Início intervalo' },
  { value: 'break_end', label: 'Fim intervalo' },
  { value: 'clock_out', label: 'Saída' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  onSubmit: (data: { employeeId: string; type: PunchType; recordedAt: string; notes: string }) => Promise<void>;
}

export function ManualPunchModal({ open, onOpenChange, employeeId, employeeName, onSubmit }: Props) {
  const [type, setType] = useState<PunchType>('clock_in');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!time || !notes.trim()) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const recordedAt = new Date(`${today}T${time}`).toISOString();
      await onSubmit({ employeeId, type, recordedAt, notes });
      setType('clock_in');
      setTime('');
      setNotes('');
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
      <Button onClick={handleSubmit} disabled={!time || !notes.trim() || loading}>
        {loading ? 'Salvando...' : 'Registrar'}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`Registro manual — ${employeeName}`} footer={footer}>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label>Tipo de registro</Label>
          <Select value={type} onValueChange={(v) => setType(v as PunchType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Horário</Label>
          <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Justificativa *</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Motivo do registro manual..." />
        </div>
      </div>
    </ResponsiveModal>
  );
}
