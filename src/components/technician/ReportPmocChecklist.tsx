import { type ReactNode } from 'react';
import { ListChecks, Check, X, MinusCircle, HelpCircle, Gauge, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SignedImg } from '@/components/ui/SignedImg';
import { cn } from '@/lib/utils';
import { useStickyStuck } from '@/hooks/useStickyStuck';
import { visitTypeFromFreqs } from '@/hooks/useOsActivityChecklist';
import { sectionLabel } from '@/utils/sectionLabel';
import {
  EquipmentChecklistHeader,
  equipmentChecklistHeaderClasses,
  useStickyHeaderHeight,
  useFollowStickyTop,
  StickyFullBleedBg,
} from './EquipmentChecklistHeader';
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
  /**
   * OS é PMOC? Quando true (relatório PMOC), os checklists personalizados ficam
   * dentro de uma seção rotulada "Checklists Personalizados" — o rótulo distingue
   * dos checklists da NORMA PMOC, que aparecem no mesmo equipamento. Quando false
   * (OS normal, sem norma PMOC), o rótulo é REDUNDANTE (não há nada do PMOC pra
   * distinguir): as respostas aparecem direto sob o equipamento, sem o sub-header.
   */
  isPmoc?: boolean;
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
   * Nome do AMBIENTE do equipamento (contract_environments.identificacao), por
   * nome de equipamento. Renderizado no cabeçalho do grupo, ao lado do nome do
   * equipamento, em fonte mais leve (" | 1º Andar"). null/ausente = não mostra.
   */
  environmentForGroup?: (equipmentName: string | null) => string | null | undefined;
  /**
   * TIPO/categoria do equipamento ({ name, color }) por nome de equipamento.
   * Renderizado como badge saturado no cabeçalho do grupo (mesmo do preenchimento).
   * null/ausente = não mostra badge.
   */
  categoryForGroup?: (equipmentName: string | null) => { name: string; color: string | null } | null | undefined;
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
 * Um equipamento do checklist do relatório. Componente próprio pra hospedar o
 * `useStickyStuck` (sentinel + IntersectionObserver) do cabeçalho sticky. O
 * sentinel (0px) fica logo acima do `AccordionTrigger`: ao sair por cima, o
 * cabeçalho grudou (`isStuck`) → sombra forte + cantos retos no topo; senão sem
 * sombra + cantos arredondados (visual de card). PDF/Imprimir: estático e sem
 * sombra. O cabeçalho em si (foto QUADRADA + nome + badge de tipo + status) é o
 * `EquipmentChecklistHeader` compartilhado na variante 'document' — MESMO do
 * preenchimento, só com a paleta clara do relatório.
 */
