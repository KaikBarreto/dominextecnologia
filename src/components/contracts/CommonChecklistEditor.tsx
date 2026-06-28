// Editor do CHECKLIST por equipamento no contrato COMUM (não-PMOC).
//
// Cada equipamento do contrato escolhe UM checklist (form_template). Ao escolher,
// um accordion lista as perguntas do checklist, cada uma com:
//  - selo de frequência (fonte ÚNICA: frequencyLabel de questionFrequency.ts);
//  - checkbox "Adicionar na primeira OS?" (marcado por padrão).
//
// Perguntas "toda visita" (sem frequência) entram SEMPRE na 1ª OS — o checkbox
// fica travado MARCADO (disabled), com tooltip explicando. Elas NUNCA entram na
// lista de exclusões.
//
// O estado persistido é uma lista de EXCLUSÕES (ids de perguntas que NÃO entram
// na 1ª OS daquele equipamento). Pergunta desmarcada → id na lista; marcada →
// fora. Vazio = todas entram. Espelha contract_items.first_os_excluded_questions.
//
// Seleção em massa por frequência: cada frequência distinta presente no checklist
// vira um chip "marcar/desmarcar todas". "Toda visita" não aparece nesse controle
// (é sempre obrigatória).
import { useMemo } from 'react';
import { ListChecks, Check } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { frequencyLabel, isEveryVisit, type QuestionFrequency } from '@/components/contracts/questionFrequency';
import { cn } from '@/lib/utils';

// Forma mínima de uma pergunta do checklist usada aqui (subset de form_questions).
export interface ChecklistQuestion extends QuestionFrequency {
  id: string;
  question: string;
  position?: number | null;
}

// Forma mínima de um checklist (form_template) usada aqui.
export interface ChecklistTemplateOption {
  id: string;
  name: string;
  questions: ChecklistQuestion[];
}

interface CommonChecklistEditorProps {
  // Checklists personalizados do tenant (form_templates ativos) com perguntas.
  templates: ChecklistTemplateOption[];
  // Checklist atualmente escolhido pra este equipamento (null = nenhum).
  selectedTemplateId: string | null;
  onChangeTemplate: (templateId: string | null) => void;
  // Ids de perguntas EXCLUÍDAS da 1ª OS (estado persistido).
  excluded: string[];
  onChangeExcluded: (next: string[]) => void;
}

// Constante sentinela do Select (Radix não aceita value="").
const NO_TEMPLATE = '__none__';

