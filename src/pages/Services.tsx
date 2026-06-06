import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ServiceTypesPanel } from '@/components/service-orders/ServiceTypesPanel';
import { TaskTypesPanel } from '@/components/service-orders/TaskTypesPanel';
import { QuestionnairesPanel } from '@/components/service-orders/QuestionnairesPanel';
import { SettingsSidebarLayout } from '@/components/SettingsSidebarLayout';
import { Settings, FileText, CheckSquare, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';

const tabs = [
  { value: 'types', label: 'Tipos de Serviços', icon: Settings },
  { value: 'task-types', label: 'Tipos de Tarefas', icon: CheckSquare },
  { value: 'questionnaires', label: 'Checklists', icon: FileText },
];

export default function ServicesPage() {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTabState] = useState(() => {
    const tabFromUrl = searchParams.get('tab');
    return tabFromUrl && tabs.some(t => t.value === tabFromUrl) ? tabFromUrl : 'types';
  });
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
      <MobilePageHeader
        title="Serviços"
        subtitle="Configure os tipos de serviços, tarefas e checklists"
        icon={Briefcase}
      />

      <SettingsSidebarLayout
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {activeTab === 'types' && <ServiceTypesPanel />}
        {activeTab === 'task-types' && <TaskTypesPanel />}
        {activeTab === 'questionnaires' && <QuestionnairesPanel />}
      </SettingsSidebarLayout>
    </div>
  );
}
