import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ListChecks, Wrench, Check, X, MinusCircle, AlertTriangle, Lock, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { OsPhotoField } from '@/components/technician/OsPhotoField';
import {
  type ChecklistActivity,
  type ChecklistEquipmentGroup,
  type ActivityConformity,
  freqLabel,
  isOutOfRange,
} from '@/hooks/useOsActivityChecklist';

interface Props {
  /** OS dona das atividades — usado no path das fotos no bucket. */
  serviceOrderId: string;
  groups: ChecklistEquipmentGroup[];
  readOnly?: boolean;
  onSave: (
    activityId: string,
    patch: {
      conformity_status?: ActivityConformity | null;
      measured_value?: number | null;
      activity_photos?: string | null;
    }
  ) => Promise<void>;
}

/** Número PT-BR: aceita vírgula ou ponto; vazio = null. */
function parseNumber(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '') return null;
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

const CONFORMITY_OPTIONS: {
  value: ActivityConformity;
  label: string;
  icon: typeof Check;
  active: string;
}[] = [
  { value: 'conforme', label: 'Conforme', icon: Check, active: 'bg-success text-success-foreground border-success' },
  { value: 'nao_conforme', label: 'Não-conforme', icon: X, active: 'bg-destructive text-destructive-foreground border-destructive' },
  { value: 'na', label: 'N/A', icon: MinusCircle, active: 'bg-muted text-muted-foreground border-border' },
];

