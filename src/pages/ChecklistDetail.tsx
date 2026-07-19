import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, Trash2, GripVertical, X,
  CheckSquare, Type, Hash, Camera, ListChecks,
  ChevronUp, ChevronDown, BookOpen, Lock, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFormTemplates, QUESTION_TYPES, type FormQuestionInsert } from '@/hooks/useFormTemplates';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import type { FormTemplate, FormQuestion } from '@/types/database';
import { cn } from '@/lib/utils';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useIsMobile } from '@/hooks/use-mobile';
import { FABButton } from '@/components/mobile/FABButton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { ChecklistCatalogModal } from '@/components/technician/ChecklistCatalogModal';
import { QuestionFrequencyBadge, FrequencyEditor, type QuestionFrequencyPayload } from '@/components/technician/QuestionFrequencyBadge';
import { ServicesMultiSelect } from '@/components/technician/ServicesMultiSelect';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const getQTypeIcon = (type: string) => {
  const found = QUESTION_TYPES.find(t => t.value === type);
  return found?.icon || CheckSquare;
};
const getQTypeLabel = (type: string) => QUESTION_TYPES.find(t => t.value === type)?.label || type;

export default function ChecklistDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    templates, isLoading,
    updateTemplate, deleteTemplate,
    createQuestion, updateQuestion, deleteQuestion, reorderQuestions,
    setTemplateServices,
  } = useFormTemplates();
  const { serviceTypes } = useServiceTypes();
  const { hasModule, isLoading: modulesLoading, maxVideoQuestions } = useCompanyModules();
  const { locale } = useAppLocaleContext();
  const tC = MESSAGES[locale].app.os.checklists;
  const canUseVideo = hasModule('video_questions');
  // Frequência por pergunta só aparece com o módulo Contratos ativo. Sem ele, a
  // tela fica idêntica ao padrão (zero poluição). Gate reusa useCompanyModules.
  // Espera o boot dos módulos pra NÃO piscar "ausente" pra quem TEM o módulo.
  const showFrequency = !modulesLoading && hasModule('contracts');
  const { toast } = useToast();

  const template = templates.find(t => t.id === id) as (FormTemplate & { questions: FormQuestion[] }) | undefined;
  const serviceTypeIds = ((template as any)?.service_type_ids ?? []) as string[];

  // Mensagem do limite de perguntas de vídeo do plano (pluralizada, traduzida).
  const videoLimitMessage = () =>
    (maxVideoQuestions === 1 ? tC.videoLimitSingular : tC.videoLimitPlural).replace('{n}', String(maxVideoQuestions));

  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null);
  const [deleteTemplateOpen, setDeleteTemplateOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);

  // Catalog modal state
  const [catalogOpen, setCatalogOpen] = useState(false);

  // Question modal state (create or edit)
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<FormQuestion | null>(null);
  const [qForm, setQForm] = useState<Partial<FormQuestionInsert> & { options?: string[]; require_camera?: boolean; answer_types?: string[]; answer_mode?: string } & QuestionFrequencyPayload>({
    question: '', question_type: 'boolean', is_required: true, description: '', options: [], require_camera: false, answer_types: [], answer_mode: 'exclusive',
    freq_kind: null, freq_months: null, freq_days: null, freq_visits: null, start_kind: null, start_visit: null,
  });
  const [newOption, setNewOption] = useState('');

  const resetQuestionForm = () => {
    setQForm({
      question: '', question_type: 'boolean', is_required: true, description: '', options: [], require_camera: false, answer_types: [], answer_mode: 'exclusive',
      freq_kind: null, freq_months: null, freq_days: null, freq_visits: null, start_kind: null, start_visit: null,
    });
    setNewOption('');
    setEditingQuestion(null);
  };

  const openCreateModal = () => {
    resetQuestionForm();
    setQuestionModalOpen(true);
  };

  const openEditModal = (question: FormQuestion) => {
    setEditingQuestion(question);
    const answerTypes = (question as any).answer_types as string[] | null;
    const effectiveTypes = answerTypes && answerTypes.length > 0 ? answerTypes : [question.question_type];
    const opts = Array.isArray(question.options) ? (question.options as string[]) : [];
    setQForm({
      question: question.question,
      question_type: question.question_type,
      is_required: question.is_required,
      description: question.description || '',
      options: opts,
      require_camera: (question as any).require_camera || false,
      allow_multiple_photos: (question as any).allow_multiple_photos !== false,
      answer_types: effectiveTypes,
      answer_mode: (question as any).answer_mode || 'exclusive',
      // Frequência por pergunta (módulo Contratos) — round-trip dos 6 campos.
      freq_kind: (question as any).freq_kind ?? null,
      freq_months: (question as any).freq_months ?? null,
      freq_days: (question as any).freq_days ?? null,
      freq_visits: (question as any).freq_visits ?? null,
      start_kind: (question as any).start_kind ?? null,
      start_visit: (question as any).start_visit ?? null,
    } as any);
    setNewOption('');
    setQuestionModalOpen(true);
  };

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!template) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/servicos?tab=checklists')}><ArrowLeft className="mr-2 h-4 w-4" /> {tC.btnCancel}</Button>
        <p className="text-muted-foreground">{tC.notFound}</p>
      </div>
    );
  }

  // Get the effective answer types for a question
  const getEffectiveTypes = (q: FormQuestion): string[] => {
    const at = (q as any).answer_types as string[] | null;
    return at && at.length > 0 ? at : [q.question_type];
  };

  const handleToggleAnswerType = (typeValue: string) => {
    const current = qForm.answer_types || [];
    let next: string[];
    if (current.includes(typeValue)) {
      next = current.filter(t => t !== typeValue);
    } else {
      next = [...current, typeValue];
    }
    // Must have at least one
    if (next.length === 0) return;
    // Primary type is the first one
    setQForm({
      ...qForm,
      answer_types: next,
      question_type: next[0] as any,
      // Keep options if select is included
      options: next.includes('select') ? (qForm.options || []) : [],
      require_camera: next.includes('photo') ? (qForm.require_camera || false) : false,
    });
  };

  const handleSaveQuestion = () => {
    if (!qForm.question?.trim()) return;
    const effectiveTypes = qForm.answer_types || [];

    // Gate de vídeo por MODELO: se esta pergunta vai virar vídeo, respeita o
    // limite do plano. Conta as OUTRAS perguntas de vídeo do checklist (exclui a
    // que está sendo editada). O técnico em campo nunca é bloqueado por isto.
    const willBeVideo = effectiveTypes.includes('video');
    if (willBeVideo) {
      const othersVideo = (template?.questions || []).filter(
        (q) => q.id !== editingQuestion?.id && q.question_type === 'video',
      ).length;
      if (othersVideo >= maxVideoQuestions) {
        toast({
          variant: 'destructive',
          title: 'Limite de perguntas de vídeo',
          description: videoLimitMessage(),
        });
        return;
      }
    }

    const answerTypes = effectiveTypes.length > 1 ? effectiveTypes : null;
    const primaryType = effectiveTypes[0] || qForm.question_type || 'boolean';
    const hasSelect = effectiveTypes.includes('select');
    const optionsToSave = hasSelect && qForm.options && qForm.options.length > 0 ? qForm.options : null;
    const answerMode = effectiveTypes.length >= 2 ? ((qForm as any).answer_mode || 'exclusive') : 'exclusive';

    // Frequência por pergunta — só persiste com o módulo Contratos. Sem ele,
    // não toca os campos (mantém NULL = toda visita, sem poluir).
    const freqFields = showFrequency
      ? {
          freq_kind: qForm.freq_kind ?? null,
          freq_months: qForm.freq_months ?? null,
          freq_days: qForm.freq_days ?? null,
          freq_visits: qForm.freq_visits ?? null,
          start_kind: qForm.start_kind ?? null,
          start_visit: qForm.start_visit ?? null,
        }
      : {};

    if (editingQuestion) {
      updateQuestion.mutate({
        id: editingQuestion.id,
        question: qForm.question,
        question_type: primaryType as any,
        is_required: qForm.is_required ?? true,
        description: qForm.description || null,
        options: optionsToSave,
        require_camera: qForm.require_camera || false,
        allow_multiple_photos: (qForm as any).allow_multiple_photos !== false,
        answer_types: answerTypes,
        answer_mode: answerMode,
        ...freqFields,
      } as any, {
        onSuccess: () => {
          setQuestionModalOpen(false);
          resetQuestionForm();
        },
      });
    } else {
      const position = template.questions?.length || 0;
      createQuestion.mutate({
        template_id: template.id,
        question: qForm.question!,
        question_type: primaryType as any,
        is_required: qForm.is_required ?? true,
        description: qForm.description || undefined,
        options: optionsToSave || undefined,
        position,
        require_camera: qForm.require_camera || false,
        allow_multiple_photos: (qForm as any).allow_multiple_photos !== false,
        answer_types: answerTypes,
        answer_mode: answerMode,
        ...freqFields,
      } as any, {
        onSuccess: () => {
          setQuestionModalOpen(false);
          resetQuestionForm();
        },
      });
    }
  };

  const handleSaveFrequency = (questionId: string, payload: QuestionFrequencyPayload) =>
    new Promise<void>((resolve, reject) => {
      updateQuestion.mutate({ id: questionId, ...payload } as any, {
        onSuccess: () => {
          const everyVisit = !payload.freq_kind;
          toast({ title: everyVisit ? 'Frequência: toda visita' : 'Frequência atualizada' });
          resolve();
        },
        onError: () => {
          toast({
            variant: 'destructive',
            title: 'Não foi possível salvar a frequência',
            description: 'Verifique a conexão e tente de novo.',
          });
          reject(new Error('update failed'));
        },
      });
    });

  const handleAddOption = () => {
    if (!newOption.trim()) return;
    setQForm(prev => ({ ...prev, options: [...(prev.options || []), newOption.trim()] }));
    setNewOption('');
  };

  const handleRemoveOption = (index: number) => {
    setQForm(prev => ({ ...prev, options: (prev.options || []).filter((_, i) => i !== index) }));
  };

  const handleDragStart = (e: React.DragEvent, qId: string) => {
    setDraggedQuestionId(qId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, qId: string) => {
    e.preventDefault();
    if (qId !== draggedQuestionId) setDragOverQuestionId(qId);
  };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedQuestionId || draggedQuestionId === targetId) { setDraggedQuestionId(null); setDragOverQuestionId(null); return; }
    const questions = [...(template.questions || [])].sort((a, b) => a.position - b.position);
    const di = questions.findIndex(q => q.id === draggedQuestionId);
    const ti = questions.findIndex(q => q.id === targetId);
    if (di === -1 || ti === -1) return;
    const [item] = questions.splice(di, 1);
    questions.splice(ti, 0, item);
    reorderQuestions.mutate(questions.map(q => q.id));
    setDraggedQuestionId(null); setDragOverQuestionId(null);
  };

  const handleDeleteTemplate = () => {
    deleteTemplate.mutate(template.id, { onSuccess: () => navigate('/servicos?tab=checklists') });
  };

  const handleDeleteQuestion = () => {
    if (deleteQuestionId) {
      deleteQuestion.mutate(deleteQuestionId);
      setDeleteQuestionId(null);
    }
  };

  const moveQuestion = (questionId: string, direction: 'up' | 'down') => {
    const questions = [...(template.questions || [])].sort((a, b) => a.position - b.position);
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    [questions[idx], questions[targetIdx]] = [questions[targetIdx], questions[idx]];
    reorderQuestions.mutate(questions.map(q => q.id));
  };

  const sortedQuestions = [...(template.questions || [])].sort((a, b) => a.position - b.position);
  const selectedAnswerTypes = qForm.answer_types || [];

  return (
    <div className={cn("space-y-6", isMobile && "pb-24")}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button variant="ghost" size="icon" onClick={() => navigate('/servicos?tab=checklists')} className="self-start">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-xl font-bold h-9"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (editName.trim() && editName.trim() !== template.name) {
                      updateTemplate.mutate({ id: template.id, name: editName.trim() });
                    }
                    setIsEditingName(false);
                  }
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
                onBlur={() => {
                  if (editName.trim() && editName.trim() !== template.name) {
                    updateTemplate.mutate({ id: template.id, name: editName.trim() });
                  }
                  setIsEditingName(false);
                }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 group/name cursor-pointer" onClick={() => { setEditName(template.name); setIsEditingName(true); }}>
              <h1 className="text-xl sm:text-2xl font-bold truncate">{template.name}</h1>
              <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
            </div>
          )}
          <p className="text-sm text-muted-foreground">{sortedQuestions.length === 1 ? tC.questionsCount.replace('{n}', '1') : tC.questionsCountPlural.replace('{n}', String(sortedQuestions.length))}</p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          <div className="flex items-center gap-2">
            <Switch
              checked={template.is_active}
              onCheckedChange={(checked) => updateTemplate.mutate({ id: template.id, is_active: checked })}
            />
            <Label className="text-sm">{tC.labelActive}</Label>
          </div>
          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTemplateOpen(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Serviços habilitados — discreto, encostado à direita, sem card/borda */}
      <div className="flex items-center justify-end gap-2">
        <Label className="text-sm text-muted-foreground">{tC.detailSectionServices}</Label>
        <ServicesMultiSelect
          services={serviceTypes.filter(t => t.is_active).map(t => ({ id: t.id, name: t.name, color: t.color }))}
          selectedIds={serviceTypeIds}
          onChange={(ids) => setTemplateServices.mutate({ templateId: template.id, serviceTypeIds: ids })}
          disabled={setTemplateServices.isPending}
        />
      </div>

      {/* Questions header with button (botão inline só no desktop; mobile usa FAB) */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">{tC.detailQuestionsHeader}</h2>
        {!isMobile && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCatalogOpen(true)}>
              <BookOpen className="mr-2 h-4 w-4" />
              {tC.btnCatalogFull}
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openCreateModal}>
              <Plus className="mr-2 h-4 w-4" />
              {tC.btnNewQuestion}
            </Button>
          </div>
        )}
        {isMobile && (
          <Button variant="outline" size="sm" onClick={() => setCatalogOpen(true)}>
            <BookOpen className="mr-1.5 h-4 w-4" />
            {tC.btnCatalog}
          </Button>
        )}
      </div>

      {/* Questions list */}
      {sortedQuestions.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-12 w-12" />}
          title={tC.detailEmptyQuestions}
          description={isMobile ? tC.detailEmptyQuestionsDescMobile : tC.detailEmptyQuestionsDescDesktop}
        />
      ) : (
        <div className="rounded-lg border bg-card divide-y overflow-hidden">
          {sortedQuestions.map((question, index) => {
            const effectiveTypes = getEffectiveTypes(question);
            const questionOptions = (question.options as string[]) || [];

            return (
              <div
                key={question.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-2.5 sm:px-3 hover:bg-muted/40 transition-colors group",
                  draggedQuestionId === question.id && "opacity-50",
                  dragOverQuestionId === question.id && "bg-primary/5 ring-1 ring-inset ring-primary"
                )}
                draggable
                onDragStart={(e) => handleDragStart(e, question.id)}
                onDragOver={(e) => handleDragOver(e, question.id)}
                onDragLeave={() => setDragOverQuestionId(null)}
                onDrop={(e) => handleDrop(e, question.id)}
                onDragEnd={() => { setDraggedQuestionId(null); setDragOverQuestionId(null); }}
              >
                {/* Reorder control: drag handle no desktop, setas no mobile */}
                <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                  <GripVertical className="h-4 w-4 text-muted-foreground/60 cursor-grab active:cursor-grabbing" />
                  <span className="text-xs font-medium text-muted-foreground tabular-nums w-5 text-right">{index + 1}</span>
                </div>
                <div className="flex flex-col gap-0.5 lg:hidden shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0}
                    onClick={() => moveQuestion(question.id, 'up')}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === sortedQuestions.length - 1}
                    onClick={() => moveQuestion(question.id, 'down')}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0 lg:hidden">{index + 1}.</span>
                    <p className="text-sm font-medium leading-snug truncate">{question.question}</p>
                    {question.is_required && (
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" title="Obrigatória" />
                    )}
                  </div>
                  {question.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-start gap-1 leading-snug">
                      <Lock className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-1">{question.description}</span>
                    </p>
                  )}
                  {effectiveTypes.includes('select') && questionOptions.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{questionOptions.length} opções: {questionOptions.join(', ')}</p>
                  )}
                </div>

                {/* Selos de tipo (compactos, à direita) */}
                <div className="hidden sm:flex items-center gap-1 flex-wrap justify-end max-w-[40%] shrink-0">
                  {effectiveTypes.map(t => {
                    const Icon = getQTypeIcon(t);
                    return (
                      <Badge key={t} variant="outline" className="text-[11px] font-normal gap-1 px-1.5 py-0 text-muted-foreground">
                        <Icon className="h-3 w-3" />
                        {getQTypeLabel(t)}
                      </Badge>
                    );
                  })}
                  {effectiveTypes.length > 1 && (
                    <Badge variant="outline" className="text-[11px] font-normal px-1.5 py-0 text-muted-foreground">
                      {(question as any).answer_mode === 'combined' ? tC.answerModeCumulative : tC.answerModeExclusive}
                    </Badge>
                  )}
                  {effectiveTypes.includes('photo') && (question as any).require_camera && (
                    <Badge variant="outline" className="text-[11px] font-normal gap-1 px-1.5 py-0 text-muted-foreground">
                      <Camera className="h-3 w-3" />
                      {tC.badgeCamera}
                    </Badge>
                  )}
                </div>

                {/* Selo de tipo único no mobile (compacto) */}
                <div className="flex sm:hidden items-center shrink-0">
                  {(() => {
                    const Icon = getQTypeIcon(effectiveTypes[0]);
                    return (
                      <Badge variant="outline" className="text-[11px] font-normal gap-1 px-1.5 py-0 text-muted-foreground">
                        <Icon className="h-3 w-3" />
                        {effectiveTypes.length > 1 ? tC.questionTypesCount.replace('{n}', String(effectiveTypes.length)) : getQTypeLabel(effectiveTypes[0])}
                      </Badge>
                    );
                  })()}
                </div>

                {/* Selo de frequência por pergunta — só com módulo Contratos */}
                {showFrequency && (
                  <QuestionFrequencyBadge
                    value={question as any}
                    onChange={(payload) => handleSaveFrequency(question.id, payload)}
                    disabled={updateQuestion.isPending}
                  />
                )}

                <div className="shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <RowActionsMenu
                    actions={[
                      { label: tC.actionEdit, icon: Pencil, variant: 'edit', onClick: () => openEditModal(question) },
                      { label: tC.actionDelete, icon: Trash2, variant: 'delete', onClick: () => setDeleteQuestionId(question.id) },
                    ]}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Catalog modal */}
      <ChecklistCatalogModal
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        templateId={template.id}
        existingCount={sortedQuestions.length}
        existingQuestions={sortedQuestions.map(q => q.question)}
      />

      {/* Question modal (create or edit) */}
      <ResponsiveModal open={questionModalOpen} onOpenChange={(o) => { setQuestionModalOpen(o); if (!o) resetQuestionForm(); }} title={editingQuestion ? tC.questionModalEdit : tC.questionModalCreate}>
        <div className="space-y-4">
          <div>
            <Label>{tC.questionLabelText}</Label>
            <Input
              value={qForm.question || ''}
              onChange={(e) => setQForm({ ...qForm, question: e.target.value })}
              placeholder={tC.questionPlaceholderText}
              className="mt-1"
            />
          </div>
          <div>
            <Label>{tC.questionLabelDesc}</Label>
            <Textarea
              value={qForm.description || ''}
              onChange={(e) => setQForm({ ...qForm, description: e.target.value })}
              placeholder={tC.questionPlaceholderDesc}
              className="mt-1"
              rows={2}
            />
            <p className="text-xs text-muted-foreground mt-1">{tC.questionDescNote}</p>
          </div>

          {/* Multi answer types — chips toggláveis (multi-seleção). Estado
              selecionado saturado na cor + check, pra deixar claro que NÃO é
              um radio: dá pra marcar vários. */}
          <div className="space-y-2">
            <Label>{tC.questionTypesLabel}</Label>
            <p className="text-xs text-muted-foreground">{tC.questionTypesNote}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUESTION_TYPES
                // Sem o módulo, "Vídeo" some do seletor — a menos que a pergunta
                // em edição já seja de vídeo (não some a opção já escolhida).
                .filter((t) => t.value !== 'video' || canUseVideo || selectedAnswerTypes.includes('video'))
                .map((t) => {
                const QIcon = t.icon;
                const isSelected = selectedAnswerTypes.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => handleToggleAnswerType(t.value)}
                    className={cn(
                      'relative flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium text-left transition-colors',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/50'
                    )}
                  >
                    <QIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t.label}</span>
                    {isSelected && (
                      <span className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Answer mode toggle when 2+ types selected */}
          {selectedAnswerTypes.length >= 2 && (
            <div className="rounded-lg border p-3 space-y-2">
              <Label className="text-sm font-medium">{tC.questionModeLabel}</Label>
              <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30">
                <span className={cn(
                  "text-sm font-medium transition-colors",
                  (qForm as any).answer_mode !== 'combined' ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {tC.questionModeExclusive}
                </span>
                <Switch
                  checked={(qForm as any).answer_mode === 'combined'}
                  onCheckedChange={(checked) => setQForm({ ...qForm, answer_mode: checked ? 'combined' : 'exclusive' } as any)}
                />
                <span className={cn(
                  "text-sm font-medium transition-colors",
                  (qForm as any).answer_mode === 'combined' ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {tC.questionModeCombined}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {(qForm as any).answer_mode === 'combined'
                  ? tC.questionModeDescCombined
                  : tC.questionModeDescExclusive}
              </p>
            </div>
          )}

          {/* Camera-only toggle for photo type */}
          {selectedAnswerTypes.includes('photo') && (
            <div className="flex items-center gap-2">
              <Switch
                checked={qForm.require_camera ?? false}
                onCheckedChange={(checked) => setQForm({ ...qForm, require_camera: checked })}
              />
              <div>
                <Label className="text-sm cursor-pointer">{tC.questionCameraLabel}</Label>
                <p className="text-xs text-muted-foreground">{tC.questionCameraDesc}</p>
              </div>
            </div>
          )}

          {/* Allow multiple photos toggle for photo type */}
          {selectedAnswerTypes.includes('photo') && (
            <div className="flex items-center gap-2">
              <Switch
                checked={(qForm as any).allow_multiple_photos !== false}
                onCheckedChange={(checked) => setQForm({ ...qForm, allow_multiple_photos: checked } as any)}
              />
              <div>
                <Label className="text-sm cursor-pointer">{tC.questionMultiPhotoLabel}</Label>
                <p className="text-xs text-muted-foreground">{tC.questionMultiPhotoDesc}</p>
              </div>
            </div>
          )}

          {/* Select options config */}
          {selectedAnswerTypes.includes('select') && (
            <div className="space-y-2">
              <Label>{tC.questionSelectLabel}</Label>
              <div className="flex gap-2">
                <Input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  placeholder={tC.questionSelectPlaceholder}
                  className="flex-1"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddOption(); } }}
                />
                <Button type="button" variant="outline" size="icon" onClick={handleAddOption} disabled={!newOption.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {(qForm.options || []).length > 0 && (
                <div className="space-y-1">
                  {(qForm.options || []).map((opt, i) => (
                    <EditableOption
                      key={i}
                      value={opt}
                      onChange={(newVal) => setQForm(prev => ({ ...prev, options: (prev.options || []).map((o, idx) => idx === i ? newVal : o) }))}
                      onRemove={() => handleRemoveOption(i)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch
              checked={qForm.is_required ?? true}
              onCheckedChange={(checked) => setQForm({ ...qForm, is_required: checked })}
            />
            <Label className="text-sm cursor-pointer">{tC.questionRequiredLabel}</Label>
          </div>

          {/* Frequência por pergunta — só com módulo Contratos. Reusa o MESMO
              editor do selo inline (FrequencyEditor); aqui ele alimenta o
              estado local do formulário e é persistido junto no salvar. */}
          {showFrequency && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">{tC.questionFreqLabel}</Label>
              <p className="text-xs text-muted-foreground">{tC.questionFreqDesc}</p>
              <FrequencyEditor
                variant="select"
                value={qForm}
                onApply={(payload) => setQForm(prev => ({ ...prev, ...payload }))}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setQuestionModalOpen(false); resetQuestionForm(); }}>{tC.btnCancel}</Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleSaveQuestion}
              disabled={!qForm.question?.trim() || selectedAnswerTypes.length === 0 || createQuestion.isPending || updateQuestion.isPending}
            >
              {editingQuestion ? tC.btnSave : tC.btnNewQuestion}
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* Delete template dialog */}
      <AlertDialog open={deleteTemplateOpen} onOpenChange={setDeleteTemplateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tC.deleteTemplateTitle}</AlertDialogTitle>
            <AlertDialogDescription>{tC.deleteTemplateDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tC.btnCancelDelete}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {tC.btnDeactivate}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete question dialog */}
      <AlertDialog open={!!deleteQuestionId} onOpenChange={(o) => !o && setDeleteQuestionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tC.deleteQuestionTitle}</AlertDialogTitle>
            <AlertDialogDescription>{tC.deleteQuestionDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tC.btnCancelDelete}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteQuestion} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {tC.btnRemove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isMobile && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={tC.detailFabLabel}
          onClick={openCreateModal}
        />
      )}
    </div>
  );
}

// Inline editable option component
function EditableOption({ value, onChange, onRemove }: { value: string; onChange: (v: string) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => { setText(value); }, [value]);

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded border px-2 py-1 text-xs bg-background">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-6 text-xs flex-1 border-0 p-0 focus-visible:ring-0"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onChange(text); setEditing(false); }
            if (e.key === 'Escape') { setText(value); setEditing(false); }
          }}
          onBlur={() => { onChange(text); setEditing(false); }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded border px-2 py-1 text-xs bg-background group/opt">
      <span
        className="flex-1 cursor-pointer hover:text-primary"
        onClick={() => setEditing(true)}
        title="Clique para editar"
      >
        {value}
      </span>
      <Button variant="edit-ghost" size="icon" className="h-5 w-5 opacity-0 group-hover/opt:opacity-100" onClick={() => setEditing(true)}>
        <Pencil className="h-2.5 w-2.5" />
      </Button>
      <Button variant="destructive-ghost" size="icon" className="h-5 w-5 opacity-0 group-hover/opt:opacity-100" onClick={onRemove}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
