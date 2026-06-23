import { useState, type ReactNode } from 'react';
import { useStickyStuck } from '@/hooks/useStickyStuck';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ListChecks, Check, X, MinusCircle, AlertTriangle, Lock, Camera, ClipboardList, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { OsPhotoField } from '@/components/technician/OsPhotoField';
import { sectionLabel } from '@/utils/sectionLabel';
import { SignaturePad } from '@/components/SignaturePad';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  EquipmentChecklistHeader,
  equipmentChecklistHeaderClasses,
  useStickyHeaderHeight,
  useFollowStickyTop,
  StickyFullBleedBg,
} from '@/components/technician/EquipmentChecklistHeader';
import type { FormQuestion } from '@/types/database';
import {
  type ChecklistActivity,
  type ChecklistEquipmentGroup,
  type ChecklistFormResponse,
  type ActivityConformity,
  freqLabel,
  isOutOfRange,
  isFormResponseAnswered,
  isTemplateActivityComplete,
  visitTypeFromFreqs,
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
  /** Abre a foto do equipamento em tela cheia (mesmo viewer da OS comum). */
  onPreviewPhoto?: (url: string) => void;
  /**
   * Nome do AMBIENTE do equipamento (contract_environments.identificacao) por
   * equipment_id. Mostrado no cabeçalho do grupo, ao lado do nome do equipamento,
   * em fonte mais leve (" | 1º Andar"). Ausente/null = não mostra. Resolvido em
   * TechnicianOS (autenticado: contract_items; anônimo: não aplica — execução é só
   * autenticada).
   */
  environmentByEquipmentId?: (equipmentId: string | null) => string | null | undefined;
  /**
   * Checklists personalizados por máquina (PMOC por equipamento, Fase 3):
   * perguntas por template_id, respostas já dadas e save (upsert) por
   * (equipamento, pergunta). Quando uma atividade tem `form_template_id`, em vez
   * do item de conformidade único renderizamos as PERGUNTAS do template.
   */
  formQuestionsByTemplate?: Record<string, FormQuestion[]>;
  getFormResponse?: (
    equipmentId: string | null,
    questionId: string
  ) => ChecklistFormResponse | undefined;
  onSaveFormResponse?: (
    equipmentId: string | null,
    questionId: string,
    patch: { response_value?: string | null; response_photo_url?: string | null }
  ) => Promise<void>;
  /**
   * Accordion controlado SINGLE-OPEN (sidebar desktop): chave aberta única +
   * callback. Abrir um equipamento fecha os demais. Quando AMBOS vêm, o accordion
   * vira controlado; senão mantém o comportamento não-controlado (1º grupo aberto
   * por defaultValue) pra retrocompat.
   */
  openKey?: string | null;
  onOpenChange?: (key: string | null) => void;
  /**
   * Offset (px) do topo pro cabeçalho sticky do equipamento aberto — respeita a
   * altura do header fixo da tela de OS. Quando ausente, o header não fica sticky.
   */
  stickyTopPx?: number;
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
  index,
  readOnly,
  onSave,
}: {
  serviceOrderId: string;
  activity: ChecklistActivity;
  /** Posição 1-based pra numeração (mesmo padrão do checklist por equipamento). */
  index: number;
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
    <div className="space-y-2.5 p-3 rounded-lg bg-muted/30">
      <div className="flex items-start gap-2">
        <span className="font-bold text-muted-foreground text-sm leading-5">{index}.</span>
        <div className="flex-1 min-w-0">
          {activity.section && (
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {sectionLabel(activity.section) || activity.section}
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
 * Uma pergunta de checklist PERSONALIZADO (form_template) renderizada no MESMO
 * estilo visual dos itens PMOC: numeração, título, obrigatória com asterisco e
 * o controle conforme o tipo da pergunta.
 *
 * - `boolean` → conformidade Conforme/Não-conforme/N/A (mapeada p/ true/false/'na').
 * - `number`/`pmoc_measurement` → entrada de medição com unidade e faixa esperada.
 * - `text` → textarea. `select` → checkboxes das opções (multi). `photo` → foto
 *   (respeita require_camera / allow_multiple_photos). `signature` → assinatura.
 */
function TemplateQuestionRow({
  serviceOrderId,
  equipmentId,
  question,
  index,
  response,
  readOnly,
  onSaveResponse,
}: {
  serviceOrderId: string;
  equipmentId: string | null;
  question: FormQuestion;
  index: number;
  response: ChecklistFormResponse | undefined;
  readOnly?: boolean;
  onSaveResponse: NonNullable<Props['onSaveFormResponse']>;
}) {
  const { toast } = useToast();
  const value = response?.response_value ?? '';
  const photoCsv = response?.response_photo_url ?? null;

  // Texto/medição: estado local pra digitar livre (vírgula) sem perder foco.
  const [text, setText] = useState<string>(value);
  const [saving, setSaving] = useState(false);

  const save = async (patch: {
    response_value?: string | null;
    response_photo_url?: string | null;
  }) => {
    if (readOnly || saving) return;
    setSaving(true);
    try {
      await onSaveResponse(equipmentId, question.id, patch);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar a resposta',
        description: getErrorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const type = question.question_type;

  const renderInput = () => {
    switch (type) {
      case 'boolean': {
        // 'true' = Conforme, 'false' = Não-conforme, 'na' = N/A.
        const opts: { v: string; label: string; icon: typeof Check; active: string }[] = [
          { v: 'true', label: 'Conforme', icon: Check, active: 'bg-success text-success-foreground border-success' },
          { v: 'false', label: 'Não-conforme', icon: X, active: 'bg-destructive text-destructive-foreground border-destructive' },
          { v: 'na', label: 'N/A', icon: MinusCircle, active: 'bg-muted text-muted-foreground border-border' },
        ];
        return (
          <div className="grid grid-cols-3 gap-1.5">
            {opts.map((o) => {
              const Icon = o.icon;
              const selected = value === o.v;
              return (
                <Button
                  key={o.v}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={readOnly || saving}
                  onClick={() => save({ response_value: selected ? null : o.v })}
                  className={cn('h-9 gap-1.5 text-xs', selected ? o.active : 'text-muted-foreground')}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {o.label}
                </Button>
              );
            })}
          </div>
        );
      }

      case 'number':
      case 'pmoc_measurement': {
        const min = question.expected_min ?? null;
        const max = question.expected_max ?? null;
        const unit = question.unit ?? null;
        const num = text.trim().replace(',', '.');
        const parsed = num === '' ? null : parseFloat(num);
        const outOfRange =
          parsed !== null &&
          !Number.isNaN(parsed) &&
          isOutOfRange(parsed, min, max);
        const rangeText = (() => {
          const u = unit ? ` ${unit}` : '';
          if (min !== null && max !== null) return `Faixa: ${min}–${max}${u}`;
          if (min !== null) return `Mín: ${min}${u}`;
          if (max !== null) return `Máx: ${max}${u}`;
          return null;
        })();
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Valor medido"
                value={text}
                disabled={readOnly || saving}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => {
                  const v = text.trim();
                  if ((v === '' ? null : v) !== (value === '' ? null : value)) {
                    save({ response_value: v === '' ? null : v });
                  }
                }}
                className={cn('h-9 text-sm', outOfRange && 'border-destructive focus-visible:ring-destructive')}
              />
              {unit && <span className="text-sm text-muted-foreground shrink-0">{unit}</span>}
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
        );
      }

      case 'text':
        return (
          <Textarea
            placeholder="Digite sua resposta..."
            value={text}
            rows={2}
            disabled={readOnly || saving}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              const v = text.trim();
              if ((v === '' ? null : v) !== (value === '' ? null : value)) {
                save({ response_value: v === '' ? null : v });
              }
            }}
            className="text-sm"
          />
        );

      case 'select': {
        const options = (question.options as string[]) || [];
        const selected = value ? value.split('|||').filter(Boolean) : [];
        const toggle = (opt: string) => {
          const next = selected.includes(opt)
            ? selected.filter((v) => v !== opt)
            : [...selected, opt];
          save({ response_value: next.length ? next.join('|||') : null });
        };
        return (
          <div className="space-y-1.5">
            {options.map((opt, i) => (
              <label
                key={i}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={selected.includes(opt)}
                  onCheckedChange={() => toggle(opt)}
                  disabled={readOnly || saving}
                />
                {opt}
              </label>
            ))}
            {selected.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selected.length} selecionada{selected.length > 1 ? 's' : ''}
              </p>
            )}
          </div>
        );
      }

      case 'photo': {
        const cameraOnly = !!question.require_camera;
        const allowMultiple = (question as any).allow_multiple_photos !== false;
        return (
          <OsPhotoField
            serviceOrderId={serviceOrderId}
            pathPrefix={`form-${question.id}`}
            value={photoCsv}
            onChange={(csv) => save({ response_photo_url: csv })}
            readOnly={readOnly}
            cameraOnly={cameraOnly}
            allowMultiple={allowMultiple}
          />
        );
      }

      case 'signature':
        // Assinatura sempre centralizada (título + pad), desktop e mobile.
        return (
          <div className="flex flex-col items-center text-center w-full">
            <p className="text-sm font-medium text-foreground break-words mb-2">{question.question}</p>
            <div className="w-full max-w-md mx-auto [&_button]:mx-auto">
              <SignaturePad
                value={value || null}
                onChange={(dataUrl) => save({ response_value: dataUrl })}
                label={question.description || undefined}
                disabled={readOnly || saving}
              />
            </div>
          </div>
        );

      default:
        return <p className="text-sm text-muted-foreground">Tipo não suportado</p>;
    }
  };

  return (
    <div className="space-y-2.5 p-3 rounded-lg bg-muted/30">
      <div className="flex items-start gap-2">
        <span className="font-bold text-muted-foreground text-sm leading-5">{index}.</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground break-words">
            {question.question}
            {question.is_required && <span className="text-destructive ml-1">*</span>}
          </p>
          {question.description && (
            <p className="text-xs text-muted-foreground break-words mt-0.5">{question.description}</p>
          )}
        </div>
      </div>
      {renderInput()}
    </div>
  );
}

