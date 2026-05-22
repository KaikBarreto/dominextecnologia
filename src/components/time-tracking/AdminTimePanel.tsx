import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TimeToday } from './TimeToday';
import { TimeHistory } from './TimeHistory';
import { TimeReport } from './TimeReport';
import { TimeSettingsPanel } from './TimeSettings';
import { CalendarClock, History, BarChart3, Settings2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export function AdminTimePanel() {
  const [tab, setTab] = useState('today');
  const isMobile = useIsMobile();

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        {isMobile ? (
          // Mobile: tabs em pill scrolláveis horizontalmente, touch-friendly (44px alvo).
          <div className="-mx-3 px-3 overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="inline-flex w-auto h-11 gap-1 bg-muted/60 p-1 rounded-full">
              <TabsTrigger
                value="today"
                className={cn(
                  'gap-1.5 text-xs h-9 px-4 rounded-full whitespace-nowrap',
                  'data-[state=active]:bg-background data-[state=active]:shadow-sm'
                )}
              >
                <CalendarClock className="h-4 w-4" /> Hoje
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className={cn(
                  'gap-1.5 text-xs h-9 px-4 rounded-full whitespace-nowrap',
                  'data-[state=active]:bg-background data-[state=active]:shadow-sm'
                )}
              >
                <History className="h-4 w-4" /> Histórico
              </TabsTrigger>
              <TabsTrigger
                value="report"
                className={cn(
                  'gap-1.5 text-xs h-9 px-4 rounded-full whitespace-nowrap',
                  'data-[state=active]:bg-background data-[state=active]:shadow-sm'
                )}
              >
                <BarChart3 className="h-4 w-4" /> Relatório
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className={cn(
                  'gap-1.5 text-xs h-9 px-4 rounded-full whitespace-nowrap',
                  'data-[state=active]:bg-background data-[state=active]:shadow-sm'
                )}
              >
                <Settings2 className="h-4 w-4" /> Config
              </TabsTrigger>
            </TabsList>
          </div>
        ) : (
          <TabsList className="grid w-full grid-cols-4 max-w-lg h-auto">
            <TabsTrigger value="today" className="gap-1.5 text-xs sm:text-sm">
              <CalendarClock className="h-4 w-4" /> Hoje
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
              <History className="h-4 w-4" /> Histórico
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4" /> Relatório
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
              <Settings2 className="h-4 w-4" /> Config
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
