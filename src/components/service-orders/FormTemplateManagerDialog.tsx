import { useState, useEffect, useRef } from 'react';
import { Plus, Settings2, Pencil, Trash2, FileText, ChevronRight, GripVertical, X, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFormTemplates, QUESTION_TYPES, type FormQuestionInsert } from '@/hooks/useFormTemplates';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import type { FormTemplate, FormQuestion } from '@/types/database';
import { cn } from '@/lib/utils';

interface FormTemplateManagerDialogProps {
  children?: React.ReactNode;
  initialTemplateId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function FormTemplateManagerDialog({ children, initialTemplateId, open: controlledOpen, onOpenChange: controlledOnOpenChange }: FormTemplateManagerDialogProps) {
  const { 
    templates, 
    createTemplate, 
    updateTemplate, 
    deleteTemplate,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
    setTemplateServices,
  } = useFormTemplates();
  const { serviceTypes } = useServiceTypes();
  
  const [open, setOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<(FormTemplate & { questions: FormQuestion[] }) | null>(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null);

  // New question form
  const [newQuestion, setNewQuestion] = useState<Partial<FormQuestionInsert>>({
    question: '',
    question_type: 'boolean',
    is_required: true,
  });

  // Keep selectedTemplate in sync with templates
  useEffect(() => {
    if (selectedTemplate) {
      const updated = templates.find(t => t.id === selectedTemplate.id);
      if (updated) {
        setSelectedTemplate(updated as FormTemplate & { questions: FormQuestion[] });
      }
    }
  }, [templates]);

  const handleCreateTemplate = () => {
    if (!newTemplateName.trim()) return;
    createTemplate.mutate({ name: newTemplateName }, {
      onSuccess: () => setNewTemplateName(''),
    });
  };

  const handleDeleteTemplate = () => {
    if (deleteId) {
      deleteTemplate.mutate(deleteId, {
        onSuccess: () => {
          setDeleteId(null);
          if (selectedTemplate?.id === deleteId) {
            setSelectedTemplate(null);
          }
        },
      });
    }
  };

  const handleAddQuestion = () => {
    if (!newQuestion.question?.trim() || !selectedTemplate) return;
    
    const position = selectedTemplate.questions?.length || 0;
    createQuestion.mutate({
      template_id: selectedTemplate.id,
      question: newQuestion.question,
      question_type: newQuestion.question_type as 'boolean' | 'text' | 'number' | 'photo' | 'select',
      is_required: newQuestion.is_required ?? true,
      position,
      description: newQuestion.description,
    }, {
      onSuccess: () => {
        setNewQuestion({ question: '', question_type: 'boolean', is_required: true });
      },
    });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, questionId: string) => {
    setDraggedQuestionId(questionId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, questionId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (questionId !== draggedQuestionId) {
      setDragOverQuestionId(questionId);
    }
  };

  const handleDragLeave = () => {
    setDragOverQuestionId(null);
  };

  const handleDrop = (e: React.DragEvent, targetQuestionId: string) => {
    e.preventDefault();
    if (!draggedQuestionId || !selectedTemplate || draggedQuestionId === targetQuestionId) {
      setDraggedQuestionId(null);
      setDragOverQuestionId(null);
      return;
    }

    const questions = [...(selectedTemplate.questions || [])].sort((a, b) => a.position - b.position);
    const draggedIndex = questions.findIndex(q => q.id === draggedQuestionId);
    const targetIndex = questions.findIndex(q => q.id === targetQuestionId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder
    const [draggedItem] = questions.splice(draggedIndex, 1);
    questions.splice(targetIndex, 0, draggedItem);

    // Get new order of IDs
    const orderedIds = questions.map(q => q.id);
    reorderQuestions.mutate(orderedIds);

    setDraggedQuestionId(null);
    setDragOverQuestionId(null);
  };

  const handleDragEnd = () => {
    setDraggedQuestionId(null);
    setDragOverQuestionId(null);
  };

  const handleDeleteQuestion = (questionId: string) => {
    deleteQuestion.mutate(questionId);
  };

  const getQuestionTypeIcon = (type: string) => {
    return QUESTION_TYPES.find(t => t.value === type)?.icon || '❓';
  };

  const getQuestionTypeLabel = (type: string) => {
    return QUESTION_TYPES.find(t => t.value === type)?.label || type;
  };

  const EditableQuestion = ({ question }: { question: FormQuestion }) => {
    const [text, setText] = useState(question.question);
    const [type, setType] = useState(question.question_type);
    const [required, setRequired] = useState(question.is_required);
    const isEditing = editingQuestionId === question.id;

    const handleSave = () => {
      updateQuestion.mutate({ 
        id: question.id, 
        question: text, 
        question_type: type,
        is_required: required,
      });
      setEditingQuestionId(null);
    };

    if (isEditing) {
      return (
        <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Texto da pergunta"
            rows={2}
          />
          <div className="flex items-center gap-3">
            <Select value={type} onValueChange={(v) => setType(v as FormQuestion['question_type'])}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.icon} {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch checked={required} onCheckedChange={setRequired} />
              <Label className="text-xs">Obrigatória</Label>
            </div>
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => setEditingQuestionId(null)}>
                <X className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleSave}>
                <Check className="h-4 w-4 text-success" />
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div 
        className={cn(
          "flex items-start gap-2 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors group",
          draggedQuestionId === question.id && "opacity-50",
          dragOverQuestionId === question.id && "border-primary border-2"
        )}
        draggable
        onDragStart={(e) => handleDragStart(e, question.id)}
        onDragOver={(e) => handleDragOver(e, question.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, question.id)}
        onDragEnd={handleDragEnd}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground mt-1 cursor-grab active:cursor-grabbing" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{question.question}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">
              {getQuestionTypeIcon(question.question_type)} {getQuestionTypeLabel(question.question_type)}
            </Badge>
            {question.is_required && (
              <Badge variant="destructive" className="text-xs">Obrigatória</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingQuestionId(question.id)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-destructive"
            onClick={() => handleDeleteQuestion(question.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  const dialogContent = (
    <div className="flex h-[600px]">
      {/* Templates List */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Questionários
          </h3>
        </div>
        
        {/* New Template */}
        <div className="p-3 border-b space-y-2">
          {!showCreateTemplate ? (
            <Button className="w-full" variant="outline" onClick={() => setShowCreateTemplate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo questionário
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Nome do questionário"
                className="flex-1"
              />
              <Button
                onClick={handleCreateTemplate}
                disabled={!newTemplateName.trim() || createTemplate.isPending}
              >Criar</Button>
              <Button variant="ghost" onClick={() => { setShowCreateTemplate(false); setNewTemplateName(''); }}>Cancelar</Button>
            </div>
          )}
        </div>

        {/* Templates */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {templates.map((template) => (
              <div
                key={template.id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors group",
                  selectedTemplate?.id === template.id 
                    ? "bg-primary/10 border border-primary/30" 
                    : "hover:bg-muted"
                )}
                onClick={() => setSelectedTemplate(template as FormTemplate & { questions: FormQuestion[] })}
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{template.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {template.questions?.length || 0} perguntas
                  </p>
                </div>
                <Badge variant={template.is_active ? 'success' : 'muted'} className="text-xs">
                  {template.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
            {templates.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhum questionário criado
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Template Details */}
      <div className="flex-1 flex flex-col">
        {selectedTemplate ? (
          <>
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{selectedTemplate.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedTemplate.questions?.length || 0} perguntas
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={selectedTemplate.is_active}
                    onCheckedChange={(checked) => {
                      updateTemplate.mutate({ id: selectedTemplate.id, is_active: checked });
                    }}
                  />
                  <Label className="text-sm">Ativo</Label>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => setDeleteId(selectedTemplate.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Service Types Link */}
            <div className="px-4 py-3 border-b space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Serviços habilitados</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={((selectedTemplate as any).service_type_ids?.length ?? 0) === 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setTemplateServices.mutate({ templateId: selectedTemplate.id, serviceTypeIds: [] });
                      }
                    }}
                  />
                  <Label className="text-xs">Todos</Label>
                </div>
              </div>
              {((selectedTemplate as any).service_type_ids?.length ?? 0) > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {serviceTypes.filter(t => t.is_active).map((st) => {
                    const selectedIds = ((selectedTemplate as any).service_type_ids ?? []) as string[];
                    const checked = selectedIds.includes(st.id);
                    return (
                      <label key={st.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selectedIds, st.id]
                              : selectedIds.filter((id) => id !== st.id);
                            setTemplateServices.mutate({ templateId: selectedTemplate.id, serviceTypeIds: next });
                          }}
                        />
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                        {st.name}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Questions List */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-2">
                {selectedTemplate.questions
                  ?.sort((a, b) => a.position - b.position)
                  .map((question, index) => (
                    <div key={question.id} className="flex items-start gap-2">
                      <span className="text-xs font-medium text-muted-foreground mt-3 w-6">
                        {index + 1}.
                      </span>
                      <div className="flex-1">
                        <EditableQuestion question={question} />
                      </div>
                    </div>
                  ))}
              </div>
            </ScrollArea>

            {/* Add Question Form */}
            <div className="p-4 border-t space-y-3">
              <Label className="text-sm font-medium">Nova Pergunta</Label>
              <div className="flex gap-2">
                <Input
                  value={newQuestion.question || ''}
                  onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                  placeholder="Texto da pergunta..."
                  className="flex-1"
                />
                <Select 
                  value={newQuestion.question_type || 'boolean'} 
                  onValueChange={(v) => setNewQuestion({ ...newQuestion, question_type: v as FormQuestion['question_type'] })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.icon} {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id="new-question-required"
                    checked={newQuestion.is_required ?? true}
                    onCheckedChange={(checked) => setNewQuestion({ ...newQuestion, is_required: checked })}
                  />
                  <Label htmlFor="new-question-required" className="text-sm cursor-pointer">
                    Campo obrigatório
                  </Label>
                </div>
                <Button
                  onClick={handleAddQuestion}
                  disabled={!newQuestion.question?.trim() || createQuestion.isPending}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Selecione um questionário para editar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const deleteDialog = (
    <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover questionário?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. Todas as perguntas deste questionário serão removidas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteTemplate}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Inline mode (no children) - render directly
  if (!children) {
    return (
      <>
        <div className="rounded-lg border overflow-hidden">
          {dialogContent}
        </div>
        {deleteDialog}
      </>
    );
  }

  // Dialog mode (with children trigger)
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          {dialogContent}
        </DialogContent>
      </Dialog>
      {deleteDialog}
    </>
  );
}
