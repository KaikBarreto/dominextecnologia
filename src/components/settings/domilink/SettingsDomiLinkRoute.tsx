import type { ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { useAuth } from '@/contexts/AuthContext';
import { DomiLinkIntegrationContent } from './DomiLinkIntegrationContent';

/** Exceção restrita: operador abre só o DomiLink, sem montar as configurações da empresa. */
export function SettingsDomiLinkRoute({ children }: { children: ReactNode }) {
  const { hasScreenAccess } = useAuth();
  const [params] = useSearchParams();
  const isDomiLink = params.get('tab') === 'integracoes' && params.get('integration') === 'domilink';

  if (hasScreenAccess('screen:settings') || !isDomiLink) return children;

  return <div className="space-y-6">
    <PageHeader title="Configurações" subtitle="Conecte os equipamentos deste computador." icon={Settings} />
    <MobilePillTabs variant="underline" level="screen" activeTab="integracoes" onTabChange={() => undefined} tabs={[{ value: 'integracoes', label: 'Integrações' }]} />
    <MobilePillTabs variant="underline" activeTab="domilink" onTabChange={() => undefined} tabs={[{ value: 'domilink', label: 'DomiLink' }]} />
    <DomiLinkIntegrationContent />
  </div>;
}
