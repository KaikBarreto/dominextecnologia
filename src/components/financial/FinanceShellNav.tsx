// Navegação responsiva do shell do Financeiro.
//
// Desktop: rail vertical à esquerda com border-l-2 destacando o ativo (padrão
// inspirado em Notion/Vercel, replicado do PmocContractSidebar em ContractDetail).
// Mobile: pill tabs scrolláveis no topo (MobilePillTabs do projeto).
//
// Filtra abas por permissão via prop — quem chama decide o que mostrar.
// v1.9.19.

import { ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';

export interface FinanceShellTab {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface Props {
  tabs: FinanceShellTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function FinanceShellNav({ tabs, activeTab, onTabChange }: Props) {
  const isMobile = useIsMobile();

  if (isMobile) {
    // Pills scrolláveis sticky no topo. MobilePillTabs já cuida do snap-x +
    // scrollbar oculta + visual ativo.
    return (
      <div className="sticky top-14 z-10 -mx-3 bg-background px-3 py-2 border-b">
        <MobilePillTabs
          tabs={tabs.map(t => ({ value: t.value, label: t.label }))}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      </div>
    );
  }

  // Desktop: rail vertical à esquerda. Item ativo com border-l-2 primary +
  // bg-primary/5 + texto primary semibold. Inativo com hover muted/40.
  return (
    <aside className="w-56 shrink-0 space-y-1 border-r pr-3">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onTabChange(tab.value)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md border-l-2 px-3 py-2 text-left text-sm transition-colors',
              active
                ? 'border-primary bg-primary/5 font-semibold text-primary'
                : 'border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{tab.label}</span>
          </button>
        );
      })}
    </aside>
  );
}
