import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePillTabs } from "@/components/mobile/MobilePillTabs";

export interface SettingsTab {
  value: string;
  label: string;
  icon: LucideIcon;
  group?: string;
  /** Texto menor abaixo do label (ex: saldo da conta). Desktop. */
  sublabel?: string;
  /** Versão compacta do sublabel pra pill no mobile (fallback: sublabel). */
  mobileSublabel?: string;
  /** Slot à direita da aba (ex: menu de 3 pontinhos). Só no desktop; aparece no hover/active. */
  rightElement?: React.ReactNode;
  /**
   * Cor própria da aba (ex: cor da conta financeira). Quando presente, o ativo
   * e o hover usam essa cor de forma SUTIL (fundo translúcido + texto/indicador
   * na cor) em vez do primary. Opt-in: abas sem `accentColor` seguem o padrão.
   */
  accentColor?: string;
  /**
   * Quando true (e com `accentColor`), o ativo/hover usa o estilo do EcoSistema:
   * fundo SATURADO na cor da conta + texto e ícone BRANCOS. Opt-in — sem isso,
   * `accentColor` mantém o estilo sutil e abas sem cor mantêm o primary.
   */
  useColorBackground?: boolean;
}

/** Converte hex (#RRGGBB) em `r, g, b` pra usar em rgba(). Fallback: null. */
function hexToRgbTriplet(hex?: string): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

interface SettingsSidebarLayoutProps {
  tabs: SettingsTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
  /** Conteúdo fixo no rodapé do sidebar (ex: botões "Nova Conta"/"Novo Cartão"). Só no desktop. */
  sidebarFooter?: React.ReactNode;
  /**
   * Conteúdo renderizado logo ABAIXO do último item de um grupo (chave = nome do
   * grupo). Ex: botão "+ Nova Conta" ao fim do grupo "Contas Bancárias". Só no
   * desktop. Opt-in — grupos sem entrada aqui não mudam.
   */
  groupFooters?: Record<string, React.ReactNode>;
  /**
   * Nomes de grupos que devem aparecer SEMPRE no sidebar, mesmo sem nenhuma aba
   * (ex: o grupo "Cartões" precisa exibir seu rótulo + footer "+ Novo Cartão"
   * ainda que o tenant não tenha cartão). Grupos ausentes são anexados ao fim,
   * na ordem da prop, com `items` vazio (renderiza só o rótulo + groupFooters).
   * Só no desktop. Opt-in — sem a prop, o layout se comporta como antes.
   */
  placeholderGroups?: string[];
}

