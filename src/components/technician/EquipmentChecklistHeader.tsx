import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Wrench, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { SignedImg } from '@/components/ui/SignedImg';

/**
 * Variante de PALETA do cabeçalho. O LAYOUT é idêntico nos dois; só muda a cor:
 *  - 'app' (default): segue o TEMA do usuário (tokens `bg-card`/`text-foreground`/
 *    `text-muted-foreground`). Usado no PREENCHIMENTO — OS normal e visita PMOC.
 *  - 'document': DOCUMENTO sempre claro (relatório/PDF). Cores `slate-*` e branco
 *    hardcoded, comportamento `print:` correto. Usado no RELATÓRIO (OSReport).
 */
export type EquipmentChecklistTone = 'app' | 'document';

/**
 * Tokens de cor por variante. Fonte única pra que o relatório (claro) e o
 * preenchimento (tema) compartilhem ESTRUTURA e divirjam só na paleta.
 */
const TONE: Record<EquipmentChecklistTone, {
  fallbackBg: string;
  fallbackIcon: string;
  title: string;
  muted: string;
  visitName: string;
  visitIcon: string;
  subtitle: string;
}> = {
  app: {
    fallbackBg: 'bg-muted',
    fallbackIcon: 'text-muted-foreground',
    title: 'text-foreground',
    muted: 'text-muted-foreground',
    visitName: 'text-foreground',
    visitIcon: 'text-primary',
    subtitle: 'text-primary',
  },
  document: {
    fallbackBg: 'bg-slate-100',
    fallbackIcon: 'text-slate-500',
    title: 'text-slate-800',
    muted: 'text-slate-400',
    visitName: 'text-slate-700',
    visitIcon: 'text-slate-400',
    subtitle: 'text-slate-600',
  },
};

/**
 * Cabeçalho de equipamento COMPARTILHADO entre TODOS os contextos de checklist:
 * PREENCHIMENTO (OS normal + visita PMOC) e RELATÓRIO/PDF (OSReport). Mesma
 * identidade visual em todos — foto QUADRADA 14x14 colada à esquerda, nome
 * `text-base font-bold`, badge de tipo + ambiente quebrando linha (nunca trunca
 * o badge), linha de visita/frequência (PMOC) e contador de itens. O que muda é:
 *  - As INFORMAÇÕES: OS normal não passa `visit`; PMOC passa "Visita X · níveis".
 *  - A PALETA: `tone='app'` (tema do usuário) no preenchimento; `tone='document'`
 *    (slate/branco hardcoded) no relatório. Ver `EquipmentChecklistTone`.
 *
 * O selo de status à direita (concluído / pendente / não-conforme) varia por
 * fluxo e entra por `statusBadge` (ReactNode), renderizado pelo chamador.
 *
 * Esse componente renderiza APENAS o conteúdo interno do `AccordionTrigger`
 * (o quê o usuário vê na barra). Sticky, sentinel, single-open e o full-bleed do
 * stuck continuam responsabilidade de cada item — ver `equipmentChecklistHeaderClasses`,
 * `useStickyHeaderHeight` e `StickyFullBleedBg`. Em TODOS os contextos (relatório
 * E preenchimento) o FUNDO grudado é um elemento `position: fixed` renderizado pelo
 * ITEM (via `StickyFullBleedBg`), não aqui — assim cobre as calhas da viewport sem
 * o erro de scrollbar do `100vw`. O conteúdo foto+texto fica no fluxo da coluna
 * (`relative z-10`), sempre por cima do fundo. A única diferença entre contextos é
 * a COR do fundo: `bg-white` (document) vs `bg-card` (app).
 */
