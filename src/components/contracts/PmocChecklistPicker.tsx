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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { catalogFreqCode, isAcSection, partitionPickerSections, type PmocMachineScope } from '@/components/contracts/pmocMachineRoutine';
import type { PmocCatalogSectionGroup } from '@/hooks/usePmocActivityCatalog';

const FREQ_LABELS: Record<string, string> = {
  M: 'Mensal',
  T: 'Trimestral',
  S: 'Semestral',
  A: 'Anual',
  E: 'Eventual',
};

// Checklist personalizado: um form_templates da empresa. Forma mínima usada pelo
// picker (id + nome + nº de perguntas pro selo).
export interface CustomChecklistOption {
  id: string;
  name: string;
  questionCount?: number;
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
}: PmocChecklistPickerProps) {
  // Filtra os grupos pelo escopo: 'ac' só mostra seções de ar-condicionado.
  const visibleGroups = catalogGroups.filter((g) => (scope === 'ac' ? isAcSection(g.section) : true));

  // Ordena: bloco de ar-condicionado primeiro (Condicionadores → Medições →
  // Testes), depois as demais seções de grande porte.
  const { acSections, otherSections } = partitionPickerSections(visibleGroups.map((g) => g.section));
  const orderedSections = [...acSections, ...otherSections];
  const groupBySection = new Map(visibleGroups.map((g) => [g.section, g] as const));

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

  // Render de uma seção (AccordionItem). Reaproveitado nos dois blocos.
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
          <div className="space-y-1">
            {group.activities.map((act) => {
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
                    {act.component && (
                      <p className="text-xs text-muted-foreground truncate">{act.component}</p>
                    )}
                  </div>
                  <Badge
                    variant={catalogFreqCode(act.default_freq_code) === 'E' ? 'outline' : 'info'}
                    className="shrink-0 text-[10px]"
                  >
                    {freqLabel}
                  </Badge>
                </label>
              );
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
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

          {/* Sub-seções por escopo (single-open): AC → Grande porte. */}
          <Accordion type="single" collapsible defaultValue="ac" className="w-full space-y-2">
            {acSections.length > 0 && (
              <AccordionItem value="ac" className="rounded-md border bg-background px-3">
                <AccordionTrigger className="text-sm font-semibold">
                  Ar-condicionado (Split / ACJ)
                </AccordionTrigger>
                <AccordionContent>
                  <Accordion type="multiple" defaultValue={[acSections[0]]} className="ml-1 w-auto border-l-2 border-muted pl-3">
                    {acSections.map(renderSection)}
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            )}

            {otherSections.length > 0 && (
              <AccordionItem value="gp" className="rounded-md border bg-background px-3">
                <AccordionTrigger className="text-sm font-semibold">
                  Grande porte (torres, bombas, casa de máquinas…)
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
              {customTemplates.map((tpl) => {
                const checked = selectedTemplateIds.has(tpl.id);
                return (
                  <label
                    key={tpl.id}
                    className="flex items-start gap-3 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-border shrink-0"
                      checked={checked}
                      onChange={() => toggleTemplate(tpl.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{tpl.name}</p>
                      {typeof tpl.questionCount === 'number' && (
                        <p className="text-xs text-muted-foreground">
                          {tpl.questionCount} pergunta{tpl.questionCount === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                    <Badge variant="info" className="shrink-0 text-[10px]">Toda visita</Badge>
                  </label>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
