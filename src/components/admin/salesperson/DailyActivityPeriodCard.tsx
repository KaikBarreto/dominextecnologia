// ─────────────────────────────────────────────────────────────────────────────
// DailyActivityPeriodCard — bloco de UM período (manhã OU tarde) do diário
// comercial. Card "burro": quem decide SE o período pode ser editado
// (`editable`) é quem monta a aba (`SalespersonActivityTab`), que já sabe a
// regra de retroativo (`canEditActivityDate`). Este card só obedece.
//
// Chama `useUpsertDailyActivity()` direto (é hook, não `supabase.from`) — cada
// card tem o próprio estado de `isPending`, então salvar a manhã não trava o
// botão da tarde.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { Pencil, Sun, Sunset, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumericInput } from '@/components/ui/numeric-input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ActivityArtButton } from '@/components/admin/salesperson/ActivityArtButton';
import {
  ACTIVITY_METRIC_LABEL, ACTIVITY_PERIOD_LABEL, useUpsertDailyActivity,
  type ActivityPeriod, type DailyActivityRow,
} from '@/hooks/useSalespersonActivity';
import type { ActivityArtInput } from '@/utils/salespersonActivityArt';

interface FieldsState {
  contacts: string;
  meetings_scheduled: string;
  meetings_held: string;
  sales_count: string;
  notes: string;
}

const EMPTY_FIELDS: FieldsState = {
  contacts: '',
  meetings_scheduled: '',
  meetings_held: '',
  sales_count: '',
  notes: '',
};

function fieldsFromRow(row: DailyActivityRow | null): FieldsState {
  if (!row) return { ...EMPTY_FIELDS };
  return {
    contacts: String(row.contacts ?? 0),
    meetings_scheduled: String(row.meetings_scheduled ?? 0),
    meetings_held: String(row.meetings_held ?? 0),
    sales_count: String(row.sales_count ?? 0),
    notes: row.notes ?? '',
  };
}

const num = (v: string): number => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

interface DailyActivityPeriodCardProps {
  period: ActivityPeriod;
  row: DailyActivityRow | null;
  salespersonId: string;
  salespersonName: string;
  salespersonPhotoUrl: string | null;
  /** 'yyyy-MM-dd' do dia sendo registrado (hoje, pro vendedor; qualquer dia, pro master). */
  dateKey: string;
  /** Decidido por quem monta a tela — espelha `canEditActivityDate`. */
  editable: boolean;
  /** Acumulado do DIA (manhã + tarde) — usado só pra alimentar a arte. */
  dayContacts: number;
  dayMeetingsScheduled: number;
  goalContacts: number;
  goalMeetingsScheduled: number;
}