export function EquipmentChecklistHeader({
  photo,
  name,
  category,
  subtitle,
  brandModel,
  environmentName,
  visit,
  itemsLabel,
  statusBadge,
  onPreviewPhoto,
  tone = 'app',
  hidePhoto = false,
  leadingIcon,
}: {
  photo: string | null;
  name: string;
  category: { name: string; color: string | null } | null;
  /**
   * Subtítulo opcional logo abaixo do nome (ex.: nome do checklist quando o mesmo
   * equipamento tem vários). Só a OS normal usa. null/undefined = não mostra.
   */
  subtitle?: ReactNode;
  /** "Marca Modelo" já concatenado (vazio = não mostra). */
  brandModel?: string;
  /** Ambiente/local do equipamento (" | 1º Andar"). null/'' = não mostra. */
  environmentName?: string | null;
  /**
   * Linha de visita/frequência — SÓ PMOC. Omitir na OS normal (não há plano de
   * visita). `niveis` são os checklists exibidos.
   */
  visit?: { tipo: string; niveis: string[] };
  /** Rótulo de contagem ("3 itens") — opcional (PMOC usa; OS normal não). */
  itemsLabel?: string;
  /** Selo de status à direita (varia por fluxo) — renderizado pelo chamador. */
  statusBadge?: ReactNode;
  /** Abre a foto em tela cheia (mesmo viewer dos dois fluxos). */
  onPreviewPhoto?: (url: string) => void;
  /** Paleta: 'app' (tema, padrão) ou 'document' (relatório claro). */
  tone?: EquipmentChecklistTone;
  /**
   * Esconde POR COMPLETO o bloco de foto à esquerda — nem a foto nem o fallback
   * Wrench. Usado no grupo "Geral / Local" (`__geral__`/sem equipamento real): não
   * é um equipamento, então o quadrado de foto não faz sentido. Com `hidePhoto` o
   * cabeçalho mostra só o texto (nome + contador + badges), sem o vão da foto.
   */
  hidePhoto?: boolean;
  /**
   * Ícone líder pequeno à esquerda, no lugar do quadrado de foto — usado no grupo
   * "Geral / Local" de CHECKLIST (não é equipamento, mas o cabeçalho passa a ser o
   * NOME do próprio checklist e ganha um ícone discreto de checklist em vez do
   * Wrench/foto). Tem precedência sobre `hidePhoto`: quando passado, renderiza o
   * ícone (pequeno, alinhado ao topo do texto) e ignora a foto. ReactNode = o
   * chamador escolhe `ClipboardCheck`/`ListChecks` já com a classe de cor/tamanho.
   */
  leadingIcon?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className={cn('relative flex items-stretch flex-1 min-w-0 text-left min-h-14', hidePhoto && !leadingIcon ? 'gap-2' : 'gap-3')}>
      {/* Foto com cantos arredondados (`rounded-md`) — pode arredondar porque o
          conteúdo NÃO cola mais na borda (fica no padding da coluna). Largura fixa
          `w-14`. Quem manda na ALTURA é o CONTEÚDO de texto à direita: a foto fica
          num wrapper `self-stretch` e a <img> é absoluta com `inset-y-1` (leve
          padding vertical → ocupa 100% da altura MENOS o respiro de cima/baixo) e
          `inset-x-0`, então NÃO impõe a própria altura intrínseca (não fica mais
          alta que o texto) — só preenche, com `object-cover`.
          `overflow-hidden` no WRAPPER é o que garante isso de verdade: uma <img>
          (elemento SUBSTITUÍDO) absoluta com `top` E `bottom` definidos NÃO resolve
          a altura por top/bottom — o browser mantém a ALTURA INTRÍNSECA da imagem e
          ignora o `bottom`. Em linhas altas (PMOC/relatório, com várias linhas de
          texto) o intrínseco cabe e ninguém percebe; em linha curta (card
          "Checklists" com só título + 1 badge) o intrínseco fica MAIOR que a linha
          e a foto vazava pra baixo, invadindo o próximo item. O `overflow-hidden`
          recorta a foto exatamente na caixa do wrapper em TODOS os contextos
          (no-op quando já cabe) — fonte única, conserta os 4 fluxos de uma vez.
          Quando `hidePhoto` (grupo "Geral / Local") o bloco INTEIRO some — nem
          foto nem fallback Wrench — porque não há equipamento real. */}
      {leadingIcon ? (
        // Grupo "Geral / Local" de CHECKLIST: ícone pequeno e discreto à esquerda
        // (não o quadrado 14x14 de foto). Largura fixa estreita pra alinhar o texto;
        // `mt-0.5` casa com a baseline do título. O chamador passa o ícone já com
        // a cor da paleta (token no preenchimento, slate no relatório).
        <div className="relative z-10 shrink-0 mt-0.5">{leadingIcon}</div>
      ) : hidePhoto ? null : photo ? (
        <div className="relative z-10 w-14 self-stretch shrink-0 overflow-hidden rounded-md">
          <SignedImg
            src={photo}
            alt={name}
            className="absolute inset-x-0 inset-y-1 rounded-md object-cover cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onPreviewPhoto?.(photo);
            }}
          />
        </div>
      ) : (
        <div className={cn('relative z-10 w-14 self-stretch min-h-14 my-1 rounded-md flex items-center justify-center shrink-0', t.fallbackBg)}>
          <Wrench className={cn('h-6 w-6', t.fallbackIcon)} />
        </div>
      )}
      <div className="relative z-10 flex-1 min-w-0">
        {/* Título do equipamento numa linha própria (pode truncar se for muito
            longo). O badge de TIPO e o ambiente saem da linha do título e descem
            pra linha de baixo (flex-wrap) — assim o badge SEMPRE aparece e nada é
            cortado com "..." quando o espaço é pequeno (mobile / sidebar estreita). */}
        {/* Nome do EQUIPAMENTO trunca (compacto). Mas no grupo geral, onde o título
            é o NOME DO CHECKLIST (leadingIcon presente), pode ser longo → quebra
            linha (`break-words`) em vez de cortar com "...". */}
        <p className={cn('text-base font-bold min-w-0', leadingIcon ? 'break-words' : 'truncate', t.title)}>{name}</p>
        {/* Badge de tipo + ambiente: linha logo abaixo do título, quebra se faltar
            espaço. Badge nunca some (não trunca); o ambiente quebra/encolhe. */}
        {(category || environmentName) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 min-w-0">
            {category && (
              <Badge
                className="text-[10px] shrink-0 text-white border-0"
                style={category.color ? { backgroundColor: category.color } : undefined}
              >
                {category.name}
              </Badge>
            )}
            {environmentName && (
              <span className={cn('text-xs font-normal min-w-0 break-words', t.muted)}>
                {environmentName}
              </span>
            )}
          </div>
        )}
        {subtitle && (
          <p className={cn('text-xs font-medium truncate mt-0.5', t.subtitle)}>{subtitle}</p>
        )}
        {brandModel && (
          <p className={cn('text-xs mt-0.5 truncate', t.muted)}>{brandModel}</p>
        )}
        {/* Linha de visita/frequência: SÓ PMOC. OS normal não passa `visit`. */}
        {visit && (
          <p className={cn('flex items-center gap-1 text-[11px] mt-0.5 min-w-0', t.muted)}>
            <CalendarClock className={cn('h-3 w-3 shrink-0', t.visitIcon)} />
            <span className="truncate normal-case">
              <span className={cn('font-medium', t.visitName)}>Visita {visit.tipo}</span>
              {' · '}
              {visit.niveis.join(' + ')}
            </span>
          </p>
        )}
        {itemsLabel && (
          <p className={cn('text-xs mt-0.5', t.muted)}>{itemsLabel}</p>
        )}
      </div>
      {statusBadge && <div className="relative z-10 self-center shrink-0">{statusBadge}</div>}
    </div>
  );
}

