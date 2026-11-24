import { type ReactNode } from 'react';
import { HorizontalTabBar } from '@/components/ui/HorizontalTabBar';
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
  /** Mantém o texto branco em fundos saturados, mesmo quando a cor é clara. */
  forceWhiteForeground?: boolean;
}

interface MobilePillTabsProps {
  tabs: PillTab[];
  activeTab: string;
  onTabChange: (value: string) => void;
  className?: string;
  /** Navegacao usa linha inferior; seletores compactos mantem pills segmentadas. */
  variant?: 'segmented' | 'underline';
  /**
   * Hierarquia da navegação (só muda o `underline`):
   * - `screen`: abas da TELA (ex.: Clientes | Fornecedores). Maiores e em
   *   negrito, porque mandam no que a página inteira mostra.
   * - `section` (padrão): subabas e abas de uma ficha (ex.: Geral |
   *   Equipamentos | Histórico do cliente). Mais leves, ficam abaixo na
   *   hierarquia visual.
   */
  level?: 'screen' | 'section';
  /**
   * Sufixo renderizado à direita do label de cada pill, dentro do container da
   * pill mas FORA do elemento clicável principal. Usar para ícones de ação
   * (ex: engrenagem de configuração) sem aninhar <button> dentro de <button>.
   * O ReactNode recebido deve ser um elemento interativo não-button
   * (ex: <span role="button" tabIndex={0}>).
   */
  renderSuffix?: (tab: PillTab, isActive: boolean) => ReactNode;
  /**
   * Conteúdo preso à DIREITA da barra (ex.: ações da tela). Fica na mesma
   * linha das abas, aproveitando a faixa em vez de gastar outra linha.
   * Só no `underline`: a pill segmentada é seletor compacto e não comporta.
   */
  actions?: ReactNode;
}

/**
 * Navegação horizontal compartilhada com setas clicáveis quando há overflow.
 *
 * A aba ativa é revelada sem rolar a página; toque e teclado são preservados.
 */
