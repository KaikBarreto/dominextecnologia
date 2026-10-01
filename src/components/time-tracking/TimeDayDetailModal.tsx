import { useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useTimeRecordsForDay, usePunchMutations, calculateWorkedMinutes, formatMinutes,
  type TimeRecord,
} from '@/hooks/useTimeRecords';
import { ManualPunchModal } from './ManualPunchModal';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignedImg } from '@/components/ui/SignedImg';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { timeInTz, timeWithSecondsInTz } from '@/lib/timezone';
import { MESSAGES } from '@/lib/i18n/messages';
import { groupIntoShifts, shiftWorkedMinutes, type Shift } from '@/lib/ponto/shifts';

const TYPE_COLORS: Record<string, string> = {
  clock_in: 'bg-success',
  break_start: 'bg-warning',
  break_end: 'bg-info',
  clock_out: 'bg-destructive',
};

// ─── Balde de registros por jornada (só apresentação) ───
//
// `groupIntoShifts` (`@/lib/ponto/shifts`) devolve só o par entrada/saída de
// cada jornada — o suficiente pra badge de contagem em TimeHistory/TimeReport.
// Esta tela também precisa mostrar break_start/break_end DENTRO da jornada
// certa, então rebaixamos os registros (já ordenados e filtrados por
// `groupIntoShifts`, mesmo critério) nos baldes usando IGUALDADE DE
// REFERÊNCIA com `shift.in`/`shift.out`: cada um é o MESMO objeto que veio de
// `records`, então dá pra achar onde cada jornada começa sem reimplementar a
// máquina de estados aqui.
function bucketRecordsByShift(records: TimeRecord[], shifts: Shift[]): TimeRecord[][] {
  const sorted = [...records]
    .filter(r => r.is_valid !== false)
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

  const buckets: TimeRecord[][] = shifts.map(() => []);
  let idx = -1;
  for (const rec of sorted) {
    const nextIdx = idx + 1;
    const next = shifts[nextIdx];
    // Um novo balde começa no `in` da próxima jornada, ou (jornada órfã, sem
    // `in`) no seu único registro, o `out`.
    if (next && (next.in === rec || (next.in === null && next.out === rec))) {
      idx = nextIdx;
    }
    if (idx >= 0) buckets[idx].push(rec);
  }
  return buckets;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string | null;
  employeeName: string;
  date: string;
}