export function DailyActivityPeriodCard({
  period, row, salespersonId, salespersonName, salespersonPhotoUrl, dateKey, editable,
  dayContacts, dayMeetingsScheduled, goalContacts, goalMeetingsScheduled,
}: DailyActivityPeriodCardProps) {
  const upsert = useUpsertDailyActivity();
  const [fields, setFields] = useState<FieldsState>(() => fieldsFromRow(row));
  const [isEditing, setIsEditing] = useState(!row);
  const [confirmZeroOpen, setConfirmZeroOpen] = useState(false);

  // Resincroniza o formulário quando o dia muda ou quando o registro é
  // atualizado (ex.: depois de salvar). `updated_at` muda a cada upsert —
  // usar como parte da chave evita resetar o formulário a cada re-render
  // (o que apagaria o que o usuário está digitando no meio da edição).
  const syncKey = `${dateKey}:${row?.updated_at ?? 'none'}`;
  const syncKeyRef = useRef<string>('');
  useEffect(() => {
    if (syncKeyRef.current === syncKey) return;
    syncKeyRef.current = syncKey;
    setFields(fieldsFromRow(row));
    setIsEditing(!row);
  }, [syncKey, row]);

  const doSave = () => {
    upsert.mutate(
      {
        salesperson_id: salespersonId,
        activity_date: dateKey,
        period,
        contacts: num(fields.contacts),
        meetings_scheduled: num(fields.meetings_scheduled),
        meetings_held: num(fields.meetings_held),
        sales_count: num(fields.sales_count),
        notes: fields.notes,
      },
      { onSuccess: () => setIsEditing(false) },
    );
  };

  const handleSaveClick = () => {
    const allZero =
      num(fields.contacts) === 0 &&
      num(fields.meetings_scheduled) === 0 &&
      num(fields.meetings_held) === 0 &&
      num(fields.sales_count) === 0;
    if (allZero) {
      setConfirmZeroOpen(true);
      return;
    }
    doSave();
  };

  const periodLabel = ACTIVITY_PERIOD_LABEL[period];
  const Icon = period === 'morning' ? Sun : Sunset;

  const artInput: ActivityArtInput = {
    salespersonName,
    salespersonPhotoUrl,
    activityDate: dateKey,
    period,
    contacts: row?.contacts ?? 0,
    meetingsScheduled: row?.meetings_scheduled ?? 0,
    meetingsHeld: row?.meetings_held ?? 0,
    salesCount: row?.sales_count ?? 0,
    notes: row?.notes ?? null,
    dayContacts,
    dayMeetingsScheduled,
    goalContacts,
    goalMeetingsScheduled,
    generatedAtIso: new Date().toISOString(),
  };

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-3">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <CardTitle className="text-base truncate">{periodLabel}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editable && !row ? (
          <p className="text-sm text-muted-foreground">
            Registro permitido somente no próprio dia.
          </p>
        ) : isEditing ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${period}-contacts`} className="text-xs">
                  {ACTIVITY_METRIC_LABEL.contacts}
                </Label>
                <NumericInput
                  id={`${period}-contacts`}
                  value={fields.contacts}
                  onValueChange={(v) => setFields((f) => ({ ...f, contacts: v }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${period}-meetings-scheduled`} className="text-xs">
                  {ACTIVITY_METRIC_LABEL.meetings_scheduled}
                </Label>
                <NumericInput
                  id={`${period}-meetings-scheduled`}
                  value={fields.meetings_scheduled}
                  onValueChange={(v) => setFields((f) => ({ ...f, meetings_scheduled: v }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${period}-meetings-held`} className="text-xs">
                  {ACTIVITY_METRIC_LABEL.meetings_held}
                </Label>
                <NumericInput
                  id={`${period}-meetings-held`}
                  value={fields.meetings_held}
                  onValueChange={(v) => setFields((f) => ({ ...f, meetings_held: v }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${period}-sales`} className="text-xs">
                  {ACTIVITY_METRIC_LABEL.sales_count}
                </Label>
                <NumericInput
                  id={`${period}-sales`}
                  value={fields.sales_count}
                  onValueChange={(v) => setFields((f) => ({ ...f, sales_count: v }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${period}-notes`} className="text-xs">Observação (opcional)</Label>
              <Textarea
                id={`${period}-notes`}
                rows={2}
                value={fields.notes}
                onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Algo relevante sobre o período..."
              />
            </div>
            <div className="flex gap-2">
              {row && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => { setFields(fieldsFromRow(row)); setIsEditing(false); }}
                  disabled={upsert.isPending}
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                className="flex-1"
                onClick={handleSaveClick}
                disabled={upsert.isPending}
              >
                {upsert.isPending ? 'Salvando...' : `Salvar ${periodLabel.toLowerCase()}`}
              </Button>
            </div>
          </>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{ACTIVITY_METRIC_LABEL.contacts}</dt>
                <dd className="font-semibold tabular-nums">{row?.contacts ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{ACTIVITY_METRIC_LABEL.meetings_scheduled}</dt>
                <dd className="font-semibold tabular-nums">{row?.meetings_scheduled ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{ACTIVITY_METRIC_LABEL.meetings_held}</dt>
                <dd className="font-semibold tabular-nums">{row?.meetings_held ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{ACTIVITY_METRIC_LABEL.sales_count}</dt>
                <dd className="font-semibold tabular-nums">{row?.sales_count ?? 0}</dd>
              </div>
            </dl>
            {row?.notes && (
              <p className="text-xs text-muted-foreground border-l-2 pl-2">{row.notes}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setIsEditing(true)}
                disabled={!editable}
                title={editable ? undefined : 'Registro permitido somente no próprio dia.'}
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            </div>
            {!editable && (
              <p className="text-xs text-muted-foreground">Registro permitido somente no próprio dia.</p>
            )}
            <ActivityArtButton data={artInput} />
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmZeroOpen} onOpenChange={setConfirmZeroOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvar período zerado?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os números de {periodLabel.toLowerCase()} estão em zero. Isso também é um dado
              válido (dia fraco acontece), mas confirme que não foi só esquecimento de preencher.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmZeroOpen(false); doSave(); }}>
              Salvar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
