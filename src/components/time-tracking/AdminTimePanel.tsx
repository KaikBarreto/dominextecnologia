import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { TimeToday } from './TimeToday';
import { TimeHistory } from './TimeHistory';
import { TimeReport } from './TimeReport';
import { TimeSettingsPanel } from './TimeSettings';
import { CalendarClock, History, BarChart3, Settings2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

export function AdminTimePanel() {
  const [tab, setTab] = useState('today');
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.timeclock.tabs;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        {isMobile ? (
          <MobilePillTabs
            tabs={[
              { value: 'today', label: t.today, icon: <CalendarClock className="h-4 w-4" /> },
              { value: 'history', label: t.history, icon: <History className="h-4 w-4" /> },
              { value: 'report', label: t.report, icon: <BarChart3 className="h-4 w-4" /> },
              { value: 'settings', label: t.settings, icon: <Settings2 className="h-4 w-4" /> },
            ]}
            activeTab={tab}
            onTabChange={setTab}
          />
        ) : (
          <TabsList className="grid w-full grid-cols-4 max-w-lg h-auto">
            <TabsTrigger value="today" className="gap-1.5 text-xs sm:text-sm">
              <CalendarClock className="h-4 w-4" /> {t.today}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
              <History className="h-4 w-4" /> {t.history}
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4" /> {t.report}
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
              <Settings2 className="h-4 w-4" /> {t.settings}
            </TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="today"><TimeToday /></TabsContent>
        <TabsContent value="history"><TimeHistory /></TabsContent>
        <TabsContent value="report"><TimeReport /></TabsContent>
        <TabsContent value="settings"><TimeSettingsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
