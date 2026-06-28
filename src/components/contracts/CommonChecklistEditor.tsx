// Editor do CHECKLIST por equipamento no contrato COMUM (não-PMOC).
//
// Cada equipamento do contrato pode ter VÁRIOS checklists (form_templates). Um
// combobox "Adicionar checklist" inclui um novo; cada checklist adicionado vira
// um BLOCO PRÓPRIO titulado "Perguntas do Checklist — [NOME]" com APENAS as
// perguntas daquele checklist (colunas, seleção em massa e contador são por bloco).
//
// Cada pergunta tem:
//  - selo de frequência (fonte ÚNICA: frequencyLabel de questionFrequency.ts);
//  - checkbox "Adicionar na primeira OS?" (marcado por padrão).
//
// Perguntas "toda visita" (sem frequência) entram SEMPRE na 1ª OS — o checkbox
// fica travado MARCADO (disabled), com tooltip explicando. Elas NUNCA entram na
// lista de exclusões.
//
// O estado persistido é uma lista de EXCLUSÕES (ids de perguntas que NÃO entram
// na 1ª OS daquele equipamento), VÁLIDA entre TODOS os checklists do item (ids
// de form_questions são únicos). Pergunta desmarcada → id na lista; marcada →
// fora. Vazio = todas entram. Espelha contract_items.first_os_excluded_questions.
//
// Seleção em massa por frequência: dentro de CADA bloco, cada frequência distinta
// presente NAQUELE checklist vira um chip "marcar/desmarcar todas". "Toda visita"
// não aparece nesse controle (é sempre obrigatória).
import { useMemo, useState, useEffect } from 'react';
import { ListChecks, Check, Plus, Trash2, ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  // Checklists atualmente escolhidos pra este equipamento (ordem = ordem de adição).
  selectedTemplateIds: string[];
  onChangeTemplates: (templateIds: string[]) => void;
  // Ids de perguntas EXCLUÍDAS da 1ª OS (estado persistido, união de todos os checklists).
  excluded: string[];
  onChangeExcluded: (next: string[]) => void;
}

// Constante sentinela do Select (Radix não aceita value="").
const ADD_PLACEHOLDER = '__add__';