function ActivityRow({
  serviceOrderId,
  activity,
  readOnly,
  onSave,
}: {
  serviceOrderId: string;
  activity: ChecklistActivity;
  readOnly?: boolean;
  onSave: Props['onSave'];
}) {
  const { toast } = useToast();
  // Estado local do input (string) pra permitir digitar vírgula sem perder foco.
  const [measureText, setMeasureText] = useState<string>(
    activity.measured_value !== null ? String(activity.measured_value).replace('.', ',') : ''
  );
  const [savingStatus, setSavingStatus] = useState(false);

  const photoUrls = (activity.activity_photos || '').split(',').filter(Boolean);
  const isNaoConforme = activity.conformity_status === 'nao_conforme';
  // Abre o campo de foto: por padrão fechado quando vazio, mas já abre quando há
  // foto OU quando a atividade é não-conforme (evidência recomendada).
  const [photoOpen, setPhotoOpen] = useState<boolean>(photoUrls.length > 0);

  const freq = freqLabel(activity.freq_code);
  const currentNumber =
    activity.measured_value !== null ? activity.measured_value : parseNumber(measureText);
  const outOfRange =
    activity.is_measurement &&
    isOutOfRange(currentNumber, activity.expected_min, activity.expected_max);

  const rangeText = (() => {
    const { expected_min: lo, expected_max: hi, unit } = activity;
    const u = unit ? ` ${unit}` : '';
    if (lo !== null && hi !== null) return `Faixa: ${lo}–${hi}${u}`;
    if (lo !== null) return `Mín: ${lo}${u}`;
    if (hi !== null) return `Máx: ${hi}${u}`;
    return null;
  })();

  const setStatus = async (value: ActivityConformity) => {
    if (readOnly || savingStatus) return;
    const next = activity.conformity_status === value ? null : value;
    setSavingStatus(true);
    try {
      await onSave(activity.id, { conformity_status: next });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Não foi possível salvar', description: getErrorMessage(error) });
    } finally {
      setSavingStatus(false);
    }
  };

  const commitMeasure = async () => {
    if (readOnly) return;
    const value = parseNumber(measureText);
    if (value === activity.measured_value) return; // nada mudou
    try {
      await onSave(activity.id, { measured_value: value });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Não foi possível salvar a medição', description: getErrorMessage(error) });
    }
  };

  // Salva o CSV de fotos da atividade (idempotente — UPDATE por id). Erro reverte
  // no hook e relança; aqui só damos o feedback.
  const savePhotos = async (csv: string | null) => {
    try {
      await onSave(activity.id, { activity_photos: csv });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Não foi possível salvar a foto', description: getErrorMessage(error) });
    }
  };

  return (
    <div className="py-3 border-b last:border-0 space-y-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {activity.section && (
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {activity.section}
              {activity.component ? ` · ${activity.component}` : ''}
            </p>
          )}
          <p className="text-sm font-medium text-foreground break-words">{activity.description}</p>
          {activity.guidance && (
            <p className="text-xs text-muted-foreground break-words mt-0.5">{activity.guidance}</p>
          )}
        </div>
        {freq && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {freq}
          </Badge>
        )}
      </div>

      {/* Conforme / Não-conforme / N/A */}
      <div className="grid grid-cols-3 gap-1.5">
        {CONFORMITY_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = activity.conformity_status === opt.value;
          return (
            <Button
              key={opt.value}
              type="button"
              variant="outline"
              size="sm"
              disabled={readOnly || savingStatus}
              onClick={() => setStatus(opt.value)}
              className={cn(
                'h-9 gap-1.5 text-xs',
                selected ? opt.active : 'text-muted-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {opt.label}
            </Button>
          );
        })}
      </div>

      {/* Medição numérica com faixa esperada */}
      {activity.is_measurement && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="decimal"
              placeholder="Valor medido"
              value={measureText}
              disabled={readOnly}
              onChange={(e) => setMeasureText(e.target.value)}
              onBlur={commitMeasure}
              className={cn('h-9 text-sm', outOfRange && 'border-destructive focus-visible:ring-destructive')}
            />
            {activity.unit && (
              <span className="text-sm text-muted-foreground shrink-0">{activity.unit}</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            {rangeText && <span className="text-[11px] text-muted-foreground">{rangeText}</span>}
            {outOfRange && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-destructive ml-auto">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Fora da faixa esperada
              </span>
            )}
          </div>
        </div>
      )}

      {/* Foto opcional (nunca obrigatória, não bloqueia finalizar). Realça quando
          a atividade é não-conforme: evidência recomendada, mas sem obrigar. */}
      {photoOpen || photoUrls.length > 0 ? (
        <div className="space-y-1.5">
          {isNaoConforme && (
            <p className="flex items-center gap-1 text-[11px] font-medium text-destructive">
              <Camera className="h-3 w-3 shrink-0" />
              Recomendado anexar evidência da não-conformidade
            </p>
          )}
          <OsPhotoField
            serviceOrderId={serviceOrderId}
            pathPrefix={`activity-${activity.id}`}
            value={activity.activity_photos}
            onChange={savePhotos}
            readOnly={readOnly}
            showEmptyPlaceholder={false}
          />
        </div>
      ) : (
        !readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPhotoOpen(true)}
            className={cn(
              'h-8 gap-1.5 text-xs',
              isNaoConforme
                ? 'border-destructive/60 text-destructive hover:bg-destructive/10'
                : 'text-muted-foreground',
            )}
          >
            <Camera className="h-3.5 w-3.5 shrink-0" />
            {isNaoConforme ? 'Anexar evidência (recomendado)' : 'Anexar foto'}
          </Button>
        )
      )}
    </div>
  );
}

/**
 * Painel "Checklist da visita" — só renderiza quando a OS tem
 * `service_order_activities` (geradas por contrato com plano). Agrupado por
 * equipamento; cada atividade tem conforme/não-conforme/N/A e, se for medição,
 * campo numérico com aviso de faixa.
 */
export function VisitChecklistPanel({ serviceOrderId, groups, readOnly, onSave }: Props) {
  if (groups.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 px-3 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl font-semibold">
          <ListChecks className="h-5 w-5 text-primary shrink-0" />
          Checklist da visita
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 pb-3 space-y-4">
        {readOnly && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-warning">
            <Lock className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm font-medium">
              OS pausada — retome o atendimento para preencher o checklist.
            </p>
          </div>
        )}
        <div className={cn('space-y-4', readOnly && 'opacity-60')}>
          {groups.map((group) => (
            <div key={group.equipmentId ?? '__local__'} className="rounded-lg border bg-muted/20">
              <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
                <Wrench className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm font-semibold truncate">{group.equipmentName}</p>
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  {group.activities.length} item{group.activities.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="px-3">
                {group.activities.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    serviceOrderId={serviceOrderId}
                    activity={activity}
                    readOnly={readOnly}
                    onSave={onSave}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
