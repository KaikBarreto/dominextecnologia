import { useState } from 'react';
import { ServiceTypesPanel } from '@/components/service-orders/ServiceTypesPanel';
import { ServiceCostsTab } from '@/components/service-orders/ServiceCostsTab';
import { SettingsSidebarLayout } from '@/components/SettingsSidebarLayout';
import { Settings, DollarSign } from 'lucide-react';

const tabs = [
  {
    value: 'types',
    label: 'Tipos de Serviços',
    icon: Settings,
  },
  {
    value: 'costs',
    label: 'Custos',
    icon: DollarSign,
  },
];

export default function ServicesPage() {
  const [activeTab, setActiveTab] = useState('types');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Serviços</h1>
        <p className="text-muted-foreground">Configure os tipos de serviços e seus custos</p>
      </div>

      <SettingsSidebarLayout
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {activeTab === 'types' && <ServiceTypesPanel />}
        {activeTab === 'costs' && <ServiceCostsTab />}
      </SettingsSidebarLayout>
    </div>
  );
}
