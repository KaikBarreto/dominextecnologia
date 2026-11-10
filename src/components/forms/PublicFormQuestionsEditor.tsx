import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';
import { fillMessage } from '@/lib/leadFormBuilderText';
import {
  getQuestionTypeMeta,
  MAX_ANSWERS_PER_SUBMISSION,
  PUBLIC_FORM_QUESTION_TYPES,
  type PublicFormQuestionType,
} from '@/lib/publicFormQuestions';
import type { PublicFormQuestionDraft } from '@/hooks/usePublicFormQuestions';

/** Tetos do banco (`public_form_questions`): pergunta 500, texto de apoio 1000, 200 alternativas. */
const MAX_QUESTION_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_OPTIONS = 200;
const MAX_OPTION_LENGTH = 200;

/** Grupos do seletor de tipo (são 10 tipos: em seções, não numa lista corrida). */
const TYPE_GROUPS: { key: 'typeGroupText' | 'typeGroupNumber' | 'typeGroupChoice' | 'typeGroupOther'; types: PublicFormQuestionType[] }[] = [
  { key: 'typeGroupText', types: ['text', 'textarea'] },
  { key: 'typeGroupNumber', types: ['number', 'rating'] },
  { key: 'typeGroupChoice', types: ['boolean', 'select', 'multiselect'] },
  { key: 'typeGroupOther', types: ['date', 'photo', 'signature'] },
];

function newDraft(): PublicFormQuestionDraft {
  return {
    id: crypto.randomUUID(),
    question: '',
    description: null,
    question_type: 'text',
    options: [],
    is_required: false,
  };
}

interface QuestionEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pergunta em edição; `null` = nova. */
  initial: PublicFormQuestionDraft | null;
  onConfirm: (draft: PublicFormQuestionDraft) => void;
}

