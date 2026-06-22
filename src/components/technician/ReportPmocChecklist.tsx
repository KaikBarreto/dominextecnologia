import type { ReactNode } from 'react';
import { ListChecks, Wrench, Check, X, MinusCircle, HelpCircle, Gauge, CalendarClock, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SignedImg } from '@/components/ui/SignedImg';
import { cn } from '@/lib/utils';
import { visitTypeFromFreqs } from '@/hooks/useOsActivityChecklist';
import type { ReportChecklistItem } from './ReportChecklist';

/**
 * Resposta personalizada (questionário) que cabe DENTRO do accordion do
 * equipamento, na seção "Checklists Personalizados". O componente é agnóstico ao
 * shape exato — só repassa cada resposta pro `renderResponse` do OSReport (que já
 * sabe desenhar foto/booleano/texto e abre o viewer interno). `id` serve de key.
 */
export interface PersonalizedResponseLike { id: string }
export interface PersonalizedBlock<R extends PersonalizedResponseLike = PersonalizedResponseLike> {
  templateName: string;
  responses: R[];
}

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
  /**
   * Ordem unificada das chaves de grupo (equipment_name ?? '__geral__'). Quando
   * fornecida, o componente renderiza UM accordion por chave NESTA ordem — assim
   * grupos que só têm checklist personalizado (sem item PMOC) também aparecem.
   * Sem isto: cai no comportamento antigo (só grupos PMOC, na ordem do groupItems).
   */
  groupOrder?: string[];
  /**
   * Checklists PERSONALIZADOS por grupo de equipamento: groupKey (= equipment_name
   * ?? '__geral__') → blocos { templateName, responses }. Renderizados na seção
   * "Checklists Personalizados", DEPOIS das seções PMOC, dentro do mesmo accordion.
   */
  personalizedByGroup?: Map<string, PersonalizedBlock<any>[]>;
  /** Renderiza UMA resposta personalizada (vem do OSReport: foto/booleano/texto). */
  renderResponse?: (response: any, idx: number) => ReactNode;
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
   * Quando true, força TODAS as seções internas (Condicionadores/Medições/Testes/
   * Personalizados) ABERTAS, ignorando o estado do usuário. Vem do force-open do
   * PDF/Imprimir do OSReport (`forcedAllOpen`): como o Radix DESMONTA o conteúdo
   * fechado, `print:` CSS não basta — precisamos abri-las de fato pra saída sair
   * completa. Sem isto, cada seção é um accordion não-controlado aberto por
   * padrão (`defaultValue`) que o usuário pode recolher na tela.
   */
  forceAllSectionsOpen?: boolean;
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

