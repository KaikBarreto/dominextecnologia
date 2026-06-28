import { useState, useEffect, useRef, useMemo } from 'react';
import { Check, X, Pencil, AlertTriangle, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errorMessages';
import { Checkbox } from '@/components/ui/checkbox';
import { SignaturePad } from '@/components/SignaturePad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { OsPhotoField } from '@/components/technician/OsPhotoField';
import { useToast } from '@/hooks/use-toast';
import type { FormQuestion } from '@/types/database';
import { computeVisibleQuestionIds } from '@/components/contracts/visitQuestionVisibility';

interface FormResponse {
  question_id: string;
  response_value: string | null;
  response_photo_url: string | null;
}

export interface FormValidationResult {
  isValid: boolean;
  missingQuestions: string[];
}

/**
 * Contexto de agendamento do contrato pra filtrar perguntas por visita (Fase B,
 * fatia B3.1). Só vem quando a OS pertence a um CONTRATO. Ausente (undefined) =
 * OS avulsa → nenhum filtro, render idêntico ao comportamento histórico.
 */
export interface ContractVisibilityContext {
  /**
   * Datas REAIS de TODAS as visitas do contrato (as `scheduled_date` de todas as
   * OSs daquele `contract_id`). É o calendário do motor E a base do índice desta
   * visita — elimina a divergência de reconstruir o calendário (plano mensal,
   * remarcação, virada de mês). Vazio/ausente → helper mostra tudo.
   */
  visitDates?: (string | null | undefined)[] | null;
  /** scheduled_date desta OS (yyyy-mm-dd). */
  scheduledDate?: string | null;
  /**
   * IDs de perguntas EXCLUÍDAS da PRIMEIRA OS DESTE equipamento (flag
   * `contract_items.first_os_excluded_questions`, fatia F3). É a âncora por
   * equipamento (Opção A do CEO): incluída → 'due_now', excluída → 'contract_start',
   * sobrescrevendo o `start_kind` do template. Só afeta perguntas COM frequência.
   * Ausente = sem flag = comportamento atual. Como é POR EQUIPAMENTO, o pai
   * (TechnicianOS) monta um contexto específico por acordeão de equipamento.
   */
  excludedQuestionIds?: Set<string>;
}

interface DynamicFormQuestionsProps {
  serviceOrderId: string;
  templateId: string;
  equipmentId?: string;
  onValidationChange?: (result: FormValidationResult) => void;
  /**
   * Bloqueia o preenchimento (OS pausada). Mantém a leitura das respostas já
   * dadas, mas desabilita toggles, inputs, uploads e edição. Liberar = retomar a OS.
   */
  readOnly?: boolean;
  /**
   * Quando setado (OS de CONTRATO), filtra as perguntas exibidas pelas que
   * "vencem" nesta visita conforme a frequência por pergunta. Perguntas sem
   * frequência e perguntas já respondidas nunca somem. Ausente = OS avulsa →
   * sem filtro. O helper `computeVisibleQuestionIds` garante o fallback
   * "mostra tudo" em qualquer incerteza.
   */
  visibility?: ContractVisibilityContext;
}

export function DynamicFormQuestions({ serviceOrderId, templateId, equipmentId, onValidationChange, readOnly = false, visibility }: DynamicFormQuestionsProps) {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, FormResponse>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);

  // Mantém a callback do pai sempre fresca SEM colocá-la nas deps do effect.
  // O pai (TechnicianOS) passa um arrow inline recriado a cada render; se ele
  // entrasse nas deps, o effect rodaria → setState no pai → novo render →
  // nova função → effect de novo = loop infinito ("Maximum update depth").
  const onValidationChangeRef = useRef(onValidationChange);
  useEffect(() => {
    onValidationChangeRef.current = onValidationChange;
  });

  // Última validação emitida, pra não notificar o pai com resultado idêntico
  // (corta re-renders desnecessários e qualquer eco de loop).
  const lastValidationRef = useRef<string | null>(null);

  // Perguntas que JÁ APARECERAM nesta sessão (FIX 4). Uma pergunta visível não
  // pode sumir no meio do preenchimento — caso clássico: o técnico LIMPA a
  // resposta de uma pergunta que não vence nesta visita; sem isto, ela some na
  // hora (some do `answeredQuestionIds` e deixa de cair no motor). Acumulamos os
  // ids num ref que NUNCA remove; unimos ao conjunto visível abaixo.
  const everShownRef = useRef<Set<string>>(new Set());

  // Perguntas VISÍVEIS nesta visita (Fase B, fatia B3.1). Só filtra quando a OS
  // é de CONTRATO (prop `visibility` presente). OS avulsa = lista intacta. O
  // helper já garante "mostra tudo" em qualquer incerteza; perguntas sem
  // frequência e já respondidas nunca somem. Filtra TANTO o render QUANTO a
  // validação de obrigatórias (pergunta escondida não pode travar a conclusão).
  const visibleQuestions = useMemo(() => {
    if (!visibility) return questions;
    const answeredQuestionIds = new Set(
      Object.values(responses)
        .filter((r) => r.response_value?.trim() || r.response_photo_url)
        .map((r) => r.question_id),
    );
    const visibleIds = computeVisibleQuestionIds({
      visitDates: visibility.visitDates,
      scheduledDate: visibility.scheduledDate,
      questions,
      answeredQuestionIds,
      excludedQuestionIds: visibility.excludedQuestionIds,
    });
    // Une as que já apareceram nesta sessão (nunca remove durante o uso).
    for (const id of everShownRef.current) visibleIds.add(id);
    const result = questions.filter((q) => visibleIds.has(q.id));
    // Registra as visíveis agora pra não sumirem em renders seguintes.
    for (const q of result) everShownRef.current.add(q.id);
    return result;
  }, [visibility, questions, responses]);

  // Troca de OS/equipamento/template = nova sessão de preenchimento → zera o
  // acumulador (senão perguntas de outra visita vazariam pra esta).
  useEffect(() => {
    everShownRef.current = new Set();
  }, [serviceOrderId, templateId, equipmentId]);

  // Validation effect — depende SÓ de dados (questions/responses), não da callback.
  useEffect(() => {
    const cb = onValidationChangeRef.current;
    if (!cb || visibleQuestions.length === 0) {
      // Sem perguntas visíveis (ex.: nenhuma vence nesta visita) → nada pendente.
      if (cb && questions.length > 0) {
        const result: FormValidationResult = { isValid: true, missingQuestions: [] };
        const signature = JSON.stringify(result);
        if (signature !== lastValidationRef.current) {
          lastValidationRef.current = signature;
          cb(result);
        }
      }
      return;
    }

    const requiredQuestions = visibleQuestions.filter(q => q.is_required);
    const missingQuestions: string[] = [];

    requiredQuestions.forEach(q => {
      const response = responses[q.id];
      const hasValue = response?.response_value?.trim() || response?.response_photo_url;
      if (!hasValue) {
        missingQuestions.push(q.question);
      }
    });

    const result: FormValidationResult = {
      isValid: missingQuestions.length === 0,
      missingQuestions,
    };

    // Só emite se mudou de fato.
    const signature = JSON.stringify(result);
    if (signature === lastValidationRef.current) return;
    lastValidationRef.current = signature;

    cb(result);
  }, [visibleQuestions, questions, responses]);

  useEffect(() => {
    fetchQuestions();
    fetchResponses();
  }, [templateId, serviceOrderId, equipmentId]);

  const fetchQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('form_questions')
        .select('*')
        .eq('template_id', templateId)
        .order('position', { ascending: true });

      if (error) throw error;
      setQuestions((data as FormQuestion[]) || []);
    } catch (error: any) {
      console.error('Error fetching questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchResponses = async () => {
    try {
      // First get question IDs for THIS template to avoid cross-equipment contamination
      const { data: templateQuestions } = await supabase
        .from('form_questions')
        .select('id')
        .eq('template_id', templateId);
      
      const questionIds = (templateQuestions || []).map(q => q.id);
      if (questionIds.length === 0) { setResponses({}); return; }

      let query = supabase
        .from('form_responses')
        .select('*')
        .eq('service_order_id', serviceOrderId)
        .in('question_id', questionIds);

      // Filter by equipment_id to isolate responses per equipment
      if (equipmentId) {
        query = query.eq('equipment_id', equipmentId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const responsesMap: Record<string, FormResponse> = {};
      (data || []).forEach((r) => {
        responsesMap[r.question_id] = {
          question_id: r.question_id,
          response_value: r.response_value,
          response_photo_url: r.response_photo_url,
        };
      });
      setResponses(responsesMap);
    } catch (error: any) {
      console.error('Error fetching responses:', error);
    }
  };

  const saveResponse = async (questionId: string, value: string | null, photoUrl?: string | null) => {
    setSaving(questionId);
    try {
      // Build query to find existing response scoped to this equipment
      let existingQuery = supabase
        .from('form_responses')
        .select('id')
        .eq('service_order_id', serviceOrderId)
        .eq('question_id', questionId);
      
      if (equipmentId) {
        existingQuery = existingQuery.eq('equipment_id', equipmentId);
      } else {
        existingQuery = existingQuery.is('equipment_id', null);
      }

      const { data: existing } = await existingQuery.single();

      if (existing) {
        const { error } = await supabase
          .from('form_responses')
          .update({
            response_value: value,
            response_photo_url: photoUrl !== undefined ? photoUrl : responses[questionId]?.response_photo_url,
            responded_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('form_responses')
          .insert({
            service_order_id: serviceOrderId,
            question_id: questionId,
            response_value: value,
            response_photo_url: photoUrl || null,
            equipment_id: equipmentId || null,
          } as any);
        if (error) throw error;
      }

      setResponses((prev) => ({
        ...prev,
        [questionId]: {
          question_id: questionId,
          response_value: value,
          response_photo_url: photoUrl !== undefined ? photoUrl : prev[questionId]?.response_photo_url || null,
        },
      }));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar resposta',
        description: getErrorMessage(error),
      });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Nenhuma pergunta configurada para este checklist.
      </p>
    );
  }

  // OS de contrato em que nenhuma pergunta vence nesta visita (todas têm
  // frequência e nenhuma caiu aqui, e nenhuma respondida). Mensagem amigável.
  if (visibleQuestions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Nenhuma pergunta prevista para esta visita.
      </p>
    );
  }

  const renderSingleTypeInput = (question: FormQuestion, type: string) => {
    const response = responses[question.id];
    const value = response?.response_value || '';
    // OS pausada (readOnly) desabilita tudo junto com o estado de salvando.
    const isSaving = saving === question.id || readOnly;

    switch (type) {
      case 'boolean':
        return (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch
                checked={value === 'true'}
                onCheckedChange={(checked) => saveResponse(question.id, checked ? 'true' : 'false')}
                disabled={isSaving}
              />
              <span className="text-sm">
                {value === 'true' ? (
                  <Badge variant="success" className="gap-1">
                    <Check className="h-3 w-3" /> Sim
                  </Badge>
                ) : value === 'false' ? (
                  <Badge variant="destructive" className="gap-1">
                    <X className="h-3 w-3" /> Não
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Não respondido</span>
                )}
              </span>
            </div>
          </div>
        );

      case 'conformidade': {
        // 3 estados fixos. Régua visual: idle = neutro com ÍCONE colorido
        // (Conforme verde, Não Conforme vermelho, N/A laranja avermelhado);
        // hover (não selecionado) === estado ativo: MESMAS classes saturadas +
        // branco, só que prefixadas com `hover:`. Strings LITERAIS (não geradas
        // em runtime) pra o Tailwind JIT enxergar e compilar o CSS. N/A usa
        // orange-600 (o mesmo do "Finalizar Parcial"), não mais slate.
        const conformOptions: {
          value: string;
          label: string;
          activeClass: string;
          idleIcon: string;
          hover: string;
          Icon: typeof Check;
        }[] = [
          {
            value: 'Conforme',
            label: 'Conforme',
            activeClass: 'bg-emerald-600 border-emerald-600 text-white [&_svg]:!text-white',
            idleIcon: '[&_svg]:text-emerald-600',
            hover: 'hover:bg-emerald-600 hover:border-emerald-600 hover:text-white hover:[&_svg]:!text-white focus-visible:bg-emerald-600 focus-visible:border-emerald-600 focus-visible:text-white focus-visible:[&_svg]:!text-white',
            Icon: Check,
          },
          {
            value: 'Não Conforme',
            label: 'Não Conforme',
            activeClass: 'bg-red-600 border-red-600 text-white [&_svg]:!text-white',
            idleIcon: '[&_svg]:text-red-600',
            hover: 'hover:bg-red-600 hover:border-red-600 hover:text-white hover:[&_svg]:!text-white focus-visible:bg-red-600 focus-visible:border-red-600 focus-visible:text-white focus-visible:[&_svg]:!text-white',
            Icon: X,
          },
          {
            value: 'N/A',
            label: 'N/A',
            activeClass: 'bg-orange-600 border-orange-600 text-white [&_svg]:!text-white',
            idleIcon: '[&_svg]:text-orange-600',
            hover: 'hover:bg-orange-600 hover:border-orange-600 hover:text-white hover:[&_svg]:!text-white focus-visible:bg-orange-600 focus-visible:border-orange-600 focus-visible:text-white focus-visible:[&_svg]:!text-white',
            Icon: Minus,
          },
        ];
        return (
          <div className="flex gap-1.5">
            {conformOptions.map((opt) => {
              const active = value === opt.value;
              const OptIcon = opt.Icon;
              const isNa = opt.value === 'N/A';
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isSaving}
                  onClick={() => saveResponse(question.id, active ? null : opt.value)}
                  className={cn(
                    'flex items-center justify-center gap-1 rounded-md border py-2 text-xs font-semibold transition-colors min-w-0',
                    isNa ? 'flex-none px-3' : 'flex-[1.3] px-2',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                    active
                      ? opt.activeClass
                      : cn('bg-card text-muted-foreground border-border', opt.idleIcon, opt.hover),
                  )}
                >
                  <OptIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        );
      }

      case 'text':
        return (
          <Textarea
            placeholder="Digite sua resposta..."
            value={value}
            onChange={(e) => setResponses((prev) => ({
              ...prev,
              [question.id]: { ...prev[question.id], question_id: question.id, response_value: e.target.value, response_photo_url: prev[question.id]?.response_photo_url || null },
            }))}
            onBlur={() => saveResponse(question.id, responses[question.id]?.response_value || null)}
            rows={2}
            disabled={isSaving}
          />
        );

      case 'number':
        return (
          <NumericInput
            decimal
            placeholder="Digite o valor..."
            value={value}
            onValueChange={(v) => setResponses((prev) => ({
              ...prev,
              [question.id]: { ...prev[question.id], question_id: question.id, response_value: v, response_photo_url: prev[question.id]?.response_photo_url || null },
            }))}
            onBlur={() => saveResponse(question.id, responses[question.id]?.response_value || null)}
            disabled={isSaving}
          />
        );

      // Onda D v1.9.x — campo sanitário PMOC.
      // Valor numérico com unidade exibida no sufixo e validação visual quando
      // sai da faixa esperada. Não bloqueia salvamento (intencional: técnico
      // precisa registrar valor anômalo pra documentar a anomalia).
      case 'pmoc_measurement': {
        const unit = question.unit ?? null;
        const min = question.expected_min ?? null;
        const max = question.expected_max ?? null;
        const numericValue = value.trim() === '' ? NaN : parseFloat(value);
        const isOutOfRange =
          !isNaN(numericValue) &&
          ((min != null && numericValue < min) ||
            (max != null && numericValue > max));

        return (
          <div className="space-y-1.5">
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="Digite a medida..."
                value={value}
                onChange={(e) =>
                  setResponses((prev) => ({
                    ...prev,
                    [question.id]: {
                      ...prev[question.id],
                      question_id: question.id,
                      response_value: e.target.value,
                      response_photo_url: prev[question.id]?.response_photo_url || null,
                    },
                  }))
                }
                onBlur={() => saveResponse(question.id, responses[question.id]?.response_value || null)}
                disabled={isSaving}
                className={cn(
                  unit ? 'pr-16' : '',
                  isOutOfRange && 'border-warning focus-visible:ring-warning',
                )}
              />
              {unit && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                  {unit}
                </span>
              )}
            </div>
            {(min != null || max != null) && (
              <p className="text-xs text-muted-foreground">
                Faixa esperada: {min ?? '—'} a {max ?? '—'}{unit ? ` ${unit}` : ''}
              </p>
            )}
            {isOutOfRange && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Valor fora da faixa esperada — confira o equipamento ou registre observação.
              </p>
            )}
          </div>
        );
      }

      case 'select':
        const options = (question.options as string[]) || [];
        const selectedValues = value ? value.split('|||').filter(Boolean) : [];
        
        const toggleOption = (opt: string) => {
          let next: string[];
          if (selectedValues.includes(opt)) {
            next = selectedValues.filter(v => v !== opt);
          } else {
            next = [...selectedValues, opt];
          }
          const newValue = next.join('|||');
          setResponses((prev) => ({
            ...prev,
            [question.id]: { ...prev[question.id], question_id: question.id, response_value: newValue, response_photo_url: prev[question.id]?.response_photo_url || null },
          }));
          saveResponse(question.id, newValue);
        };

        return (
          <div className="space-y-1.5">
            {options.map((opt, idx) => (
              <label key={idx} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
                <Checkbox
                  checked={selectedValues.includes(opt)}
                  onCheckedChange={() => toggleOption(opt)}
                  disabled={isSaving}
                />
                {opt}
              </label>
            ))}
            {selectedValues.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedValues.length} selecionada{selectedValues.length > 1 ? 's' : ''}</p>
            )}
          </div>
        );

      case 'photo': {
        const cameraOnly = !!(question as any).require_camera;
        const allowMultiple = (question as any).allow_multiple_photos !== false;

        // Toda a máquina de foto (câmera/galeria, HEIC, salvar no aparelho,
        // carrossel, viewer, remover) vive em OsPhotoField. Aqui só ligamos o
        // CSV de URLs ao response_photo_url desta pergunta/equipamento.
        return (
          <OsPhotoField
            serviceOrderId={serviceOrderId}
            pathPrefix={`form-${question.id}`}
            value={response?.response_photo_url}
            onChange={(csv) =>
              saveResponse(question.id, responses[question.id]?.response_value || null, csv)
            }
            readOnly={readOnly}
            cameraOnly={cameraOnly}
            allowMultiple={allowMultiple}
          />
        );
      }

      case 'signature':
        // Assinatura sempre centralizada (título + pad), desktop e mobile. O
        // título da pergunta vem centralizado aqui; o pad ocupa a largura do
        // wrapper e o botão Limpar/legenda ficam centrados.
        return (
          <div className="flex flex-col items-center text-center w-full">
            <p className="text-sm font-medium text-foreground break-words mb-2">{question.question}</p>
            <div className="w-full max-w-md mx-auto [&_button]:mx-auto">
              <SignaturePad
                value={value || null}
                onChange={(dataUrl) => saveResponse(question.id, dataUrl)}
                label={question.description || undefined}
                disabled={isSaving}
              />
            </div>
          </div>
        );

      default:
        return <p className="text-sm text-muted-foreground">Tipo não suportado</p>;
    }
  };

  const renderQuestionInput = (question: FormQuestion) => {
    const answerTypes = ((question as any).answer_types as string[] | null);
    const effectiveTypes = answerTypes && answerTypes.length > 0 ? answerTypes : [question.question_type];
    const answerMode = (question as any).answer_mode || 'exclusive';

    // Single type - just render it
    if (effectiveTypes.length === 1) {
      return renderSingleTypeInput(question, effectiveTypes[0]);
    }

    // Combined mode - always show all types
    if (answerMode === 'combined') {
      return (
        <div className="space-y-3">
          {effectiveTypes.map((type) => (
            <div key={type} className="space-y-1">
              <Badge variant="outline" className="text-xs">
                {type === 'boolean' ? 'Sim/Não' : type === 'conformidade' ? 'Conformidade' : type === 'text' ? 'Texto' : type === 'number' ? 'Número' : type === 'photo' ? 'Foto' : type === 'select' ? 'Seleção' : type === 'signature' ? 'Assinatura' : type === 'pmoc_measurement' ? 'Medida PMOC' : type}
              </Badge>
              {renderSingleTypeInput(question, type)}
            </div>
          ))}
        </div>
      );
    }

    // Exclusive mode - hide others when one is answered
    const response = responses[question.id];
    const hasTextValue = response?.response_value?.trim();
    const hasPhotoValue = response?.response_photo_url;

    let answeredType: string | null = null;
    if (hasPhotoValue) {
      answeredType = 'photo';
    } else if (hasTextValue) {
      if (hasTextValue === 'true' || hasTextValue === 'false') {
        answeredType = effectiveTypes.includes('boolean') ? 'boolean' : null;
      }
      if (!answeredType) {
        for (const t of effectiveTypes) {
          if (t !== 'photo' && t !== 'signature') {
            answeredType = t;
            break;
          }
        }
      }
    }

    return (
      <div className="space-y-3">
        {effectiveTypes.map((type) => {
          if (answeredType && answeredType !== type) return null;
          return (
            <div key={type} className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {type === 'boolean' ? 'Sim/Não' : type === 'conformidade' ? 'Conformidade' : type === 'text' ? 'Texto' : type === 'number' ? 'Número' : type === 'photo' ? 'Foto' : type === 'select' ? 'Seleção' : type === 'signature' ? 'Assinatura' : type === 'pmoc_measurement' ? 'Medida PMOC' : type}
                </Badge>
                {answeredType === type && (
                  <Badge variant="default" className="text-xs gap-1">
                    <Check className="h-3 w-3" /> Respondido
                  </Badge>
                )}
              </div>
              {renderSingleTypeInput(question, type)}
            </div>
          );
        })}
        {answeredType && !readOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => saveResponse(question.id, null, null)}
          >
            Limpar resposta e mostrar todas as opções
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {visibleQuestions.map((question, index) => {
        const response = responses[question.id];
        const hasAnswer = !!(response?.response_value?.trim() || response?.response_photo_url);
        const isEditing = editingQuestion === question.id;
        const showReadOnly = hasAnswer && !isEditing && question.question_type !== 'photo';
        
        return (
          <div key={question.id} className="space-y-2 p-3 rounded-lg bg-muted/30">
            <Label className="flex items-start gap-2">
              <span className="font-bold text-muted-foreground">{index + 1}.</span>
              <span className="flex-1">
                {question.question}
                {question.is_required && <span className="text-destructive ml-1">*</span>}
              </span>
              {hasAnswer && !isEditing && !readOnly && (
                <button
                  type="button"
                  className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                  onClick={() => setEditingQuestion(question.id)}
                  title="Editar resposta"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
              {isEditing && (
                <button
                  type="button"
                  className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                  onClick={() => setEditingQuestion(null)}
                  title="Fechar edição"
                >
                  <Check className="h-3.5 w-3.5 text-primary" />
                </button>
              )}
            </Label>
            {question.description && (
              <p className="text-xs text-muted-foreground ml-5">{question.description}</p>
            )}
            <div className="ml-5">
              {showReadOnly ? (
                <div className="text-sm py-1">
                  {response.response_value === 'true' ? (
                    <Badge variant="success" className="gap-1"><Check className="h-3 w-3" /> Sim</Badge>
                  ) : response.response_value === 'false' ? (
                    <Badge variant="destructive" className="gap-1"><X className="h-3 w-3" /> Não</Badge>
                  ) : response.response_value === 'Conforme' ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white"><Check className="h-3 w-3" /> Conforme</span>
                  ) : response.response_value === 'Não Conforme' ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-xs font-semibold text-white"><X className="h-3 w-3" /> Não Conforme</span>
                  ) : response.response_value === 'N/A' ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-500 px-2 py-0.5 text-xs font-semibold text-white"><Minus className="h-3 w-3" /> N/A</span>
                  ) : response.response_value?.includes('|||') ? (
                    <div className="flex flex-wrap gap-1">
                      {response.response_value.split('|||').map((v, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{v}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-foreground">{response.response_value}</p>
                  )}
                </div>
              ) : (
                renderQuestionInput(question)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