function QuestionEditorModal({ open, onOpenChange, initial, onConfirm }: QuestionEditorModalProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.leadFormBuilder;
  const { toast } = useToast();
  const [draft, setDraft] = useState<PublicFormQuestionDraft>(newDraft);

  useEffect(() => {
    if (!open) return;
    setDraft(initial ? { ...initial, options: [...initial.options] } : newDraft());
  }, [open, initial]);

  const meta = getQuestionTypeMeta(draft.question_type);
  const hasOptions = !!meta?.hasOptions;

  const setOption = (index: number, value: string) =>
    setDraft((prev) => ({ ...prev, options: prev.options.map((option, i) => (i === index ? value : option)) }));
  const addOption = () =>
    setDraft((prev) => (prev.options.length >= MAX_OPTIONS ? prev : { ...prev, options: [...prev.options, ''] }));
  const removeOption = (index: number) =>
    setDraft((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== index) }));

  const changeType = (value: string) => {
    const nextMeta = getQuestionTypeMeta(value);
    if (!nextMeta) return;
    setDraft((prev) => ({
      ...prev,
      question_type: nextMeta.value,
      // Ao entrar num tipo com alternativas já abre com 2 linhas; ao sair, zera
      // (o banco guarda options só pros tipos que usam).
      options: nextMeta.hasOptions ? (prev.options.length > 0 ? prev.options : ['', '']) : [],
    }));
  };

  const handleConfirm = () => {
    const question = draft.question.trim();
    if (!question) {
      toast({ variant: 'destructive', title: t.qeErrQuestion });
      return;
    }
    let options: string[] = [];
    if (hasOptions) {
      // Trim + dedupe: o servidor compara a resposta com a alternativa já aparada.
      options = Array.from(new Set(draft.options.map((option) => option.trim()).filter(Boolean)));
      if (options.length < 2) {
        toast({ variant: 'destructive', title: t.qeErrOptions });
        return;
      }
    }
    onConfirm({
      ...draft,
      question,
      description: draft.description?.trim() || null,
      options,
    });
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? t.qeTitleEdit : t.qeTitleNew}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="cancel" onClick={() => onOpenChange(false)}>
            {t.qeCancel}
          </Button>
          <Button type="button" onClick={handleConfirm}>
            {initial ? t.qeConfirmEdit : t.qeConfirmNew}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pfq-question">{t.qeQuestionLabel}</Label>
          <Input
            id="pfq-question"
            value={draft.question}
            maxLength={MAX_QUESTION_LENGTH}
            onChange={(e) => setDraft((prev) => ({ ...prev, question: e.target.value }))}
            placeholder={t.qeQuestionPlaceholder}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pfq-description">{t.qeDescriptionLabel}</Label>
          <Textarea
            id="pfq-description"
            value={draft.description ?? ''}
            maxLength={MAX_DESCRIPTION_LENGTH}
            rows={2}
            onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
            placeholder={t.qeDescriptionPlaceholder}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t.qeTypeLabel}</Label>
          <Select value={draft.question_type} onValueChange={changeType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_GROUPS.map((group) => (
                <SelectGroup key={group.key}>
                  <SelectLabel>{t[group.key]}</SelectLabel>
                  {group.types.map((type) => {
                    const typeMeta = PUBLIC_FORM_QUESTION_TYPES.find((item) => item.value === type);
                    const Icon = typeMeta?.icon;
                    return (
                      <SelectItem key={type} value={type}>
                        <span className="inline-flex items-center gap-2">
                          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                          {t.typeLabels[type]}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasOptions && (
          <div className="space-y-2">
            <Label>{t.qeOptionsLabel}</Label>
            {draft.options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={option}
                  maxLength={MAX_OPTION_LENGTH}
                  onChange={(e) => setOption(index, e.target.value)}
                  placeholder={fillMessage(t.qeOptionPlaceholder, { n: index + 1 })}
                  aria-label={fillMessage(t.qeOptionPlaceholder, { n: index + 1 })}
                />
                <Button
                  type="button"
                  variant="destructive-ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  aria-label={t.qeRemoveOption}
                  onClick={() => removeOption(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addOption}>
              <Plus className="h-4 w-4" />
              {t.qeAddOption}
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t.qeRequiredLabel}</p>
            <p className="text-xs text-muted-foreground">{t.qeRequiredHint}</p>
          </div>
          <Switch
            checked={draft.is_required}
            onCheckedChange={(value) => setDraft((prev) => ({ ...prev, is_required: value }))}
            aria-label={t.qeRequiredLabel}
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}

interface PublicFormQuestionsEditorProps {
  questions: PublicFormQuestionDraft[];
  onChange: (questions: PublicFormQuestionDraft[]) => void;
}

/**
 * Editor das perguntas do formulário público. Trabalha só em memória: quem salva
 * é o diálogo do formulário (um único "Salvar" fixo grava formulário e perguntas).
 * `position` nasce do índice da lista na hora de gravar, então a ordem na tela é
 * sempre a ordem que vai pro banco.
 */
export function PublicFormQuestionsEditor({ questions, onChange }: PublicFormQuestionsEditorProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.leadFormBuilder;
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PublicFormQuestionDraft | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const openNew = () => {
    if (questions.length >= MAX_ANSWERS_PER_SUBMISSION) {
      toast({ variant: 'destructive', title: fillMessage(t.questionLimit, { n: MAX_ANSWERS_PER_SUBMISSION }) });
      return;
    }
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (question: PublicFormQuestionDraft) => {
    setEditing(question);
    setEditorOpen(true);
  };

  const handleConfirm = (draft: PublicFormQuestionDraft) => {
    const exists = questions.some((question) => question.id === draft.id);
    onChange(exists ? questions.map((question) => (question.id === draft.id ? draft : question)) : [...questions, draft]);
  };

  const move = (id: string, direction: -1 | 1) => {
    const index = questions.findIndex((question) => question.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const handleDrop = (targetId: string) => {
    if (draggedId && draggedId !== targetId) {
      const from = questions.findIndex((question) => question.id === draggedId);
      const to = questions.findIndex((question) => question.id === targetId);
      if (from !== -1 && to !== -1) {
        const next = [...questions];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        onChange(next);
      }
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm text-muted-foreground">{t.questionsIntro}</p>
        {questions.length > 0 && (
          <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={openNew}>
            <Plus className="h-4 w-4" />
            {t.addQuestion}
          </Button>
        )}
      </div>

      {questions.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<ListChecks className="h-8 w-8" />}
          title={t.questionsEmptyTitle}
          description={t.questionsEmptyDesc}
          action={{ label: t.addQuestion, onClick: openNew }}
        />
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {questions.map((question, index) => {
            const meta = getQuestionTypeMeta(question.question_type);
            const Icon = meta?.icon;
            return (
              <div
                key={question.id}
                className={cn(
                  'grid grid-cols-[36px_minmax(0,1fr)] items-center gap-x-2 gap-y-2 px-1 py-3 transition-colors hover:bg-muted/30 sm:px-2 lg:grid-cols-[40px_minmax(0,1fr)_minmax(150px,220px)_auto]',
                  draggedId === question.id && 'opacity-50',
                  dragOverId === question.id && 'bg-primary/5 ring-1 ring-inset ring-primary',
                )}
                draggable
                onDragStart={(e) => {
                  setDraggedId(question.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (question.id !== draggedId) setDragOverId(question.id);
                }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(question.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
              >
                {/* Reordenar: alça + posição no desktop, setas no celular (HTML5 DnD não existe no toque). */}
                <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
                  <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground/60 active:cursor-grabbing" />
                  <span className="w-5 text-right text-xs font-medium tabular-nums text-muted-foreground">{index + 1}</span>
                </div>
                <div className="flex shrink-0 flex-col gap-0.5 lg:hidden">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0}
                    aria-label={t.moveUp}
                    onClick={() => move(question.id, -1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === questions.length - 1}
                    aria-label={t.moveDown}
                    onClick={() => move(question.id, 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* Conteúdo */}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground lg:hidden">{index + 1}.</span>
                    <p className="truncate text-base font-medium leading-snug">{question.question}</p>
                    {question.is_required && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" title={t.requiredMark} />
                    )}
                  </div>
                  {question.description && (
                    <p className="mt-0.5 line-clamp-1 text-sm leading-snug text-muted-foreground">{question.description}</p>
                  )}
                  {question.options.length > 0 && (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {fillMessage(t.optionsCount, { n: question.options.length, list: question.options.join(', ') })}
                    </p>
                  )}
                </div>

                {/* Tipo */}
                <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-1 lg:col-start-auto">
                  <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[11px] font-normal text-muted-foreground">
                    {Icon && <Icon className="h-3 w-3" />}
                    {t.typeLabels[question.question_type]}
                  </Badge>
                </div>

                {/* Ações em ícone, com tooltip e aria-label (mesmo padrão do checklist). */}
                <TooltipProvider delayDuration={200}>
                  <div className="col-start-2 flex shrink-0 items-center gap-0.5 lg:col-start-auto lg:justify-end">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="edit-ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`${t.editQuestion}: ${question.question}`}
                          onClick={() => openEdit(question)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t.editQuestion}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive-ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`${t.removeQuestion}: ${question.question}`}
                          onClick={() => onChange(questions.filter((item) => item.id !== question.id))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t.removeQuestion}</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
            );
          })}
        </div>
      )}

      <QuestionEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editing}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
