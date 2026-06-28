// Conteúdo do picker de checklists da máquina (catálogo PMOC), compartilhado
// pelo formulário de contrato (ContractFormDialog) e pela aba Ambientes
// (ContractEnvironmentsTab) pra NÃO divergir de UX/lógica.
//
// Item 1 (lote PMOC): as seções são separadas POR ESCOPO da máquina:
//  - escopo 'ac'   → mostra só o bloco de ar-condicionado (Condicionadores
//    Split/ACJ + Medições + Testes), Condicionadores sempre primeiro.
//  - escopo 'full' → mostra TODAS as seções; primeiro o bloco de ar-condicionado,
//    depois as de grande porte (torres, bombas, casa de máquinas, dutos…). Em
//    contrato/máquina novo o escopo 'full' já vem com tudo marcado (o config
//    default carrega toda a norma do escopo).
//
// Cada seção tem "marcar todos" (padrão já existente) e um "marcar todos" global.
import { useMemo, useState } from 'react';
import { Check, ChevronDown, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { catalogFreqCode, isAcSection, partitionPickerSections, type PmocMachineScope } from '@/components/contracts/pmocMachineRoutine';
import { frequencyLabel, isEveryVisit, type QuestionFrequency } from '@/components/contracts/questionFrequency';
import { cn } from '@/lib/utils';
import {
  groupActivitiesByType,
  isEssentialFor,
  type PmocCatalogActivity,
  type PmocCatalogSectionGroup,
} from '@/hooks/usePmocActivityCatalog';

// Copy dos tooltips das duas famílias (sem travessão — vírgula). Reusada também
// pelo Catálogo de Checklists pra não divergir.
export const FAMILY_TOOLTIPS = {
  expansaoDireta:
    'Aparelhos de expansão direta, que resfriam o ambiente sem água gelada: hi-wall, cassete, piso teto, janela, ACJ e splitão DX. É o PMOC do dia a dia.',
  sistemasCentrais:
    'Climatização central de grande porte: VRF, chiller, fan coil, UTA/AHU e self contained, com torres, bombas, válvulas, sensores e água gelada.',
} as const;

// Nota de conformidade exibida perto do selo "Essencial" (sem travessão).
export const ESSENTIAL_COMPLIANCE_NOTE =
  'Conjunto essencial da norma para começar. Você pode adicionar a norma completa quando quiser, conforme o porte e o risco do equipamento.';

const FREQ_LABELS: Record<string, string> = {
  M: 'Mensal',
  T: 'Trimestral',
  S: 'Semestral',
  A: 'Anual',
  E: 'Eventual',
};

// Pergunta de um checklist personalizado (subset de form_questions) usada pra
// expandir o template e gerir o "Adicionar na 1ª OS?" por pergunta.
export interface CustomChecklistQuestion extends QuestionFrequency {
  id: string;
  question: string;
  position?: number | null;
}

// Checklist personalizado: um form_templates da empresa. Forma mínima usada pelo
// picker (id + nome + nº de perguntas pro selo). `questions` (opcional) habilita
// a expansão por pergunta com o checkbox "Adicionar na 1ª OS?".
export interface CustomChecklistOption {
  id: string;
  name: string;
  questionCount?: number;
  questions?: CustomChecklistQuestion[];
}

interface PmocChecklistPickerProps {
  catalogGroups: PmocCatalogSectionGroup[];
  catalogLoading: boolean;
  // Escopo da máquina alvo. Em 'ac' só o bloco de ar-condicionado aparece;
  // em 'full' aparece tudo, AC primeiro. null = sem filtro (mostra tudo).
  scope?: PmocMachineScope | null;
  selection: Set<string>;
  onChange: (next: Set<string>) => void;
  // Checklists personalizados (form_templates ativos, não-pmoc-default) do tenant.
  // A seção "Personalizados" é a 2ª fonte de checklist da máquina e aparece no modo
  // por-máquina (quando há customTemplates ou onChangeTemplates). No modo "geral"
  // ela some e sobra só a fonte "Catálogo PMOC". Default [].
  customTemplates?: CustomChecklistOption[];
  // Seleção dos templates personalizados, gerenciada à parte da do catálogo.
  selectedTemplateIds?: Set<string>;
  onChangeTemplates?: (next: Set<string>) => void;
  // 1ª OS por pergunta dos PERSONALIZADOS desta máquina. `excludedQuestionIds` =
  // ids de perguntas que o gestor TIROU da 1ª OS (checkbox desmarcado). O picker
  // só reporta o toggle; o pai mantém o estado e sanitiza no save. Perguntas
  // "toda visita" nunca entram aqui (checkbox travado marcado). Quando ausente, a
  // expansão por pergunta não aparece (mantém o comportamento antigo só-seleção).
  excludedQuestionIds?: Set<string>;
  onToggleExcludedQuestion?: (questionId: string) => void;
  // Seta um LOTE de perguntas de uma vez na lista de exclusões da 1ª OS.
  // excluded=true → tira todas da 1ª OS; excluded=false → coloca todas de volta.
  // "Toda visita" nunca chega aqui (filtrada antes). Quando ausente, os chips de
  // frequência não aparecem (mantém comportamento antigo).
  onSetExcludedQuestions?: (questionIds: string[], excluded: boolean) => void;
}

export function PmocChecklistPicker({
  catalogGroups,
  catalogLoading,
  scope = null,
  selection,
  onChange,
  customTemplates = [],
  selectedTemplateIds = new Set(),
  onChangeTemplates,
  excludedQuestionIds = new Set(),
  onToggleExcludedQuestion,
  onSetExcludedQuestions,
}: PmocChecklistPickerProps) {
  // Filtra os grupos pelo escopo: 'ac' só mostra seções de ar-condicionado.
  const visibleGroups = catalogGroups.filter((g) => (scope === 'ac' ? isAcSection(g.section) : true));

  // Ordena: bloco de ar-condicionado primeiro (Condicionadores → Medições →
  // Testes), depois as demais seções de grande porte.
  const { acSections, otherSections } = partitionPickerSections(visibleGroups.map((g) => g.section));
  const groupBySection = new Map(visibleGroups.map((g) => [g.section, g] as const));

  // Escopo concreto pra calcular o conjunto essencial. scope null/full ⇒ 'full'
  // (essencial = base + central); só 'ac' restringe ao tier base.
  const essentialScope: PmocMachineScope = scope === 'ac' ? 'ac' : 'full';

  // ── Família "Expansão Direta" (seções AC) — display por activity_group ──────
  // Achatamos as seções AC numa lista só e reagrupamos por TIPO de tarefa
  // (LIMPEZA · INSPEÇÃO · MEDIÇÕES · TESTES), independente da section de origem.
  const acActivities = acSections.flatMap((s) => groupBySection.get(s)?.activities ?? []);
  const acTypeGroups = groupActivitiesByType(acActivities);
  const acIds = acActivities.map((a) => a.id);
  const acEssentialIds = acActivities.filter((a) => isEssentialFor(a, essentialScope)).map((a) => a.id);

  // ── Família "Sistemas Centrais" (demais seções) — display por section ───────
  const otherActivities = otherSections.flatMap((s) => groupBySection.get(s)?.activities ?? []);
  const otherIds = otherActivities.map((a) => a.id);
  const otherEssentialIds = otherActivities.filter((a) => isEssentialFor(a, essentialScope)).map((a) => a.id);

  const allIds = visibleGroups.flatMap((g) => g.activities.map((a) => a.id));
  const allChecked = allIds.length > 0 && allIds.every((id) => selection.has(id));

  const toggleAll = () => onChange(allChecked ? new Set() : new Set(allIds));

  const toggleOne = (id: string) => {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const toggleGroup = (groupIds: string[], groupAllChecked: boolean) => {
    const next = new Set(selection);
    if (groupAllChecked) groupIds.forEach((id) => next.delete(id));
    else groupIds.forEach((id) => next.add(id));
    onChange(next);
  };

  // Selo "Essencial" de uma família: a seleção CORRENTE dentro da família é
  // exatamente o conjunto essencial (some quando o gestor adiciona/remove algo).
  const isEssentialSelection = (familyIds: string[], essentialIds: string[]): boolean => {
    if (essentialIds.length === 0) return false;
    const selectedInFamily = familyIds.filter((id) => selection.has(id));
    if (selectedInFamily.length !== essentialIds.length) return false;
    const essSet = new Set(essentialIds);
    return selectedInFamily.every((id) => essSet.has(id));
  };

  // "Adicionar norma completa" de uma família: marca TODAS as atividades dela.
  const addFullNorm = (familyIds: string[]) => {
    const next = new Set(selection);
    familyIds.forEach((id) => next.add(id));
    onChange(next);
  };
  const familyAllChecked = (familyIds: string[]) =>
    familyIds.length > 0 && familyIds.every((id) => selection.has(id));

  // ---- Personalizados (form_templates) -------------------------------------
  const templateIds = customTemplates.map((t) => t.id);
  const selectedTemplateCount = templateIds.filter((id) => selectedTemplateIds.has(id)).length;
  const allTemplatesChecked = templateIds.length > 0 && templateIds.every((id) => selectedTemplateIds.has(id));

  const toggleTemplate = (id: string) => {
    if (!onChangeTemplates) return;
    const next = new Set(selectedTemplateIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChangeTemplates(next);
  };
  const toggleAllTemplates = () => {
    if (!onChangeTemplates) return;
    onChangeTemplates(allTemplatesChecked ? new Set() : new Set(templateIds));
  };

  // Linha de UMA atividade do catálogo (checkbox + descrição + selo de frequência).
  const renderActivityRow = (act: PmocCatalogActivity) => {
    const checked = selection.has(act.id);
    const freqLabel = FREQ_LABELS[catalogFreqCode(act.default_freq_code)] ?? act.default_freq_code;
    return (
      <label
        key={act.id}
        className="flex items-start gap-3 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <input
          type="checkbox"
          className="mt-0.5 rounded border-border shrink-0"
          checked={checked}
          onChange={() => toggleOne(act.id)}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">{act.description}</p>
        </div>
        <Badge
          variant={catalogFreqCode(act.default_freq_code) === 'E' ? 'outline' : 'info'}
          className="shrink-0 text-[10px]"
        >
          {freqLabel}
        </Badge>
      </label>
    );
  };

  // Render de uma seção (AccordionItem) por SECTION — usado em Sistemas Centrais.
  const renderSection = (section: string) => {
    const group = groupBySection.get(section);
    if (!group) return null;
    const groupIds = group.activities.map((a) => a.id);
    const selectedInGroup = groupIds.filter((id) => selection.has(id)).length;
    const groupAllChecked = groupIds.length > 0 && groupIds.every((id) => selection.has(id));
    return (
      <AccordionItem key={section} value={section}>
        <AccordionTrigger className="text-[13px]">
          <span className="flex flex-1 items-center gap-2 text-left">
            {group.label}
            <Badge variant="outline" className="text-[10px] shrink-0">{group.activities.length}</Badge>
            {selectedInGroup > 0 && (
              <Badge variant="info" className="text-[10px] shrink-0">{selectedInGroup} ✓</Badge>
            )}
            <span
              role="button"
              tabIndex={0}
              className="ml-auto mr-2 shrink-0 rounded-md border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleGroup(groupIds, groupAllChecked); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); toggleGroup(groupIds, groupAllChecked); } }}
            >
              {groupAllChecked ? 'Desmarcar' : 'Marcar todos'}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-1">{group.activities.map(renderActivityRow)}</div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  // Render de um grupo por TIPO de tarefa (AccordionItem) — usado em Expansão
  // Direta (LIMPEZA · INSPEÇÃO · MEDIÇÕES · TESTES). value = `tipo:<group>`.
  const renderTypeGroup = (block: { group: string; label: string; activities: PmocCatalogActivity[] }) => {
    const groupIds = block.activities.map((a) => a.id);
    const selectedInGroup = groupIds.filter((id) => selection.has(id)).length;
    const groupAllChecked = groupIds.length > 0 && groupIds.every((id) => selection.has(id));
    return (
      <AccordionItem key={block.group} value={`tipo:${block.group}`}>
        <AccordionTrigger className="text-[13px]">
          <span className="flex flex-1 items-center gap-2 text-left">
            <span className="font-semibold uppercase tracking-wide">{block.label}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">{block.activities.length}</Badge>
            {selectedInGroup > 0 && (
              <Badge variant="info" className="text-[10px] shrink-0">{selectedInGroup} ✓</Badge>
            )}
            <span
              role="button"
              tabIndex={0}
              className="ml-auto mr-2 shrink-0 rounded-md border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleGroup(groupIds, groupAllChecked); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); toggleGroup(groupIds, groupAllChecked); } }}
            >
              {groupAllChecked ? 'Desmarcar' : 'Marcar todos'}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-1">{block.activities.map(renderActivityRow)}</div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  // Cabeçalho de família com o "?" (HelpCircle + Tooltip), selo "Essencial"
  // quando a seleção da família = conjunto essencial, e o atalho "Adicionar norma
  // completa". stopPropagation/preventDefault no "?" e no botão pra não togglar o
  // accordion da família.
  const renderFamilyHeader = (
    title: string,
    tip: string,
    familyIds: string[],
    essentialIds: string[],
  ) => {
    const essentialNow = isEssentialSelection(familyIds, essentialIds);
    const allOn = familyAllChecked(familyIds);
    return (
      <span className="flex flex-1 flex-wrap items-center gap-2 text-left">
        <span className="text-sm font-semibold">{title}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* role=button (não <button>) pra não aninhar botão dentro do
                AccordionTrigger; stopPropagation evita togglar a família. */}
            <span
              role="button"
              tabIndex={0}
              className="inline-flex shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={`Sobre ${title}`}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); } }}
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{tip}</TooltipContent>
        </Tooltip>
        {essentialNow && (
          <Badge className="shrink-0 bg-emerald-600 text-white border-transparent text-[10px]">Essencial</Badge>
        )}
        {!allOn && (
          <span
            role="button"
            tabIndex={0}
            className="ml-auto mr-2 shrink-0 rounded-md border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); addFullNorm(familyIds); }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); addFullNorm(familyIds); } }}
          >
            Adicionar norma completa
          </span>
        )}
      </span>
    );
  };

  // Conta selecionados do catálogo PMOC (AC + Grande porte juntos) pro selo da seção.
  const selectedCatalogCount = allIds.filter((id) => selection.has(id)).length;

  // A seção "Personalizados" é a 2ª fonte de checklist da máquina. Só faz sentido
  // no modo por-máquina (quando há customTemplates); no modo "geral" ela some e
  // sobra só o "Catálogo PMOC" — então nem montamos o agrupamento por fonte.
  const showCustomSection = customTemplates.length > 0 || !!onChangeTemplates;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Atividades de manutenção conforme a norma (Lei 13.589/2018). Marque as que se aplicam a esta máquina.
        A frequência vem da norma como ponto de partida.
      </p>

      {allIds.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">Selecionar todas as seções da norma</span>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={toggleAll}>
            {allChecked ? 'Desmarcar todos' : 'Marcar todos'}
          </Button>
        </div>
      )}

      {allIds.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center">
          {catalogLoading ? 'Carregando catálogo da norma…' : 'Nenhuma atividade da norma para este escopo.'}
        </p>
      )}

      {/* DUAS fontes de checklist desta máquina, cada uma num container destacado:
          1) "Catálogo PMOC" — agrupa AC (Split/ACJ) + Grande porte por dentro.
          2) "Personalizados" — checklists próprios da empresa (só no modo máquina).
          Cada fonte tem cabeçalho forte + selo de total/selecionados. */}

      {/* ── Fonte 1: Catálogo PMOC ────────────────────────────────────────── */}
      {allIds.length > 0 && (
        <section className="rounded-lg border-2 border-info/40 bg-info/5 p-2.5 space-y-2">
          <header className="flex items-center gap-2 px-1">
            <h3 className="text-sm font-bold text-foreground">Catálogo PMOC</h3>
            <Badge variant="outline" className="text-[10px] shrink-0">{allIds.length}</Badge>
            {selectedCatalogCount > 0 && (
              <Badge variant="info" className="text-[10px] shrink-0">{selectedCatalogCount} ✓</Badge>
            )}
          </header>

          {/* Nota de conformidade: o default vem enxuto (essencial), a norma
              completa fica a um clique por família. */}
          <p className="px-1 text-[11px] leading-snug text-muted-foreground">{ESSENTIAL_COMPLIANCE_NOTE}</p>

          {/* Famílias (single-open): Expansão Direta → Sistemas Centrais.
              - Expansão Direta agrupa por TIPO de tarefa (Limpeza/Inspeção/
                Medições/Testes).
              - Sistemas Centrais agrupa por section (infra/central têm
                activity_group NULL). */}
          <Accordion type="single" collapsible defaultValue="ac" className="w-full space-y-2">
            {acTypeGroups.length > 0 && (
              <AccordionItem value="ac" className="rounded-md border bg-background px-3">
                <AccordionTrigger className="text-sm font-semibold">
                  {renderFamilyHeader('Expansão Direta', FAMILY_TOOLTIPS.expansaoDireta, acIds, acEssentialIds)}
                </AccordionTrigger>
                <AccordionContent>
                  <Accordion type="multiple" defaultValue={acTypeGroups.map((b) => `tipo:${b.group}`)} className="ml-1 w-auto border-l-2 border-muted pl-3">
                    {acTypeGroups.map(renderTypeGroup)}
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            )}

            {otherSections.length > 0 && (
              <AccordionItem value="gp" className="rounded-md border bg-background px-3">
                <AccordionTrigger className="text-sm font-semibold">
                  {renderFamilyHeader('Sistemas Centrais', FAMILY_TOOLTIPS.sistemasCentrais, otherIds, otherEssentialIds)}
                </AccordionTrigger>
                <AccordionContent>
                  <Accordion type="multiple" className="ml-1 w-auto border-l-2 border-muted pl-3">
                    {otherSections.map(renderSection)}
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </section>
      )}

      {/* ── Fonte 2: Personalizados ───────────────────────────────────────────
          Só no modo por-máquina (há customTemplates / onChangeTemplates). No modo
          geral fica oculta pra não sobrar uma fonte só "solta". */}
      {showCustomSection && (
        <section className="rounded-lg border-2 border-border bg-muted/20 p-2.5 space-y-2">
          <header className="flex items-center gap-2 px-1">
            <h3 className="text-sm font-bold text-foreground">Personalizados</h3>
            {customTemplates.length > 0 && (
              <Badge variant="outline" className="text-[10px] shrink-0">{customTemplates.length}</Badge>
            )}
            {selectedTemplateCount > 0 && (
              <Badge variant="info" className="text-[10px] shrink-0">{selectedTemplateCount} ✓</Badge>
            )}
            {customTemplates.length > 0 && onChangeTemplates && (
              <button
                type="button"
                className="ml-auto shrink-0 rounded-md border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                onClick={toggleAllTemplates}
              >
                {allTemplatesChecked ? 'Desmarcar' : 'Marcar todos'}
              </button>
            )}
          </header>

          {customTemplates.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-1">
              Nenhum checklist personalizado. Crie em <span className="font-medium">Checklists</span> e ele aparece aqui
              para anexar a esta máquina.
            </p>
          ) : (
            <div className="space-y-1 rounded-md border bg-background p-1.5">
              {customTemplates.map((tpl) => (
                <CustomTemplateRow
                  key={tpl.id}
                  tpl={tpl}
                  checked={selectedTemplateIds.has(tpl.id)}
                  onToggle={() => toggleTemplate(tpl.id)}
                  excludedQuestionIds={excludedQuestionIds}
                  onToggleExcludedQuestion={onToggleExcludedQuestion}
                  onSetExcludedQuestions={onSetExcludedQuestions}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ── Linha de UM checklist personalizado da máquina ───────────────────────────
// Checkbox de selecionar o template + (quando selecionado e há perguntas) chevron
// que expande a lista de perguntas, cada uma com selo de frequência e o checkbox
// quadrado "Adicionar na 1ª OS?". "Toda visita" entra travado marcado (sempre na
// 1ª OS); as demais default marcado, desmarcar → vai pra lista de exclusões.
// Acima da lista, uma faixa de chips por frequência (quando o pai fornece
// onSetExcludedQuestions) marca/desmarca todas as perguntas de uma frequência de
// uma vez — paridade com o contrato comum.
interface CustomTemplateRowProps {
  tpl: CustomChecklistOption;
  checked: boolean;
  onToggle: () => void;
  excludedQuestionIds: Set<string>;
  onToggleExcludedQuestion?: (questionId: string) => void;
  onSetExcludedQuestions?: (questionIds: string[], excluded: boolean) => void;
}

function CustomTemplateRow({
  tpl,
  checked,
  onToggle,
  excludedQuestionIds,
  onToggleExcludedQuestion,
  onSetExcludedQuestions,
}: CustomTemplateRowProps) {
  const [open, setOpen] = useState(false);
  const questions = [...(tpl.questions ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  // Expansível só quando selecionado, com perguntas E o pai gerencia a 1ª OS.
  const expandable = checked && questions.length > 0 && !!onToggleExcludedQuestion;
  const questionCount = tpl.questionCount ?? questions.length;
  // Quantas perguntas entram na 1ª OS (toda visita + não excluídas).
  const includedCount = questions.filter((q) => isEveryVisit(q) || !excludedQuestionIds.has(q.id)).length;

  // Frequências distintas deste checklist (exclui "toda visita", obrigatória).
  // Cada bucket vira um chip "marcar/desmarcar todas". Espelha CommonChecklistEditor.
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
    <div className="rounded-md bg-background">
      <div className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50 transition-colors">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-border shrink-0 cursor-pointer"
          checked={checked}
          onChange={onToggle}
          aria-label={`Selecionar checklist ${tpl.name}`}
        />
        <button
          type="button"
          className="flex flex-1 min-w-0 items-start gap-2 text-left"
          onClick={() => (expandable ? setOpen((o) => !o) : onToggle())}
          aria-expanded={expandable ? open : undefined}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">{tpl.name}</p>
            <p className="text-xs text-muted-foreground">
              {checked && questions.length > 0
                ? `${includedCount} de ${questionCount} na 1ª OS`
                : `${questionCount} pergunta${questionCount === 1 ? '' : 's'}`}
            </p>
          </div>
          {/* A frequência de um personalizado é POR PERGUNTA — selo informativo. */}
          <Badge variant="outline" className="shrink-0 text-[10px]">Frequência por pergunta</Badge>
          {expandable && (
            <ChevronDown
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          )}
        </button>
      </div>

      {expandable && open && (
        <div className="ml-7 mr-1 mb-1.5 rounded-md border bg-muted/20 px-2 pb-2 pt-1.5">
          {/* Faixa de chips por frequência: marca/desmarca todas de uma vez.
              Só aparece quando o pai fornece o setter de lote e há ≥1 bucket. */}
          {onSetExcludedQuestions && frequencyBuckets.length > 0 && (
            <div className="mb-2.5 rounded-md bg-muted/40 p-2">
              <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
                Marcar/desmarcar todas de uma frequência
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {frequencyBuckets.map((b) => {
                  const allIncluded = b.ids.every((id) => !excludedQuestionIds.has(id));
                  return (
                    <button
                      key={b.label}
                      type="button"
                      onClick={() => onSetExcludedQuestions(b.ids, allIncluded)}
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
          <div className="max-h-72 space-y-1.5 overflow-y-auto pt-1">
            {questions.map((q) => {
              const everyVisit = isEveryVisit(q);
              const included = everyVisit || !excludedQuestionIds.has(q.id);
              return (
                <div key={q.id} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-muted/40">
                  <p className="min-w-0 flex-1 text-xs leading-snug text-foreground">{q.question}</p>
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
                        onCheckedChange={() => onToggleExcludedQuestion?.(q.id)}
                        aria-label={`Adicionar na primeira OS: ${q.question}`}
                        title="Adicionar na 1ª OS?"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
