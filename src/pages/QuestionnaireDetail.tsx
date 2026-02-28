import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, GripVertical, X, Check, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
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
  const [newQuestion, setNewQuestion] = useState<Partial<FormQuestionInsert>>({
    question: '', question_type: 'boolean', is_required: true,
  });

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
    if (!newQuestion.question?.trim()) return;
    const position = template.questions?.length || 0;
    createQuestion.mutate({
      template_id: template.id,
      question: newQuestion.question,
      question_type: newQuestion.question_type as any,
      is_required: newQuestion.is_required ?? true,
      position,
    }, {
      onSuccess: () => setNewQuestion({ question: '', question_type: 'boolean', is_required: true }),
    });
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

  const getQTypeIcon = (type: string) => QUESTION_TYPES.find(t => t.value === type)?.icon || '❓';
  const getQTypeLabel = (type: string) => QUESTION_TYPES.find(t => t.value === type)?.label || type;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/questionarios')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{template.name}</h1>
          <p className="text-sm text-muted-foreground">{template.questions?.length || 0} perguntas</p>
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
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const next = e.target.checked
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

      {/* Questions */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Perguntas</h2>
        {(template.questions || [])
          .sort((a, b) => a.position - b.position)
          .map((question, index) => (
            <QuestionRow
              key={question.id}
              question={question}
              index={index}
              isEditing={editingQuestionId === question.id}
              onEdit={() => setEditingQuestionId(question.id)}
              onCancelEdit={() => setEditingQuestionId(null)}
              onSave={(data) => { updateQuestion.mutate({ id: question.id, ...data }); setEditingQuestionId(null); }}
              onDelete={() => deleteQuestion.mutate(question.id)}
              isDragged={draggedQuestionId === question.id}
              isDragOver={dragOverQuestionId === question.id}
              onDragStart={(e) => handleDragStart(e, question.id)}
              onDragOver={(e) => handleDragOver(e, question.id)}
              onDragLeave={() => setDragOverQuestionId(null)}
              onDrop={(e) => handleDrop(e, question.id)}
              onDragEnd={() => { setDraggedQuestionId(null); setDragOverQuestionId(null); }}
              getQTypeIcon={getQTypeIcon}
              getQTypeLabel={getQTypeLabel}
            />
          ))}
      </div>

      {/* Add question */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Label className="text-sm font-medium">Nova Pergunta</Label>
          <div className="flex gap-2">
            <Input
              value={newQuestion.question || ''}
              onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
              placeholder="Texto da pergunta..."
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddQuestion()}
            />
            <Select
              value={newQuestion.question_type || 'boolean'}
              onValueChange={(v) => setNewQuestion({ ...newQuestion, question_type: v as any })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={newQuestion.is_required ?? true}
                onCheckedChange={(checked) => setNewQuestion({ ...newQuestion, is_required: checked })}
              />
              <Label className="text-sm cursor-pointer">Campo obrigatório</Label>
            </div>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleAddQuestion}
              disabled={!newQuestion.question?.trim() || createQuestion.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}

// Sub-component for each question row
function QuestionRow({
  question, index, isEditing, onEdit, onCancelEdit, onSave, onDelete,
  isDragged, isDragOver,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  getQTypeIcon, getQTypeLabel,
}: {
  question: FormQuestion; index: number;
  isEditing: boolean; onEdit: () => void; onCancelEdit: () => void;
  onSave: (data: Partial<FormQuestion>) => void; onDelete: () => void;
  isDragged: boolean; isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void; onDrop: (e: React.DragEvent) => void; onDragEnd: () => void;
  getQTypeIcon: (t: string) => string; getQTypeLabel: (t: string) => string;
}) {
  const [text, setText] = useState(question.question);
  const [type, setType] = useState<string>(question.question_type);
  const [required, setRequired] = useState(question.is_required);

  useEffect(() => {
    setText(question.question);
    setType(question.question_type);
    setRequired(question.is_required);
  }, [question]);

  if (isEditing) {
    return (
      <div className="flex items-start gap-2">
        <span className="text-xs font-medium text-muted-foreground mt-3 w-6">{index + 1}.</span>
        <div className="flex-1 p-3 rounded-lg border bg-muted/30 space-y-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={type} onValueChange={(v) => setType(v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch checked={required} onCheckedChange={setRequired} />
              <Label className="text-xs">Obrigatória</Label>
            </div>
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="icon" onClick={onCancelEdit}><X className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => onSave({ question: text, question_type: type, is_required: required })}><Check className="h-4 w-4 text-success" /></Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <span className="text-xs font-medium text-muted-foreground mt-3 w-6">{index + 1}.</span>
      <div
        className={cn(
          "flex-1 flex items-start gap-2 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors group",
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
        <GripVertical className="h-4 w-4 text-muted-foreground mt-1 cursor-grab active:cursor-grabbing" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{question.question}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">
              {getQTypeIcon(question.question_type)} {getQTypeLabel(question.question_type)}
            </Badge>
            {question.is_required && (
              <Badge variant="destructive" className="text-xs">Obrigatória</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
