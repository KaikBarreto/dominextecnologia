import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Search, ChevronDown, ChevronRight, Snowflake,
  ClipboardList, Check, Download, BookOpen, ArrowLeft, HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  groupActivitiesByType,
  type PmocCatalogActivity,
} from '@/hooks/usePmocActivityCatalog';
import { isAcSection } from '@/components/contracts/pmocMachineRoutine';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FAMILY_TOOLTIPS } from '@/components/contracts/PmocChecklistPicker';
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
  /**
   * Modo de operação:
   * - 'import'  → adiciona as perguntas selecionadas ao checklist atual (`templateId`).
   * - 'create'  → pede um nome e cria um checklist NOVO já populado com as perguntas.
   */
  mode?: 'import' | 'create';
  /** Obrigatório no modo 'import'. */
  templateId?: string;
  /** Maior position já existente — novas perguntas entram em sequência depois. */
  existingCount?: number;
  /** Perguntas já no checklist (para evitar duplicar pelo texto). Só faz sentido no modo 'import'. */
  existingQuestions?: string[];
  /** Chamado após criar com sucesso no modo 'create' (ex: navegar pro novo checklist). */
  onCreated?: (templateId: string) => void;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Mapeia o `default_freq_code` do catálogo PMOC ('M'|'T'|'S'|'A'|'E') pros
 * campos de frequência de uma pergunta. M=1, T=3, S=6, A=12 meses; 'E'
 * (eventual) e qualquer código desconhecido ficam como "toda visita" (NULL).
 */
function freqCodeToFields(code: string | null | undefined): Pick<
  CatalogQuestion,
  'freq_kind' | 'freq_months' | 'freq_days' | 'freq_visits' | 'start_kind' | 'start_visit'
> {
  const months: Record<string, number> = { M: 1, T: 3, S: 6, A: 12 };
  const m = code ? months[code] : undefined;
  if (!m) {
    // 'E'/eventual/desconhecido → toda visita (NULL em tudo).
    return { freq_kind: null, freq_months: null, freq_days: null, freq_visits: null, start_kind: null, start_visit: null };
  }
  return { freq_kind: 'time', freq_months: m, freq_days: null, freq_visits: null, start_kind: 'contract_start', start_visit: null };
}

function pmocActivityToQuestion(a: PmocCatalogActivity): CatalogQuestion {
  const freq = freqCodeToFields(a.default_freq_code);
  if (a.is_measurement) {
    return {
      question: a.description,
      question_type: 'number',
      description: a.guidance || undefined,
      unit: a.unit || undefined,
      expected_min: a.expected_min ?? undefined,
      expected_max: a.expected_max ?? undefined,
      is_required: false,
      ...freq,
    };
  }
  return {
    question: a.description,
    question_type: 'conformidade',
    description: a.guidance || undefined,
    is_required: false,
    ...freq,
  };
}

/** Cor do selo de tipo de pergunta — consistente com a régua de status (conformidade saturada). */
function qTypeBadge(type: string): { label: string; className: string } {
  const base = QUESTION_TYPES.find(x => x.value === type)?.label || type;
  switch (type) {
    case 'conformidade':
      return { label: 'Conformidade', className: 'bg-emerald-600 text-white border-transparent' };
    case 'number':
    case 'pmoc_measurement':
      return { label: base, className: 'bg-sky-100 text-sky-700 border-transparent dark:bg-sky-950/40 dark:text-sky-300' };
    case 'photo':
      return { label: base, className: 'bg-violet-100 text-violet-700 border-transparent dark:bg-violet-950/40 dark:text-violet-300' };
    default:
      return { label: base, className: 'bg-muted text-muted-foreground border-transparent' };
  }
}

