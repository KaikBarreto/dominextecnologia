import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ServiceTypesPanel } from '@/components/service-orders/ServiceTypesPanel';
import { TaskTypesPanel } from '@/components/service-orders/TaskTypesPanel';
import { ChecklistsPanel } from '@/components/service-orders/ChecklistsPanel';
import { SettingsSidebarLayout } from '@/components/SettingsSidebarLayout';
import { Settings, FileText, CheckSquare, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

export default function ServicesPage() {
  const { locale } = useAppLocaleContext();
  const sp = MESSAGES[locale].app.os.servicePage;
  const tabs = [
    { value: 'types', label: sp.tabTypes, icon: Settings },
    { value: 'task-types', label: sp.tabTaskTypes, icon: CheckSquare },
    { value: 'checklists', label: sp.tabChecklists, icon: FileText },
  ];
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTabState] = useState(() => {
    const rawTab = searchParams.get('tab');
    // Back-compat: link antigo ?tab=questionnaires vira a aba checklists.
    const tabFromUrl = rawTab === 'questionnaires' ? 'checklists' : rawTab;
    return tabFromUrl && tabs.some(t => t.value === tabFromUrl) ? tabFromUrl : 'types';
  });
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
      <MobilePageHeader
        title={sp.pageTitle}
        subtitle={sp.pageSubtitle}
        icon={Briefcase}
      />

      <SettingsSidebarLayout
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {activeTab === 'types' && <ServiceTypesPanel />}
        {activeTab === 'task-types' && <TaskTypesPanel />}
        {activeTab === 'checklists' && <ChecklistsPanel />}
      </SettingsSidebarLayout>
    </div>
  );
}
