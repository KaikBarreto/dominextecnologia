import { format } from 'date-fns';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useTimeRecordsForDay, calculateWorkedMinutes, formatMinutes } from '@/hooks/useTimeRecords';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignedImg } from '@/components/ui/SignedImg';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const TYPE_COLORS: Record<string, string> = {
  clock_in: 'bg-success',
  break_start: 'bg-warning',
  break_end: 'bg-info',
  clock_out: 'bg-destructive',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string | null;
  employeeName: string;
  date: string;
}

export function TimeDayDetailModal({ open, onOpenChange, employeeId, employeeName, date }: Props) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.timeclock.dayDetail;

  const { data: records = [], isLoading } = useTimeRecordsForDay(employeeId, date);
  const { worked, breakMin } = calculateWorkedMinutes(records);
  const balance = worked - 480;

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`${t.titlePrefix} ${employeeName}`} className="sm:max-w-[500px]">
      {isLoading ? (
        <div className="space-y-3 py-4">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : records.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">{t.noRecords}</p>
      ) : (
        <div className="space-y-6 py-2">
          {/* Timeline */}
          <div className="relative pl-6">
            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />
            {records.map((rec) => (
              <div key={rec.id} className="relative flex gap-3 pb-4">
                <div className={cn('absolute left-[-13px] top-1 h-3 w-3 rounded-full border-2 border-background', TYPE_COLORS[rec.type])} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{format(new Date(rec.recorded_at), 'HH:mm:ss')}</span>
                    <span className="text-xs text-muted-foreground">— {t.punchTypes[rec.type as keyof typeof t.punchTypes] ?? rec.type}</span>
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
              </div>
            ))}
          </div>

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
  );
}
