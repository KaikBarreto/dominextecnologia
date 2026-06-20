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

interface PmocChecklistPickerProps {
  catalogGroups: PmocCatalogSectionGroup[];
  catalogLoading: boolean;
  // Escopo da máquina alvo. Em 'ac' só o bloco de ar-condicionado aparece;
  // em 'full' aparece tudo, AC primeiro. null = sem filtro (mostra tudo).
  scope?: PmocMachineScope | null;
  selection: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function PmocChecklistPicker({
  catalogGroups,
  catalogLoading,
  scope = null,
  selection,
  onChange,
}: PmocChecklistPickerProps) {
  if (catalogGroups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        {catalogLoading ? 'Carregando catálogo...' : 'Nenhuma atividade no catálogo.'}
      </p>
    );
  }

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

  // Render de uma seção (AccordionItem). Reaproveitado nos dois blocos.
  const renderSection = (section: string) => {
    const group = groupBySection.get(section);
    if (!group) return null;
    const groupIds = group.activities.map((a) => a.id);
    const selectedInGroup = groupIds.filter((id) => selection.has(id)).length;
    const groupAllChecked = groupIds.length > 0 && groupIds.every((id) => selection.has(id));
    return (
      <AccordionItem key={section} value={section}>
        <AccordionTrigger className="text-sm">
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

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Atividades de manutenção conforme a norma (Lei 13.589/2018). Marque as que se aplicam a esta máquina.
        A frequência vem da norma como ponto de partida.
      </p>

      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
        <span className="text-xs text-muted-foreground">Selecionar todas as seções</span>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={toggleAll}>
          {allChecked ? 'Desmarcar todos' : 'Marcar todos'}
        </Button>
      </div>

      {/* Blocos de TOPO como chevrons single-open: abrir um fecha os outros.
          Ordem: Ar-condicionado (Split/ACJ) → Grande Porte → (Personalizados, futuro).
          Dentro de cada bloco, as sub-seções seguem como accordion próprio com
          "marcar todos" por categoria. */}
      <Accordion type="single" collapsible defaultValue="ac" className="w-full space-y-2">
        {acSections.length > 0 && (
          <AccordionItem value="ac" className="rounded-md border px-3">
            <AccordionTrigger className="text-sm font-semibold">
              Ar-condicionado (Split / ACJ)
            </AccordionTrigger>
            <AccordionContent>
              <Accordion type="multiple" defaultValue={[acSections[0]]} className="w-full">
                {acSections.map(renderSection)}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        )}

        {otherSections.length > 0 && (
          <AccordionItem value="gp" className="rounded-md border px-3">
            <AccordionTrigger className="text-sm font-semibold">
              Grande porte (torres, bombas, casa de máquinas…)
            </AccordionTrigger>
            <AccordionContent>
              <Accordion type="multiple" className="w-full">
                {otherSections.map(renderSection)}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}
