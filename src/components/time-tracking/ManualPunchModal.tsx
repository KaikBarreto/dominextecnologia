import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PunchType, TimeRecord } from '@/hooks/useTimeRecords';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { timeInTz, todayInTz, zonedDateTimeToUtc } from '@/lib/timezone';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  /** Presente = modo edição (pré-preenche data/hora/tipo/observação do registro). */
  record?: TimeRecord | null;
  onSubmit: (data: { employeeId: string; type: PunchType; recordedAt: string; notes: string }) => Promise<void>;
}

export function ManualPunchModal({ open, onOpenChange, employeeId, employeeName, record, onSubmit }: Props) {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.timeclock.manualPunch;
  const isEdit = !!record;

  const TYPE_OPTIONS: { value: PunchType; label: string }[] = [
    { value: 'clock_in', label: t.punchTypes.clock_in },
    { value: 'break_start', label: t.punchTypes.break_start },
    { value: 'break_end', label: t.punchTypes.break_end },
    { value: 'clock_out', label: t.punchTypes.clock_out },
  ];

  const [type, setType] = useState<PunchType>(record?.type ?? 'clock_in');
  const [date, setDate] = useState(record ? record.date : todayInTz(timezone));
  // A hora exibida é a do relógio da EMPRESA — `new Date(...)` formataria no fuso
  // do aparelho do gestor e deslocaria a batida em horas sem erro na tela.
  const [time, setTime] = useState(record ? timeInTz(record.recorded_at, timezone) : '');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!time || !notes.trim()) return;
    setLoading(true);
    try {
      // A hora digitada é a do relógio da EMPRESA, no dia da empresa. Antes o
      // dia vinha de toISOString() (dia UTC, que às 22:00 de Brasília já virou)
      // e a hora era interpretada no fuso do aparelho do admin, então quem
      // lançava de outro fuso gravava o instante errado no espelho.
      // No modo edição o dia é o que o gestor escolheu no campo Data; no
      // lançamento é sempre hoje no fuso da empresa.
      const recordedAt = zonedDateTimeToUtc(isEdit ? date : todayInTz(timezone), time, timezone);
      await onSubmit({ employeeId, type, recordedAt, notes });
      if (!isEdit) {
        setType('clock_in');
        setDate(todayInTz(timezone));
        setTime('');
        setNotes('');
      }
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
      <Button onClick={handleSubmit} disabled={!time || !notes.trim() || loading}>
        {loading ? t.submitting : isEdit ? t.submitEdit : t.submit}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`${isEdit ? t.titlePrefixEdit : t.titlePrefix} ${employeeName}`}
      footer={footer}
    >
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label>{t.typeLabel}</Label>
          <Select value={type} onValueChange={(v) => setType(v as PunchType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {isEdit && (
          <div className="space-y-2">
            <Label>{t.dateLabel}</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        )}
        <div className="space-y-2">
          <Label>{t.timeLabel}</Label>
          <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t.notesLabel}</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={isEdit ? t.notesPlaceholderEdit : t.notesPlaceholder} />
        </div>
      </div>
    </ResponsiveModal>
  );
}