export function TimeDayDetailModal({ open, onOpenChange, employeeId, employeeName, date }: Props) {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.timeclock.dayDetail;

  const { data: records = [], isLoading } = useTimeRecordsForDay(employeeId, date);
  const { updatePunch, deletePunch } = usePunchMutations();
  const { worked, breakMin } = calculateWorkedMinutes(records);
  const balance = worked - 480;

  // ─── Agrupamento por jornada ───
  // Com jornada noturna (migration 20260930150000) um dia pode ter 2+ pares
  // entrada→saída. `groupIntoShifts` é a mesma régua usada por TimeHistory e
  // TimeReport pra contar jornadas — aqui ela também organiza a timeline.
  const shifts = useMemo(() => groupIntoShifts(records), [records]);
  // Balde de registros (incluindo break_start/break_end) de cada jornada, na
  // mesma ordem de `shifts`. Usa igualdade de REFERÊNCIA com `shift.in`/
  // `shift.out` (o mesmo objeto que `groupIntoShifts` devolveu) pra saber onde
  // cada balde começa, sem duplicar a máquina de estados aqui.
  const shiftBuckets = useMemo(() => bucketRecordsByShift(records, shifts), [records, shifts]);

  const [editingRecord, setEditingRecord] = useState<TimeRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<TimeRecord | null>(null);

  const typeLabel = (type: string) => t.punchTypes[type as keyof typeof t.punchTypes] ?? type;

  const renderRecordRow = (rec: TimeRecord) => (
    <div key={rec.id} className="relative flex gap-3 pb-4">
      <div className={cn('absolute left-[-13px] top-1 h-3 w-3 rounded-full border-2 border-background', TYPE_COLORS[rec.type])} />
      <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-sm">{timeWithSecondsInTz(rec.recorded_at, timezone)}</span>
            <span className="text-xs text-muted-foreground">— {typeLabel(rec.type)}</span>
            {rec.edited_at && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground"
                title={t.editedTitle.replace('{{time}}', timeInTz(rec.original_recorded_at ?? rec.recorded_at, timezone))}
              >
                {t.edited}
              </Badge>
            )}
          </div>
          {rec.address && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin className="h-3 w-3" /> {rec.address}
            </div>
          )}
          {rec.photo_url && (
            <SignedImg src={rec.photo_url} alt="Selfie" className="mt-1 h-12 w-12 rounded object-cover border" />
          )}
          {rec.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{rec.notes}</p>}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant="edit-ghost"
            size="icon"
            className="h-9 w-9"
            aria-label={t.actions.edit}
            onClick={() => setEditingRecord(rec)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="destructive-ghost"
            size="icon"
            className="h-9 w-9"
            aria-label={t.actions.delete}
            onClick={() => setDeletingRecord(rec)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`${t.titlePrefix} ${employeeName}`} className="sm:max-w-[500px]">
        {isLoading ? (
          <div className="space-y-3 py-4">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
        ) : records.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">{t.noRecords}</p>
        ) : (
          <div className="space-y-6 py-2">
            {/* Timeline, agrupada por jornada. Com 1 jornada só (99% dos
                dias) NENHUM cabeçalho aparece — não pode poluir o caso
                normal. Com 2+, cada jornada ganha um cabeçalho com o total
                trabalhado dela. */}
            {shifts.map((shift, i) => (
              <div key={i} className={i > 0 ? 'pt-2' : undefined}>
                {shifts.length > 1 && (
                  <div className="flex items-baseline justify-between mb-2 px-0.5">
                    <h4 className="text-sm font-semibold">
                      {t.shiftHeading.replace('{{n}}', String(i + 1))}
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      {formatMinutes(shiftWorkedMinutes(shift))}
                    </span>
                  </div>
                )}
                <div className="relative pl-6">
                  <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />
                  {shiftBuckets[i].map(renderRecordRow)}
                </div>
              </div>
            ))}

            {/* Totals */}
            <div className="border-t pt-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">{t.totals.worked}</p>
                <p className="font-semibold">{formatMinutes(worked)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t.totals.break}</p>
                <p className="font-semibold">{formatMinutes(breakMin)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t.totals.balance}</p>
                <p className={cn('font-semibold', balance >= 0 ? 'text-success' : 'text-destructive')}>
                  {balance >= 0 ? '+' : ''}{formatMinutes(balance)}
                </p>
              </div>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {editingRecord && (
        <ManualPunchModal
          open={!!editingRecord}
          onOpenChange={(o) => { if (!o) setEditingRecord(null); }}
          employeeId={employeeId || ''}
          employeeName={employeeName}
          record={editingRecord}
          onSubmit={async (data) => {
            await updatePunch.mutateAsync({
              record: editingRecord,
              type: data.type,
              recordedAt: data.recordedAt,
              notes: data.notes,
            });
            setEditingRecord(null);
          }}
        />
      )}

      <AlertDialog open={!!deletingRecord} onOpenChange={(o) => { if (!o) setDeletingRecord(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteConfirm.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingRecord && t.deleteConfirm.description
                .replace('{{type}}', typeLabel(deletingRecord.type))
                .replace('{{time}}', timeInTz(deletingRecord.recorded_at, timezone))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteConfirm.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePunch.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deletingRecord) return;
                await deletePunch.mutateAsync(deletingRecord);
                setDeletingRecord(null);
              }}
            >
              {t.deleteConfirm.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