/**
 * MECANISMO ÚNICO de full-bleed do cabeçalho grudado — IDÊNTICO nos 3 contextos
 * (OS normal, visita PMOC e RELATÓRIO). NENHUM contexto usa mais margem negativa
 * nem `overflow-hidden`:
 *
 * Quando o cabeçalho gruda (stuck), o ITEM renderiza um FUNDO `position: fixed`
 * com `left-0 right-0` — que referenciam a VIEWPORT INTERNA (já EXCLUI a barra de
 * rolagem), diferente de `w-screen`/`100vw` (que inclui a calha e transbordava
 * ~scrollbar/2 de um lado e faltava do outro). Esse fundo é ancorado em
 * `top: stickyTopPx - 1` (cola 1px atrás do header laranja, z-20, fechando o vão
 * vertical) com ALTURA MEDIDA do cabeçalho (via `useStickyHeaderHeight` +
 * ResizeObserver), então cobre exatamente a barra sem vão nem sobra. O conteúdo
 * foto+texto fica no FLUXO da coluna (`relative z-10` no EquipmentChecklistHeader),
 * sempre POR CIMA do fundo e alinhado com os itens abaixo (sem colar na borda).
 *
 * A ÚNICA diferença entre contextos é a COR do fundo (`bgClass`): `bg-white` no
 * relatório/document (documento sempre claro) e `bg-card` no preenchimento/app
 * (segue o tema do usuário). O componente `<StickyFullBleedBg>` encapsula esse
 * fundo; o `useStickyHeaderHeight` encapsula a medição.
 */

/**
 * Mede a altura REAL do cabeçalho grudado (o `AccordionTrigger`, barra visível
 * incluindo `py-3`). Usada como `height` do fundo `fixed` — sem ela o fundo não
 * saberia até onde pintar. ResizeObserver remede a cada mudança de altura (quebra
 * de linha do nome/badge, fonte etc.). Retorna o ref pra plugar no trigger e a
 * altura medida (0 até a 1ª medição → o item suprime o fundo pra evitar flash 0px).
 */
