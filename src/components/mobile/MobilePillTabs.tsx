import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { hexToRgbTriplet, idealForeground } from '@/lib/colorContrast';

export interface PillTab {
  value: string;
  label: string;
  icon?: ReactNode;
  /** Texto menor à direita do label (ex: saldo/fatura da conta). */
  sublabel?: string;
  /**
   * Cor própria da pill (ex: cor da conta financeira). Quando presente, ativo
   * e hover usam essa cor de forma SUTIL. Opt-in: pills sem `accentColor`
   * seguem o padrão primary.
   */
  accentColor?: string;
  /**
   * Quando true (e com `accentColor`), o pill ATIVO usa a cor SATURADA da conta
   * como fundo + texto contrastante (igual ao card-herói da conta e ao sidebar
   * do desktop). Opt-in: sem isso, `accentColor` mantém o estilo translúcido
   * sutil; pills sem cor mantêm o padrão primary.
   */
  useColorBackground?: boolean;
}

interface MobilePillTabsProps {
  tabs: PillTab[];
  activeTab: string;
  onTabChange: (value: string) => void;
  className?: string;
  /**
   * Sufixo renderizado à direita do label de cada pill, dentro do container da
   * pill mas FORA do elemento clicável principal. Usar para ícones de ação
   * (ex: engrenagem de configuração) sem aninhar <button> dentro de <button>.
   * O ReactNode recebido deve ser um elemento interativo não-button
   * (ex: <span role="button" tabIndex={0}>).
   */
  renderSuffix?: (tab: PillTab, isActive: boolean) => ReactNode;
}

/**
 * Segmented control horizontal scrollável pra trocar de aba no mobile.
 * Pills snap-x com gradient fade nas bordas via mask-image (superfície-agnóstico).
 * Visual app nativo.
 *
 * Comportamento de scroll:
 * - Ancora à esquerda por default (scrollLeft = 0 ao montar).
 * - Ao trocar de aba, rola apenas o suficiente para revelar a pill ativa se ela
 *   estiver além da borda direita — nunca corta a borda esquerda.
 * - Fade esquerdo aparece só quando há conteúdo rolado para a esquerda.
 * - Fade direito aparece só quando há conteúdo além da borda direita.
 * - Ambos os fades usam mask-image (funciona sobre qualquer superfície: tela, modal, card).
 */
