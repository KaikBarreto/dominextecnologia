import { ListChecks, Wrench, Check, X, MinusCircle, HelpCircle, Gauge } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SignedImg } from '@/components/ui/SignedImg';
import { cn } from '@/lib/utils';
import type { ReportChecklistItem } from './ReportChecklist';

/**
 * Versão CLARA (tema slate do relatório branco) do checklist de conformidade
 * PMOC. Renderiza DENTRO do card branco do OSReport como a seção "Checklists da
 * Visita PMOC". Compartilha o shape `ReportChecklistItem` (os dois modos —
 * técnico autenticado e cliente anônimo — já convergem pra ele em TechnicianOS),
 * mas o visual casa com `slate-*` em vez dos tokens de tema (`bg-muted`,
 * `text-foreground`) usados pelo `ReportChecklist` escuro.
 */

interface ReportPmocChecklistGroup {
  equipmentName: string | null;
  items: ReportChecklistItem[];
}

interface Props {
  items: ReportChecklistItem[];
  /** Abre a foto no viewer interno do relatório (NUNCA em nova aba). */
  onPreviewPhoto?: (url: string, images?: string[], index?: number) => void;
  /**
   * Id de âncora (scroll target) por grupo de equipamento. Usado pela sidebar
   * desktop da tela de OS pra rolar até o equipamento. Recebe o equipmentName
   * (ou null pro grupo "Geral"). Só desktop — não afeta o mobile.
   */
  anchorIdForGroup?: (equipmentName: string | null) => string | undefined;
}

const CONFORMITY_META: Record<
  'conforme' | 'nao_conforme' | 'na',
  { label: string; icon: typeof Check; className: string }
> = {
  conforme: { label: 'Conforme', icon: Check, className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  nao_conforme: { label: 'Não-conforme', icon: X, className: 'bg-red-100 text-red-700 border-red-200' },
  na: { label: 'N/A', icon: MinusCircle, className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function ConformityBadge({ status }: { status: ReportChecklistItem['conformity_status'] }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
        <HelpCircle className="h-3 w-3 shrink-0" />
        Não respondido
      </span>
    );
  }
  const meta = CONFORMITY_META[status];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border', meta.className)}>
      <Icon className="h-3 w-3 shrink-0" />
      {meta.label}
    </span>
  );
}

function formatNumber(n: number): string {
  return String(n).replace('.', ',');
}

/** Agrupa por equipment_name preservando sort_order; null (geral) por último. */
function groupItems(items: ReportChecklistItem[]): ReportPmocChecklistGroup[] {
  const sorted = [...items].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return (a.section || '').localeCompare(b.section || '');
  });
  const groups: ReportPmocChecklistGroup[] = [];
  const index = new Map<string, number>();
  for (const item of sorted) {
    const key = item.equipment_name ?? '__geral__';
    let idx = index.get(key);
    if (idx === undefined) {
      idx = groups.length;
      index.set(key, idx);
      groups.push({ equipmentName: item.equipment_name, items: [] });
    }
    groups[idx].items.push(item);
  }
  groups.sort((a, b) => {
    if (a.equipmentName === null && b.equipmentName !== null) return 1;
    if (a.equipmentName !== null && b.equipmentName === null) return -1;
    return 0;
  });
  return groups;
}

/**
 * Seção "Checklists da Visita PMOC" do relatório branco. Agrupa a conformidade
 * por equipamento em acordeões claros. Não renderiza nada quando não há itens.
 */
export function ReportPmocChecklist({ items, onPreviewPhoto, anchorIdForGroup }: Props) {
  if (!items || items.length === 0) return null;

  const groups = groupItems(items);

  return (
    <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5" /> Checklists da Visita PMOC
      </h3>
      <Accordion type="multiple" defaultValue={groups.map((g) => g.equipmentName ?? '__geral__')} className="w-full space-y-2">
        {groups.map((group) => {
          const groupKey = group.equipmentName ?? '__geral__';
          const total = group.items.length;
          const answered = group.items.filter((a) => !!a.conformity_status).length;
          const naoConforme = group.items.filter((a) => a.conformity_status === 'nao_conforme').length;
          const pending = total - answered;
          return (
            <AccordionItem
              key={groupKey}
              value={groupKey}
              id={anchorIdForGroup?.(group.equipmentName)}
              data-pdf-section
              className="border border-slate-200 rounded-lg overflow-hidden scroll-mt-24"
            >
              <AccordionTrigger className="hover:no-underline px-3 sm:px-4 py-3 gap-2 min-w-0 overflow-hidden">
                <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="h-9 w-9 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                    <Wrench className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-800 truncate">
                      {group.equipmentName ?? 'Geral / Local'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {total} item{total > 1 ? 's' : ''}
                    </p>
                  </div>
                  {naoConforme > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">
                      <X className="h-3 w-3" />
                      {naoConforme} não-conforme{naoConforme > 1 ? 's' : ''}
                    </span>
                  ) : pending === 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-600 text-white shrink-0">
                      <Check className="h-3 w-3" /> Concluído
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                      {pending} sem resposta
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 sm:px-4 pb-3">
                <div className="space-y-3 pt-1">
                  {group.items.map((item, idx) => (
                    <div key={item.id} className="space-y-2 p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-slate-400 text-sm leading-5">{idx + 1}.</span>
                        <div className="flex-1 min-w-0">
                          {item.section && (
                            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                              {item.section}
                              {item.component ? ` · ${item.component}` : ''}
                            </p>
                          )}
                          <p className="text-sm font-medium text-slate-700 break-words">{item.description}</p>
                          {item.guidance && (
                            <p className="text-xs text-slate-400 break-words mt-0.5">{item.guidance}</p>
                          )}
                        </div>
                        <ConformityBadge status={item.conformity_status} />
                      </div>

                      {item.is_measurement && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <Gauge className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          {item.measured_value !== null ? (
                            <span className="font-medium text-slate-700">
                              {formatNumber(item.measured_value)}
                              {item.unit ? ` ${item.unit}` : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Sem medição</span>
                          )}
                        </div>
                      )}

                      {item.photos.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {item.photos.map((url, i) => (
                            <SignedImg
                              key={i}
                              src={url}
                              alt="Foto da atividade"
                              className="rounded-md h-20 w-20 object-cover border border-slate-200 cursor-pointer"
                              onClick={() => onPreviewPhoto?.(url, item.photos, i)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