export function useStickyHeaderHeight<T extends HTMLElement = HTMLButtonElement>() {
  const triggerRef = useRef<T | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const measure = () => setHeight(Math.ceil(el.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { triggerRef, height };
}

/**
 * Faz o FUNDO `fixed` do cabeçalho SEGUIR o topo REAL do cabeçalho sticky (em vez
 * de ficar travado em `stickyTopPx` e ligar/desligar por `isStuck`). Resolve a
 * janela TRANSPARENTE da SOLTURA: ao rolar passando do fim do equipamento, o
 * cabeçalho sticky ainda sobe ~headerHeight px antes de sair de vista, mas o
 * `isStuck` já virava false e apagava o fundo — sobrava o cabeçalho sem fundo
 * (conteúdo de trás vazando). Agora o fundo acompanha o cabeçalho linha a linha.
 *
 * Como funciona: num loop de scroll (throttle por `requestAnimationFrame`) lê
 * `triggerRef.getBoundingClientRect().top` (viewport-relative) e devolve:
 *  - `followTop` = topo atual do cabeçalho, com piso em `stickyTopPx` (quando o
 *    cabeçalho ainda NÃO grudou, fica abaixo da linha sticky — o fundo não deve
 *    descer com ele; só interessa do ponto fixado pra cima). Resultado:
 *      • Fixado (pinned): rect.top == stickyTopPx → fundo em stickyTopPx (igual antes).
 *      • Soltando: rect.top < stickyTopPx → o fundo SOBE junto (vai pra trás do
 *        header laranja z-20 que o tampa) → cabeçalho NUNCA fica transparente.
 *  - `visible` = o cabeçalho ainda ocupa a faixa do topo (rect.top + headerHeight
 *    > stickyTopPx) E está montado/medido. Some quando o item passou de vez
 *    (some o "tijolo branco") ou fechou.
 *
 * O listener é de `scroll` em CAPTURA no `window` (pega scroll de QUALQUER
 * ancestral que role — a página ou um container interno) + `resize`, e só roda
 * quando `enabled` (sticky ligado/aberto + altura medida). Limpa tudo no cleanup
 * (cancelAnimationFrame + removeEventListener) — nada de listener por item à toa.
 */
export function useFollowStickyTop(
  triggerRef: { current: HTMLElement | null },
  stickyTopPx: number,
  headerHeight: number,
  enabled: boolean,
) {
  const [followTop, setFollowTop] = useState(stickyTopPx);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setVisible(false);
      return;
    }
    let raf = 0;
    const compute = () => {
      raf = 0;
      const el = triggerRef.current;
      if (!el) {
        setVisible(false);
        return;
      }
      const rectTop = el.getBoundingClientRect().top;
      // Piso em stickyTopPx: antes de grudar o cabeçalho está ABAIXO da linha; o
      // fundo só interessa do ponto fixado pra cima (segue só na soltura).
      const top = Math.min(rectTop, stickyTopPx);
      // Visível APENAS quando o cabeçalho de fato ocupa a faixa do topo:
      //  - já alcançou/passou a linha de pin (rectTop <= stickyTopPx) — antes disso
      //    ele está em FLUXO, abaixo da linha, e pinta a própria área (sem fundo
      //    fixo, senão sobraria uma faixa branca solta no topo);
      //  - E ainda não saiu de vista por cima (rectTop + headerHeight > stickyTopPx).
      // O `+1`/`+0.5` de folga evita flicker sub-pixel no ponto exato de grudar.
      const onTop = rectTop <= stickyTopPx + 1 && rectTop + headerHeight > stickyTopPx + 0.5;
      setFollowTop(top);
      setVisible(onTop);
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', schedule);
    };
  }, [triggerRef, stickyTopPx, headerHeight, enabled]);

  return { followTop, visible };
}

/**
 * Fundo `position: fixed` do cabeçalho grudado (full-bleed da viewport interna).
 * Renderizado pelo ITEM enquanto o cabeçalho está com sticky HABILITADO (aberto) e
 * com altura já medida — a VISIBILIDADE é controlada por `visible` (= isStuck), NÃO
 * por montar/desmontar. Assim o fundo+sombra fazem FADE-IN ao grudar e FADE-OUT ao
 * desgrudar (`transition-opacity`), em vez de aparecer/sumir seco. `left-0 right-0`
 * exclui a barra de rolagem (sem erro de `100vw`); `top`/`height` colam no header
 * laranja e cobrem a barra exata. z baixo (`z-[5]`) → ATRÁS do conteúdo foto+texto
 * (`relative z-10`) e ABAIXO do laranja (z-20). `print:hidden` pra não quebrar PDF.
 *
 * Quando invisível: `opacity-0` + leve `-translate-y-1` (desce ao aparecer) +
 * `pointer-events-none` (não captura clique fantasma). O ITEM deve renderizar este
 * componente sempre que o cabeçalho estiver sticky/aberto e com altura medida, e só
 * alternar `visible` — montar/desmontar mataria a animação de saída.
 *
 * Só a COR muda por contexto: `bg-white` (relatório) vs `bg-card` (preenchimento).
 */
