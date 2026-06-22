import { useMemo, useState } from 'react';
import {
  AlertTriangle, Search, ChevronDown, ChevronRight, Snowflake,
  ClipboardList, Check, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  useFormTemplates,
  QUESTION_TYPES,
  type FormQuestionInsert,
} from '@/hooks/useFormTemplates';
import {
  usePmocActivityCatalog,
  type PmocCatalogActivity,
} from '@/hooks/usePmocActivityCatalog';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import {
  getCatalogForSegment,
  segmentHasPmocCatalog,
  type ChecklistTemplate,
  type CatalogQuestion,
} from '@/data/checklistCatalog';

interface ChecklistCatalogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  /** Maior position já existente — novas perguntas entram em sequência depois. */
  existingCount: number;
  /** Perguntas já no checklist (para evitar duplicar pelo texto). */
  existingQuestions: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

function pmocActivityToQuestion(a: PmocCatalogActivity): CatalogQuestion {
  if (a.is_measurement) {
    return {
      question: a.description,
      question_type: 'number',
      description: a.guidance || undefined,
      unit: a.unit || undefined,
      expected_min: a.expected_min ?? undefined,
      expected_max: a.expected_max ?? undefined,
      is_required: false,
    };
  }
  return {
    question: a.description,
    question_type: 'boolean',
    description: a.guidance || undefined,
    is_required: false,
  };
}

