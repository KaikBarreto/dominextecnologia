import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Megaphone, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminNoticesTab } from '@/components/admin/AdminNoticesTab';
import { AdminNpsTab } from '@/components/admin/AdminNpsTab';
import { useAuth } from '@/contexts/AuthContext';
import { typography } from '@/lib/typography';

const TABS = ['avisos', 'nps'] as const;
type AdminNoticeTab = (typeof TABS)[number];

/** Comunicação da Dominex com sua base. Não é o NPS de uma ordem de serviço. */
export default function AdminNotices() {
  const { roles } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('aba');
  const tab: AdminNoticeTab = (TABS as readonly string[]).includes(requested ?? '')
    ? requested as AdminNoticeTab
    : 'avisos';

  if (!roles.includes('super_admin')) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <h1 className={`${typography.pageTitle} flex items-center gap-2`}><Megaphone className="h-6 w-6" /> Avisos e NPS</h1>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Acesso restrito</AlertTitle>
          <AlertDescription>Esta tela é exclusiva do administrador master da Dominex.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-5 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
      <div>
        <h1 className={`${typography.pageTitle} flex items-center gap-2`}><Megaphone className="h-6 w-6 lg:h-7 lg:w-7" /> Avisos e NPS</h1>
        <p className={typography.pageSubtitle}>Comunique novidades e acompanhe a satisfação da base Dominex.</p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setSearchParams({ aba: value }, { replace: true })}>
        <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <TabsList variant="underline" className="w-max">
            <TabsTrigger variant="underline" level="screen" value="avisos" className="gap-1.5"><Megaphone className="h-4 w-4" /> Avisos</TabsTrigger>
            <TabsTrigger variant="underline" level="screen" value="nps" className="gap-1.5"><ClipboardList className="h-4 w-4" /> Pesquisas (NPS)</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="avisos" className="mt-5"><AdminNoticesTab /></TabsContent>
        <TabsContent value="nps" className="mt-5"><AdminNpsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