export function StickyFullBleedBg({
  top,
  height,
  bgClass,
  visible,
  roundedBottom = false,
  overlapTop = 0,
}: {
  /** Topo do fundo em px — passe `stickyTopPx - 1` (cola atrás do header laranja). */
  top: number;
  /** Altura medida do cabeçalho (de `useStickyHeaderHeight`). */
  height: number;
  /** Cor do fundo: 'bg-white' (document) ou 'bg-card' (app). */
  bgClass: 'bg-white' | 'bg-card';
  /**
   * Visível (= grudado/`isStuck`). true → fade-in (opacidade 100, translate 0);
   * false → fade-out (opacidade 0, leve translate pra cima, sem capturar clique).
   * Sempre montado enquanto sticky/aberto pra animar entrada E saída.
   */
  visible: boolean;
  /**
   * Arredonda as bordas INFERIORES do fundo grudado (`rounded-b-2xl`), espelhando
   * o header principal da tela (que tem `rounded-b-2xl`) — dá ao cabeçalho de
   * equipamento grudado a mesma cara de "drawer" ao colar no topo. `overflow-hidden`
   * recorta a sombra/cor exatamente nos cantos arredondados.
   */
  roundedBottom?: boolean;
  /**
   * Sobe o fundo `overlapTop` px ACIMA de `top` (e soma na altura), mantendo o
   * topo VISUAL do cabeçalho no mesmo lugar. Serve pra TUCAR o fundo ATRÁS do
   * header principal da tela (z-20 cobre este z-[5]) e preencher os CANTINHOS que
   * o `rounded-b-2xl` do header verde deixa expostos — sem esse preenchimento, a
   * cor escura da página (`bg-background`) vaza nos cantos formando um "vão preto"
   * entre o header verde e o cabeçalho branco do equipamento. Como o header da
   * tela está por cima (z-20), essa sobra só aparece NOS cantos arredondados,
   * pintando-os com a cor do cabeçalho (branco no relatório). 0 = comportamento
   * antigo (preenchimento/app, onde `bg-card` ≈ fundo da página e não há vão).
   */
  overlapTop?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'fixed left-0 right-0 z-[5] shadow-[0_4px_12px_rgba(0,0,0,0.12)] print:hidden',
        'transition-[opacity,transform] duration-200 ease-out',
        roundedBottom && 'rounded-b-2xl',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none',
        bgClass,
      )}
      style={{ top: top - overlapTop, height: height + overlapTop }}
    />
  );
}

/**
 * Classes do `AccordionTrigger` (botão) e do `<Header>` (wrapper sticky) — fonte
 * ÚNICA compartilhada entre TODOS os contextos (OS normal, PMOC e RELATÓRIO) pra
 * os cabeçalhos ficarem idênticos em estrutura. Hoje os 3 tones CONVERGEM: o
 * full-bleed do stuck é sempre o fundo `fixed` (ver `StickyFullBleedBg`), então o
 * trigger/header NUNCA têm margem negativa, `overflow-hidden`, cor ou sombra
 * próprias (senão pintariam/clipariam só a coluna, não as calhas). A cor do fundo
 * grudado vem do `StickyFullBleedBg` do item, divergindo só na paleta (`tone`).
 *
 * Fora do stuck mantém o card arredondado. `print:` deixa o header estático e sem
 * sombra (saída de PDF/impressão).
 */
export function equipmentChecklistHeaderClasses(
  stickyOn: boolean,
  isStuck: boolean,
  _tone: EquipmentChecklistTone = 'app',
) {
  return {
    trigger: cn(
      'hover:no-underline py-3 gap-2 min-w-0',
      // Não-stuck: arredonda o card pra combinar com os cantos do cabeçalho.
      stickyOn && !isStuck && 'rounded-lg',
    ),
    // Sticky no WRAPPER (Header). z-10 < z-20 do header da tela (laranja), que
    // sempre fica ACIMA. A cor/sombra/full-bleed do stuck vivem no fundo `fixed`
    // do item (StickyFullBleedBg), então o Header fica "transparente" e SEM
    // overflow-hidden (pra não clipar a foto nem o bleed). PDF/Imprimir: estático.
    header: cn(
      stickyOn && 'sticky z-10 print:static print:shadow-none transition-shadow',
      // Fora do stuck mantém cantos arredondados pro visual de card.
      stickyOn && !isStuck && 'rounded-lg',
    ),
  };
}
