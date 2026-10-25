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
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
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
import { useIsCompact } from '@/hooks/use-mobile';
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

/** Uma linha da coluna da esquerda: um modelo curado OU uma seção do PMOC. */
interface ItemDoCatalogo {
  id: string;
  grupo: string;
  titulo: string;
  descricao: string;
  total: number;
  template?: ChecklistTemplate;
  atividades?: PmocCatalogActivity[];
}

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
  const isCompact = useIsCompact();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.checklistCatalog;
  const { toast } = useToast();
  const { settings } = useCompanySettings();
  const segment = settings?.segment ?? null;
  const { createQuestionsBatch, createTemplate } = useFormTemplates();
  const { groups: pmocGroups, isLoading: pmocLoading } = usePmocActivityCatalog();

  const isCreate = mode === 'create';
  const showPmoc = segmentHasPmocCatalog(segment);
  const serviceTemplates = useMemo(() => getCatalogForSegment(segment), [segment]);

  const [search, setSearch] = useState('');
  // Fonte aberta na direita (modelo curado ou seção do PMOC).
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
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
    setSelecionadoId(null);
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
        title: t.toastNothingToImport,
        description: skipped > 0 ? t.toastAlreadyExists : t.toastNoneSelected,
      });
      return;
    }
    createQuestionsBatch.mutate(inserts, {
      onSuccess: () => {
        if (skipped > 0) {
          toast({ title: t.toastImportDone, description: t.toastImportSkipped.replace('{n}', String(skipped)) });
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
      toast({ title: t.toastNothingSelected, description: t.toastSelectAtLeast });
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

  // ---------------------------------------------------------------------------
  // LISTA + DETALHES
  //
  // Antes o catálogo era uma pilha de acordeões: modelos curados, família
  // "Expansão Direta", família "Sistemas Centrais", cada uma com subgrupos
  // colapsáveis por dentro — três níveis de "abre e fecha" num modal. Agora é a
  // mesma régua das telas de cliente/equipamento: a ESQUERDA lista as fontes
  // (um modelo curado ou uma seção do PMOC por linha) e a DIREITA mostra as
  // perguntas daquela fonte, com o botão de importar/selecionar no topo.
  // ---------------------------------------------------------------------------
  const itensDoCatalogo = useMemo(() => {
    const lista: ItemDoCatalogo[] = filteredServiceTemplates.map((tpl) => ({
      id: `tpl:${tpl.id}`,
      grupo: t.sectionTemplates,
      titulo: tpl.nome,
      descricao: tpl.descricao,
      total: tpl.questions.length,
      template: tpl,
    }));
    if (showPmoc) {
      for (const b of acTypeGroups) {
        lista.push({
          id: `ac:${b.group}`,
          grupo: 'Expansão Direta',
          titulo: b.label,
          descricao: FAMILY_TOOLTIPS.expansaoDireta,
          total: b.activities.length,
          atividades: b.activities,
        });
      }
      for (const g of otherGroups) {
        lista.push({
          id: `sec:${g.section}`,
          grupo: 'Sistemas Centrais',
          titulo: g.label,
          descricao: FAMILY_TOOLTIPS.sistemasCentrais,
          total: g.activities.length,
          atividades: g.activities,
        });
      }
    }
    return lista;
  }, [filteredServiceTemplates, acTypeGroups, otherGroups, showPmoc, t.sectionTemplates]);

  // Ordem de exibição: cada grupo vira um subtítulo na coluna da esquerda.
  const gruposDaLista = useMemo(() => {
    const mapa = new Map<string, ItemDoCatalogo[]>();
    for (const item of itensDoCatalogo) {
      const atual = mapa.get(item.grupo);
      if (atual) atual.push(item);
      else mapa.set(item.grupo, [item]);
    }
    return [...mapa.entries()];
  }, [itensDoCatalogo]);

  // No desktop sempre há um item aberto (o primeiro, se o gestor não escolheu
  // nenhum). No celular a lista vem primeiro e o detalhe só aparece no toque.
  const itemEscolhido = itensDoCatalogo.find((i) => i.id === selecionadoId) ?? null;
  const itemAberto = itemEscolhido ?? (isCompact ? null : itensDoCatalogo[0] ?? null);

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
              {a.is_measurement ? `${t.badgeNumber}${a.unit ? ` (${a.unit})` : ''}` : t.badgeConformidade}
            </Badge>
            {already && <span className="text-[10px] text-muted-foreground">{t.alreadyInChecklist}</span>}
          </div>
        </div>
      </label>
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
        title={t.modalTitleNameStep}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNameStep(false)} disabled={busy}>
              {t.btnBack}
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreate}
              disabled={!newName.trim() || busy}
            >
              {t.btnCreate}
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
            {t.btnBackToCatalog}
          </button>

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm">
              {pendingQuestions.length > 1
                ? t.nameStepSummaryPlural.replace('{n}', String(pendingQuestions.length))
                : t.nameStepSummary.replace('{n}', String(pendingQuestions.length))}
            </p>
          </div>

          <div>
            <Label>{t.labelChecklistName}</Label>
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.placeholderChecklistName}
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
  const primaryActionLabel = isCreate ? t.btnSelect : t.btnImport;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title={t.modalTitle}
      description={isCreate ? t.headerCreateSub : t.headerImportSub}
      className="sm:max-w-5xl"
      footer={
        selectedPmocCount > 0 ? (
          <div className="flex items-center justify-end">
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
              onClick={handleSelectedPmoc}
              disabled={busy}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {primaryActionLabel} {selectedPmocCount}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {/* Aviso: uma linha, não um bloco — o conteúdo é a lista, não o alerta. */}
        <p className="flex items-start gap-2 text-xs leading-snug text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>{t.warningTitle}</strong> {t.warningBody}
          </span>
        </p>

        <div className="lg:grid lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] lg:gap-0">
          {/* ----------------------------- LISTA ----------------------------- */}
          <aside
            className={cn(
              'flex flex-col gap-3 lg:border-r lg:border-border lg:pr-4',
              isCompact && itemAberto && 'hidden',
            )}
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="pl-9"
              />
            </div>

            {pmocLoading && showPmoc && (
              <p className="px-1 text-xs text-muted-foreground">{t.loadingPmoc}</p>
            )}

            {itensDoCatalogo.length === 0 ? (
              <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                {t.emptyTemplates}
              </p>
            ) : (
              <div className="space-y-4 lg:max-h-[55vh] lg:overflow-y-auto lg:pr-1">
                {gruposDaLista.map(([grupo, itensDoGrupo]) => (
                  <div key={grupo} className="space-y-0.5">
                    <h3 className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {grupo}
                    </h3>
                    {itensDoGrupo.map((item) => {
                      const marcadas = item.atividades
                        ? item.atividades.filter((a) => selectedPmoc[a.id]).length
                        : 0;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelecionadoId(item.id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors',
                            item.id === itemAberto?.id ? 'bg-muted' : 'hover:bg-muted/50',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.titulo}</span>
                          {marcadas > 0 && (
                            <Badge className="shrink-0 border-transparent bg-emerald-600 text-[10px] text-white">
                              {marcadas} ✓
                            </Badge>
                          )}
                          <Badge variant="secondary" className="shrink-0 text-xs">{item.total}</Badge>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </aside>

          {/* ---------------------------- DETALHE ---------------------------- */}
          <section className={cn('min-w-0 lg:pl-5', isCompact && !itemAberto && 'hidden')}>
            {!itemAberto ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t.detailEmpty}</p>
            ) : (
              <div className="space-y-3">
                {isCompact && (
                  <button
                    type="button"
                    onClick={() => setSelecionadoId(null)}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t.btnBackToCatalog}
                  </button>
                )}

                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {itemAberto.template ? (
                        <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <Snowflake className="h-4 w-4 shrink-0 text-cyan-500" />
                      )}
                      <h3 className="truncate text-base font-semibold">{itemAberto.titulo}</h3>
                      <Badge variant="secondary" className="shrink-0 text-xs">{itemAberto.total}</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">{itemAberto.descricao}</p>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() =>
                      itemAberto.template
                        ? handleTemplate(itemAberto.template)
                        : handlePmocSection(itemAberto.atividades ?? [], itemAberto.titulo)
                    }
                    disabled={busy}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    {itemAberto.template ? primaryActionLabel : (isCreate ? t.btnSelectAll : t.btnImportAll)}
                  </Button>
                </header>

                {itemAberto.template ? (
                  <div className="divide-y rounded-lg border">
                    {itemAberto.template.questions.map((cq, i) => {
                      const already = !isCreate && existingSet.has(norm(cq.question));
                      const tb = qTypeBadge(cq.question_type);
                      return (
                        <div
                          key={i}
                          className={cn('flex items-start gap-2 px-3 py-2 text-sm', already && 'opacity-50')}
                        >
                          <span className="mt-0.5 w-5 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
                          <div className="min-w-0 flex-1">
                            <p className="leading-tight">{cq.question}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge className={cn('text-[10px] font-medium', tb.className)}>
                                {tb.label}{cq.unit ? ` (${cq.unit})` : ''}
                              </Badge>
                              {cq.is_required && (
                                <Badge variant="destructive" className="text-[10px]">
                                  {MESSAGES[locale].app.os.formTemplates.editLabelRequired}
                                </Badge>
                              )}
                              {already && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                  <Check className="h-3 w-3" />{t.alreadyInChecklist}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="divide-y rounded-lg border">
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40">
                      <Checkbox
                        checked={
                          (itemAberto.atividades?.length ?? 0) > 0 &&
                          (itemAberto.atividades ?? []).every((a) => selectedPmoc[a.id])
                        }
                        onCheckedChange={(c) => togglePmocSection(itemAberto.atividades ?? [], !!c)}
                      />
                      {(itemAberto.atividades ?? []).every((a) => selectedPmoc[a.id])
                        ? t.uncheckAllLabel
                        : t.checkAllLabel}
                    </label>
                    {(itemAberto.atividades ?? []).map(renderPmocActivity)}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </ResponsiveModal>
  );
}