/** Um item de conformidade PMOC (card slate). Reusado dentro das seções. */
function PmocItemCard({
  item,
  idx,
  onPreviewPhoto,
}: {
  item: ReportChecklistItem;
  idx: number;
  onPreviewPhoto?: Props['onPreviewPhoto'];
}) {
  return (
    <div className="space-y-2 p-3 rounded-lg bg-slate-50 border border-slate-100">
      <div className="flex items-start gap-2">
        <span className="font-bold text-slate-400 text-sm leading-5">{idx + 1}.</span>
        <div className="flex-1 min-w-0">
          {item.component && (
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
              {item.component}
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
  );
}

/**
 * Seção recolhível DENTRO do equipamento. Cada seção (Condicionadores, Medições,
 * Testes, Checklists Personalizados…) vira um accordion próprio (nested), aberto
 * por padrão e colapsável de forma independente.
 *
 * - Modo tela: não-controlado, `defaultValue` = a própria seção (aberta), usuário
 *   pode recolher.
 * - Modo PDF/Imprimir: quando `forceOpen`, vira CONTROLADO sempre aberto (o Radix
 *   desmonta conteúdo fechado, então não dá pra confiar só em CSS print).
 *
 * O rótulo (trigger) mantém o visual antigo: ícone + título uppercase + divisória.
 */
function SectionAccordion({
  sectionKey,
  icon: Icon,
  label,
  forceOpen,
  children,
}: {
  sectionKey: string;
  icon: typeof ListChecks;
  label: string;
  forceOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Accordion
      type="single"
      collapsible
      {...(forceOpen
        ? { value: sectionKey, onValueChange: () => {} } // travado aberto no PDF
        : { defaultValue: sectionKey })}
      className="w-full"
    >
      <AccordionItem value={sectionKey} className="border-0">
        <AccordionTrigger className="hover:no-underline py-0 pb-2 pt-1 border-b-2 border-slate-200 text-slate-600">
          <span className="flex items-center gap-1.5 min-w-0">
            <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider text-left">{label}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="pt-3 pb-0">{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/**
 * Agrupa os itens PMOC de um equipamento pelas SEÇÕES (item.section), preservando
 * a ordem de aparição. Itens sem seção caem num bloco "Itens" (rótulo genérico).
 */
function sectionGroups(items: ReportChecklistItem[]): { section: string; items: ReportChecklistItem[] }[] {
  const out: { section: string; items: ReportChecklistItem[] }[] = [];
  const index = new Map<string, number>();
  for (const it of items) {
    const sec = it.section || 'Itens';
    let i = index.get(sec);
    if (i === undefined) {
      i = out.length;
      index.set(sec, i);
      out.push({ section: sec, items: [] });
    }
    out[i].items.push(it);
  }
  return out;
}

/**
 * Seção "Checklists por Equipamento" do relatório branco. Cada equipamento é UM
 * accordion contendo as seções de conformidade PMOC (agrupadas por `section`,
 * cada uma com rótulo + divisória) seguidas da seção "Checklists Personalizados"
 * (respostas do questionário daquele equipamento, por nome de template).
 * Não renderiza nada quando não há nem itens PMOC nem checklists personalizados.
 */
export function ReportPmocChecklist({
  items,
  groupOrder,
  personalizedByGroup,
  renderResponse,
  onPreviewPhoto,
  anchorIdForGroup,
  photoUrlForGroup,
  openKeys,
  onOpenChange,
  stickyTopPx,
  forceAllSectionsOpen,
}: Props) {
  // Mapa de grupos PMOC por chave (equipment_name ?? '__geral__').
  const pmocGroups = groupItems(items);
  const pmocByKey = new Map<string, ReportPmocChecklistGroup>();
  for (const g of pmocGroups) pmocByKey.set(groupKeyForName(g.equipmentName), g);

  // Lista final de chaves de grupo a renderizar (uma por equipamento). Usa a
  // ordem unificada da página quando vier; senão só as chaves PMOC.
  const keys = groupOrder && groupOrder.length > 0
    ? groupOrder
    : pmocGroups.map((g) => groupKeyForName(g.equipmentName));

  if (keys.length === 0) return null;

  // Controlado só quando a página passa openKeys + onOpenChange (sidebar
  // desktop). Senão segue não-controlado com tudo aberto (defaultValue).
  const controlled = openKeys !== undefined && onOpenChange !== undefined;

  // Nome de exibição da chave: '__geral__' → "Geral / Local", senão o próprio.
  const displayName = (key: string) => (key === '__geral__' ? 'Geral / Local' : key);
  // equipment_name pro lookup de foto/âncora: '__geral__' vira null (igual PMOC).
  const equipmentNameForKey = (key: string): string | null => (key === '__geral__' ? null : key);

  return (
    <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5" /> Checklists por Equipamento
      </h3>
      <Accordion
        type="multiple"
        {...(controlled
          ? { value: openKeys, onValueChange: onOpenChange }
          : { defaultValue: keys })}
        className="w-full"
      >
        {keys.map((groupKey) => {
          const pmocGroup = pmocByKey.get(groupKey);
          const pmocItems = pmocGroup?.items ?? [];
          const personalized = personalizedByGroup?.get(groupKey) ?? [];
          // Grupo sem nada (nem PMOC nem personalizado): não renderiza item.
          if (pmocItems.length === 0 && personalized.length === 0) return null;

          const equipmentName = equipmentNameForKey(groupKey);
          const photoUrl = photoUrlForGroup?.(equipmentName) || null;

          // Contadores/visita derivam SÓ dos itens de conformidade PMOC.
          const total = pmocItems.length;
          const answered = pmocItems.filter((a) => !!a.conformity_status).length;
          const naoConforme = pmocItems.filter((a) => a.conformity_status === 'nao_conforme').length;
          const pending = total - answered;
          const hasFreq = pmocItems.some((a) => !!a.freq_code);
          const visit = hasFreq ? visitTypeFromFreqs(pmocItems.map((a) => a.freq_code)) : null;
          const personalizedCount = personalized.reduce((n, b) => n + b.responses.length, 0);
          const hasPmoc = total > 0;

          return (
            <AccordionItem
              key={groupKey}
              value={groupKey}
              id={anchorIdForGroup?.(equipmentName)}
              data-pdf-section
              className={cn(
                // Sem caixa por equipamento: lista limpa, SEM fundo próprio — o
                // bloco herda o branco do documento de trás (reportRef). Mais
                // espaço VERTICAL entre equipamentos (pt-6) pra as fotos coladas
                // na esquerda não grudarem entre uma linha e outra.
                'border-0 scroll-mt-24 pt-6 first:pt-0',
                // `overflow-hidden` clipa o cabeçalho sticky; só mantém quando
                // não há sticky (PDF/impressão e modo sem offset).
                stickyTopPx === undefined && 'overflow-hidden',
              )}
            >
              <AccordionTrigger
                // Relatório é documento SEMPRE claro (reportRef é bg-white). O
                // trigger NÃO ganha fundo próprio: herda o branco do documento de
                // trás (sem "card flutuante"). `text-slate-900` garante chevron e
                // texto não estilizado legíveis. Sem padding à ESQUERDA (pl-0):
                // a foto encosta na borda esquerda; respiro fica só à direita.
                className="hover:no-underline pl-0 pr-1 py-0 gap-2 min-w-0 overflow-hidden text-slate-900"
                // Cabeçalho do equipamento fixo no topo enquanto rola o conteúdo
                // aberto (logo abaixo do header laranja "OS #..."). Sticky no
                // WRAPPER (Header). Fundo branco SÓLIDO = MESMA cor do documento:
                // quando NÃO está grudado parece sem fundo (igual o de trás);
                // quando gruda continua opaco (conteúdo não passa atrás) +
                // sombra. z abaixo do header da tela.
                headerClassName={cn(stickyTopPx !== undefined && 'sticky z-10 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] print:static print:shadow-none')}
                headerStyle={stickyTopPx !== undefined ? { top: stickyTopPx } : undefined}
              >
                <div className="flex items-stretch gap-3 flex-1 min-w-0 text-left min-h-14">
                  {photoUrl ? (
                    <SignedImg
                      src={photoUrl}
                      alt={displayName(groupKey)}
                      className="self-stretch w-16 rounded-none object-cover shrink-0 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreviewPhoto?.(photoUrl);
                      }}
                    />
                  ) : (
                    <div className="self-stretch w-16 rounded-none bg-slate-100 flex items-center justify-center shrink-0">
                      <Wrench className="h-6 w-6 text-slate-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 self-center">
                    <p className="font-bold text-base text-slate-800 truncate">
                      {displayName(groupKey)}
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
                      {hasPmoc && `${total} item${total > 1 ? 's' : ''}`}
                      {hasPmoc && personalizedCount > 0 && ' · '}
                      {personalizedCount > 0 && `${personalizedCount} resposta${personalizedCount > 1 ? 's' : ''}`}
                    </p>
                  </div>
                  {naoConforme > 0 ? (
                    <span className="self-center inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">
                      <X className="h-3 w-3" />
                      {naoConforme} não-conforme{naoConforme > 1 ? 's' : ''}
                    </span>
                  ) : hasPmoc && pending === 0 ? (
                    <span title="Concluído" aria-label="Concluído" className="self-center shrink-0">
                      <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    </span>
                  ) : hasPmoc ? (
                    <span className="self-center inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                      {pending} sem resposta
                    </span>
                  ) : null}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-1 pb-3">
                {/* Seções do equipamento: cada uma é um accordion próprio (nested)
                    ABERTO por padrão e recolhível. Espaçamento maior entre elas. */}
                <div className="space-y-6 pt-2">
                  {/* Seções de conformidade PMOC, agrupadas por item.section. */}
                  {hasPmoc && sectionGroups(pmocItems).map((sec) => (
                    <SectionAccordion
                      key={`sec-${sec.section}`}
                      sectionKey={`sec-${groupKey}-${sec.section}`}
                      icon={ListChecks}
                      label={sec.section}
                      forceOpen={forceAllSectionsOpen}
                    >
                      <div className="space-y-3">
                        {sec.items.map((item, idx) => (
                          <PmocItemCard key={item.id} item={item} idx={idx} onPreviewPhoto={onPreviewPhoto} />
                        ))}
                      </div>
                    </SectionAccordion>
                  ))}

                  {/* Seção "Checklists Personalizados": cada template é um sub-bloco
                      com o NOME real do checklist. Reusa o renderResponse do OSReport. */}
                  {personalized.length > 0 && renderResponse && (
                    <SectionAccordion
                      sectionKey={`pers-${groupKey}`}
                      icon={ClipboardCheck}
                      label="Checklists Personalizados"
                      forceOpen={forceAllSectionsOpen}
                    >
                      <div className="space-y-4">
                        {personalized.map((block, bi) => (
                          <div key={`tpl-${bi}-${block.templateName}`} className="space-y-1">
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                              {block.templateName}
                            </p>
                            <div className="space-y-2">
                              {block.responses.map((response, idx) => renderResponse(response, idx))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionAccordion>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
