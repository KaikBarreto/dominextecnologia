import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, Trash2, GripVertical, X,
  CheckSquare, Type, Hash, Camera, ListChecks,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFormTemplates, QUESTION_TYPES, type FormQuestionInsert } from '@/hooks/useFormTemplates';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import type { FormTemplate, FormQuestion } from '@/types/database';
import { cn } from '@/lib/utils';

const getQTypeIcon = (type: string) => {
  const found = QUESTION_TYPES.find(t => t.value === type);
  return found?.icon || CheckSquare;
};
const getQTypeLabel = (type: string) => QUESTION_TYPES.find(t => t.value === type)?.label || type;

export default function QuestionnaireDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    templates, isLoading,
    updateTemplate, deleteTemplate,
    createQuestion, updateQuestion, deleteQuestion, reorderQuestions,
    setTemplateServices,
  } = useFormTemplates();
  const { serviceTypes } = useServiceTypes();

  const template = templates.find(t => t.id === id) as (FormTemplate & { questions: FormQuestion[] }) | undefined;
  const serviceTypeIds = ((template as any)?.service_type_ids ?? []) as string[];
  const appliesToAll = serviceTypeIds.length === 0;

  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null);
  const [deleteTemplateOpen, setDeleteTemplateOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);

  // Question modal state (create or edit)
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<FormQuestion | null>(null);
  const [qForm, setQForm] = useState<Partial<FormQuestionInsert> & { options?: string[]; require_camera?: boolean; answer_types?: string[]; answer_mode?: string }>({
    question: '', question_type: 'boolean', is_required: true, description: '', options: [], require_camera: false, answer_types: [], answer_mode: 'exclusive',
  });
  const [newOption, setNewOption] = useState('');

  const resetQuestionForm = () => {
    setQForm({ question: '', question_type: 'boolean', is_required: true, description: '', options: [], require_camera: false, answer_types: [], answer_mode: 'exclusive' });
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
      answer_types: effectiveTypes,
      answer_mode: (question as any).answer_mode || 'exclusive',
    });
    setNewOption('');
    setQuestionModalOpen(true);
  };

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!template) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/servicos?tab=questionnaires')}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
        <p className="text-muted-foreground">Questionário não encontrado.</p>
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

    if (editingQuestion) {
      updateQuestion.mutate({
        id: editingQuestion.id,
        question: qForm.question,
        question_type: primaryType as any,
        is_required: qForm.is_required ?? true,
        description: qForm.description || null,
        options: optionsToSave,
        require_camera: qForm.require_camera || false,
        answer_types: answerTypes,
        answer_mode: answerMode,
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
        answer_types: answerTypes,
        answer_mode: answerMode,
      } as any, {
        onSuccess: () => {
          setQuestionModalOpen(false);
          resetQuestionForm();
        },
      });
    }
  };

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
    deleteTemplate.mutate(template.id, { onSuccess: () => navigate('/servicos?tab=questionnaires') });
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button variant="ghost" size="icon" onClick={() => navigate('/servicos?tab=questionnaires')} className="self-start">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{template.name}</h1>
          <p className="text-sm text-muted-foreground">{sortedQuestions.length} perguntas</p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          <div className="flex items-center gap-2">
            <Switch
              checked={template.is_active}
              onCheckedChange={(checked) => updateTemplate.mutate({ id: template.id, is_active: checked })}
            />
            <Label className="text-sm">Ativo</Label>
          </div>
          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTemplateOpen(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Services section */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Serviços habilitados</Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={appliesToAll}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setTemplateServices.mutate({ templateId: template.id, serviceTypeIds: [] });
                  } else {
                    const firstActive = serviceTypes.find(t => t.is_active);
                    setTemplateServices.mutate({ templateId: template.id, serviceTypeIds: firstActive ? [firstActive.id] : [] });
                  }
                }}
              />
              <Label className="text-sm">Todos</Label>
            </div>
          </div>
          {!appliesToAll && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {serviceTypes.filter(t => t.is_active).map((st) => {
                const isChecked = serviceTypeIds.includes(st.id);
                return (
                  <label key={st.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        const next = checked
                          ? [...serviceTypeIds, st.id]
                          : serviceTypeIds.filter(sid => sid !== st.id);
                        setTemplateServices.mutate({ templateId: template.id, serviceTypeIds: next });
                      }}
                    />
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                    {st.name}
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Questions header with button */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Perguntas</h2>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Pergunta
        </Button>
      </div>

      {/* Questions list */}
      {sortedQuestions.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <ListChecks className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium">Nenhuma pergunta criada</h3>
          <p className="text-muted-foreground">Clique em "Nova Pergunta" para começar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedQuestions.map((question, index) => {
            const effectiveTypes = getEffectiveTypes(question);
            const questionOptions = (question.options as string[]) || [];

            return (
              <div key={question.id} className="flex items-start gap-2">
                <span className="text-xs font-medium text-muted-foreground mt-3 w-6">{index + 1}.</span>
                <div
                  className={cn(
                    "flex-1 flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors group",
                    draggedQuestionId === question.id && "opacity-50",
                    dragOverQuestionId === question.id && "border-primary border-2"
                  )}
                  draggable
                  onDragStart={(e) => handleDragStart(e, question.id)}
                  onDragOver={(e) => handleDragOver(e, question.id)}
                  onDragLeave={() => setDragOverQuestionId(null)}
                  onDrop={(e) => handleDrop(e, question.id)}
                  onDragEnd={() => { setDraggedQuestionId(null); setDragOverQuestionId(null); }}
                >
                  {/* Desktop: drag handle */}
                  <GripVertical className="h-4 w-4 text-muted-foreground mt-1 cursor-grab active:cursor-grabbing shrink-0 hidden lg:block" />
                  {/* Mobile: up/down buttons */}
                  <div className="flex flex-col gap-0.5 lg:hidden shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === 0}
                      onClick={() => moveQuestion(question.id, 'up')}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === sortedQuestions.length - 1}
                      onClick={() => moveQuestion(question.id, 'down')}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-medium leading-tight">{question.question}</p>
                    {question.description && (
                      <p className="text-xs text-muted-foreground italic whitespace-pre-line">🔒 {question.description}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {effectiveTypes.map(t => {
                        const Icon = getQTypeIcon(t);
                        return (
                          <Badge key={t} variant="secondary" className="text-xs gap-1">
                            <Icon className="h-3 w-3" />
                            {getQTypeLabel(t)}
                          </Badge>
                        );
                      })}
                      {effectiveTypes.length > 1 && (
                        <Badge variant="outline" className="text-xs">
                          {(question as any).answer_mode === 'combined' ? '🔗 Cumulativo' : '⚡ Exclusivo'}
                        </Badge>
                      )}
                      {question.is_required && (
                        <Badge variant="destructive" className="text-xs">Obrigatória</Badge>
                      )}
                      {effectiveTypes.includes('photo') && (question as any).require_camera && (
                        <Badge variant="outline" className="text-xs">Câmera obrigatória</Badge>
                      )}
                      {effectiveTypes.includes('select') && questionOptions.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {questionOptions.length} opções
                        </span>
                      )}
                    </div>
                    {effectiveTypes.includes('select') && questionOptions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {questionOptions.map((opt, i) => (
                          <Badge key={i} variant="outline" className="text-xs font-normal">{opt}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="edit-ghost" size="icon" className="h-8 w-8" onClick={() => openEditModal(question)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="destructive-ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteQuestionId(question.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Question modal (create or edit) */}
      <ResponsiveModal open={questionModalOpen} onOpenChange={(o) => { setQuestionModalOpen(o); if (!o) resetQuestionForm(); }} title={editingQuestion ? 'Editar Pergunta' : 'Nova Pergunta'}>
        <div className="space-y-4">
          <div>
            <Label>Pergunta</Label>
            <Input
              value={qForm.question || ''}
              onChange={(e) => setQForm({ ...qForm, question: e.target.value })}
              placeholder="Texto da pergunta..."
              className="mt-1"
            />
          </div>
          <div>
            <Label>Descrição interna (opcional)</Label>
            <Textarea
              value={qForm.description || ''}
              onChange={(e) => setQForm({ ...qForm, description: e.target.value })}
              placeholder="Instrução interna para o técnico (não aparece no relatório)..."
              className="mt-1"
              rows={2}
            />
            <p className="text-xs text-muted-foreground mt-1">Visível apenas durante o preenchimento. Não aparece no relatório nem no portal do cliente.</p>
          </div>

          {/* Multi answer types */}
          <div className="space-y-2">
            <Label>Tipos de resposta</Label>
            <p className="text-xs text-muted-foreground">Selecione uma ou mais formas de responder.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUESTION_TYPES.map((t) => {
                const QIcon = t.icon;
                const isSelected = selectedAnswerTypes.includes(t.value);
                return (
                  <label
                    key={t.value}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors',
                      isSelected ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted/50'
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleAnswerType(t.value)}
                    />
                    <QIcon className="h-4 w-4" />
                    {t.label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Answer mode toggle when 2+ types selected */}
          {selectedAnswerTypes.length >= 2 && (
            <div className="rounded-lg border p-3 space-y-2">
              <Label className="text-sm font-medium">Modo de resposta múltipla</Label>
              <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30">
                <span className={cn(
                  "text-sm font-medium transition-colors",
                  (qForm as any).answer_mode !== 'combined' ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  Exclusivo
                </span>
                <Switch
                  checked={(qForm as any).answer_mode === 'combined'}
                  onCheckedChange={(checked) => setQForm({ ...qForm, answer_mode: checked ? 'combined' : 'exclusive' } as any)}
                />
                <span className={cn(
                  "text-sm font-medium transition-colors",
                  (qForm as any).answer_mode === 'combined' ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  Cumulativo
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {(qForm as any).answer_mode === 'combined'
                  ? 'O técnico poderá preencher todos os tipos de resposta ao mesmo tempo'
                  : 'Ao responder por um tipo, os demais ficam ocultos automaticamente'}
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
                <Label className="text-sm cursor-pointer">Exigir foto da câmera</Label>
                <p className="text-xs text-muted-foreground">Bloqueia upload da galeria, exige foto tirada na hora</p>
              </div>
            </div>
          )}

          {/* Select options config */}
          {selectedAnswerTypes.includes('select') && (
            <div className="space-y-2">
              <Label>Opções de resposta</Label>
              <div className="flex gap-2">
                <Input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  placeholder="Adicionar opção..."
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
            <Label className="text-sm cursor-pointer">Campo obrigatório</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setQuestionModalOpen(false); resetQuestionForm(); }}>Cancelar</Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleSaveQuestion}
              disabled={!qForm.question?.trim() || selectedAnswerTypes.length === 0 || createQuestion.isPending || updateQuestion.isPending}
            >
              {editingQuestion ? 'Salvar Alterações' : 'Criar Pergunta'}
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* Delete template dialog */}
      <AlertDialog open={deleteTemplateOpen} onOpenChange={setDeleteTemplateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar questionário?</AlertDialogTitle>
            <AlertDialogDescription>
              O questionário deixará de aparecer na listagem e não poderá mais ser vinculado em novas OSs, mas continuará preservado nas OSs já existentes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete question dialog */}
      <AlertDialog open={!!deleteQuestionId} onOpenChange={(o) => !o && setDeleteQuestionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover pergunta?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteQuestion} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