/**
 * Bloco de uma atividade de checklist PERSONALIZADO dentro do grupo do
 * equipamento: título com o nome do checklist + as perguntas do template.
 */
function TemplateActivityBlock({
  serviceOrderId,
  equipmentId,
  activity,
  questions,
  getFormResponse,
  readOnly,
  onSaveResponse,
}: {
  serviceOrderId: string;
  equipmentId: string | null;
  activity: ChecklistActivity;
  questions: FormQuestion[];
  getFormResponse: NonNullable<Props['getFormResponse']>;
  readOnly?: boolean;
  onSaveResponse: NonNullable<Props['onSaveFormResponse']>;
}) {
  const complete = isTemplateActivityComplete(questions, (qid) =>
    getFormResponse(equipmentId, qid)
  );
  const requiredCount = questions.filter((q) => q.is_required).length;
  const requiredAnswered = questions.filter(
    (q) => q.is_required && isFormResponseAnswered(getFormResponse(equipmentId, q.id))
  ).length;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-2.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary shrink-0" />
        <p className="text-sm font-semibold text-foreground flex-1 min-w-0 break-words">
          {activity.description || 'Checklist personalizado'}
        </p>
        {questions.length > 0 &&
          (complete ? (
            <Badge variant="success" className="gap-1 shrink-0 text-[10px]">
              <Check className="h-3 w-3" /> Concluído
            </Badge>
          ) : requiredCount > 0 ? (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {requiredAnswered}/{requiredCount}
            </Badge>
          ) : null)}
      </div>
      {questions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma pergunta configurada para este checklist.
        </p>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <TemplateQuestionRow
              key={q.id}
              serviceOrderId={serviceOrderId}
              equipmentId={equipmentId}
              question={q}
              index={idx + 1}
              response={getFormResponse(equipmentId, q.id)}
              readOnly={readOnly}
              onSaveResponse={onSaveResponse}
            />
          ))}
        </div>
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
/** Chave estável do grupo no accordion. */
function groupKey(group: ChecklistEquipmentGroup): string {
  return group.equipmentId ?? '__local__';
}

