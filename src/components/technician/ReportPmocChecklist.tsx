import { ListChecks, Wrench, Check, X, MinusCircle, HelpCircle, Gauge, CalendarClock, CheckCircle2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SignedImg } from '@/components/ui/SignedImg';
import { cn } from '@/lib/utils';
import { visitTypeFromFreqs } from '@/hooks/useOsActivityChecklist';
import type { ReportChecklistItem } from './ReportChecklist';

/** Chave estável do grupo no accordion (espelha a sidebar desktop). */
export function groupKeyForName(equipmentName: string | null): string {
  return equipmentName ?? '__geral__';
}

/**
 * Chaves dos grupos PMOC na MESMA ORDEM em que o `ReportPmocChecklist` os
 * renderiza (passa pelo `groupItems`, que ordena por `sort_order` e empurra o
 * grupo "Geral" pro fim). O OSReport usa isto pra que `pmocGroupKeys[0]` seja
 * idêntico ao `value` do PRIMEIRO `AccordionItem` renderizado — senão o
 * single-open (`value={[openReportKey]}`) não casa com nenhum item e nada abre.
 */
export function pmocGroupKeysFor(items: ReportChecklistItem[]): string[] {
  return groupItems(items).map((g) => groupKeyForName(g.equipmentName));
}

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
  /**
   * Foto do equipamento (path no bucket) por nome de equipamento. Renderizada
   * (clicável → onPreviewPhoto) no header do grupo no lugar do ícone de chave
   * inglesa. Sem foto → fallback pro ícone Wrench.
   */
  photoUrlForGroup?: (equipmentName: string | null) => string | null | undefined;
  /**
   * Accordion controlado (sidebar desktop): chaves abertas + callback de
   * mudança. Quando AMBOS vêm, o accordion vira controlado (a sidebar pode abrir
   * o equipamento ao navegar). Senão mantém o comportamento não-controlado (tudo
   * aberto via defaultValue) pra retrocompat e pra impressão.
   */
  openKeys?: string[];
  onOpenChange?: (keys: string[]) => void;
  /**
   * Offset (px) do header fixo da tela de OS. Quando definido, o cabeçalho de
   * cada equipamento vira `sticky` e gruda logo abaixo do header laranja "OS
   * #..." ao rolar (espelha o `VisitChecklistPanel` da execução). O sticky vai
   * no WRAPPER (Header) do `AccordionTrigger`; o item perde o `overflow-hidden`
   * (que clipa sticky) quando este offset existe. Sem valor = sem sticky.
   */
  stickyTopPx?: number;
}

const CONFORMITY_META: Record<
  'conforme' | 'nao_conforme' | 'na',
  { label: string; icon: typeof Check; className: string }
> = {
  conforme: { label: 'Conforme', icon: Check, className: 'bg-emerald-600 text-white' },
  nao_conforme: { label: 'Não-conforme', icon: X, className: 'bg-red-600 text-white' },
  na: { label: 'N/A', icon: MinusCircle, className: 'bg-slate-500 text-white' },
};

function ConformityBadge({ status }: { status: ReportChecklistItem['conformity_status'] }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-500 text-white">
        <HelpCircle className="h-3 w-3 shrink-0" />
        Não respondido
      </span>
    );
  }
  const meta = CONFORMITY_META[status];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full', meta.className)}>
      <Icon className="h-3 w-3 shrink-0" />
      {meta.label}
    </span>
  );
}

function formatNumber(n: number): string {
  return String(n).replace('.', ',');
}

/** Agrupa por equipment_name preservando sort_order; null (geral) por último. */
export function groupItems(items: ReportChecklistItem[]): ReportPmocChecklistGroup[] {
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
export function ReportPmocChecklist({
  items,
  onPreviewPhoto,
  anchorIdForGroup,
  photoUrlForGroup,
  openKeys,
  onOpenChange,
  stickyTopPx,
}: Props) {
  if (!items || items.length === 0) return null;

  const groups = groupItems(items);
  const allKeys = groups.map((g) => groupKeyForName(g.equipmentName));
  // Controlado só quando a página passa openKeys + onOpenChange (sidebar
  // desktop). Senão segue não-controlado com tudo aberto (defaultValue).
  const controlled = openKeys !== undefined && onOpenChange !== undefined;

  return (
    <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5" /> Checklists da Visita PMOC
      </h3>
      <Accordion
        type="multiple"
        {...(controlled
          ? { value: openKeys, onValueChange: onOpenChange }
          : { defaultValue: allKeys })}
        className="w-full"
      >
        {groups.map((group) => {
          const groupKey = groupKeyForName(group.equipmentName);
          const photoUrl = photoUrlForGroup?.(group.equipmentName) || null;
          const total = group.items.length;
          const answered = group.items.filter((a) => !!a.conformity_status).length;
          const naoConforme = group.items.filter((a) => a.conformity_status === 'nao_conforme').length;
          const pending = total - answered;
          // Tipo de visita + checklists exibidos. Só renderiza quando há alguma
          // freq_code (modo cliente anônimo ainda não recebe esse campo).
          const hasFreq = group.items.some((a) => !!a.freq_code);
          const visit = hasFreq ? visitTypeFromFreqs(group.items.map((a) => a.freq_code)) : null;
          return (
            <AccordionItem
              key={groupKey}
              value={groupKey}
              id={anchorIdForGroup?.(group.equipmentName)}
              data-pdf-section
              className={cn(
                // Sem caixa por equipamento: lista limpa separada por um divisor
                // leve (some no último). Visual de lista, não de cards.
                'border-b border-slate-200 last:border-0 scroll-mt-24',
                // `overflow-hidden` clipa o cabeçalho sticky; só mantém quando
                // não há sticky (PDF/impressão e modo sem offset).
                stickyTopPx === undefined && 'overflow-hidden',
              )}
            >
              <AccordionTrigger
                // Relatório é documento SEMPRE claro (reportRef é bg-white): fundo
                // branco fixo + texto slate, nunca tokens de tema (bg-card/text-
                // foreground viram escuros no dark mode). `text-slate-900` garante
                // o chevron e qualquer texto não estilizado legíveis sobre o branco.
                className="hover:no-underline px-1 py-3 gap-2 min-w-0 overflow-hidden bg-white text-slate-900"
                // Cabeçalho do equipamento fixo no topo enquanto rola o conteúdo
                // aberto (logo abaixo do header laranja "OS #..."). Sticky no
                // WRAPPER (Header), fundo branco sólido pra o conteúdo não passar
                // atrás, z abaixo do header da tela.
                headerClassName={cn(stickyTopPx !== undefined && 'sticky z-10 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] print:static print:shadow-none')}
                headerStyle={stickyTopPx !== undefined ? { top: stickyTopPx } : undefined}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  {photoUrl ? (
                    <SignedImg
                      src={photoUrl}
                      alt={group.equipmentName ?? 'Equipamento'}
                      className="h-14 w-14 rounded-md object-cover border border-slate-200 shrink-0 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreviewPhoto?.(photoUrl);
                      }}
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                      <Wrench className="h-6 w-6 text-slate-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base text-slate-800 truncate">
                      {group.equipmentName ?? 'Geral / Local'}
                    </p>
                    {visit && (
                      <p className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5 min-w-0">
                        <CalendarClock className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate normal-case">
                          <span className="font-medium text-slate-700">Visita {visit.tipo}</span>
                          {' · '}
                          {visit.niveis.join(' + ')}
                        </span>
                      </p>
                    )}
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
                    <span title="Concluído" aria-label="Concluído" className="shrink-0">
                      <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                      {pending} sem resposta
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-1 pb-3">
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