export function SettingsSidebarLayout({
  tabs,
  activeTab,
  onTabChange,
  children,
  sidebarFooter,
  groupFooters,
  placeholderGroups,
}: SettingsSidebarLayoutProps) {
  const isMobile = useIsMobile();

  const groupedTabs = tabs.reduce<{ group: string; items: SettingsTab[] }[]>((acc, tab) => {
    const groupName = tab.group || '';
    const existing = acc.find(g => g.group === groupName);
    if (existing) {
      existing.items.push(tab);
    } else {
      acc.push({ group: groupName, items: [tab] });
    }
    return acc;
  }, []);

  // Grupos placeholder (opt-in): garante que rótulo + footer de um grupo apareçam
  // mesmo sem nenhuma aba. Anexa ao fim, na ordem da prop, só os ausentes.
  if (placeholderGroups) {
    for (const name of placeholderGroups) {
      if (!groupedTabs.some(g => g.group === name)) {
        groupedTabs.push({ group: name, items: [] });
      }
    }
  }

  if (isMobile) {
    // Mobile: segmented control via MobilePillTabs (grupos achatados).
    return (
      <div className="space-y-4">
        <MobilePillTabs
          tabs={tabs.map((t) => ({ value: t.value, label: t.label, icon: <t.icon className="h-4 w-4 shrink-0" />, sublabel: t.mobileSublabel ?? t.sublabel, accentColor: t.accentColor }))}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
        <div>{children}</div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 min-h-[600px]">
      <nav className="w-56 flex-shrink-0">
        <div className="sticky top-6 space-y-4">
          {groupedTabs.map((group, gi) => (
            <div key={group.group || gi}>
              {group.group && (
                <p className="px-3 mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.group}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((tab) => {
                  const IconComponent = tab.icon;
                  const isActive = activeTab === tab.value;
                  const rgb = hexToRgbTriplet(tab.accentColor);
                  const accented = !!rgb;
                  // EcoSistema style (opt-in): ativo/hover = fundo SATURADO na cor
                  // da conta + texto/ícone BRANCOS. Sem `useColorBackground`,
                  // `accentColor` segue o estilo sutil de sempre.
                  const colorBg = accented && !!tab.useColorBackground;

                  // Estilo da aba acentuada:
                  // - colorBg (saturado): ativo = bg cheio + branco; hover via classes.
                  // - sutil: ativo = bg translúcido + texto na cor; hover bem leve.
                  // - sem cor: primary de sempre.
                  const accentStyle: React.CSSProperties = colorBg
                    ? ({
                        ['--tab-accent' as any]: `rgb(${rgb})`,
                        backgroundColor: isActive ? `rgb(${rgb})` : undefined,
                        color: isActive ? '#fff' : undefined,
                      } as React.CSSProperties)
                    : accented
                    ? ({
                        ['--tab-accent' as any]: `rgb(${rgb})`,
                        ['--tab-accent-active-bg' as any]: `rgba(${rgb}, 0.16)`,
                        ['--tab-accent-hover-bg' as any]: `rgba(${rgb}, 0.08)`,
                        backgroundColor: isActive ? `rgba(${rgb}, 0.16)` : undefined,
                        color: isActive ? `rgb(${rgb})` : undefined,
                      } as React.CSSProperties)
                    : {};

                  return (
                    <div
                      key={tab.value}
                      style={accentStyle}
                      className={cn(
                        "group/tab relative w-full flex items-center gap-3 px-3 py-2 text-[13px] font-normal rounded-lg transition-all duration-200 text-left cursor-pointer",
                        colorBg
                          ? isActive
                            ? "font-medium shadow-sm"
                            : "text-muted-foreground hover:font-medium hover:[background-color:var(--tab-accent)] hover:text-white"
                          : accented
                          ? isActive
                            ? "font-medium shadow-sm"
                            : "text-muted-foreground hover:font-medium hover:[background-color:var(--tab-accent-hover-bg)] hover:[color:var(--tab-accent)]"
                          : isActive
                          ? "bg-primary text-primary-foreground shadow-sm font-medium"
                          : "text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:font-medium"
                      )}
                      onClick={() => onTabChange(tab.value)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTabChange(tab.value); } }}
                    >
                      {/* Indicador vertical na cor da conta (só no estilo sutil). */}
                      {accented && !colorBg && isActive && (
                        <span
                          className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full"
                          style={{ backgroundColor: `rgb(${rgb})` }}
                        />
                      )}
                      <IconComponent className="h-4 w-4 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate">{tab.label}</span>
                        {tab.sublabel && (
                          <span
                            className={cn(
                              "block truncate text-[11px] leading-tight tabular-nums",
                              colorBg
                                ? isActive ? "text-white/90" : "text-muted-foreground/80 group-hover/tab:text-white/90"
                                : accented
                                ? isActive ? "opacity-80" : "text-muted-foreground/80"
                                : isActive ? "text-primary-foreground/80" : "text-muted-foreground/80 group-hover/tab:text-primary-foreground/80"
                            )}
                          >
                            {tab.sublabel}
                          </span>
                        )}
                      </div>
                      {tab.rightElement && (
                        <div
                          className={cn(
                            "flex-shrink-0 transition-opacity",
                            isActive ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100"
                          )}
                        >
                          {tab.rightElement}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Footer do grupo (ex: "+ Nova Conta" ao fim das Contas Bancárias). */}
                {groupFooters?.[group.group] && (
                  <div className="pt-1">{groupFooters[group.group]}</div>
                )}
              </div>
            </div>
          ))}
          {sidebarFooter && <div className="pt-1">{sidebarFooter}</div>}
        </div>
      </nav>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