export function CommonChecklistEditor({
  templates,
  selectedTemplateId,
  onChangeTemplate,
  excluded,
  onChangeExcluded,
}: CommonChecklistEditorProps) {
  const template = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  // Perguntas ordenadas por posição (estável).
  const questions = useMemo(() => {
    const qs = template?.questions ?? [];
    return [...qs].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [template]);

  const excludedSet = useMemo(() => new Set(excluded), [excluded]);

  // Frequências distintas presentes (exclui "toda visita", que é obrigatória).
  // Cada bucket guarda o rótulo + os ids das perguntas com aquela frequência.
  const frequencyBuckets = useMemo(() => {
    const map = new Map<string, { label: string; ids: string[] }>();
    for (const q of questions) {
      if (isEveryVisit(q)) continue;
      const label = frequencyLabel(q);
      // Chave de agrupamento idêntica ao rótulo (perguntas com mesmo selo juntas).
      const bucket = map.get(label) ?? { label, ids: [] };
      bucket.ids.push(q.id);
      map.set(label, bucket);
    }
    return [...map.values()];
  }, [questions]);

  // Pergunta marcada = NÃO está na lista de exclusões. "Toda visita" sempre marcada.
  const isIncluded = (q: ChecklistQuestion) => isEveryVisit(q) || !excludedSet.has(q.id);

  // Quantas perguntas entram na 1ª OS (todas as "toda visita" + as não excluídas).
  const includedCount = useMemo(
    () => questions.filter(isIncluded).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, excludedSet],
  );

  const toggleQuestion = (q: ChecklistQuestion) => {
    if (isEveryVisit(q)) return; // travada
    const next = new Set(excludedSet);
    if (next.has(q.id)) next.delete(q.id);
    else next.add(q.id);
    onChangeExcluded([...next]);
  };

  // Marca/desmarca em massa todas as perguntas de uma frequência. Marcar = tirar
  // da exclusão; desmarcar = adicionar. (Toda visita nunca está nesses buckets.)
  const toggleBucket = (ids: string[], allIncluded: boolean) => {
    const next = new Set(excludedSet);
    if (allIncluded) ids.forEach((id) => next.add(id));
    else ids.forEach((id) => next.delete(id));
    onChangeExcluded([...next]);
  };

  return (
    <div className="space-y-2.5">
      {/* Seletor de checklist do equipamento. */}
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5 text-info" />
          Checklist deste equipamento
        </span>
        <Select
          value={selectedTemplateId ?? NO_TEMPLATE}
          onValueChange={(v) => onChangeTemplate(v === NO_TEMPLATE ? null : v)}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Sem checklist" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TEMPLATE} className="text-xs">Sem checklist</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.name} ({t.questions.length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Accordion das perguntas — só quando há checklist com perguntas. */}
      {template && questions.length > 0 && (
        <Accordion type="single" collapsible defaultValue="questions" className="w-full">
          <AccordionItem value="questions" className="rounded-lg border bg-background">
            <AccordionTrigger className="px-3 py-2.5 text-xs hover:no-underline">
              <span className="flex items-center gap-2">
                <span className="font-medium text-foreground">Perguntas do Checklist</span>
                <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                  {includedCount} de {questions.length} na 1ª OS
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              {/* Seleção em massa por frequência. */}
              {frequencyBuckets.length > 0 && (
                <div className="mb-2.5 rounded-md bg-muted/40 p-2">
                  <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
                    Marcar/desmarcar todas de uma frequência
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {frequencyBuckets.map((b) => {
                      const allIncluded = b.ids.every((id) => !excludedSet.has(id));
                      return (
                        <button
                          key={b.label}
                          type="button"
                          onClick={() => toggleBucket(b.ids, allIncluded)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors',
                            allIncluded
                              ? 'border-info bg-info text-info-foreground'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted',
                          )}
                          title={
                            allIncluded
                              ? `Desmarcar todas as perguntas: ${b.label}`
                              : `Marcar todas as perguntas: ${b.label}`
                          }
                        >
                          {allIncluded && <Check className="h-3 w-3" />}
                          {b.label}
                          <span className="opacity-70">({b.ids.length})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cabeçalho das colunas. */}
              <div className="flex items-center gap-2.5 border-b px-1.5 pb-1.5">
                <span className="min-w-0 flex-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Pergunta
                </span>
                <span className="w-[5.5rem] shrink-0 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Frequência
                </span>
                <span className="w-12 shrink-0 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Na 1ª OS?
                </span>
              </div>

              {/* Lista rolável (pode ter dezenas de perguntas). */}
              <div className="max-h-72 space-y-0.5 overflow-y-auto pt-1">
                {questions.map((q) => {
                  const everyVisit = isEveryVisit(q);
                  const included = isIncluded(q);
                  return (
                    <div
                      key={q.id}
                      className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-muted/40"
                    >
                      <p className="min-w-0 flex-1 text-xs leading-snug text-foreground">
                        {q.question}
                      </p>
                      <Badge
                        variant={everyVisit ? 'info' : 'outline'}
                        className="w-[5.5rem] shrink-0 justify-center text-[10px] font-normal"
                      >
                        {frequencyLabel(q)}
                      </Badge>
                      <div className="flex w-12 shrink-0 justify-center">
                        {everyVisit ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Checkbox checked disabled aria-label="Sempre na primeira OS" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[15rem] text-xs">
                              Itens de toda visita sempre entram na primeira OS.
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Checkbox
                            checked={included}
                            onCheckedChange={() => toggleQuestion(q)}
                            aria-label={`Adicionar na primeira OS: ${q.question}`}
                            title="Adicionar na 1ª OS?"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {template && questions.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Este checklist ainda não tem perguntas.
        </p>
      )}
    </div>
  );
}
