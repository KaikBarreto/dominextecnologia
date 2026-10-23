import {
  ArrowLeft, Camera, CheckSquare2, FileSignature, FileText, Hash,
  ListChecks, Pencil, Plus, Type, Video,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QUESTION_TYPES } from '@/hooks/useFormTemplates';
import type { ServiceType } from '@/hooks/useServiceTypes';
import type { FormQuestion, FormTemplate } from '@/types/database';

type ChecklistTemplate = FormTemplate & { questions?: FormQuestion[] };

const previewIcons: Record<string, typeof CheckSquare2> = {
  boolean: CheckSquare2,
  conformidade: CheckSquare2,
  text: Type,
  number: Hash,
  photo: Camera,
  video: Video,
  select: ListChecks,
  signature: FileSignature,
};

function getQuestionTypes(question: FormQuestion): string[] {
  return question.answer_types?.length ? question.answer_types : [question.question_type];
}

function getQuestionTypeLabel(type: string): string {
  return QUESTION_TYPES.find((item) => item.value === type)?.label ?? type;
}

function QuestionAnswerPreview({ question }: { question: FormQuestion }) {
  return (
    <div className="mt-3 space-y-2">
      {getQuestionTypes(question).map((type) => {
        const Icon = previewIcons[type] ?? FileText;
        const options = type === 'select' && Array.isArray(question.options) ? question.options : [];

        if (options.length > 0) {
          return (
            <div key={type} className="space-y-1.5">
              {options.map((option) => (
                <div key={option} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/50" />
                  <span>{option}</span>
                </div>
              ))}
            </div>
          );
        }

        const answerLabel: Record<string, string> = {
          boolean: 'Sim ou não',
          conformidade: 'Conforme, não conforme ou não se aplica',
          text: 'Resposta em texto',
          number: question.unit ? `Valor em ${question.unit}` : 'Resposta numérica',
          photo: 'Registro fotográfico',
          video: 'Registro em vídeo',
          signature: 'Assinatura do responsável',
          select: 'Nenhuma opção cadastrada',
        };

        return (
          <div key={type} className="flex items-center gap-2 border-b border-dashed pb-2 text-sm text-muted-foreground last:border-0 last:pb-0">
            <Icon className="h-4 w-4 shrink-0" />
            <span>{answerLabel[type] ?? getQuestionTypeLabel(type)}</span>
          </div>
        );
      })}
    </div>
  );
}

interface ChecklistOsPreviewProps {
  template: ChecklistTemplate;
  serviceTypes: ServiceType[];
  onEdit: () => void;
  onAddQuestion?: () => void;
  onBack: () => void;
  showBack: boolean;
}

export function ChecklistOsPreview({
  template,
  serviceTypes,
  onEdit,
  onAddQuestion,
  onBack,
  showBack,
}: ChecklistOsPreviewProps) {
  const serviceIds = template.service_type_ids ?? [];
  const linkedServices = serviceTypes.filter((service) => serviceIds.includes(service.id));
  const questions = [...(template.questions ?? [])].sort((a, b) => a.position - b.position);

  return (
    <section className="min-w-0" aria-label={`Prévia do checklist ${template.name}`}>
      {showBack && (
        <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar aos checklists
        </Button>
      )}

      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prévia na ordem de serviço</p>
          <h3 className="mt-1 text-xl font-semibold text-foreground">{template.name}</h3>
          {template.description && <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {onAddQuestion && (
            <Button size="sm" onClick={onAddQuestion}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar pergunta
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar checklist
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-b py-3 text-xs text-muted-foreground">
        <span><strong className="font-medium text-foreground">{questions.length}</strong> {questions.length === 1 ? 'pergunta' : 'perguntas'}</span>
        <span>
          Aplicação: <strong className="font-medium text-foreground">
            {serviceIds.length === 0
              ? 'todos os tipos de serviço'
              : linkedServices.map((service) => service.name).join(', ') || `${serviceIds.length} tipos de serviço`}
          </strong>
        </span>
      </div>

      {questions.length === 0 ? (
        <div className="py-12 text-center">
          <FileText className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
          <p className="font-medium">Este checklist ainda não tem perguntas</p>
          <p className="mt-1 text-sm text-muted-foreground">Adicione a primeira pergunta para montar a prévia da OS.</p>
        </div>
      ) : (
        <ol className="divide-y">
          {questions.map((question, index) => (
            <li key={question.id} className="py-4 first:pt-5">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-6">
                      {question.question}
                      {question.is_required && <span className="ml-1 text-destructive" aria-label="Obrigatória">*</span>}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {getQuestionTypes(question).map((type) => (
                        <Badge key={type} variant="outline" className="font-normal">{getQuestionTypeLabel(type)}</Badge>
                      ))}
                      <Badge variant={question.is_required ? 'secondary' : 'outline'} className="font-normal">
                        {question.is_required ? 'Obrigatória' : 'Opcional'}
                      </Badge>
                    </div>
                  </div>
                  {question.description && <p className="mt-1 text-xs text-muted-foreground">{question.description}</p>}
                  <QuestionAnswerPreview question={question} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
