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
}

interface SettingsSidebarLayoutProps {
  tabs: SettingsTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
  /** Conteúdo fixo no rodapé do sidebar (ex: botões "Nova Conta"/"Novo Cartão"). Só no desktop. */
  sidebarFooter?: React.ReactNode;
}

export function SettingsSidebarLayout({
  tabs,
  activeTab,
  onTabChange,
  children,
  sidebarFooter,
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

  if (isMobile) {
    // Mobile: segmented control via MobilePillTabs (grupos achatados).
    return (
      <div className="space-y-4">
        <MobilePillTabs
          tabs={tabs.map((t) => ({ value: t.value, label: t.label, icon: <t.icon className="h-4 w-4 shrink-0" />, sublabel: t.mobileSublabel ?? t.sublabel }))}
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

                  return (
                    <div
                      key={tab.value}
                      className={cn(
                        "group/tab relative w-full flex items-center gap-3 px-3 py-2 text-[13px] font-normal rounded-lg transition-all duration-200 text-left cursor-pointer",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm font-medium"
                          : "text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:font-medium"
                      )}
                      onClick={() => onTabChange(tab.value)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTabChange(tab.value); } }}
                    >
                      <IconComponent className="h-4 w-4 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate">{tab.label}</span>
                        {tab.sublabel && (
                          <span
                            className={cn(
                              "block truncate text-[11px] leading-tight tabular-nums",
                              isActive ? "text-primary-foreground/80" : "text-muted-foreground/80 group-hover/tab:text-primary-foreground/80"
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