export function ChecklistCatalogModal({
  open, onOpenChange, templateId, existingCount, existingQuestions,
}: ChecklistCatalogModalProps) {
  const { toast } = useToast();
  const { settings } = useCompanySettings();
  const segment = settings?.segment ?? null;
  const { createQuestionsBatch } = useFormTemplates();
  const { groups: pmocGroups, isLoading: pmocLoading } = usePmocActivityCatalog();

  const showPmoc = segmentHasPmocCatalog(segment);
  const serviceTemplates = useMemo(() => getCatalogForSegment(segment), [segment]);

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // PMOC: seleção granular por id de atividade
  const [selectedPmoc, setSelectedPmoc] = useState<Record<string, boolean>>({});

  const existingSet = useMemo(
    () => new Set(existingQuestions.map(norm)),
    [existingQuestions],
  );

  const toggleSection = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const q = norm(search);
  const matches = (text: string) => !q || norm(text).includes(q);

  // Filtragem por busca
  const filteredPmocGroups = useMemo(() => {
    if (!q) return pmocGroups;
    return pmocGroups
      .map(g => ({
        ...g,
        activities: g.activities.filter(a => matches(a.description) || matches(g.label)),
      }))
      .filter(g => g.activities.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pmocGroups, q]);

  const filteredServiceTemplates = useMemo(() => {
    if (!q) return serviceTemplates;
    return serviceTemplates.filter(
      t => matches(t.nome) || matches(t.descricao) ||
        t.questions.some(qq => matches(qq.question)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTemplates, q]);

  const selectedPmocCount = Object.values(selectedPmoc).filter(Boolean).length;

  const togglePmoc = (id: string) =>
    setSelectedPmoc(prev => ({ ...prev, [id]: !prev[id] }));

  const togglePmocSection = (acts: PmocCatalogActivity[], on: boolean) => {
    setSelectedPmoc(prev => {
      const next = { ...prev };
      for (const a of acts) next[a.id] = on;
      return next;
    });
  };

  const buildInserts = (questions: CatalogQuestion[]): { inserts: FormQuestionInsert[]; skipped: number } => {
    const inserts: FormQuestionInsert[] = [];
    let skipped = 0;
    let pos = existingCount;
    for (const cq of questions) {
      if (existingSet.has(norm(cq.question))) { skipped++; continue; }
      inserts.push({
        template_id: templateId,
        question: cq.question,
        question_type: cq.question_type,
        description: cq.description ?? null,
        is_required: cq.is_required ?? false,
        options: cq.question_type === 'select' ? cq.options : undefined,
        unit: cq.unit ?? null,
        expected_min: cq.expected_min ?? null,
        expected_max: cq.expected_max ?? null,
        position: pos++,
      });
    }
    return { inserts, skipped };
  };

  const importQuestions = (questions: CatalogQuestion[]) => {
    const { inserts, skipped } = buildInserts(questions);
    if (inserts.length === 0) {
      toast({
        title: 'Nada a importar',
        description: skipped > 0 ? 'Essas perguntas já estão no checklist.' : 'Nenhuma pergunta selecionada.',
      });
      return;
    }
    createQuestionsBatch.mutate(inserts, {
      onSuccess: () => {
        if (skipped > 0) {
          toast({ title: 'Importação concluída', description: `${skipped} pergunta(s) já existiam e foram ignoradas.` });
        }
        setSelectedPmoc({});
        onOpenChange(false);
      },
    });
  };

  const importTemplate = (tpl: ChecklistTemplate) => importQuestions(tpl.questions);

  const importSelectedPmoc = () => {
    const all = pmocGroups.flatMap(g => g.activities);
    const chosen = all.filter(a => selectedPmoc[a.id]).map(pmocActivityToQuestion);
    importQuestions(chosen);
  };

  const importPmocSection = (acts: PmocCatalogActivity[]) =>
    importQuestions(acts.map(pmocActivityToQuestion));

  const qTypeLabel = (t: string) => QUESTION_TYPES.find(x => x.value === t)?.label || t;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) { setSearch(''); setSelectedPmoc({}); } }}
      title="Catálogo de Checklists"
    >
      <div className="space-y-4">
        {/* Aviso */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/50 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-snug">
            Estes são apenas <strong>modelos sugeridos</strong>. Cada empresa deve
            adequá-los aos seus próprios processos. As perguntas importadas ficam
            totalmente editáveis depois.
          </p>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar modelo ou pergunta..."
            className="pl-9"
          />
        </div>

        {/* Seção PMOC (só refrigeração) */}
        {showPmoc && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground/70">
                <Snowflake className="h-4 w-4 text-cyan-500" />
                Checklists do Catálogo PMOC
              </h3>
              {selectedPmocCount > 0 && (
                <Button
                  size="sm"
                  className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={importSelectedPmoc}
                  disabled={createQuestionsBatch.isPending}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Importar {selectedPmocCount}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Atividades da norma. Marque as que quiser ou importe uma seção inteira.
            </p>

            {pmocLoading ? (
              <p className="text-sm text-muted-foreground py-2">Carregando catálogo PMOC...</p>
            ) : filteredPmocGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nenhuma atividade encontrada.</p>
            ) : (
              <div className="space-y-1.5">
                {filteredPmocGroups.map((g) => {
                  const key = `pmoc:${g.section}`;
                  const isOpen = expanded[key] ?? !!q;
                  const allOn = g.activities.every(a => selectedPmoc[a.id]);
                  return (
                    <div key={g.section} className="rounded-lg border bg-card">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button
                          type="button"
                          className="flex flex-1 items-center gap-2 text-left"
                          onClick={() => toggleSection(key)}
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                          <span className="text-sm font-medium">{g.label}</span>
                          <Badge variant="secondary" className="text-xs">{g.activities.length}</Badge>
                        </button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => importPmocSection(g.activities)}
                          disabled={createQuestionsBatch.isPending}
                        >
                          Importar seção
                        </Button>
                      </div>
                      {isOpen && (
                        <div className="border-t divide-y">
                          <label className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground cursor-pointer hover:bg-muted/40">
                            <Checkbox
                              checked={allOn}
                              onCheckedChange={(c) => togglePmocSection(g.activities, !!c)}
                            />
                            {allOn ? 'Desmarcar todas' : 'Marcar todas desta seção'}
                          </label>
                          {g.activities.map((a) => {
                            const already = existingSet.has(norm(a.description));
                            return (
                              <label
                                key={a.id}
                                className={cn(
                                  'flex items-start gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40',
                                  already && 'opacity-50',
                                )}
                              >
                                <Checkbox
                                  className="mt-0.5"
                                  checked={!!selectedPmoc[a.id]}
                                  onCheckedChange={() => togglePmoc(a.id)}
                                  disabled={already}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="leading-tight">{a.description}</p>
                                  <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                    <Badge variant="outline" className="text-[10px]">
                                      {a.is_measurement ? `Número${a.unit ? ` (${a.unit})` : ''}` : 'Conformidade'}
                                    </Badge>
                                    {already && <span className="text-[10px] text-muted-foreground">já no checklist</span>}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Templates de serviço curados */}
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground/70">
            <ClipboardList className="h-4 w-4 text-primary" />
            Modelos de checklist
          </h3>
          {filteredServiceTemplates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nenhum modelo encontrado.</p>
          ) : (
            <div className="space-y-1.5">
              {filteredServiceTemplates.map((tpl) => {
                const key = `tpl:${tpl.id}`;
                const isOpen = expanded[key] ?? false;
                return (
                  <div key={tpl.id} className="rounded-lg border bg-card">
                    <div className="flex items-start gap-2 px-3 py-2">
                      <button
                        type="button"
                        className="flex flex-1 items-start gap-2 text-left min-w-0"
                        onClick={() => toggleSection(key)}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{tpl.nome}</span>
                            <Badge variant="secondary" className="text-xs">{tpl.questions.length}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-snug">{tpl.descricao}</p>
                        </div>
                      </button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                        onClick={() => importTemplate(tpl)}
                        disabled={createQuestionsBatch.isPending}
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        Importar
                      </Button>
                    </div>
                    {isOpen && (
                      <div className="border-t divide-y">
                        {tpl.questions.map((cq, i) => {
                          const already = existingSet.has(norm(cq.question));
                          return (
                            <div key={i} className={cn('flex items-start gap-2 px-3 py-2 text-sm', already && 'opacity-50')}>
                              <span className="text-xs text-muted-foreground mt-0.5 w-5 shrink-0">{i + 1}.</span>
                              <div className="min-w-0 flex-1">
                                <p className="leading-tight">{cq.question}</p>
                                <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  <Badge variant="outline" className="text-[10px]">
                                    {qTypeLabel(cq.question_type)}{cq.unit ? ` (${cq.unit})` : ''}
                                  </Badge>
                                  {cq.is_required && <Badge variant="destructive" className="text-[10px]">Obrigatória</Badge>}
                                  {already && <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5"><Check className="h-3 w-3" />já no checklist</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
