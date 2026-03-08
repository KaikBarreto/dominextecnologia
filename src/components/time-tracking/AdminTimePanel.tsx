import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TimeToday } from './TimeToday';
import { TimeHistory } from './TimeHistory';
import { TimeReport } from './TimeReport';
import { TimeSettingsPanel } from './TimeSettings';
import { CalendarClock, History, BarChart3, Settings2 } from 'lucide-react';

export function AdminTimePanel() {
  const [tab, setTab] = useState('today');

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-lg h-auto">
          <TabsTrigger value="today" className="gap-1.5 text-xs sm:text-sm">
            <CalendarClock className="h-4 w-4 hidden sm:block" /> Hoje
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
            <History className="h-4 w-4 hidden sm:block" /> Histórico
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5 text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4 hidden sm:block" /> Relatório
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
            <Settings2 className="h-4 w-4 hidden sm:block" /> Config
          </TabsTrigger>
        </TabsList>
        <TabsContent value="today"><TimeToday /></TabsContent>
        <TabsContent value="history"><TimeHistory /></TabsContent>
        <TabsContent value="report"><TimeReport /></TabsContent>
        <TabsContent value="settings"><TimeSettingsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
