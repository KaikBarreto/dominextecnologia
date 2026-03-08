import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    return (
      <div className="space-y-4">
        <Select value={activeTab} onValueChange={onTabChange}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {(() => {
                const currentTab = tabs.find(t => t.value === activeTab);
                if (currentTab) {
                  const IconComponent = currentTab.icon;
                  return (
                    <div className="flex items-center gap-2">
                      <IconComponent className="h-4 w-4" />
                      <span>{currentTab.label}</span>
                    </div>
                  );
                }
                return null;
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {groupedTabs.map((group) => (
              <div key={group.group}>
                {group.group && (
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.group}
                  </div>
                )}
                {group.items.map((tab) => {
                  const IconComponent = tab.icon;
                  return (
                    <SelectItem key={tab.value} value={tab.value}>
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-4 w-4" />
                        <span>{tab.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </div>
            ))}
          </SelectContent>
        </Select>
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
