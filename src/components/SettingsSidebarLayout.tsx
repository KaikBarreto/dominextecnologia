import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export interface SettingsTab {
  value: string;
  label: string;
  icon: LucideIcon;
  group?: string;
}

interface SettingsSidebarLayoutProps {
  tabs: SettingsTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

export function SettingsSidebarLayout({
  tabs,
  activeTab,
  onTabChange,
  children,
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
    // Mobile: segmented control horizontal rolável (estilo app nativo).
    // Grupos são ignorados visualmente — todas as tabs viram pills numa linha.
    return (
      <div className="space-y-4">
        <div className="relative -mx-3">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-3 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-3 bg-gradient-to-l from-background to-transparent" />
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-1 snap-x scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab) => {
              const IconComponent = tab.icon;
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => onTabChange(tab.value)}
                  className={cn(
                    'snap-start shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium transition-all active:scale-95',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted active:bg-muted',
                  )}
                >
                  <IconComponent className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
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
                    <button
                      key={tab.value}
                      onClick={() => onTabChange(tab.value)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-[13px] font-normal rounded-lg transition-all duration-200 text-left",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm font-medium"
                          : "text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:font-medium"
                      )}
                    >
                      <IconComponent className="h-4 w-4 flex-shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