export function CommonChecklistEditor({
  templates,
  selectedTemplateIds,
  onChangeTemplates,
  excluded,
  onChangeExcluded,
}: CommonChecklistEditorProps) {
  // Checklists escolhidos, na ordem de adição, resolvidos pra opção completa.
  const selectedTemplates = useMemo(
    () =>
      selectedTemplateIds
        .map((id) => templates.find((t) => t.id === id))
        .filter((t): t is ChecklistTemplateOption => !!t),
    [templates, selectedTemplateIds],
  );

  // Checklists ainda disponíveis pra adicionar (não escolhidos).
  const availableTemplates = useMemo(
    () => templates.filter((t) => !selectedTemplateIds.includes(t.id)),
    [templates, selectedTemplateIds],
  );

  // Perguntas de cada checklist escolhido, ordenadas por posição (estável).
  const blocks = useMemo(
    () =>
      selectedTemplates.map((t) => ({
        template: t,
        questions: [...t.questions].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      })),
    [selectedTemplates],
  );

  // Accordion single-open: qual checklist está expandido. Default = o primeiro.
  // Abrir um fecha os outros; clicar no aberto fecha (collapsible).
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(
    () => selectedTemplateIds[0] ?? null,
  );

  // Mantém o accordion coerente quando a lista muda: se o aberto sumiu, abre o
  // primeiro restante; se nada estava aberto e há blocos, abre o primeiro.
  useEffect(() => {
    if (selectedTemplateIds.length === 0) {
      if (openTemplateId !== null) setOpenTemplateId(null);
      return;
    }
    if (!openTemplateId || !selectedTemplateIds.includes(openTemplateId)) {
      setOpenTemplateId(selectedTemplateIds[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateIds]);

  const excludedSet = useMemo(() => new Set(excluded), [excluded]);

  // Pergunta marcada = NÃO está na lista de exclusões. "Toda visita" sempre marcada.
  const isIncluded = (q: ChecklistQuestion) => isEveryVisit(q) || !excludedSet.has(q.id);

  const toggleQuestion = (q: ChecklistQuestion) => {
    if (isEveryVisit(q)) return; // travada
    const next = new Set(excludedSet);
    if (next.has(q.id)) next.delete(q.id);
    else next.add(q.id);
    onChangeExcluded([...next]);
  };

  // Marca/desmarca em massa um conjunto de ids. Marcar = tirar da exclusão;
  // desmarcar = adicionar. (Toda visita nunca chega aqui.)
  const toggleBucket = (ids: string[], allIncluded: boolean) => {
    const next = new Set(excludedSet);
    if (allIncluded) ids.forEach((id) => next.add(id));
    else ids.forEach((id) => next.delete(id));
    onChangeExcluded([...next]);
  };

  // Adiciona um checklist ao equipamento (no fim da lista).
  const addTemplate = (templateId: string) => {
    if (selectedTemplateIds.includes(templateId)) return;
    onChangeTemplates([...selectedTemplateIds, templateId]);
    setOpenTemplateId(templateId); // abre o recém-adicionado (fecha os outros)
  };

  // Remove um checklist do equipamento. As exclusões de perguntas que NÃO existem
  // mais em nenhum checklist restante são limpas (não acumula lixo).
  const removeTemplate = (templateId: string) => {
    const nextIds = selectedTemplateIds.filter((id) => id !== templateId);
    onChangeTemplates(nextIds);
    const remainingQuestionIds = new Set<string>();
    for (const id of nextIds) {
      const t = templates.find((x) => x.id === id);
      for (const q of t?.questions ?? []) remainingQuestionIds.add(q.id);
    }
    const prunedExcluded = excluded.filter((id) => remainingQuestionIds.has(id));
    if (prunedExcluded.length !== excluded.length) onChangeExcluded(prunedExcluded);
  };

  return (
    <div className="space-y-2.5">
      {/* Seletor pra ADICIONAR um checklist ao equipamento. */}
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5 text-info" />
          Checklists deste equipamento
        </span>
        <Select
          value={ADD_PLACEHOLDER}
          onValueChange={(v) => {
            if (v !== ADD_PLACEHOLDER) addTemplate(v);
          }}
          disabled={availableTemplates.length === 0}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Adicionar checklist">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Plus className="h-3.5 w-3.5" />
                {availableTemplates.length === 0
                  ? selectedTemplateIds.length > 0
                    ? 'Todos os checklists adicionados'
                    : 'Nenhum checklist disponível'
                  : 'Adicionar checklist'}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availableTemplates.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.name} ({t.questions.length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Accordion single-open: um BLOCO por checklist; abrir um fecha os outros. */}
      {blocks.length > 0 && (
        <div className="divide-y overflow-hidden rounded-lg border bg-background">
          {blocks.map(({ template, questions }) => (
        <ChecklistBlock
          key={template.id}
          template={template}
          questions={questions}
          excludedSet={excludedSet}
          isIncluded={isIncluded}
          open={openTemplateId === template.id}
          onToggleOpen={() =>
            setOpenTemplateId((cur) => (cur === template.id ? null : template.id))
          }
          onToggleQuestion={toggleQuestion}
          onToggleBucket={toggleBucket}
          onRemove={() => removeTemplate(template.id)}
        />
          ))}
        </div>
      )}

      {selectedTemplates.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Nenhum checklist neste equipamento. Adicione um acima.
        </p>
      )}
    </div>
  );
}

// ── Bloco de UM checklist ────────────────────────────────────────────────────
// Renderiza o cabeçalho titulado, a seleção em massa por frequência (só deste
// checklist), as colunas e a lista rolável de perguntas. Contador e buckets são
// derivados APENAS das perguntas deste bloco.
interface ChecklistBlockProps {
  template: ChecklistTemplateOption;
  questions: ChecklistQuestion[];
  excludedSet: Set<string>;
  isIncluded: (q: ChecklistQuestion) => boolean;
  open: boolean;
  onToggleOpen: () => void;
  onToggleQuestion: (q: ChecklistQuestion) => void;
  onToggleBucket: (ids: string[], allIncluded: boolean) => void;
  onRemove: () => void;
}

function ChecklistBlock({
  template,
  questions,
  excludedSet,
  isIncluded,
  open,
  onToggleOpen,
  onToggleQuestion,
  onToggleBucket,
  onRemove,
}: ChecklistBlockProps) {
  // Quantas perguntas deste checklist entram na 1ª OS (toda visita + não excluídas).
  const includedCount = useMemo(
    () => questions.filter(isIncluded).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, excludedSet],
  );

  // Frequências distintas deste checklist (exclui "toda visita", obrigatória).
  const frequencyBuckets = useMemo(() => {
    const map = new Map<string, { label: string; ids: string[] }>();
    for (const q of questions) {
      if (isEveryVisit(q)) continue;
      const label = frequencyLabel(q);
      const bucket = map.get(label) ?? { label, ids: [] };
      bucket.ids.push(q.id);
      map.set(label, bucket);
    }
    return [...map.values()];
  }, [questions]);

  return (
    <div className="bg-background">
      {/* Cabeçalho-trigger do accordion: clicar abre/fecha este bloco (e fecha os
          outros). O botão remover não pode alternar — stopPropagation. */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
      >
        <ListChecks className="h-3.5 w-3.5 shrink-0 text-info" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          Perguntas do Checklist — {template.name}
        </span>
        <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
          {includedCount} de {questions.length} na 1ª OS
        </Badge>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }
          }}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Remover checklist ${template.name}`}
          title="Remover checklist"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
      <div className="border-t px-3 pb-3 pt-2.5">
        {questions.length === 0 ? (
          <p className="px-1.5 py-1 text-[11px] text-muted-foreground">
            Este checklist ainda não tem perguntas.
          </p>
        ) : (
          <>
            {/* Seleção em massa por frequência (só deste checklist). */}
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
                        onClick={() => onToggleBucket(b.ids, allIncluded)}
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

            {/* Lista rolável das perguntas deste checklist. */}
            <div className="max-h-72 space-y-1.5 overflow-y-auto pt-1">
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
                          onCheckedChange={() => onToggleQuestion(q)}
                          aria-label={`Adicionar na primeira OS: ${q.question}`}
                          title="Adicionar na 1ª OS?"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}