export function ChecklistCatalogModal({
  open, onOpenChange, mode = 'import', templateId, existingCount = 0,
  existingQuestions = [], onCreated,
}: ChecklistCatalogModalProps) {
  const { toast } = useToast();
  const { settings } = useCompanySettings();
  const segment = settings?.segment ?? null;
  const { createQuestionsBatch, createTemplate } = useFormTemplates();
  const { groups: pmocGroups, isLoading: pmocLoading } = usePmocActivityCatalog();

  const isCreate = mode === 'create';
  const showPmoc = segmentHasPmocCatalog(segment);
  const serviceTemplates = useMemo(() => getCatalogForSegment(segment), [segment]);

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // PMOC: seleção granular por id de atividade
  const [selectedPmoc, setSelectedPmoc] = useState<Record<string, boolean>>({});
  // Modo create: passo de nomear o checklist + perguntas acumuladas.
  const [nameStep, setNameStep] = useState(false);
  const [newName, setNewName] = useState('');
  const [pendingQuestions, setPendingQuestions] = useState<CatalogQuestion[]>([]);
  const [creating, setCreating] = useState(false);

  const existingSet = useMemo(
    () => new Set(existingQuestions.map(norm)),
    [existingQuestions],
  );

  // Default ENXUTO: ao abrir o catálogo, o conjunto ESSENCIAL já vem pré-marcado
  // (não vazio, não a norma inteira). Essencial = qualquer linha com
  // essential_tier (base/central/infra). Itens já no checklist (modo import) não
  // entram (ficam disabled). Só semeia uma vez por abertura, sem sobrescrever a
  // escolha do gestor depois.
  const [seededDefault, setSeededDefault] = useState(false);
  useEffect(() => {
    if (!open) { setSeededDefault(false); return; }
    if (seededDefault || pmocLoading || !showPmoc) return;
    const seed: Record<string, boolean> = {};
    for (const g of pmocGroups) {
      for (const a of g.activities) {
        if (a.essential_tier && !existingSet.has(norm(a.description))) seed[a.id] = true;
      }
    }
    setSelectedPmoc(seed);
    setSeededDefault(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pmocLoading, showPmoc, pmocGroups]);

  const resetState = () => {
    setSearch('');
    setSelectedPmoc({});
    setNameStep(false);
    setNewName('');
    setPendingQuestions([]);
    setCreating(false);
  };

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o);
    if (!o) resetState();
  };

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

  // Famílias do catálogo PMOC, derivadas dos grupos já filtrados pela busca.
  //  - Expansão Direta = seções AC (condicionadores/medições/testes), reagrupadas
  //    por TIPO de tarefa (Limpeza/Inspeção/Medições/Testes via activity_group).
  //  - Sistemas Centrais = demais seções, agrupadas por section (infra/central
  //    têm activity_group NULL).
  const acTypeGroups = useMemo(() => {
    const acActs = filteredPmocGroups
      .filter(g => isAcSection(g.section))
      .flatMap(g => g.activities);
    return groupActivitiesByType(acActs);
  }, [filteredPmocGroups]);

  const acActivitiesFlat = useMemo(
    () => acTypeGroups.flatMap(b => b.activities),
    [acTypeGroups],
  );

  const otherGroups = useMemo(
    () => filteredPmocGroups.filter(g => !isAcSection(g.section)),
    [filteredPmocGroups],
  );
  const otherActivitiesFlat = useMemo(
    () => otherGroups.flatMap(g => g.activities),
    [otherGroups],
  );

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

  // ----- modo IMPORT: insere direto no checklist atual -----
  const buildInserts = (questions: CatalogQuestion[]): { inserts: FormQuestionInsert[]; skipped: number } => {
    const inserts: FormQuestionInsert[] = [];
    let skipped = 0;
    let pos = existingCount;
    for (const cq of questions) {
      if (existingSet.has(norm(cq.question))) { skipped++; continue; }
      inserts.push({
        template_id: templateId!,
        question: cq.question,
        question_type: cq.question_type,
        description: cq.description ?? null,
        is_required: cq.is_required ?? false,
        options: cq.question_type === 'select' ? cq.options : undefined,
        unit: cq.unit ?? null,
        expected_min: cq.expected_min ?? null,
        expected_max: cq.expected_max ?? null,
        position: pos++,
        // Frequência herdada do catálogo (PMOC). Modelos curados ficam NULL.
        freq_kind: cq.freq_kind ?? null,
        freq_months: cq.freq_months ?? null,
        freq_days: cq.freq_days ?? null,
        freq_visits: cq.freq_visits ?? null,
        start_kind: cq.start_kind ?? null,
        start_visit: cq.start_visit ?? null,
      });
    }
    return { inserts, skipped };
  };

  const importToCurrent = (questions: CatalogQuestion[]) => {
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
        handleOpenChange(false);
      },
    });
  };

  // ----- modo CREATE: acumula perguntas e abre passo de nome -----
  const goToNameStep = (questions: CatalogQuestion[], defaultName?: string) => {
    // Dedup por texto dentro da própria seleção.
    const seen = new Set<string>();
    const unique: CatalogQuestion[] = [];
    for (const cq of questions) {
      const k = norm(cq.question);
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(cq);
    }
    if (unique.length === 0) {
      toast({ title: 'Nada selecionado', description: 'Escolha ao menos uma pergunta ou modelo.' });
      return;
    }
    setPendingQuestions(unique);
    // Pré-preenche o nome com o template/seção de origem (editável depois).
    setNewName(defaultName?.trim() || '');
    setNameStep(true);
  };

  const handleCreate = () => {
    if (!newName.trim() || pendingQuestions.length === 0) return;
    setCreating(true);
    createTemplate.mutate({ name: newName.trim() }, {
      onSuccess: (data: any) => {
        const newId = data?.id as string;
        if (!newId) { setCreating(false); return; }
        const inserts: FormQuestionInsert[] = pendingQuestions.map((cq, i) => ({
          template_id: newId,
          question: cq.question,
          question_type: cq.question_type,
          description: cq.description ?? null,
          is_required: cq.is_required ?? false,
          options: cq.question_type === 'select' ? cq.options : undefined,
          unit: cq.unit ?? null,
          expected_min: cq.expected_min ?? null,
          expected_max: cq.expected_max ?? null,
          position: i,
          freq_kind: cq.freq_kind ?? null,
          freq_months: cq.freq_months ?? null,
          freq_days: cq.freq_days ?? null,
          freq_visits: cq.freq_visits ?? null,
          start_kind: cq.start_kind ?? null,
          start_visit: cq.start_visit ?? null,
        }));
        createQuestionsBatch.mutate(inserts, {
          onSuccess: () => {
            setCreating(false);
            handleOpenChange(false);
            onCreated?.(newId);
          },
          onError: () => setCreating(false),
        });
      },
      onError: () => setCreating(false),
    });
  };

  // Dispatchers que bifurcam por modo. `defaultName` só vale no modo create
  // (pré-preenche o nome do novo checklist com o modelo/seção de origem).
  const handleQuestions = (questions: CatalogQuestion[], defaultName?: string) =>
    isCreate ? goToNameStep(questions, defaultName) : importToCurrent(questions);

  const handleTemplate = (tpl: ChecklistTemplate) => handleQuestions(tpl.questions, tpl.nome);

  const handleSelectedPmoc = () => {
    const all = pmocGroups.flatMap(g => g.activities);
    const chosen = all.filter(a => selectedPmoc[a.id]);
    // Se a seleção pertence a uma única seção PMOC, usa o rótulo dela como nome.
    const sectionsOfChosen = new Set(
      pmocGroups
        .filter(g => g.activities.some(a => selectedPmoc[a.id]))
        .map(g => g.label),
    );
    const defaultName = sectionsOfChosen.size === 1 ? [...sectionsOfChosen][0] : undefined;
    handleQuestions(chosen.map(pmocActivityToQuestion), defaultName);
  };

  const handlePmocSection = (acts: PmocCatalogActivity[], label?: string) =>
    handleQuestions(acts.map(pmocActivityToQuestion), label);

  const busy = createQuestionsBatch.isPending || createTemplate.isPending || creating;

  // Linha de UMA atividade PMOC (checkbox + descrição + selo de tipo).
  const renderPmocActivity = (a: PmocCatalogActivity) => {
    const already = !isCreate && existingSet.has(norm(a.description));
    const tb = qTypeBadge(a.is_measurement ? 'number' : 'conformidade');
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
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <Badge className={cn('text-[10px] font-medium', tb.className)}>
              {a.is_measurement ? `Número${a.unit ? ` (${a.unit})` : ''}` : 'Conformidade'}
            </Badge>
            {already && <span className="text-[10px] text-muted-foreground">já no checklist</span>}
          </div>
        </div>
      </label>
    );
  };

  // Um subgrupo (tipo de tarefa OU section) dentro de uma família: cabeçalho
  // colapsável + "marcar todas" + importar/selecionar o subgrupo inteiro.
  const renderPmocSubGroup = (sub: { key: string; label: string; activities: PmocCatalogActivity[] }) => {
    const isOpen = expanded[sub.key] ?? !!q;
    const allOn = sub.activities.length > 0 && sub.activities.every(a => selectedPmoc[a.id]);
    return (
      <div key={sub.key}>
        <div className={cn('flex items-center gap-2 px-3 py-2', isOpen && 'bg-muted/30')}>
          <button
            type="button"
            className="flex flex-1 items-center gap-2 text-left min-w-0"
            onClick={() => toggleSection(sub.key)}
          >
            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            <span className="text-sm font-medium truncate">{sub.label}</span>
            <Badge variant="secondary" className="text-xs shrink-0">{sub.activities.length}</Badge>
          </button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs shrink-0"
            onClick={() => handlePmocSection(sub.activities, sub.label)}
            disabled={busy}
          >
            {isCreate ? 'Selecionar' : 'Importar'}
          </Button>
        </div>
        {isOpen && (
          <div className="divide-y bg-muted/20">
            <label className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground cursor-pointer hover:bg-muted/40">
              <Checkbox
                checked={allOn}
                onCheckedChange={(c) => togglePmocSection(sub.activities, !!c)}
              />
              {allOn ? 'Desmarcar todas' : 'Marcar todas'}
            </label>
            {sub.activities.map(renderPmocActivity)}
          </div>
        )}
      </div>
    );
  };

  // Uma família (Expansão Direta / Sistemas Centrais): cabeçalho forte com "?",
  // selo de selecionados, "Importar/Selecionar a família" + subgrupos por dentro.
  const renderPmocFamily = (fam: {
    familyKey: string;
    title: string;
    tip: string;
    familyActivities: PmocCatalogActivity[];
    subgroups: { key: string; label: string; activities: PmocCatalogActivity[] }[];
  }) => {
    const selectedInFamily = fam.familyActivities.filter(a => selectedPmoc[a.id]).length;
    return (
      <div key={fam.familyKey} className="rounded-lg border bg-card overflow-hidden">
        <header className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
          <h4 className="text-sm font-semibold">{fam.title}</h4>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={`Sobre ${fam.title}`}>
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{fam.tip}</TooltipContent>
          </Tooltip>
          <Badge variant="secondary" className="text-xs shrink-0">{fam.familyActivities.length}</Badge>
          {selectedInFamily > 0 && (
            <Badge className="bg-emerald-600 text-white border-transparent text-[10px] shrink-0">{selectedInFamily} ✓</Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 text-xs shrink-0"
            onClick={() => handlePmocSection(fam.familyActivities, fam.title)}
            disabled={busy}
          >
            {isCreate ? 'Selecionar tudo' : 'Importar tudo'}
          </Button>
        </header>
        <div className="divide-y">{fam.subgroups.map(renderPmocSubGroup)}</div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // PASSO DE NOME (só no modo create)
  // -------------------------------------------------------------------------
  if (isCreate && nameStep) {
    return (
      <ResponsiveModal
        open={open}
        onOpenChange={handleOpenChange}
        title="Nome do novo checklist"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNameStep(false)} disabled={busy}>
              Voltar
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreate}
              disabled={!newName.trim() || busy}
            >
              Criar checklist
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setNameStep(false)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao catálogo
          </button>

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm">
              <span className="font-semibold">{pendingQuestions.length}</span> pergunta
              {pendingQuestions.length > 1 ? 's' : ''} selecionada{pendingQuestions.length > 1 ? 's' : ''} para o novo checklist.
            </p>
          </div>

          <div>
            <Label>Nome do checklist</Label>
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Checklist PMOC mensal"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
              className="mt-1"
            />
          </div>
        </div>
      </ResponsiveModal>
    );
  }

  // -------------------------------------------------------------------------
  // CATÁLOGO
  // -------------------------------------------------------------------------
  const primaryActionLabel = isCreate ? 'Selecionar' : 'Importar';

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Catálogo de Checklists"
    >
      <div className="space-y-4">
        {/* Cabeçalho contextual */}
        <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">
              {isCreate ? 'Criar checklist a partir de modelos' : 'Adicionar perguntas de modelos'}
            </p>
            <p className="text-xs text-muted-foreground leading-snug mt-0.5">
              {isCreate
                ? 'Escolha modelos ou atividades; depois você dá um nome e o checklist é criado já preenchido.'
                : 'As perguntas escolhidas entram no checklist atual.'}
            </p>
          </div>
        </div>

        {/* Aviso */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/50 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-snug">
            Estes são apenas <strong>modelos sugeridos</strong>. Cada empresa deve
            adequá-los aos seus próprios processos. As perguntas ficam
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

        {/* Templates de serviço curados — vêm PRIMEIRO */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-foreground/70">
            <ClipboardList className="h-4 w-4 text-primary shrink-0" />
            Modelos de checklist
          </h3>
          {filteredServiceTemplates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center rounded-lg border border-dashed">
              Nenhum modelo encontrado.
            </p>
          ) : (
            <div className="rounded-lg border bg-card divide-y overflow-hidden">
              {filteredServiceTemplates.map((tpl) => {
                const key = `tpl:${tpl.id}`;
                const isOpen = expanded[key] ?? false;
                return (
                  <div key={tpl.id}>
                    <div className={cn('flex items-start gap-2 px-3 py-2', isOpen && 'bg-muted/30')}>
                      <button
                        type="button"
                        className="flex flex-1 items-start gap-2 text-left min-w-0"
                        onClick={() => toggleSection(key)}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{tpl.nome}</span>
                            <Badge variant="secondary" className="text-xs shrink-0">{tpl.questions.length}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-snug">{tpl.descricao}</p>
                        </div>
                      </button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                        onClick={() => handleTemplate(tpl)}
                        disabled={busy}
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        {primaryActionLabel}
                      </Button>
                    </div>
                    {isOpen && (
                      <div className="divide-y bg-muted/20">
                        {tpl.questions.map((cq, i) => {
                          const already = !isCreate && existingSet.has(norm(cq.question));
                          const tb = qTypeBadge(cq.question_type);
                          return (
                            <div key={i} className={cn('flex items-start gap-2 px-3 py-2 text-sm', already && 'opacity-50')}>
                              <span className="text-xs text-muted-foreground mt-0.5 w-5 shrink-0">{i + 1}.</span>
                              <div className="min-w-0 flex-1">
                                <p className="leading-tight">{cq.question}</p>
                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                  <Badge className={cn('text-[10px] font-medium', tb.className)}>
                                    {tb.label}{cq.unit ? ` (${cq.unit})` : ''}
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
        </section>

        {/* Seção PMOC (só refrigeração) — vem DEPOIS dos modelos */}
        {showPmoc && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-foreground/70">
                <Snowflake className="h-4 w-4 text-cyan-500 shrink-0" />
                Catálogo PMOC
              </h3>
              {selectedPmocCount > 0 && (
                <Button
                  size="sm"
                  className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleSelectedPmoc}
                  disabled={busy}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {primaryActionLabel} {selectedPmocCount}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Atividades da norma. Marque as que quiser ou {isCreate ? 'selecione' : 'importe'} uma seção inteira.
            </p>

            {pmocLoading ? (
              <p className="text-sm text-muted-foreground py-2">Carregando catálogo PMOC...</p>
            ) : acActivitiesFlat.length === 0 && otherActivitiesFlat.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center rounded-lg border border-dashed">
                Nenhuma atividade encontrada.
              </p>
            ) : (
              <div className="space-y-3">
                {/* Família 1: Expansão Direta — agrupada por TIPO de tarefa. */}
                {acActivitiesFlat.length > 0 && renderPmocFamily({
                  familyKey: 'expansao',
                  title: 'Expansão Direta',
                  tip: FAMILY_TOOLTIPS.expansaoDireta,
                  familyActivities: acActivitiesFlat,
                  subgroups: acTypeGroups.map(b => ({ key: `tipo:${b.group}`, label: b.label, activities: b.activities })),
                })}

                {/* Família 2: Sistemas Centrais — agrupada por section. */}
                {otherActivitiesFlat.length > 0 && renderPmocFamily({
                  familyKey: 'centrais',
                  title: 'Sistemas Centrais',
                  tip: FAMILY_TOOLTIPS.sistemasCentrais,
                  familyActivities: otherActivitiesFlat,
                  subgroups: otherGroups.map(g => ({ key: `sec:${g.section}`, label: g.label, activities: g.activities })),
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </ResponsiveModal>
  );
}
