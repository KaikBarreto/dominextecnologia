import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
}

/** Converte hex (#RRGGBB) em `r, g, b`. Fallback: null (cai no padrão primary). */
function hexToRgbTriplet(hex?: string): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

interface MobilePillTabsProps {
  tabs: PillTab[];
  activeTab: string;
  onTabChange: (value: string) => void;
  className?: string;
}

/**
 * Segmented control horizontal scrollável pra trocar de aba no mobile.
 * Pills snap-x com gradient fade nas bordas. Visual app nativo.
 */
export function MobilePillTabs({ tabs, activeTab, onTabChange, className }: MobilePillTabsProps) {
  return (
    <div className={cn('relative -mx-3', className)}>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-3 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-3 bg-gradient-to-l from-background to-transparent" />
      <div className="flex gap-1.5 overflow-x-auto px-3 pb-1 snap-x scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.value;
          const rgb = hexToRgbTriplet(tab.accentColor);
          const accented = !!rgb;

          // Pill com cor própria (conta financeira): ativo = fundo translúcido
          // da cor + texto/ícone na cor + borda sutil. Inativo segue o muted.
          // Sem cor → mantém o padrão primary.
          const accentStyle: React.CSSProperties = accented
            ? isActive
              ? { backgroundColor: `rgba(${rgb}, 0.16)`, color: `rgb(${rgb})`, boxShadow: `inset 0 0 0 1px rgba(${rgb}, 0.4)` }
              : {}
            : {};

          return (
            <button
              key={tab.value}
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
                  className={cn(
                    'whitespace-nowrap text-xs font-semibold tabular-nums',
                    accented
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
