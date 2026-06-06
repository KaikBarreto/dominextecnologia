import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, ShieldCheck, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { CompanyPmocTemplatesTab } from '@/components/pmoc/CompanyPmocTemplatesTab';
import { ResponsibleTechniciansContent } from '@/pages/ResponsibleTechnicians';

type ContractSettingsTab = 'documentos' | 'rt';

function normalizeTab(raw: string | null): ContractSettingsTab {
  return raw === 'rt' ? 'rt' : 'documentos';
}

/**
 * Configurações de Contrato — casca com abas.
 *
 * Abas:
 *  1. Documentos (default) → template de documentos PMOC da empresa.
 *  2. Responsáveis Técnicos → cadastro regulatório PMOC (Lei 13.589/2018).
 *
 * A aba ativa é sincronizada com o query param `?tab=` (documentos | rt) pra
 * permitir abrir direto numa aba (usado pelo redirect de /responsaveis-tecnicos).
 */
export default function ContractSettings() {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<ContractSettingsTab>(() =>
    normalizeTab(searchParams.get('tab')),
  );

  // Mantém ?tab= na URL alinhado com a aba ativa, sem empilhar histórico.
  useEffect(() => {
    if (searchParams.get('tab') !== activeTab) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', activeTab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(normalizeTab(value));
  };

  return (
    <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
      <MobilePageHeader
        title="Configurações de Contrato"
        subtitle="Documentos e responsáveis técnicos"
        icon={Settings}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {isMobile ? (
          <MobilePillTabs
            tabs={[
              { value: 'documentos', label: 'Documentos', icon: <FileText className="h-4 w-4" /> },
              { value: 'rt', label: 'Responsáveis Técnicos', icon: <ShieldCheck className="h-4 w-4" /> },
            ]}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        ) : (
          <TabsList>
            <TabsTrigger value="documentos" className="gap-2">
              <FileText className="h-4 w-4" /> Documentos
            </TabsTrigger>
            <TabsTrigger value="rt" className="gap-2">
              <ShieldCheck className="h-4 w-4" /> Responsáveis Técnicos
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="documentos" className="mt-4">
          <CompanyPmocTemplatesTab />
        </TabsContent>

        <TabsContent value="rt" className="mt-4">
          <ResponsibleTechniciansContent embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
