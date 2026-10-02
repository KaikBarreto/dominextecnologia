// ─────────────────────────────────────────────────────────────────────────────
// SalespersonActivityTab — aba "Atividade" na ficha do vendedor (5ª aba de
// `AdminSalespersonDetail`). Dois blocos:
//
//   1) Registro do dia: dois `DailyActivityPeriodCard` (manhã/tarde) + barra
//      de progresso da meta diária (contatos e reuniões agendadas).
//   2) Histórico: `ActivityHistoryTable`, no intervalo do `DateRangeFilter` da
//      página mãe.
//
// Quem decide a data sendo registrada é esta aba: vendedor vê sempre
// `brtToday()` (fixo, sem seletor); master escolhe qualquer dia (backfill).
// A trava de retroativo é espelhada aqui via `canEditActivityDate`, mas quem
// garante de verdade é a RLS (ver `useSalespersonActivity.ts`).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { DateRange } from '@/components/ui/DateRangeFilter';
import type { Salesperson } from '@/hooks/useSalespersonData';
import { brtToday } from '@/lib/date-br';
import {
  canEditActivityDate, useSalespersonActivity,
} from '@/hooks/useSalespersonActivity';
import { goalProgress } from '@/utils/activityArtFormat';
import { findPeriodRow, fromDateKey, toDateKey } from '@/utils/salespersonActivityStats';
import { DailyActivityPeriodCard } from '@/components/admin/salesperson/DailyActivityPeriodCard';
import { ActivityHistoryTable } from '@/components/admin/salesperson/ActivityHistoryTable';

interface SalespersonActivityTabProps {
  salesperson: Salesperson;
  range: DateRange;
  isMaster: boolean;
}

/** Primeira letra maiúscula — `date-fns` com `locale: ptBR` devolve o nome do
 * dia da semana em minúsculas ("sexta-feira"), e a frase fica em início de
 * sentença na tela. */
function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function GoalProgressRow({ label, value, goal }: { label: string; value: number; goal: number }) {
  const { percent, barPercent, met } = goalProgress(value, goal);
  // Três tiers, todos SATURADOS: verde ao bater, âmbar perto, azul em
  // andamento. Nada de cinza aqui — barra de estado cinza é justamente o que a
  // régua de UI do CEO proíbe, e `info` lê como "progredindo", não como erro.
  const tier: 'success' | 'warning' | 'info' = met ? 'success' : percent >= 50 ? 'warning' : 'info';
  const barClass = tier === 'success' ? 'bg-success' : tier === 'warning' ? 'bg-warning' : 'bg-info';
  const remaining = Math.max(0, goal - value);

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        <Badge variant={tier} className="shrink-0">
          {met ? 'Meta batida' : `${percent}%`}
        </Badge>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', barClass)}
          style={{ width: `${barPercent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {goal > 0
          ? met
            ? `${value} de ${goal}. Meta do dia batida.`
            : `${value} de ${goal}, faltam ${remaining} para bater a meta hoje.`
          : `${value} registrados hoje (sem meta definida).`}
      </p>
    </div>
  );
}

export function SalespersonActivityTab({ salesperson, range, isMaster }: SalespersonActivityTabProps) {
  const { data: rows = [] } = useSalespersonActivity(salesperson.id);

  const todayKey = brtToday();
  // Default ancorado em BRT, não em `new Date()`: o CEO opera da Europa, e lá
  // depois das 21h o dia local já virou enquanto em Brasília ainda é ontem.
  // Com `new Date()` o seletor abria no dia SEGUINTE ao de Brasília e o aviso de
  // retroativo aparecia sem motivo.
  const [selectedDate, setSelectedDate] = useState<Date>(() => fromDateKey(brtToday()) ?? new Date());
  const dateKey = isMaster ? toDateKey(selectedDate) : todayKey;
  const isRetroactive = isMaster && dateKey !== todayKey;
  const editable = canEditActivityDate(dateKey, isMaster);

  const morningRow = useMemo(() => findPeriodRow(rows, dateKey, 'morning'), [rows, dateKey]);
  const afternoonRow = useMemo(() => findPeriodRow(rows, dateKey, 'afternoon'), [rows, dateKey]);

  const dayContacts = (morningRow?.contacts ?? 0) + (afternoonRow?.contacts ?? 0);
  const dayMeetingsScheduled =
    (morningRow?.meetings_scheduled ?? 0) + (afternoonRow?.meetings_scheduled ?? 0);

  const goalContacts = salesperson.daily_goal_contacts ?? 200;
  const goalMeetingsScheduled = salesperson.daily_goal_meetings_scheduled ?? 5;

  const todayDateObj = fromDateKey(todayKey);
  const extenseToday = todayDateObj
    ? capitalize(format(todayDateObj, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR }))
    : todayKey;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">Registro do dia</h3>
          {isMaster ? (
            <div className="flex flex-col gap-1 sm:items-end">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => d && setSelectedDate(d)}
                    disabled={(d) => toDateKey(d) > todayKey}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
              {isRetroactive && (
                <p className="text-xs text-warning">Registro retroativo, você é admin.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{extenseToday}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DailyActivityPeriodCard
            period="morning"
            row={morningRow}
            salespersonId={salesperson.id}
            salespersonName={salesperson.name}
            salespersonPhotoUrl={salesperson.photo_url}
            dateKey={dateKey}
            editable={editable}
            dayContacts={dayContacts}
            dayMeetingsScheduled={dayMeetingsScheduled}
            goalContacts={goalContacts}
            goalMeetingsScheduled={goalMeetingsScheduled}
          />
          <DailyActivityPeriodCard
            period="afternoon"
            row={afternoonRow}
            salespersonId={salesperson.id}
            salespersonName={salesperson.name}
            salespersonPhotoUrl={salesperson.photo_url}
            dateKey={dateKey}
            editable={editable}
            dayContacts={dayContacts}
            dayMeetingsScheduled={dayMeetingsScheduled}
            goalContacts={goalContacts}
            goalMeetingsScheduled={goalMeetingsScheduled}
          />
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="mb-3 text-sm font-semibold">Progresso da meta do dia</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <GoalProgressRow label="Contatos / Prospecções" value={dayContacts} goal={goalContacts} />
            <GoalProgressRow label="Reuniões agendadas" value={dayMeetingsScheduled} goal={goalMeetingsScheduled} />
          </div>
        </div>
      </div>

      <ActivityHistoryTable
        rows={rows}
        range={range}
        todayKey={todayKey}
        goals={{ contacts: goalContacts, meetingsScheduled: goalMeetingsScheduled }}
      />
    </div>
  );
}