export function MobilePillTabs({ tabs, activeTab, onTabChange, className, renderSuffix }: MobilePillTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeDivRef = useRef<HTMLDivElement>(null);
  const activeButtonRef = useRef<HTMLButtonElement>(null);

  // Visibilidade dinâmica dos fades: esquerdo = há scroll à esquerda; direito = há scroll à direita.
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  /** Recalcula quais fades devem aparecer com base na posição atual de scroll. */
  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, clientWidth, scrollWidth } = el;
    setShowLeft(scrollLeft > 1);
    setShowRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  // Listener de scroll e resize para atualizar fades dinamicamente.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', updateFades, { passive: true });
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);

    // Cálculo inicial após montagem.
    updateFades();

    return () => {
      el.removeEventListener('scroll', updateFades);
      ro.disconnect();
    };
  }, [updateFades]);

  // Recalcula fades quando a lista de tabs muda (ex: abas carregadas assincronamente).
  useEffect(() => {
    updateFades();
  }, [tabs, updateFades]);

  // Ao trocar de aba: ancora à esquerda na primeira montagem (scroll = 0).
  // Nas trocas subsequentes, rola só se a pill ativa estiver ALÉM da borda direita.
  // Nunca usa scrollIntoView com inline: 'center' para não cortar a borda esquerda.
  useEffect(() => {
    const container = scrollRef.current;
    const activeEl = activeDivRef.current ?? activeButtonRef.current;
    if (!container || !activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    const activeRight = activeRect.right - containerRect.left + container.scrollLeft;
    const activeLeft = activeRect.left - containerRect.left + container.scrollLeft;

    if (activeLeft < container.scrollLeft) {
      // Pill ativa está à esquerda da vista — revelar com margem mínima.
      container.scrollTo({ left: Math.max(0, activeLeft - 12), behavior: 'smooth' });
    } else if (activeRight > container.scrollLeft + container.clientWidth) {
      // Pill ativa está além da borda direita — revelar com margem mínima.
      container.scrollTo({
        left: activeRight - container.clientWidth + 12,
        behavior: 'smooth',
      });
    }
    // Caso contrário (pill visível), não mexe no scroll — preserva a âncora atual.
  }, [activeTab]);

  // Máscara CSS superfície-agnóstica: transparente nas bordas com conteúdo rolável,
  // opaca no centro. Aplicada dinamicamente conforme a posição de scroll.
  // Usa a combinação dos dois fades: esquerdo e/ou direito, quando necessário.
  const maskStyle: React.CSSProperties = (() => {
    if (showLeft && showRight) {
      return {
        WebkitMaskImage:
          'linear-gradient(to right, transparent 0, black 24px, black calc(100% - 24px), transparent 100%)',
        maskImage:
          'linear-gradient(to right, transparent 0, black 24px, black calc(100% - 24px), transparent 100%)',
      };
    }
    if (showLeft) {
      return {
        WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 24px)',
        maskImage: 'linear-gradient(to right, transparent 0, black 24px)',
      };
    }
    if (showRight) {
      return {
        WebkitMaskImage: 'linear-gradient(to left, transparent 0, black 24px)',
        maskImage: 'linear-gradient(to left, transparent 0, black 24px)',
      };
    }
    return {};
  })();

  return (
    <div className={cn('relative -mx-3', className)}>
      <div
        ref={scrollRef}
        style={maskStyle}
        className="flex gap-1.5 overflow-x-auto px-3 pb-1 snap-x scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-[mask-image] duration-200"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.value;
          const rgb = hexToRgbTriplet(tab.accentColor);
          const accented = !!rgb;
          // SATURADO (opt-in): com cor + useColorBackground, o ativo fica com a
          // cor cheia de fundo + texto contrastante (igual ao card da conta e ao
          // sidebar do desktop). Sem isso, accentColor mantém o estilo sutil.
          const colorBg = accented && !!tab.useColorBackground;

          // Pill com cor própria (conta financeira):
          // - colorBg + ativo → fundo SATURADO na cor + texto via idealForeground.
          // - sutil + ativo → fundo translúcido da cor + texto na cor + borda.
          // - inativo → muted; sem cor → padrão primary.
          // No estilo sutil, a cor de texto é a própria cor da conta, EXCETO
          // quando muito clara (ex: #ffffff) — aí cai no token escuro pra não
          // sumir sobre o fundo translúcido claro.
          const pillTextColor = idealForeground(tab.accentColor) === '#0f172a' ? '#0f172a' : `rgb(${rgb})`;
          const accentStyle: React.CSSProperties = colorBg
            ? isActive
              ? { backgroundColor: `rgb(${rgb})`, color: idealForeground(tab.accentColor) }
              : {}
            : accented
            ? isActive
              ? { backgroundColor: `rgba(${rgb}, 0.16)`, color: pillTextColor, boxShadow: `inset 0 0 0 1px rgba(${rgb}, 0.4)` }
              : {}
            : {};

          const suffix = renderSuffix ? renderSuffix(tab, isActive) : null;

          // Quando há sufixo, a pill é um <div> container para evitar button-in-button.
          // A área clicável de troca de aba fica num <span role="tab"> e o sufixo
          // é irmão separado dentro do container.
          if (suffix) {
            return (
              <div
                key={tab.value}
                ref={isActive ? activeDivRef : undefined}
                style={accentStyle}
                className={cn(
                  'snap-start shrink-0 inline-flex items-center rounded-full text-sm font-medium transition-all',
                  accented
                    ? isActive
                      ? 'shadow-sm'
                      : 'bg-muted/50 text-muted-foreground'
                    : isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground',
                )}
              >
                {/* Área clicável de troca de aba */}
                <span
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={0}
                  onClick={() => onTabChange(tab.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTabChange(tab.value); } }}
                  className="inline-flex items-center gap-1.5 h-9 pl-3.5 pr-1.5 cursor-pointer select-none active:scale-95"
                >
                  {tab.icon}
                  <span className="whitespace-nowrap">{tab.label}</span>
                  {tab.sublabel && (
                    <span
                      style={colorBg && isActive ? { opacity: 0.85 } : undefined}
                      className={cn(
                        'whitespace-nowrap text-xs font-semibold tabular-nums',
                        colorBg
                          ? isActive ? '' : 'text-muted-foreground/70'
                          : accented
                          ? isActive ? 'opacity-80' : 'text-muted-foreground/70'
                          : isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/70',
                      )}
                    >
                      {tab.sublabel}
                    </span>
                  )}
                </span>
                {/* Sufixo: elemento interativo irmão, não filho de button */}
                <span className="flex items-center pr-1.5">
                  {suffix}
                </span>
              </div>
            );
          }

          return (
            <button
              key={tab.value}
              ref={isActive ? activeButtonRef : undefined}
              type="button"
              onClick={() => onTabChange(tab.value)}
              style={accentStyle}
              className={cn(
                'snap-start shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium transition-all active:scale-95',
                accented
                  ? isActive
                    ? 'shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted active:bg-muted'
                  : isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted active:bg-muted',
              )}
            >
              {tab.icon}
              <span className="whitespace-nowrap">{tab.label}</span>
              {tab.sublabel && (
                <span
                  // No estilo saturado, o sublabel herda a cor contrastante do pai
                  // (via currentColor) e só aplica opacidade — sem cor hardcoded.
                  style={colorBg && isActive ? { opacity: 0.85 } : undefined}
                  className={cn(
                    'whitespace-nowrap text-xs font-semibold tabular-nums',
                    colorBg
                      ? isActive ? '' : 'text-muted-foreground/70'
                      : accented
                      ? isActive ? 'opacity-80' : 'text-muted-foreground/70'
                      : isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/70',
                  )}
                >
                  {tab.sublabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