/**
 * Um equipamento do checklist de execução. Componente próprio pra hospedar o
 * `useStickyStuck` (sentinel + IntersectionObserver) de cada cabeçalho sticky.
 * O sentinel (0px) fica LOGO acima do `AccordionTrigger`: quando ele sai por cima,
 * o cabeçalho grudou → `isStuck` → sombra forte + cantos retos; senão sem sombra +
 * cantos arredondados (visual de card).
 */
function VisitChecklistItem({
  group,
  stickyTopPx,
  isOpen,
  onPreviewPhoto,
  header,
  children,
}: {
  group: ChecklistEquipmentGroup;
  stickyTopPx?: number;
  /**
   * Single-open: SÓ o equipamento ABERTO fixa o cabeçalho no topo. Fechados ficam
   * em fluxo normal (sem sticky) — assim nunca empilham nem brigam por z-index.
   */
  isOpen: boolean;
  onPreviewPhoto?: Props['onPreviewPhoto'];
  header: {
    total: number;
    naoConforme: number;
    pending: number;
    visit: { tipo: string; niveis: string[] };
    photo: string | null;
    category: { name: string; color: string | null } | null;
    brandModel: string;
    /** Nome do ambiente (fonte leve, " | …"). null = não mostra. */
    environmentName: string | null;
    /** Grupo "Geral / Local" (sem equipamento): esconde o bloco de foto/chave. */
    hidePhoto: boolean;
  };
  children: ReactNode;
}) {
  // SÓ o equipamento ABERTO fica sticky. Fechado → desativa o observer (passa
  // undefined) pra não medir/atualizar à toa. Elimina o empilhamento de vários
  // cabeçalhos sticky sobrepostos (e a invasão do header do topo).
  const stickyOn = isOpen && stickyTopPx !== undefined;
  const { total, naoConforme, pending, visit, photo, category, brandModel, environmentName, hidePhoto } = header;
  // Mede a altura do cabeçalho ANTES do useStickyStuck — o hook usa essa altura pra
  // saber onde fica a linha de BAIXO (sticky + altura) que detecta quando o item
  // passou do fim e o cabeçalho desgruda.
  const { triggerRef, height: headerHeight } = useStickyHeaderHeight();
  const { sentinelRef, bottomSentinelRef, isStuck } = useStickyStuck(stickyOn ? stickyTopPx : undefined, headerHeight);
  // MESMO mecanismo do relatório/OS normal: cabeçalho compartilhado + fundo `fixed`
  // medido (foto não cortada, full-bleed da viewport). Cor `bg-card` (segue o tema).
  const headerCls = equipmentChecklistHeaderClasses(stickyOn, isStuck);
  // Monta o fundo enquanto sticky/aberto e com altura medida (evita flash 0px). A
  // visibilidade/posição (fundo SEGUE o topo real do cabeçalho) vêm de
  // `useFollowStickyTop` — sem a janela transparente da soltura.
  const mountStuckBg = stickyOn && stickyTopPx !== undefined && headerHeight > 0;
  const { followTop, visible: bgVisible } = useFollowStickyTop(
    triggerRef,
    (stickyTopPx ?? 0) - 1,
    headerHeight,
    mountStuckBg,
  );

  return (
    <AccordionItem
      key={groupKey(group)}
      value={groupKey(group)}
      id={`os-pmoc-${groupKey(group)}`}
      className="border-0 scroll-mt-28"
    >
      {/* Sentinel do sticky: 0px logo acima do cabeçalho (detecta stuck). */}
      <div ref={sentinelRef} aria-hidden className="h-0" />
      {/* Fundo do cabeçalho grudado (full-bleed da viewport interna) — cor `bg-card`
          (tema). Mecanismo IDÊNTICO ao relatório; foto não é cortada (sem overflow). */}
      {mountStuckBg && (
        <StickyFullBleedBg top={followTop} height={headerHeight} bgClass="bg-card" visible={bgVisible} />
      )}
      <AccordionTrigger
        ref={triggerRef}
        className={headerCls.trigger}
        headerClassName={headerCls.header}
        // `-1px` no top: gruda 1px ATRÁS do header laranja (z-20 cobre o equipamento
        // z-10) pra fechar qualquer costura sub-pixel entre as duas barras.
        headerStyle={stickyOn ? { top: stickyTopPx - 1 } : undefined}
      >
        <EquipmentChecklistHeader
          // Grupo "Geral / Local" (sem equipamento) não mostra bloco de foto/chave.
          hidePhoto={hidePhoto}
          photo={photo}
          name={group.equipmentName}
          category={category}
          brandModel={brandModel}
          environmentName={environmentName}
          visit={visit}
          itemsLabel={`${total} item${total > 1 ? 's' : ''}`}
          onPreviewPhoto={onPreviewPhoto}
          statusBadge={
            naoConforme > 0 ? (
              <Badge variant="destructive" className="gap-1 text-xs shrink-0">
                <X className="h-3 w-3" />
                {naoConforme} não-conforme{naoConforme > 1 ? 's' : ''}
              </Badge>
            ) : pending === 0 ? (
              <span title="Concluído" aria-label="Concluído" className="shrink-0">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </span>
            ) : (
              <Badge variant="outline" className="text-xs shrink-0">
                {pending} pendente{pending > 1 ? 's' : ''}
              </Badge>
            )
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-1">{children}</div>
      </AccordionContent>
      {/* Sentinel da BASE: 0px logo após o conteúdo. Marca o fim do item — quando
          ele cruza a linha (sticky + altura do cabeçalho), o cabeçalho desgruda e
          o fundo/sombra some (não fica mais preso no topo passando do fim). */}
      <div ref={bottomSentinelRef} aria-hidden className="h-0" />
    </AccordionItem>
  );
}

export function VisitChecklistPanel({
  serviceOrderId,
  groups,
  readOnly,
  onSave,
  onPreviewPhoto,
  environmentByEquipmentId,
  openKey,
  onOpenChange,
  stickyTopPx,
  formQuestionsByTemplate,
  getFormResponse,
  onSaveFormResponse,
}: Props) {
  if (groups.length === 0) return null;

  const questionsByTemplate = formQuestionsByTemplate ?? {};
  // Suporte a checklist personalizado só quando o pai passa os 3 handlers.
  const canRenderTemplates = !!getFormResponse && !!onSaveFormResponse;

  /** Uma atividade de conformidade "respondida"? (pra contagem do header). */
  const isConformityAnswered = (a: ChecklistActivity) => !!a.conformity_status;
  /** Uma atividade de template "completa"? (todas as obrigatórias respondidas). */
  const isTemplateDone = (a: ChecklistActivity): boolean => {
    if (!canRenderTemplates || !a.form_template_id) return false;
    const qs = questionsByTemplate[a.form_template_id] ?? [];
    return isTemplateActivityComplete(qs, (qid) => getFormResponse!(a.equipment_id ?? null, qid));
  };

  // Requisito: 1º equipamento aberto, demais fechados, single-open (abrir um
  // fecha os outros). type="single" collapsible + defaultValue com a chave do
  // primeiro grupo.
  const firstKey = groupKey(groups[0]);
  // Controlado só quando a página passa openKey + onOpenChange (sidebar desktop).
  // Senão mantém o uso não-controlado original (defaultValue).
  const controlled = openKey !== undefined && onOpenChange !== undefined;
  // Chave do equipamento ABERTO pra decidir QUEM fica sticky. Controlado → openKey;
  // não-controlado → o 1º grupo (defaultValue). É o melhor palpite estável no modo
  // não-controlado; o execution flow sempre passa controlado.
  const effectiveOpenKey = controlled ? (openKey ?? null) : firstKey;

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
        <Accordion
          type="single"
          collapsible
          {...(controlled
            ? {
                value: openKey ?? '',
                onValueChange: (v: string) => onOpenChange!(v || null),
              }
            : { defaultValue: firstKey })}
          className={cn('w-full space-y-3', readOnly && 'opacity-60 cursor-not-allowed')}
        >
          {groups.map((group) => {
            const total = group.activities.length;
            // "Feita": conformidade marcada (atividade comum) OU todas as
            // perguntas obrigatórias respondidas (atividade de checklist próprio).
            const answered = group.activities.filter((a) =>
              a.form_template_id ? isTemplateDone(a) : isConformityAnswered(a)
            ).length;
            // Não-conforme conta tanto atividade comum quanto pergunta boolean
            // 'false' (= não-conforme) de checklist personalizado.
            const naoConforme = group.activities.filter((a) => {
              if (a.form_template_id) {
                if (!canRenderTemplates) return false;
                const qs = questionsByTemplate[a.form_template_id] ?? [];
                return qs.some(
                  (q) =>
                    q.question_type === 'boolean' &&
                    getFormResponse!(a.equipment_id ?? null, q.id)?.response_value === 'false'
                );
              }
              return a.conformity_status === 'nao_conforme';
            }).length;
            const pending = total - answered;
            // Tipo de visita + checklists exibidos, derivados das frequências das
            // atividades DESTE equipamento (atividade de checklist personalizado
            // acrescenta o nível "personalizado" sem mudar o tipo da visita).
            const visit = visitTypeFromFreqs(
              group.activities.map((a) => a.freq_code),
              { hasTemplate: group.activities.some((a) => !!a.form_template_id) }
            );
            const photo = group.equipment?.photo_url || null;
            const category = group.equipment?.category || null;
            const brandModel = [group.equipment?.brand, group.equipment?.model]
              .filter(Boolean)
              .join(' ');
            const environmentName = environmentByEquipmentId?.(group.equipmentId) || null;

            return (
              <VisitChecklistItem
                key={groupKey(group)}
                group={group}
                stickyTopPx={stickyTopPx}
                isOpen={groupKey(group) === effectiveOpenKey}
                onPreviewPhoto={onPreviewPhoto}
                header={{ total, naoConforme, pending, visit, photo, category, brandModel, environmentName, hidePhoto: group.equipmentId == null }}
              >
                {group.activities.map((activity, idx) =>
                  activity.form_template_id && canRenderTemplates ? (
                    <TemplateActivityBlock
                      key={activity.id}
                      serviceOrderId={serviceOrderId}
                      equipmentId={activity.equipment_id ?? null}
                      activity={activity}
                      questions={questionsByTemplate[activity.form_template_id] ?? []}
                      getFormResponse={getFormResponse!}
                      readOnly={readOnly}
                      onSaveResponse={onSaveFormResponse!}
                    />
                  ) : (
                    <ActivityRow
                      key={activity.id}
                      serviceOrderId={serviceOrderId}
                      activity={activity}
                      index={idx + 1}
                      readOnly={readOnly}
                      onSave={onSave}
                    />
                  )
                )}
              </VisitChecklistItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
