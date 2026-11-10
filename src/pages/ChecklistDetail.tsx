import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, Trash2, GripVertical, X,
  CheckSquare, Type, Hash, Camera, ListChecks,
  ChevronUp, ChevronDown, BookOpen, Lock, Check,
  Search, ArrowUpDown, ChevronLeft, ChevronRight,
  Video, Minus, PenLine, ImagePlus, ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFormTemplates, QUESTION_TYPES, type FormQuestionInsert } from '@/hooks/useFormTemplates';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import type { FormTemplate, FormQuestion } from '@/types/database';
import { cn } from '@/lib/utils';
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
import { buildChecklistQuestionPage, type ChecklistQuestionSort } from '@/lib/checklistQuestionList';

type QuestionDraft = Partial<FormQuestionInsert> & {
  options?: string[];
  require_camera?: boolean;
  require_camera_video?: boolean;
  allow_multiple_photos?: boolean;
  answer_types?: string[];
  answer_mode?: string;
} & QuestionFrequencyPayload;

function QuestionOsPreview({ draft, checklistName }: { draft: QuestionDraft; checklistName: string }) {
  const answerTypes = draft.answer_types?.length
    ? draft.answer_types
    : [draft.question_type || 'boolean'];
  const isCombined = answerTypes.length > 1 && draft.answer_mode === 'combined';
  const questionText = draft.question?.trim() || 'Sua pergunta aparecerá aqui';

  const renderAnswer = (type: string) => {
    switch (type) {
      case 'boolean':
        return (
          <div className="flex items-center gap-3">
            <Switch disabled />
            <span className="text-sm text-muted-foreground">Sem resposta</span>
          </div>
        );
      case 'conformidade':
        return (
          <div className="grid grid-cols-[1fr_1.25fr_auto] gap-1.5">
            <div className="flex h-9 items-center justify-center gap-1 rounded-md border px-2 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-600" /> Conforme
            </div>
            <div className="flex h-9 items-center justify-center gap-1 rounded-md border px-2 text-xs text-muted-foreground">
              <X className="h-3.5 w-3.5 text-red-600" /> Não conforme
            </div>
            <div className="flex h-9 items-center justify-center gap-1 rounded-md border px-3 text-xs text-muted-foreground">
              <Minus className="h-3.5 w-3.5 text-orange-600" /> N/A
            </div>
          </div>
        );
      case 'text':
        return <Textarea disabled rows={2} placeholder="Digite a resposta..." className="resize-none bg-background" />;
      case 'number':
        return <Input disabled inputMode="decimal" placeholder="Digite o valor medido" className="bg-background" />;
      case 'photo':
        return (
          <div className="flex h-20 items-center justify-center gap-2 rounded-lg border border-dashed bg-background text-sm text-muted-foreground">
            <ImagePlus className="h-4 w-4" />
            {draft.require_camera ? 'Tirar foto agora' : 'Tirar ou anexar foto'}
          </div>
        );
      case 'video':
        return (
          <div className="flex h-20 items-center justify-center gap-2 rounded-lg border border-dashed bg-background text-sm text-muted-foreground">
            <Video className="h-4 w-4" />
            {draft.require_camera_video ? 'Gravar vídeo agora' : 'Gravar ou anexar vídeo'}
          </div>
        );
      case 'select': {
        const options = draft.options?.length ? draft.options : ['Opção 1', 'Opção 2'];
        return (
          <div className="space-y-1.5">
            {options.slice(0, 4).map((option, index) => (
              <div key={`${option}-${index}`} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                <Checkbox disabled />
                <span className={cn(!draft.options?.length && 'text-muted-foreground')}>{option}</span>
              </div>
            ))}
          </div>
        );
      }
      case 'signature':
        return (
          <div className="flex h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background text-sm text-muted-foreground">
            <PenLine className="h-5 w-5" />
            Área para assinatura
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <aside className="lg:sticky lg:top-0" aria-label="Prévia da pergunta na ordem de serviço">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Prévia na OS</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Atualiza enquanto você configura</p>
        </div>
        <Badge variant="outline" className="shrink-0 gap-1 font-normal">
          <ClipboardCheck className="h-3 w-3" /> Técnico
        </Badge>
      </div>

      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="border-b bg-muted/40 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Checklist</p>
          <p className="mt-0.5 truncate text-sm font-semibold">{checklistName}</p>
        </div>
        <div className="space-y-4 p-4">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">1</span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-semibold leading-snug', !draft.question?.trim() && 'text-muted-foreground')}>
                {questionText}
                {draft.is_required !== false && <span className="ml-1 text-destructive">*</span>}
              </p>
              {draft.description?.trim() && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{draft.description}</p>
              )}
            </div>
          </div>

          <div className="ml-8 space-y-3">
            {answerTypes.length > 1 && (
              <div className="rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
                {isCombined
                  ? 'O técnico preencherá todas as formas de resposta abaixo.'
                  : 'O técnico escolhe uma das formas de resposta abaixo.'}
              </div>
            )}
            {answerTypes.map((type) => (
              <div key={type} className="space-y-1.5">
                {answerTypes.length > 1 && (
                  <Badge variant="outline" className="text-[10px] font-normal">{getQTypeLabel(type)}</Badge>
                )}
                {renderAnswer(type)}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">Prévia ilustrativa; nenhuma resposta será salva aqui.</p>
    </aside>
  );
}

const getQTypeIcon = (type: string) => {
  const found = QUESTION_TYPES.find(t => t.value === type);
  return found?.icon || CheckSquare;
};
const getQTypeLabel = (type: string) => QUESTION_TYPES.find(t => t.value === type)?.label || type;

interface ChecklistDetailProps {
  /** Quando informado, o editor é embutido em outra tela em vez de ler a rota. */
  templateId?: string;
  embedded?: boolean;
  initialAction?: 'create-question';
  onExit?: () => void;
}

export default function ChecklistDetail({
  templateId,
  embedded = false,
  initialAction,
  onExit,
}: ChecklistDetailProps = {}) {
  const { id: routeId } = useParams<{ id: string }>();
  const id = templateId ?? routeId;
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    templates, isLoading,
    updateTemplate, deleteTemplate,
    createQuestion, updateQuestion, deleteQuestion, reorderQuestions,
    setTemplateServices,
  } = useFormTemplates();
  const { serviceTypes } = useServiceTypes();
  const { hasModule, isLoading: modulesLoading } = useCompanyModules();
  const { locale } = useAppLocaleContext();
  const tC = MESSAGES[locale].app.os.checklists;
  // Frequência por pergunta só aparece com o módulo Contratos ativo. Sem ele, a
  // tela fica idêntica ao padrão (zero poluição). Gate reusa useCompanyModules.
  // Espera o boot dos módulos pra NÃO piscar "ausente" pra quem TEM o módulo.
  const showFrequency = !modulesLoading && hasModule('contracts');
  const { toast } = useToast();

  const template = templates.find(t => t.id === id) as (FormTemplate & { questions: FormQuestion[] }) | undefined;
  const serviceTypeIds = ((template as any)?.service_type_ids ?? []) as string[];

  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null);
  const [deleteTemplateOpen, setDeleteTemplateOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);

  // Catalog modal state
  const [catalogOpen, setCatalogOpen] = useState(false);

  // Question modal state (create or edit)
  const [questionModalOpen, setQuestionModalOpen] = useState(initialAction === 'create-question');
  const [editingQuestion, setEditingQuestion] = useState<FormQuestion | null>(null);
  const [qForm, setQForm] = useState<QuestionDraft>({
    question: '', question_type: 'boolean', is_required: true, description: '', options: [], require_camera: false, answer_types: ['boolean'], answer_mode: 'exclusive',
    freq_kind: null, freq_months: null, freq_days: null, freq_visits: null, start_kind: null, start_visit: null,
  });
  const [newOption, setNewOption] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionTypeFilter, setQuestionTypeFilter] = useState('all');
  const [questionSort, setQuestionSort] = useState<ChecklistQuestionSort>('position');
  const [questionSortDirection, setQuestionSortDirection] = useState<'asc' | 'desc'>('asc');
  const [questionPage, setQuestionPage] = useState(1);

  const leaveEditor = () => {
    if (embedded) onExit?.();
    else navigate('/servicos?tab=checklists');
  };

  const resetQuestionForm = () => {
    setQForm({
      question: '', question_type: 'boolean', is_required: true, description: '', options: [], require_camera: false, answer_types: ['boolean'], answer_mode: 'exclusive',
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
      require_camera_video: (question as any).require_camera_video || false,
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
        <Button variant="ghost" onClick={leaveEditor}><ArrowLeft className="mr-2 h-4 w-4" /> {tC.btnCancel}</Button>
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
        require_camera_video: (qForm as any).require_camera_video || false,
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
        require_camera_video: (qForm as any).require_camera_video || false,
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
    deleteTemplate.mutate(template.id, { onSuccess: leaveEditor });
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

  const pageSize = 20;
  const questionView = buildChecklistQuestionPage({
    questions: template.questions || [],
    query: questionSearch,
    typeFilter: questionTypeFilter,
    sort: questionSort,
    direction: questionSortDirection,
    page: questionPage,
    pageSize,
    getTypes: getEffectiveTypes,
    getTypeLabel: getQTypeLabel,
  });
  const sortedQuestions = questionView.all;
  const filteredQuestions = questionView.filtered;
  const pagedQuestions = questionView.items;
  const totalQuestionPages = questionView.totalPages;
  const currentQuestionPage = questionView.currentPage;
  const normalizedSearch = questionView.normalizedQuery;
  const canReorder = questionSort === 'position' && questionSortDirection === 'asc' && !normalizedSearch && questionTypeFilter === 'all';
  const selectedAnswerTypes = qForm.answer_types || [];

  return (
    <div className={cn(embedded ? "space-y-5" : "space-y-6", isMobile && "pb-24")}>
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start">
        <Button
          variant="ghost"
          size={embedded ? 'sm' : 'icon'}
          onClick={leaveEditor}
          className={cn('self-start', embedded && '-ml-2 gap-2')}
        >
          <ArrowLeft className="h-5 w-5" />
          {embedded && <span>Voltar à prévia</span>}
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
        <div className="flex flex-wrap items-center gap-2 self-start sm:justify-end">
          {!isMobile && (
            <>
              <Button variant="outline" size="sm" onClick={() => setCatalogOpen(true)}>
                <BookOpen className="mr-2 h-4 w-4" />
                {tC.btnCatalog}
              </Button>
              <Button size="sm" onClick={openCreateModal}>
                <Plus className="mr-2 h-4 w-4" />
                {tC.btnNewQuestion}
              </Button>
            </>
          )}
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

      {/* Uma única hierarquia de ações: criar/importar fica no cabeçalho; aqui
          permanecem apenas o título da coleção e, no mobile, o acesso ao catálogo. */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{tC.detailQuestionsHeader}</h2>
        {isMobile && (
          <Button variant="outline" size="sm" onClick={() => setCatalogOpen(true)}>
            <BookOpen className="mr-1.5 h-4 w-4" />
            {tC.btnCatalog}
          </Button>
        )}
      </div>

      {/* Busca, tipo e ordem vivem em uma única barra contextual. */}
      {sortedQuestions.length > 0 && (
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/30 p-2 sm:grid-cols-[minmax(0,1fr)_170px_180px]">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={questionSearch}
              onChange={(event) => { setQuestionSearch(event.target.value); setQuestionPage(1); }}
              placeholder="Pesquisar pergunta, descrição ou tipo..."
              className="h-10 pl-9"
            />
          </div>
          <Select value={questionTypeFilter} onValueChange={(value) => { setQuestionTypeFilter(value); setQuestionPage(1); }}>
            <SelectTrigger className="h-10 min-w-0"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {QUESTION_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={`${questionSort}-${questionSortDirection}`}
            onValueChange={(value) => {
              const separator = value.lastIndexOf('-');
              setQuestionSort(value.slice(0, separator) as ChecklistQuestionSort);
              setQuestionSortDirection(value.slice(separator + 1) as 'asc' | 'desc');
              setQuestionPage(1);
            }}
          >
            <SelectTrigger className="h-10 min-w-0">
              <ArrowUpDown className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="position-asc">Ordem do checklist</SelectItem>
              <SelectItem value="question-asc">Pergunta A-Z</SelectItem>
              <SelectItem value="question-desc">Pergunta Z-A</SelectItem>
              <SelectItem value="type-asc">Tipo de pergunta</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Questions list */}
      {sortedQuestions.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-12 w-12" />}
          title={tC.detailEmptyQuestions}
          description={isMobile ? tC.detailEmptyQuestionsDescMobile : tC.detailEmptyQuestionsDescDesktop}
        />
      ) : (
        <div className="divide-y divide-border/60 border-y border-border/60">
          {pagedQuestions.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Search className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Nenhuma pergunta encontrada</p>
              <p className="text-sm text-muted-foreground">Ajuste a pesquisa ou os filtros.</p>
            </div>
          ) : pagedQuestions.map((question) => {
            const effectiveTypes = getEffectiveTypes(question);
            const questionOptions = (question.options as string[]) || [];
            const absoluteIndex = sortedQuestions.findIndex((item) => item.id === question.id);

            return (
              <div
                key={question.id}
                className={cn(
                  "grid grid-cols-[36px_minmax(0,1fr)] items-center gap-x-2 gap-y-2 px-1 py-3 transition-colors hover:bg-muted/30 sm:px-2 lg:grid-cols-[40px_minmax(0,1fr)_minmax(150px,220px)_auto]",
                  draggedQuestionId === question.id && "opacity-50",
                  dragOverQuestionId === question.id && "bg-primary/5 ring-1 ring-inset ring-primary"
                )}
                draggable={canReorder}
                onDragStart={(e) => handleDragStart(e, question.id)}
                onDragOver={(e) => handleDragOver(e, question.id)}
                onDragLeave={() => setDragOverQuestionId(null)}
                onDrop={(e) => handleDrop(e, question.id)}
                onDragEnd={() => { setDraggedQuestionId(null); setDragOverQuestionId(null); }}
              >
                {/* Reorder control: drag handle no desktop, setas no mobile */}
                <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                  <GripVertical className={cn('h-4 w-4 text-muted-foreground/60', canReorder && 'cursor-grab active:cursor-grabbing')} />
                  <span className="text-xs font-medium text-muted-foreground tabular-nums w-5 text-right">{absoluteIndex + 1}</span>
                </div>
                <div className="flex flex-col gap-0.5 lg:hidden shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={!canReorder || absoluteIndex === 0}
                    onClick={() => moveQuestion(question.id, 'up')}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={!canReorder || absoluteIndex === sortedQuestions.length - 1}
                    onClick={() => moveQuestion(question.id, 'down')}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0 lg:hidden">{absoluteIndex + 1}.</span>
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

                {/* Metadados em um bloco único: tipo e frequência não disputam
                    colunas diferentes nem empurram as ações para fora da view. */}
                <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-1 lg:col-start-auto">
                  {effectiveTypes.map(type => {
                    const Icon = getQTypeIcon(type);
                    return (
                      <Badge key={type} variant="outline" className="gap-1 px-1.5 py-0 text-[11px] font-normal text-muted-foreground">
                        <Icon className="h-3 w-3" />
                        {getQTypeLabel(type)}
                      </Badge>
                    );
                  })}
                  {effectiveTypes.length > 1 && (
                    <Badge variant="outline" className="px-1.5 py-0 text-[11px] font-normal text-muted-foreground">
                      {(question as any).answer_mode === 'combined' ? tC.answerModeCumulative : tC.answerModeExclusive}
                    </Badge>
                  )}
                  {effectiveTypes.includes('photo') && (question as any).require_camera && (
                    <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[11px] font-normal text-muted-foreground">
                      <Camera className="h-3 w-3" />
                      {tC.badgeCamera}
                    </Badge>
                  )}
                  {showFrequency && (
                    <QuestionFrequencyBadge
                      value={question as any}
                      onChange={(payload) => handleSaveFrequency(question.id, payload)}
                      disabled={updateQuestion.isPending}
                    />
                  )}
                </div>

                {/* Ícones sempre visíveis evitam repetir texto em todas as linhas;
                    tooltip e aria-label mantêm a ação clara e acessível. */}
                <TooltipProvider delayDuration={200}>
                  <div className="col-start-2 flex shrink-0 items-center gap-0.5 lg:col-start-auto lg:justify-end">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`${tC.actionEdit}: ${question.question}`}
                          onClick={() => openEditModal(question)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{tC.actionEdit}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="destructive-ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`${tC.actionDelete}: ${question.question}`}
                          onClick={() => setDeleteQuestionId(question.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{tC.actionDelete}</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
            );
          })}
          {filteredQuestions.length > pageSize && (
            <div className="flex flex-col items-center justify-between gap-2 px-3 py-3 text-sm sm:flex-row">
              <span className="text-muted-foreground">
                {(currentQuestionPage - 1) * pageSize + 1}–{Math.min(currentQuestionPage * pageSize, filteredQuestions.length)} de {filteredQuestions.length}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setQuestionPage((page) => Math.max(1, page - 1))} disabled={currentQuestionPage === 1}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
                </Button>
                <span className="min-w-16 text-center">{currentQuestionPage}/{totalQuestionPages}</span>
                <Button variant="outline" size="sm" onClick={() => setQuestionPage((page) => Math.min(totalQuestionPages, page + 1))} disabled={currentQuestionPage === totalQuestionPages}>
                  Próxima <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
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
      <ResponsiveModal
        open={questionModalOpen}
        onOpenChange={(o) => { setQuestionModalOpen(o); if (!o) resetQuestionForm(); }}
        title={editingQuestion ? tC.questionModalEdit : tC.questionModalCreate}
        description="Configure a pergunta e confira, em tempo real, como o técnico verá na ordem de serviço."
        className="sm:max-w-[1120px]"
        footer={(
          <div className="flex items-center justify-between gap-3">
            <p className="hidden text-xs text-muted-foreground sm:block">
              <span className="text-destructive">*</span> Campo obrigatório para salvar
            </p>
            <div className="ml-auto flex gap-2">
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
        )}
      >
        <div className="grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(21rem,0.85fr)]">
          <div className="min-w-0 space-y-7">
            <section className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">1</span>
                <div>
                  <h3 className="text-sm font-semibold">Escreva a pergunta</h3>
                  <p className="text-xs text-muted-foreground">Seja direto e use a orientação para explicar como executar.</p>
                </div>
              </div>
              <div className="space-y-4 pl-10">
                <div>
                  <Label htmlFor="checklist-question-text">{tC.questionLabelText}</Label>
                  <Input
                    id="checklist-question-text"
                    value={qForm.question || ''}
                    onChange={(e) => setQForm({ ...qForm, question: e.target.value })}
                    placeholder="Ex.: Verificar a pressão do equipamento"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="checklist-question-description">Orientação para o técnico <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <Textarea
                    id="checklist-question-description"
                    value={qForm.description || ''}
                    onChange={(e) => setQForm({ ...qForm, description: e.target.value })}
                    placeholder="Ex.: Com o equipamento ligado, aguarde 5 minutos antes de medir."
                    className="mt-1.5 resize-none"
                    rows={2}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Visível para o técnico durante o preenchimento; não aparece no relatório do cliente.</p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">2</span>
                <div>
                  <h3 className="text-sm font-semibold">Escolha como responder</h3>
                  <p className="text-xs text-muted-foreground">Você pode combinar mais de uma forma de resposta.</p>
                </div>
              </div>
              <div className="space-y-4 pl-10">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {QUESTION_TYPES.map((t) => {
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
                          'relative flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/50'
                        )}
                      >
                        <QIcon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">{t.label}</span>
                        {isSelected && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {selectedAnswerTypes.length >= 2 && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{tC.questionModeLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {qForm.answer_mode === 'combined' ? tC.questionModeDescCombined : tC.questionModeDescExclusive}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border bg-background p-1">
                        <button
                          type="button"
                          className={cn('rounded px-2.5 py-1.5 text-xs font-medium', qForm.answer_mode !== 'combined' && 'bg-foreground text-background')}
                          onClick={() => setQForm({ ...qForm, answer_mode: 'exclusive' })}
                        >
                          {tC.questionModeExclusive}
                        </button>
                        <button
                          type="button"
                          className={cn('rounded px-2.5 py-1.5 text-xs font-medium', qForm.answer_mode === 'combined' && 'bg-foreground text-background')}
                          onClick={() => setQForm({ ...qForm, answer_mode: 'combined' })}
                        >
                          {tC.questionModeCombined}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {selectedAnswerTypes.includes('select') && (
                  <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                    <Label>{tC.questionSelectLabel}</Label>
                    <div className="flex gap-2">
                      <Input
                        value={newOption}
                        onChange={(e) => setNewOption(e.target.value)}
                        placeholder={tC.questionSelectPlaceholder}
                        className="flex-1 bg-background"
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddOption(); } }}
                      />
                      <Button type="button" variant="outline" size="icon" onClick={handleAddOption} disabled={!newOption.trim()} aria-label="Adicionar opção">
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
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">3</span>
                <div>
                  <h3 className="text-sm font-semibold">Defina as regras</h3>
                  <p className="text-xs text-muted-foreground">Ajustes de obrigatoriedade, captura e frequência.</p>
                </div>
              </div>
              <div className="space-y-4 pl-10">
                <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                  <div className="flex items-start gap-3">
                    <Switch
                      checked={qForm.is_required ?? true}
                      onCheckedChange={(checked) => setQForm({ ...qForm, is_required: checked })}
                    />
                    <div>
                      <Label className="cursor-pointer text-sm">{tC.questionRequiredLabel}</Label>
                      <p className="text-xs text-muted-foreground">A OS só poderá avançar depois que o técnico responder.</p>
                    </div>
                  </div>

                  {selectedAnswerTypes.includes('photo') && (
                    <>
                      <div className="flex items-start gap-3">
                        <Switch
                          checked={qForm.require_camera ?? false}
                          onCheckedChange={(checked) => setQForm({ ...qForm, require_camera: checked })}
                        />
                        <div>
                          <Label className="cursor-pointer text-sm">{tC.questionCameraLabel}</Label>
                          <p className="text-xs text-muted-foreground">{tC.questionCameraDesc}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Switch
                          checked={qForm.allow_multiple_photos !== false}
                          onCheckedChange={(checked) => setQForm({ ...qForm, allow_multiple_photos: checked })}
                        />
                        <div>
                          <Label className="cursor-pointer text-sm">{tC.questionMultiPhotoLabel}</Label>
                          <p className="text-xs text-muted-foreground">{tC.questionMultiPhotoDesc}</p>
                        </div>
                      </div>
                    </>
                  )}

                  {selectedAnswerTypes.includes('video') && (
                    <div className="flex items-start gap-3">
                      <Switch
                        checked={qForm.require_camera_video ?? false}
                        onCheckedChange={(checked) => setQForm({ ...qForm, require_camera_video: checked })}
                      />
                      <div>
                        <Label className="cursor-pointer text-sm">{tC.questionVideoCameraLabel}</Label>
                        <p className="text-xs text-muted-foreground">{tC.questionVideoCameraDesc}</p>
                      </div>
                    </div>
                  )}
                </div>

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
              </div>
            </section>
          </div>

          <QuestionOsPreview draft={qForm} checklistName={template.name} />
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
