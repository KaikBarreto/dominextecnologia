import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, Trash2, GripVertical, X, Check,
  CheckSquare, Type, Hash, Camera, ListChecks,
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null);
  const [deleteTemplateOpen, setDeleteTemplateOpen] = useState(false);
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);

  // New question modal state
  const [newQuestionOpen, setNewQuestionOpen] = useState(false);
  const [newQ, setNewQ] = useState<Partial<FormQuestionInsert> & { options?: string[] }>({
    question: '', question_type: 'boolean', is_required: true, description: '', options: [],
  });
  const [newOption, setNewOption] = useState('');

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!template) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/questionarios')}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
        <p className="text-muted-foreground">Questionário não encontrado.</p>
      </div>
    );
  }

  const handleAddQuestion = () => {
    if (!newQ.question?.trim()) return;
    const position = template.questions?.length || 0;
    createQuestion.mutate({
      template_id: template.id,
      question: newQ.question,
      question_type: newQ.question_type as any,
      is_required: newQ.is_required ?? true,
      description: newQ.description || undefined,
      options: newQ.question_type === 'select' && newQ.options?.length ? newQ.options : undefined,
      position,
    }, {
      onSuccess: () => {
        setNewQ({ question: '', question_type: 'boolean', is_required: true, description: '', options: [] });
        setNewOption('');
        setNewQuestionOpen(false);
      },
    });
  };

  const handleAddOption = () => {
    if (!newOption.trim()) return;
    setNewQ(prev => ({ ...prev, options: [...(prev.options || []), newOption.trim()] }));
    setNewOption('');
  };

  const handleRemoveOption = (index: number) => {
    setNewQ(prev => ({ ...prev, options: (prev.options || []).filter((_, i) => i !== index) }));
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
    deleteTemplate.mutate(template.id, { onSuccess: () => navigate('/questionarios') });
  };

  const handleDeleteQuestion = () => {
    if (deleteQuestionId) {
      deleteQuestion.mutate(deleteQuestionId);
      setDeleteQuestionId(null);
    }
  };

  const sortedQuestions = [...(template.questions || [])].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/questionarios')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{template.name}</h1>
          <p className="text-sm text-muted-foreground">{sortedQuestions.length} perguntas</p>
        </div>
        <div className="flex items-center gap-3">
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
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setNewQuestionOpen(true)}>
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
          {sortedQuestions.map((question, index) => (
            <QuestionRow
              key={question.id}
              question={question}
              index={index}
              isEditing={editingQuestionId === question.id}
              onEdit={() => setEditingQuestionId(question.id)}
              onCancelEdit={() => setEditingQuestionId(null)}
              onSave={(data) => { updateQuestion.mutate({ id: question.id, ...data }); setEditingQuestionId(null); }}
              onDelete={() => setDeleteQuestionId(question.id)}
              isDragged={draggedQuestionId === question.id}
              isDragOver={dragOverQuestionId === question.id}
              onDragStart={(e) => handleDragStart(e, question.id)}
              onDragOver={(e) => handleDragOver(e, question.id)}
              onDragLeave={() => setDragOverQuestionId(null)}
              onDrop={(e) => handleDrop(e, question.id)}
              onDragEnd={() => { setDraggedQuestionId(null); setDragOverQuestionId(null); }}
            />
          ))}
        </div>
      )}

      {/* New question modal */}
      <ResponsiveModal open={newQuestionOpen} onOpenChange={setNewQuestionOpen} title="Nova Pergunta">
        <div className="space-y-4">
          <div>
            <Label>Pergunta</Label>
            <Input
              value={newQ.question || ''}
              onChange={(e) => setNewQ({ ...newQ, question: e.target.value })}
              placeholder="Texto da pergunta..."
              className="mt-1"
            />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={newQ.description || ''}
              onChange={(e) => setNewQ({ ...newQ, description: e.target.value })}
              placeholder="Descrição ou instrução adicional..."
              className="mt-1"
              rows={2}
            />
          </div>
          <div>
            <Label>Tipo de resposta</Label>
            <Select
              value={newQ.question_type || 'boolean'}
              onValueChange={(v) => setNewQ({ ...newQ, question_type: v as any, options: v === 'select' ? (newQ.options || []) : [] })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {t.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Select options config */}
          {newQ.question_type === 'select' && (
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
              {(newQ.options || []).length > 0 && (
                <div className="space-y-1">
                  {(newQ.options || []).map((opt, i) => (
                    <EditableOption
                      key={i}
                      value={opt}
                      onChange={(newVal) => setNewQ(prev => ({ ...prev, options: (prev.options || []).map((o, idx) => idx === i ? newVal : o) }))}
                      onRemove={() => handleRemoveOption(i)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch
              checked={newQ.is_required ?? true}
              onCheckedChange={(checked) => setNewQ({ ...newQ, is_required: checked })}
            />
            <Label className="text-sm cursor-pointer">Campo obrigatório</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setNewQuestionOpen(false)}>Cancelar</Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleAddQuestion}
              disabled={!newQ.question?.trim() || createQuestion.isPending}
            >
              Criar Pergunta
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* Delete template dialog */}
      <AlertDialog open={deleteTemplateOpen} onOpenChange={setDeleteTemplateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover questionário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as perguntas serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
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

// Sub-component for each question row
function QuestionRow({
  question, index, isEditing, onEdit, onCancelEdit, onSave, onDelete,
  isDragged, isDragOver,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: {
  question: FormQuestion; index: number;
  isEditing: boolean; onEdit: () => void; onCancelEdit: () => void;
  onSave: (data: Partial<FormQuestion>) => void; onDelete: () => void;
  isDragged: boolean; isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void; onDrop: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  const [text, setText] = useState(question.question);
  const [type, setType] = useState<string>(question.question_type);
  const [required, setRequired] = useState(question.is_required);
  const [options, setOptions] = useState<string[]>((question.options as string[]) || []);
  const [editOption, setEditOption] = useState('');

  useEffect(() => {
    setText(question.question);
    setType(question.question_type);
    setRequired(question.is_required);
    setOptions((question.options as string[]) || []);
  }, [question]);

  const Icon = getQTypeIcon(type);

  if (isEditing) {
    return (
      <div className="flex items-start gap-2">
        <span className="text-xs font-medium text-muted-foreground mt-3 w-6">{index + 1}.</span>
        <div className="flex-1 p-4 rounded-lg border bg-muted/30 space-y-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={type} onValueChange={(v) => { setType(v); if (v !== 'select') setOptions([]); }}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => {
                  const TIcon = t.icon;
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2"><TIcon className="h-4 w-4" />{t.label}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch checked={required} onCheckedChange={setRequired} />
              <Label className="text-xs">Obrigatória</Label>
            </div>
          </div>

          {/* Edit options for select type */}
          {type === 'select' && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Opções de resposta</Label>
              <div className="flex gap-2">
                <Input
                  value={editOption}
                  onChange={(e) => setEditOption(e.target.value)}
                  placeholder="Adicionar opção..."
                  className="flex-1 h-8"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (editOption.trim()) {
                        setOptions([...options, editOption.trim()]);
                        setEditOption('');
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (editOption.trim()) {
                      setOptions([...options, editOption.trim()]);
                      setEditOption('');
                    }
                  }}
                  disabled={!editOption.trim()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {options.length > 0 && (
                <div className="space-y-1">
                  {options.map((opt, i) => (
                    <EditableOption
                      key={i}
                      value={opt}
                      onChange={(newVal) => setOptions(options.map((o, idx) => idx === i ? newVal : o))}
                      onRemove={() => setOptions(options.filter((_, idx) => idx !== i))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSave({
                question: text,
                question_type: type as any,
                is_required: required,
                options: type === 'select' ? options : null,
              })}
            >
              <Check className="h-4 w-4 mr-1 text-green-600" /> Salvar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const questionOptions = (question.options as string[]) || [];

  return (
    <div className="flex items-start gap-2">
      <span className="text-xs font-medium text-muted-foreground mt-3 w-6">{index + 1}.</span>
      <div
        className={cn(
          "flex-1 flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors group",
          isDragged && "opacity-50",
          isDragOver && "border-primary border-2"
        )}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground mt-1 cursor-grab active:cursor-grabbing shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-medium leading-tight">{question.question}</p>
          {question.description && (
            <p className="text-xs text-muted-foreground">{question.description}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs gap-1">
              <Icon className="h-3 w-3" />
              {getQTypeLabel(question.question_type)}
            </Badge>
            {question.is_required && (
              <Badge variant="destructive" className="text-xs">Obrigatória</Badge>
            )}
            {question.question_type === 'select' && questionOptions.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {questionOptions.length} opções
              </span>
            )}
          </div>
          {/* Show options inline for select type */}
          {question.question_type === 'select' && questionOptions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {questionOptions.map((opt, i) => (
                <Badge key={i} variant="outline" className="text-xs font-normal">{opt}</Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button variant="edit-ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="destructive-ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
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
