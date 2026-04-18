import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ServiceTypesPanel } from '@/components/service-orders/ServiceTypesPanel';
import { TaskTypesPanel } from '@/components/service-orders/TaskTypesPanel';
import { QuestionnairesPanel } from '@/components/service-orders/QuestionnairesPanel';
import { SettingsSidebarLayout } from '@/components/SettingsSidebarLayout';
import { Settings, FileText, CheckSquare } from 'lucide-react';

const tabs = [
  { value: 'types', label: 'Tipos de Serviços', icon: Settings },
  { value: 'task-types', label: 'Tipos de Tarefas', icon: CheckSquare },
  { value: 'questionnaires', label: 'Questionários', icon: FileText },
];

export default function ServicesPage() {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Serviços</h1>
        <p className="text-muted-foreground">Configure os tipos de serviços, tarefas e questionários</p>
      </div>

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