export function MobilePillTabs({ tabs, activeTab, onTabChange, className, variant = 'segmented', level = 'section', renderSuffix, actions }: MobilePillTabsProps) {
  // Tamanho/peso da aba por hierarquia. Só vale no underline: as pills
  // segmentadas são seletores compactos e não entram nessa régua.
  const alturaEPeso =
    variant === 'underline' && level === 'screen'
      ? 'min-h-11 py-2 text-[15px] font-semibold'
      : variant === 'underline' ? 'min-h-11 py-2 text-sm font-medium' : 'h-9 text-sm font-medium';
  const comAcoes = variant === 'underline' && !!actions;
  const barra = (
    <HorizontalTabBar
      wrapTabs={variant === 'underline'}
      className={cn(comAcoes ? 'min-w-0 flex-1' : className)}
      viewportProps={{ role: 'tablist', 'aria-label': 'Abas. Deslize ou use as setas para ver mais opções.', onKeyDown: event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !(event.target as HTMLElement).closest('[role=tab]')) return;
        event.preventDefault();
        const index = tabs.findIndex(tab => tab.value === activeTab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        if (tabs[next]) { onTabChange(tabs[next].value); event.currentTarget.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus(); }
      } }}
      viewportClassName={cn(
        'flex snap-x snap-proximity',
        variant === 'underline' ? 'items-end gap-1 border-b border-border' : 'gap-1.5 pb-1',
      )}
    >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.value;
          const rgb = hexToRgbTriplet(tab.accentColor);
          const accented = !!rgb;
          // SATURADO (opt-in): com cor + useColorBackground, o ativo fica com a
          // cor cheia de fundo + texto contrastante (igual ao card da conta e ao
          // sidebar do desktop). Sem isso, accentColor mantém o estilo sutil.
          const colorBg = accented && !!tab.useColorBackground;
          const saturatedForeground = tab.forceWhiteForeground
            ? '#ffffff'
            : idealForeground(tab.accentColor);

          // Pill com cor própria (conta financeira):
          // - colorBg + ativo → fundo SATURADO na cor + texto via idealForeground.
          // - sutil + ativo → fundo translúcido da cor + texto na cor + borda.
          // - inativo → muted; sem cor → padrão primary.
          // No estilo sutil, a cor de texto é a própria cor da conta, EXCETO
          // quando muito clara (ex: #ffffff) — aí cai no token escuro pra não
          // sumir sobre o fundo translúcido claro.
          const pillTextColor = idealForeground(tab.accentColor) === '#0f172a' ? '#0f172a' : `rgb(${rgb})`;
          const segmentedAccentStyle: React.CSSProperties = colorBg
            ? isActive
              ? { backgroundColor: `rgb(${rgb})`, color: saturatedForeground }
              : {}
            : accented
            ? isActive
              ? { backgroundColor: `rgba(${rgb}, 0.16)`, color: pillTextColor, boxShadow: `inset 0 0 0 1px rgba(${rgb}, 0.4)` }
              : {}
            : {};
          const accentStyle: React.CSSProperties = variant === 'underline'
            ? tab.accentColor && isActive
              ? { borderColor: tab.accentColor, color: tab.accentColor }
              : {}
            : segmentedAccentStyle;

          const suffix = renderSuffix ? renderSuffix(tab, isActive) : null;

          // Quando há sufixo, a pill é um <div> container para evitar button-in-button.
          // A área clicável de troca de aba fica num <span role="tab"> e o sufixo
          // é irmão separado dentro do container.
          if (suffix) {
            return (
              <div
                key={tab.value}
                data-tab-item=""
                style={accentStyle}
                className={cn(
                  'snap-start shrink-0 inline-flex items-center transition-colors',
                  alturaEPeso,
                  variant === 'underline' && level === 'screen' && isActive && 'font-bold',
                  variant === 'underline'
                    ? cn(
                        '-mb-px rounded-none border-b-2 bg-transparent shadow-none',
                        isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                      )
                    : accented
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
                  className={cn(
                    'inline-flex items-center gap-1.5 h-full cursor-pointer select-none active:scale-95',
                    variant === 'underline' ? 'pl-4 pr-2' : 'pl-3.5 pr-1.5',
                  )}
                >
                  {tab.icon}
                  <span className="whitespace-nowrap">{tab.label}</span>
                  {tab.sublabel && (
                    <span
                      style={colorBg && isActive ? { opacity: 0.85 } : undefined}
                      className={cn(
                        'whitespace-nowrap text-xs font-semibold tabular-nums',
                        variant === 'underline'
                          ? isActive ? 'text-current opacity-80' : 'text-muted-foreground/70'
                          : colorBg
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
                <span className={cn('flex items-center', variant === 'underline' ? 'pr-2' : 'pr-1.5')}>
                  {suffix}
                </span>
              </div>
            );
          }

          return (
            <button
              key={tab.value}

              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.value)}
              style={accentStyle}
              className={cn(
                'snap-start shrink-0 inline-flex items-center gap-1.5 transition-colors active:scale-95 focus:outline-none focus-visible:bg-muted/60',
                alturaEPeso,
                variant === 'underline' && level === 'screen' && isActive && 'font-bold',
                variant === 'underline'
                  ? cn(
                      '-mb-px rounded-none border-b-2 bg-transparent px-4 shadow-none',
                      isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                    )
                  : cn(
                    'rounded-full px-3.5',
                    accented
                  ? isActive
                    ? 'shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted active:bg-muted'
                  : isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted active:bg-muted',
                  ),
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
                    variant === 'underline'
                      ? isActive ? 'text-current opacity-80' : 'text-muted-foreground/70'
                      : colorBg
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
    </HorizontalTabBar>
  );

  if (!comAcoes) return barra;

  // A linha inteira ganha a borda; a barra de abas perde a dela pra não
  // desenhar duas linhas sobrepostas de comprimentos diferentes.
  return (
    <div className={cn('flex flex-col gap-2 border-b border-border sm:flex-row sm:items-end sm:gap-3', className)}>
      <div className="min-w-0 flex-1 [&_[role=tablist]]:border-b-0">{barra}</div>
      <div className="flex shrink-0 justify-end pb-1.5">{actions}</div>
    </div>
  );
}
