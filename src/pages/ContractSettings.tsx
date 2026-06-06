import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, ShieldCheck, Settings, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { CompanyPmocTemplatesTab } from '@/components/pmoc/CompanyPmocTemplatesTab';
import { ResponsibleTechniciansContent } from '@/pages/ResponsibleTechnicians';

type ContractSettingsTab = 'documentos' | 'rt';

const SETTINGS_TABS: SettingsTab[] = [
  { value: 'documentos', label: 'Documentos', icon: FileText },
  { value: 'rt', label: 'Responsáveis Técnicos', icon: ShieldCheck },
];

function normalizeTab(raw: string | null): ContractSettingsTab {
  return raw === 'rt' ? 'rt' : 'documentos';
}

/**
 * Configurações de Contrato — casca com navegação lateral (sidebar no desktop,
 * pills no mobile via SettingsSidebarLayout — mesmo padrão da tela de Orçamentos).
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
  const navigate = useNavigate();
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
      <div className="mb-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 -ml-2 text-muted-foreground"
          onClick={() => navigate('/contratos')}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      <MobilePageHeader
        title="Configurações de Contrato"
        subtitle="Documentos e responsáveis técnicos"
        icon={Settings}
      />

      <SettingsSidebarLayout
        tabs={SETTINGS_TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      >
        {activeTab === 'documentos' && <CompanyPmocTemplatesTab />}
        {activeTab === 'rt' && <ResponsibleTechniciansContent embedded />}
      </SettingsSidebarLayout>
    </div>
  );
}
