import { Badge } from '@/components/ui/badge';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { QUESTION_TYPES } from '@/hooks/useFormTemplates';
import type { FormTemplate, FormQuestion } from '@/types/database';

interface QuestionnairePreviewDialogProps {
  templateId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: (FormTemplate & { questions: FormQuestion[] })[];
}

export function QuestionnairePreviewDialog({ templateId, open, onOpenChange, templates }: QuestionnairePreviewDialogProps) {
  const template = templates.find(t => t.id === templateId);
  if (!template) return null;

  const getIcon = (type: string) => QUESTION_TYPES.find(t => t.value === type)?.icon || '❓';
  const getLabel = (type: string) => QUESTION_TYPES.find(t => t.value === type)?.label || type;

  const sortedQuestions = [...(template.questions || [])].sort((a, b) => a.position - b.position);

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`Pré-visualização: ${template.name}`}>
      <div className="space-y-3">
        {sortedQuestions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma pergunta neste questionário.</p>
        ) : (
          sortedQuestions.map((q, i) => (
            <div key={q.id} className="flex items-start gap-2 p-3 rounded-lg border">
              <span className="text-xs font-medium text-muted-foreground mt-0.5 w-6">{i + 1}.</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{q.question}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs gap-1">
                    {(() => { const QIcon = getIcon(q.question_type); return typeof QIcon === 'string' ? QIcon : <QIcon className="h-3 w-3" />; })()} {getLabel(q.question_type)}
                  </Badge>
                  {q.is_required && (
                    <Badge variant="destructive" className="text-xs">Obrigatória</Badge>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </ResponsiveModal>
  );
}