function ReportPmocItem({
  groupKey,
  pmocItems,
  personalized,
  displayName,
  hideSingleTemplateLabel,
  environmentName,
  category,
  photoUrl,
  anchorId,
  onPreviewPhoto,
  renderResponse,
  stickyTopPx,
  isOpen,
  forceAllSectionsOpen,
  isPmoc,
}: {
  groupKey: string;
  pmocItems: ReportChecklistItem[];
  personalized: PersonalizedBlock<any>[];
  displayName: string;
  /**
   * Grupo "Geral / Local" com UM único template: o cabeçalho JÁ é o nome do
   * checklist, então o sub-rótulo do nome do template dentro do conteúdo é omitido
   * (seria duplicado). Vários templates mantêm os sub-rótulos.
   */
  hideSingleTemplateLabel?: boolean;
  /** Nome do ambiente do equipamento (fonte leve, " | …"). null = não mostra. */
  environmentName: string | null;
  /** Tipo/categoria do equipamento (badge). null = não mostra. */
  category: { name: string; color: string | null } | null;
  photoUrl: string | null;
  anchorId?: string;
  onPreviewPhoto?: Props['onPreviewPhoto'];
  renderResponse?: Props['renderResponse'];
  stickyTopPx?: number;
  /**
   * Single-open: SÓ o equipamento ABERTO fixa o cabeçalho. Fechados ficam em
   * fluxo normal — sem empilhamento de cabeçalhos sticky sobrepostos.
   */
  isOpen: boolean;
  forceAllSectionsOpen?: boolean;
  /**
   * OS é PMOC? Em OS normal (false) o bloco personalizado é renderizado SEM o
   * sub-header "Checklists Personalizados" (redundante — não há norma PMOC pra
   * distinguir). Em PMOC mantém o sub-header recolhível.
   */
  isPmoc?: boolean;
}) {
  // Sticky só no equipamento ABERTO. Fechado desativa o observer.
  const stickyOn = isOpen && stickyTopPx !== undefined;

  // Altura REAL do cabeçalho grudado (o `AccordionTrigger`) via hook compartilhado
  // (ResizeObserver). Usada como `height` do fundo branco `fixed` (ver JSX abaixo)
  // E como linha de BAIXO no useStickyStuck (por isso medida ANTES dele).
  const { triggerRef, height: headerHeight } = useStickyHeaderHeight();
  const { sentinelRef, bottomSentinelRef, isStuck } = useStickyStuck(stickyOn ? stickyTopPx : undefined, headerHeight);

  // Monta o fundo branco enquanto o cabeçalho está sticky/aberto e com altura já
  // medida (evita flash de barra 0px). A VISIBILIDADE (fade) é controlada por
  // `bgVisible` (o fundo SEGUE o topo real do cabeçalho via `useFollowStickyTop`)
  // — fica montado pra animar entrada E saída.
  const mountStuckBg = stickyOn && stickyTopPx !== undefined && headerHeight > 0;
  // O fundo `fixed` SEGUE o topo REAL do cabeçalho (sobe junto na soltura) — sem
  // a janela transparente que o `isStuck` causava ao apagar cedo demais.
  const { followTop, visible: bgVisible } = useFollowStickyTop(
    triggerRef,
    (stickyTopPx ?? 0) - 1,
    headerHeight,
    mountStuckBg,
  );

  const total = pmocItems.length;
  const answered = pmocItems.filter((a) => !!a.conformity_status).length;
  const naoConforme = pmocItems.filter((a) => a.conformity_status === 'nao_conforme').length;
  const pending = total - answered;
  const hasFreq = pmocItems.some((a) => !!a.freq_code);
  const visit = hasFreq ? visitTypeFromFreqs(pmocItems.map((a) => a.freq_code)) : null;
  const personalizedCount = personalized.reduce((n, b) => n + b.responses.length, 0);
  const hasPmoc = total > 0;

  // Rótulo de contagem (itens PMOC + respostas personalizadas), mesmo texto do
  // cabeçalho antigo do relatório. Passado ao `itemsLabel` do header compartilhado.
  const itemsLabel = [
    hasPmoc ? `${total} item${total > 1 ? 's' : ''}` : '',
    personalizedCount > 0 ? `${personalizedCount} resposta${personalizedCount > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ') || undefined;

  // Classes compartilhadas (sticky + full-bleed no stuck) na variante 'document'
  // (documento branco, padding de full-bleed 29/41px, print estático). MESMA fonte
  // que o preenchimento — só muda a paleta.
  const headerCls = equipmentChecklistHeaderClasses(stickyOn, isStuck, 'document');

  return (
    <AccordionItem
      key={groupKey}
      value={groupKey}
      id={anchorId}
      data-pdf-section
      className={cn(
        // Sem caixa por equipamento: lista limpa, SEM fundo próprio — herda o
        // branco do documento de trás. Mais espaço VERTICAL entre equipamentos.
        'border-0 scroll-mt-24 pt-6 first:pt-0',
        // `overflow-hidden` clipa o cabeçalho sticky; só mantém quando ESTE item
        // não está sticky (fechado, PDF/impressão, ou modo sem offset).
        !stickyOn && 'overflow-hidden',
      )}
    >
      {/* Sentinel do sticky: 0px logo acima do cabeçalho (detecta stuck). */}
      <div ref={sentinelRef} aria-hidden className="h-0" />
      {/* Fundo branco do cabeçalho grudado (full-bleed da viewport interna) via
          componente compartilhado. No relatório a cor é `bg-white` (documento claro);
          o mecanismo é IDÊNTICO ao do preenchimento (que usa `bg-card`). */}
      {mountStuckBg && (
        <StickyFullBleedBg top={followTop} height={headerHeight} bgClass="bg-white" visible={bgVisible} />
      )}
      <AccordionTrigger
        ref={triggerRef}
        // MESMO cabeçalho do preenchimento (EquipmentChecklistHeader), só que na
        // variante 'document' (documento branco, slate, print estático). Classes
        // sticky + full-bleed vêm da fonte ÚNICA compartilhada.
        className={headerCls.trigger}
        headerClassName={headerCls.header}
        // `-1px` no top: gruda 1px ATRÁS do header laranja (z-20 cobre o equipamento
        // z-10) pra fechar qualquer costura sub-pixel entre as duas barras. Sem isso,
        // arredondamento fracionário deixa um fio do fundo da página aparecendo (vão).
        headerStyle={stickyOn ? { top: stickyTopPx - 1 } : undefined}
      >
        <EquipmentChecklistHeader
          tone="document"
          // Grupo "Geral / Local" (`__geral__`) não é equipamento: ícone discreto de
          // checklist (slate) no lugar da foto. O `displayName` já vem como o NOME do
          // checklist quando o grupo geral tem UM único template; vários mantêm
          // "Geral / Local". Equipamentos reais seguem com foto.
          leadingIcon={groupKey === '__geral__' ? <ClipboardCheck className="h-5 w-5 text-slate-400" /> : undefined}
          photo={photoUrl}
          name={displayName}
          category={category}
          environmentName={environmentName}
          visit={visit ?? undefined}
          itemsLabel={itemsLabel}
          onPreviewPhoto={onPreviewPhoto ? (url) => onPreviewPhoto(url) : undefined}
          statusBadge={
            naoConforme > 0 ? (
              <span className="self-center inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-600 text-white shrink-0">
                <X className="h-3 w-3" />
                {naoConforme} não-conforme{naoConforme > 1 ? 's' : ''}
              </span>
            ) : hasPmoc && pending === 0 ? (
              <span title="Concluído" aria-label="Concluído" className="self-center shrink-0">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </span>
            ) : hasPmoc ? (
              <span className="self-center inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-500 text-white shrink-0">
                {pending} sem resposta
              </span>
            ) : null
          }
        />
      </AccordionTrigger>
      <AccordionContent className="px-1 pb-3">
        {/* Seções do equipamento: cada uma é um accordion próprio (nested) ABERTO
            por padrão e recolhível. Não são sticky → nunca empurram o cabeçalho. */}
        <div className="space-y-6 pt-2">
          {hasPmoc && sectionGroups(pmocItems).map((sec) => (
            <SectionAccordion
              key={`sec-${sec.section}`}
              sectionKey={`sec-${groupKey}-${sec.section}`}
              icon={ListChecks}
              label={sectionLabel(sec.section) || sec.section}
              forceOpen={forceAllSectionsOpen}
            >
              <div className="space-y-3">
                {sec.items.map((item, idx) => (
                  <PmocItemCard key={item.id} item={item} idx={idx} onPreviewPhoto={onPreviewPhoto} />
                ))}
              </div>
            </SectionAccordion>
          ))}

          {personalized.length > 0 && renderResponse && (
            // Os blocos personalizados (cada um já rotulado pelo NOME do template).
            // - PMOC: envoltos na seção recolhível "Checklists Personalizados" — o
            //   rótulo distingue dos checklists da NORMA PMOC do mesmo equipamento.
            // - OS normal: SEM esse sub-header (redundante, não há norma PMOC pra
            //   distinguir) — os blocos saem direto sob o equipamento.
            isPmoc ? (
              <SectionAccordion
                sectionKey={`pers-${groupKey}`}
                icon={ClipboardCheck}
                label="Checklists Personalizados"
                forceOpen={forceAllSectionsOpen}
              >
                <div className="space-y-4">
                  {personalized.map((block, bi) => (
                    <div key={`tpl-${bi}-${block.templateName}`} className="space-y-1">
                      {!hideSingleTemplateLabel && (
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          {block.templateName}
                        </p>
                      )}
                      <div className="space-y-2">
                        {block.responses.map((response, idx) => renderResponse(response, idx))}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionAccordion>
            ) : (
              <div className="space-y-4">
                {personalized.map((block, bi) => (
                  <div key={`tpl-${bi}-${block.templateName}`} className="space-y-1">
                    {!hideSingleTemplateLabel && (
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        {block.templateName}
                      </p>
                    )}
                    <div className="space-y-2">
                      {block.responses.map((response, idx) => renderResponse(response, idx))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </AccordionContent>
      {/* Sentinel da BASE: 0px logo após o conteúdo. Marca o fim do item — quando
          ele cruza a linha (sticky + altura do cabeçalho), o cabeçalho desgruda e
          o fundo/sombra some (não fica mais preso no topo passando do fim). */}
      <div ref={bottomSentinelRef} aria-hidden className="h-0" />
    </AccordionItem>
  );
}

/**
 * Seção "Checklists por Equipamento" do relatório branco. Cada equipamento é UM
 * accordion contendo as seções de conformidade PMOC (agrupadas por `section`,
 * cada uma com rótulo + divisória) seguidas da seção "Checklists Personalizados"
 * (respostas do questionário daquele equipamento, por nome de template).
 * Não renderiza nada quando não há nem itens PMOC nem checklists personalizados.
 */
export function ReportPmocChecklist({
  isPmoc,
  items,
  groupOrder,
  personalizedByGroup,
  renderResponse,
  onPreviewPhoto,
  anchorIdForGroup,
  photoUrlForGroup,
  environmentForGroup,
  categoryForGroup,
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

  // Título da seção: "Checklists por Equipamento" só faz sentido quando há ao
  // menos UM grupo de equipamento real. Quando todos os grupos são o geral
  // ('__geral__'), o título vira só "Checklists" (não é "por equipamento").
  const hasRealEquipment = keys.some((key) => key !== '__geral__');
  const sectionTitle = hasRealEquipment ? 'Checklists por Equipamento' : 'Checklists';

  return (
    <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5" /> {sectionTitle}
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
          const environmentName = environmentForGroup?.(equipmentName) || null;
          const category = categoryForGroup?.(equipmentName) || null;

          // Grupo "Geral / Local": quando é UM único checklist personalizado (sem
          // itens PMOC), o cabeçalho vira o NOME desse checklist em vez do título
          // genérico. Vários templates mantêm "Geral / Local" (o cabeçalho não pode
          // ser o nome de todos). O sub-rótulo do nome dentro do conteúdo é então
          // omitido pra um único template (seria duplicado com o cabeçalho).
          const isGeneralSingleTemplate =
            groupKey === '__geral__' && pmocItems.length === 0 && personalized.length === 1;
          const groupDisplayName = isGeneralSingleTemplate
            ? personalized[0].templateName
            : displayName(groupKey);

          // SÓ o equipamento aberto é sticky. No force-open do PDF/Imprimir todos
          // ficam "abertos", mas aí desligamos o sticky (a saída é estática).
          const itemOpen = !forceAllSectionsOpen && (openKeys?.includes(groupKey) ?? false);

          return (
            <ReportPmocItem
              key={groupKey}
              groupKey={groupKey}
              pmocItems={pmocItems}
              personalized={personalized}
              displayName={groupDisplayName}
              hideSingleTemplateLabel={isGeneralSingleTemplate}
              environmentName={environmentName}
              category={category}
              photoUrl={photoUrl}
              anchorId={anchorIdForGroup?.(equipmentName)}
              onPreviewPhoto={onPreviewPhoto}
              renderResponse={renderResponse}
              stickyTopPx={stickyTopPx}
              isOpen={itemOpen}
              forceAllSectionsOpen={forceAllSectionsOpen}
              isPmoc={isPmoc}
            />
          );
        })}
      </Accordion>
    </div>
  );
}
